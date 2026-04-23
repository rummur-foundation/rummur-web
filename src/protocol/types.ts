// ── Protocol constants (mirror libxmrmsg.h) ───────────────────────────────────

export const NONCE_SIZE          = 255;
export const CIPHERTEXT_OFFSET   = 10;
export const CIPHERTEXT_SIZE     = 245;
export const THREAD_NONCE_OFFSET = 2;
export const THREAD_NONCE_SIZE   = 8;
export const KEY_SIZE            = 32;
export const KEYSTREAM_SIZE      = 256;
export const ADDRESS_LEN         = 95;
export const MAX_MSG_ANON        = 242;
export const MAX_MSG_WITH_SENDER = 147;
export const MAGIC               = 0x4d;
export const PROTOCOL_VERSION    = 0x00;
export const PAYLOAD_TEXT        = 0x01;
export const FLAG_SENDER_ADDR    = 0x01;
export const FLAG_IS_REPLY       = 0x02;
export const DEFAULT_DUST        = 1_000_000n; // piconero

// ── Address representation ─────────────────────────────────────────────────────

export interface ParsedAddress {
  isSubaddress: boolean;
  spendPk: Uint8Array; // 32 bytes
  viewPk: Uint8Array;  // 32 bytes
  network: 'mainnet' | 'stagenet' | 'testnet';
}

// ── Wallet context ─────────────────────────────────────────────────────────────

export interface WalletKeys {
  spendSk: Uint8Array;  // 32 bytes — private spend key
  viewSk:  Uint8Array;  // 32 bytes — private view key
  spendPk: Uint8Array;  // 32 bytes — public spend key
  viewPk:  Uint8Array;  // 32 bytes — public view key
  address: string;      // 95-char primary address
  network: 'mainnet' | 'stagenet' | 'testnet';
}

// ── Encode result ─────────────────────────────────────────────────────────────

export interface EncodeResult {
  nonce: Uint8Array;        // 255 bytes
  threadNonce: Uint8Array;  // 8 bytes
  txSk: Uint8Array;         // 32 bytes — tx secret key used
  txPk: Uint8Array;         // 32 bytes — tx public key
  derivation: Uint8Array;   // 32 bytes — ECDH shared secret
  plaintext: Uint8Array;    // 245 bytes — unencrypted payload
}

// ── Error types ───────────────────────────────────────────────────────────────

export class RummurError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RummurError';
  }
}
