import { useState } from 'react';
import type { WalletKeys, EncodeResult } from '../protocol/types';
import { connectWallet, bytesToHex } from '../wallet/wallet';

interface TxPanelProps {
  wallet: WalletKeys;
  encoded: EncodeResult;
  recipientAddress: string;
  onSent: (txId: string) => void;
}

const STAGENET_NODE = 'http://stagenet.xmr.ditatompel.com:38089';
const MAINNET_NODE  = 'http://node.moneroworld.com:18089';

type Priority = 'slow' | 'normal' | 'fast';

const FEE_TABLE: Record<Priority, { xmr: string; usd: string }> = {
  slow:   { xmr: '~0.0006 XMR', usd: '~$0.21' },
  normal: { xmr: '~0.0024 XMR', usd: '~$0.84' },
  fast:   { xmr: '~0.012 XMR',  usd: '~$4.20' },
};

export function TxPanel({ wallet, encoded, recipientAddress, onSent }: TxPanelProps) {
  const defaultNode = wallet.network === 'stagenet' ? STAGENET_NODE : MAINNET_NODE;
  const [daemonUrl, setDaemonUrl] = useState(defaultNode);
  const [priority, setPriority]   = useState<Priority>('slow');
  const [syncHeight, setSyncHeight] = useState('');
  const [status, setStatus]       = useState<'idle' | 'syncing' | 'building' | 'broadcasting' | 'done' | 'error'>('idle');
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState('');
  const [txId, setTxId]           = useState('');
  const [syncLog, setSyncLog]     = useState<string[]>([]);

  function appendLog(msg: string) {
    setSyncLog((prev) => [...prev.slice(-8), msg]);
  }

  async function handleBroadcast() {
    setStatus('syncing');
    setError('');
    setSyncLog([]);
    appendLog(`Connecting to ${daemonUrl}…`);

    try {
      const restoreHeightNum = syncHeight.trim() ? parseInt(syncHeight.trim(), 10) : undefined;

      const connected = await connectWallet(
        wallet,
        daemonUrl,
        (height, target, pct) => {
          setProgress(pct);
          appendLog(`Syncing… block ${height.toLocaleString()} / ${target.toLocaleString()} (${pct}%)`);
        },
        restoreHeightNum,
      );

      appendLog(`Synced. Balance: ${(connected.balance / 1_000_000_000_000n).toString()} XMR`);
      setStatus('building');
      appendLog('Building Rummur transaction…');

      const id = await connected.sendMessage({
        recipientAddress,
        nonceBytes: encoded.nonce,
        txPk: encoded.txPk,
        txSk: encoded.txSk,
        outputAmount: 1_000_000n,
        priority,
      });

      await connected.close();
      setTxId(id);
      setStatus('done');
      onSent(id);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const txExtraHex = (() => {
    const txExtra = new Uint8Array(1 + 32 + 1 + 1 + 255);
    let off = 0;
    txExtra[off++] = 0x01;
    txExtra.set(encoded.txPk, off); off += 32;
    txExtra[off++] = 0x02;
    txExtra[off++] = 0xFF;
    txExtra.set(encoded.nonce, off);
    return bytesToHex(txExtra);
  })();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Broadcast Transaction</h2>
        <p className="text-sm text-zinc-400">
          Connect to a Monero node to sync your wallet and send the message transaction.
        </p>
      </div>

      {status === 'done' ? (
        <SuccessView txId={txId} network={wallet.network} />
      ) : (
        <>
          {/* Daemon URL */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
              Monero Daemon RPC URL
            </label>
            <input
              value={daemonUrl}
              onChange={(e) => setDaemonUrl(e.target.value.trim())}
              placeholder="http://localhost:18081"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-xmr-500 focus:border-transparent"
              disabled={status !== 'idle' && status !== 'error'}
            />
            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                onClick={() => setDaemonUrl(STAGENET_NODE)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                stagenet public node
              </button>
              <span className="text-zinc-700">·</span>
              <button
                onClick={() => setDaemonUrl(MAINNET_NODE)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                mainnet public node
              </button>
            </div>
          </div>

          {/* Optional restore height */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
              Restore Height <span className="normal-case font-normal text-zinc-600">(optional — speeds up sync)</span>
            </label>
            <input
              value={syncHeight}
              onChange={(e) => setSyncHeight(e.target.value)}
              placeholder="e.g. 3250000"
              type="number"
              min={0}
              className="w-48 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-xmr-500 focus:border-transparent"
            />
          </div>

          {/* Priority selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
              Fee Priority
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['slow', 'normal', 'fast'] as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    priority === p
                      ? 'bg-xmr-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700'
                  }`}
                >
                  <div className="capitalize">{p}</div>
                  <div className="text-[10px] opacity-75 font-mono">{FEE_TABLE[p].xmr}</div>
                  <div className="text-[10px] opacity-50">{FEE_TABLE[p].usd}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sync progress */}
          {(status === 'syncing' || status === 'building' || status === 'broadcasting') && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4 text-xmr-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-zinc-300 capitalize">{status}…</span>
              </div>
              {status === 'syncing' && (
                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                  <div
                    className="bg-xmr-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              <div className="space-y-0.5">
                {syncLog.map((line, i) => (
                  <div key={i} className="text-xs font-mono text-zinc-500">{line}</div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 space-y-2">
              <div className="text-sm text-red-300 font-medium">Broadcast failed</div>
              <div className="text-xs text-red-400 font-mono break-all">{error}</div>
            </div>
          )}

          {/* Raw tx_extra for manual broadcast */}
          <details className="group">
            <summary className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer select-none">
              Manual broadcast (CLI fallback) ▾
            </summary>
            <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono space-y-3">
              <div>
                <div className="text-zinc-500 mb-1">tx_extra (289 bytes = tag + pk + nonce tag + nonce)</div>
                <div className="text-zinc-400 break-all">{txExtraHex}</div>
              </div>
              <div className="text-zinc-600 text-[10px]">
                Use xmrmsg_broadcast_tx() from the native libxmrmsg library, or broadcast via the Monero CLI wallet using the rummur plugin.
              </div>
            </div>
          </details>

          <button
            onClick={handleBroadcast}
            disabled={status === 'syncing' || status === 'building' || status === 'broadcasting' || !daemonUrl}
            className="w-full bg-xmr-500 hover:bg-xmr-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium py-3 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
          >
            {status === 'idle' || status === 'error' ? (
              'Sync & Send Message'
            ) : (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="capitalize">{status}…</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

function SuccessView({ txId, network }: { txId: string; network: string }) {
  const explorerUrl = network === 'stagenet'
    ? `https://stagenet.xmrchain.net/tx/${txId}`
    : `https://xmrchain.net/tx/${txId}`;

  return (
    <div className="space-y-4">
      <div className="bg-green-950/50 border border-green-800 rounded-lg p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-green-400 font-medium text-lg">Message sent!</div>
        <div className="text-zinc-400 text-sm">
          Your Rummur message has been embedded in a Monero transaction and broadcast to the network.
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">Transaction ID</div>
        <div className="font-mono text-xs text-zinc-200 break-all">{txId}</div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-xmr-400 hover:text-xmr-300 mt-1"
        >
          View on block explorer ↗
        </a>
      </div>

      <div className="text-xs text-zinc-500 text-center">
        The recipient can decode the message using their view key by scanning the blockchain.
      </div>
    </div>
  );
}
