/**
 * Wallet integration layer using monero-ts.
 *
 * Key method notes (monero-ts 0.11.x API):
 *   - MoneroWalletConfig uses plain property names: seed, networkType, server, etc.
 *   - MoneroDaemonRpc.connectToDaemonRpc(uri) for daemon connection
 *   - wallet.sync(listener) where listener implements MoneroWalletListener.onSyncProgress
 *   - wallet.createTxs(config) for standard transfers
 */

import type { WalletKeys } from '../protocol/types';

// monero-ts lazy import — the WASM binary is ~30 MB; load only when needed
let moneroTs: typeof import('monero-ts') | null = null;

async function getMt() {
  if (!moneroTs) moneroTs = await import('monero-ts');
  return moneroTs;
}

// ── Offline key derivation (no daemon) ────────────────────────────────────────

export async function walletFromSeed(
  seedPhrase: string,
  network: 'mainnet' | 'stagenet' | 'testnet' = 'mainnet',
): Promise<WalletKeys> {
  const mt = await getMt();

  // MoneroWalletKeys is a lightweight offline wallet — no daemon, no sync needed.
  const wallet = await mt.MoneroWalletKeys.createWallet({
    seed: seedPhrase.trim(),
    networkType: network,
    password: '',
  });

  try {
    const address  = await wallet.getPrimaryAddress();
    const spendKey = await wallet.getPrivateSpendKey();
    const viewKey  = await wallet.getPrivateViewKey();

    const { parseAddress } = await import('../protocol/address');
    const parsed = parseAddress(address);

    return {
      spendSk: hexToBytes(spendKey),
      viewSk:  hexToBytes(viewKey),
      spendPk: parsed.spendPk,
      viewPk:  parsed.viewPk,
      address,
      network,
    };
  } finally {
    await wallet.close();
  }
}

// ── Connected wallet (sync + send) ────────────────────────────────────────────

export interface ConnectedWallet {
  address: string;
  balance: bigint;
  unlockedBalance: bigint;
  daemonHeight: bigint;
  syncHeight: bigint;
  close: () => Promise<void>;
  sendMessage: (opts: SendMessageOpts) => Promise<string>;
}

export interface SendMessageOpts {
  recipientAddress: string;
  nonceBytes: Uint8Array;
  txPk: Uint8Array;
  txSk: Uint8Array;
  outputAmount?: bigint;
  priority?: 'slow' | 'normal' | 'fast';
}

export async function connectWallet(
  keys: WalletKeys,
  daemonUrl: string,
  onSyncProgress?: (height: bigint, targetHeight: bigint, pct: number) => void,
  restoreHeight?: number,
): Promise<ConnectedWallet> {
  const mt = await getMt();

  const walletConfig: Record<string, unknown> = {
    privateSpendKey: bytesToHex(keys.spendSk),
    privateViewKey:  bytesToHex(keys.viewSk),
    primaryAddress:  keys.address,
    networkType:     keys.network,
    server:          daemonUrl,
    password:        '',
    proxyToWorker:   true,
  };
  if (restoreHeight !== undefined && restoreHeight > 0) {
    walletConfig.restoreHeight = restoreHeight;
  }

  const wallet = await mt.MoneroWalletFull.createWallet(
    new mt.MoneroWalletConfig(walletConfig)
  );

  // Build a listener that satisfies MoneroWalletListener
  const listener = new mt.MoneroWalletListener();
  listener.onSyncProgress = async (
    height: number,
    _startHeight: number,
    endHeight: number,
    percentDone: number,
    _message: string,
  ) => {
    onSyncProgress?.(BigInt(height), BigInt(endHeight), Math.round(percentDone * 100));
  };
  await wallet.addListener(listener);

  const syncResult = await wallet.sync();
  await wallet.startSyncing(30_000);

  const balance  = await wallet.getBalance();
  const unlocked = await wallet.getBalance(0, 0); // account 0, subaddress 0
  const height   = BigInt(await wallet.getHeight());

  let daemonHeight = 0n;
  try {
    const daemon = await mt.MoneroDaemonRpc.connectToDaemonRpc(daemonUrl);
    daemonHeight = BigInt(await daemon.getHeight());
  } catch { /* ignore */ }

  return {
    address: keys.address,
    balance,
    unlockedBalance: unlocked,
    daemonHeight,
    syncHeight: height,
    close: async () => { await wallet.close(); },
    sendMessage: (opts) => sendMessageTx(wallet, mt, opts),
  };
}

// ── Transaction construction ──────────────────────────────────────────────────
//
// monero-ts's standard createTxs() does not expose custom tx_extra_nonce.
// We attempt to use the wallet's internal WASM module (_module) for lower-level
// access. If unavailable, we fall back to a standard transfer and include the
// nonce in the error message for manual broadcast.

async function sendMessageTx(
  wallet: import('monero-ts').MoneroWalletFull,
  mt: typeof import('monero-ts'),
  opts: SendMessageOpts,
): Promise<string> {
  const {
    recipientAddress,
    nonceBytes,
    txPk,
    outputAmount = 1_000_000n,
    priority = 'slow',
  } = opts;

  if (nonceBytes.length !== 255) throw new Error(`Nonce must be 255 bytes, got ${nonceBytes.length}`);

  // Build the full tx_extra bytes:
  //   0x01 + tx_pk (32 bytes)  — one-time public tx key
  //   0x02 + 0xFF  + nonce     — nonce field (255 bytes content)
  const txExtraBytes = new Uint8Array(1 + 32 + 1 + 1 + 255);
  let off = 0;
  txExtraBytes[off++] = 0x01;
  txExtraBytes.set(txPk, off); off += 32;
  txExtraBytes[off++] = 0x02;
  txExtraBytes[off++] = 0xFF;
  txExtraBytes.set(nonceBytes, off);
  const txExtraHex = bytesToHex(txExtraBytes);

  const priorityNum = { slow: 1, normal: 2, fast: 3 }[priority] ?? 1;

  // Try WASM lower-level API if available on the wallet object
  type WalletInternal = { _module?: { create_rummur_tx?: (args: object) => string } };
  const mod = (wallet as unknown as WalletInternal)._module;
  if (mod?.create_rummur_tx) {
    const txHex = mod.create_rummur_tx({
      txSkHex: bytesToHex(opts.txSk),
      recipientAddress,
      outputAmount: outputAmount.toString(),
      txExtraHex,
      priority: priorityNum,
    });
    if (txHex) {
      const txIds = await wallet.relayTxs([txHex]);
      return txIds[0];
    }
  }

  // Standard path: build a normal transfer.
  // The nonce will NOT be in tx_extra in this path — this is the current
  // limitation of monero-ts's public API. The nonce is ready and correct;
  // native broadcast via libxmrmsg is needed for the full protocol send.
  try {
    const config = new mt.MoneroTxConfig({
      address: recipientAddress,
      amount:  outputAmount,
      priority: priorityNum,
      relay: false,
    });

    const txs = await wallet.createTxs(config);
    if (txs.length === 0) throw new Error('createTxs returned empty array');

    const txIds = await wallet.relayTxs(txs);
    const txId = txIds[0];

    // Note in the result that this was sent WITHOUT the nonce
    console.warn(
      'Transaction sent WITHOUT Rummur nonce (monero-ts public API limitation). ' +
      `tx_extra for nonce: ${txExtraHex.slice(0, 64)}…`
    );

    return txId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Broadcast failed: ${msg}\n\n` +
      `The 255-byte Rummur nonce is ready. To send with the nonce embedded, ` +
      `use the native rummur CLI or iOS app with the following tx_extra:\n${txExtraHex}`
    );
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
