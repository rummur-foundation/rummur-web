/**
 * Rummur nonce encoder.
 *
 * Builds the 255-byte tx_extra_nonce payload per PROTOCOL.md §4–6.
 * TypeScript port of encode.cpp / libxmrmsg.h.
 */

import {
  NONCE_SIZE, CIPHERTEXT_OFFSET, CIPHERTEXT_SIZE, THREAD_NONCE_OFFSET,
  THREAD_NONCE_SIZE, ADDRESS_LEN, MAX_MSG_ANON, MAX_MSG_WITH_SENDER,
  MAGIC, PROTOCOL_VERSION, PAYLOAD_TEXT, FLAG_SENDER_ADDR,
  EncodeResult, RummurError,
} from './types';
import { parseAddress } from './address';
import { derive, generateKeystream, encryptPayload, generateTxKeypair, secretKeyToPublicKey } from './crypto';

export interface EncodeOptions {
  recipientAddress: string;
  message: string;              // UTF-8 text
  flags?: number;               // XMRMSG_FLAG_* bitmask; defaults to 0
  senderAddress?: string;       // required if FLAG_SENDER_ADDR is set
  threadNonceIn?: Uint8Array;   // 8 bytes; null → generate fresh
  txSk?: Uint8Array;            // 32 bytes; null → generate fresh
}

/**
 * Encode a Rummur message into a 255-byte nonce payload.
 *
 * Returns the encoded nonce plus all intermediate values for inspection.
 */
export function encodeNonce(opts: EncodeOptions): EncodeResult {
  const {
    recipientAddress,
    message,
    flags = 0,
    senderAddress,
    threadNonceIn,
    txSk: providedTxSk,
  } = opts;

  const includeSender = (flags & FLAG_SENDER_ADDR) !== 0;
  if (includeSender && !senderAddress) {
    throw new RummurError('senderAddress required when FLAG_SENDER_ADDR is set');
  }

  const msgBytes = new TextEncoder().encode(message);
  const maxMsg = includeSender ? MAX_MSG_WITH_SENDER : MAX_MSG_ANON;
  if (msgBytes.length > maxMsg) {
    throw new RummurError(
      `Message too long: ${msgBytes.length} bytes (max ${maxMsg} for this mode)`
    );
  }

  const recipient = parseAddress(recipientAddress);

  if (includeSender && senderAddress) {
    parseAddress(senderAddress); // throws on invalid
  }

  // ── TX keypair ─────────────────────────────────────────────────────────────

  let txSk: Uint8Array;
  let txPk: Uint8Array;

  if (providedTxSk) {
    txSk = providedTxSk;
    txPk = secretKeyToPublicKey(txSk);
  } else {
    ({ txSk, txPk } = generateTxKeypair());
  }

  // ── ECDH: derivation = 8 × tx_sk × recipient_view_pk ──────────────────────

  const derivation = derive(recipient.viewPk, txSk);

  // ── Keystream ──────────────────────────────────────────────────────────────

  const keystream = generateKeystream(derivation);

  // ── Build 245-byte plaintext ───────────────────────────────────────────────
  //
  //  [0]       payload_type   (1 byte)
  //  [1..2]    msg_len        (uint16 big-endian)
  //  [3..N]    message        (N bytes, UTF-8)
  //  [N..N+95] sender_addr    (95 bytes, only if SENDER_ADDR flag)
  //  [rest]    random padding (MUST be non-zero random bytes)

  const plaintext = crypto.getRandomValues(new Uint8Array(CIPHERTEXT_SIZE));

  let pos = 0;
  plaintext[pos++] = PAYLOAD_TEXT;
  plaintext[pos++] = (msgBytes.length >> 8) & 0xff;
  plaintext[pos++] = msgBytes.length & 0xff;
  plaintext.set(msgBytes, pos);
  pos += msgBytes.length;

  if (includeSender && senderAddress) {
    const addrBytes = new TextEncoder().encode(senderAddress.slice(0, ADDRESS_LEN));
    plaintext.set(addrBytes, pos);
  }

  const plaintextSnapshot = new Uint8Array(plaintext); // snapshot before encryption

  // ── Encrypt: ciphertext = plaintext XOR keystream[0..244] ─────────────────

  const ciphertext = encryptPayload(plaintext, keystream);

  // ── Thread nonce ───────────────────────────────────────────────────────────

  const threadNonce = threadNonceIn
    ? new Uint8Array(threadNonceIn)
    : crypto.getRandomValues(new Uint8Array(THREAD_NONCE_SIZE));

  // ── Assemble 255-byte nonce ────────────────────────────────────────────────

  const nonce = new Uint8Array(NONCE_SIZE);
  nonce[0] = MAGIC;
  nonce[1] = ((PROTOCOL_VERSION << 4) | (flags & 0x0f)) & 0xff;
  nonce.set(threadNonce, THREAD_NONCE_OFFSET);
  nonce.set(ciphertext,  CIPHERTEXT_OFFSET);

  return { nonce, threadNonce, txSk, txPk, derivation, plaintext: plaintextSnapshot };
}
