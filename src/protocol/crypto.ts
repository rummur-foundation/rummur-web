/**
 * Rummur cryptographic primitives.
 *
 * ECDH:      derivation = 8 × tx_sk × view_pk  (Edwards25519, Monero convention)
 * Keystream: 8 rounds of Keccak-256 with domain separator 0x4D
 * Encrypt:   ciphertext = plaintext XOR keystream[0..244]
 *
 * Uses @noble/curves for Ed25519 point operations and @noble/hashes for Keccak-256.
 * Monero scalars are 32-byte little-endian integers reduced mod the group order.
 * Monero public keys are compressed Edwards25519 points in the same encoding as
 * standard Ed25519 — so @noble/curves/ed25519 decompresses them correctly.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { keccak_256 } from '@noble/hashes/sha3';
import { KEY_SIZE, KEYSTREAM_SIZE, CIPHERTEXT_SIZE, MAGIC, RummurError } from './types';

// ── Scalar utilities ──────────────────────────────────────────────────────────

// Monero scalars are 32-byte little-endian integers reduced mod the group order.
function leToScalar(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    n = (n << 8n) | BigInt(bytes[i]);
  }
  return n;
}

// Reduce scalar mod group order and clamp to range [1, n-1].
// @noble/curves requires 1 <= sc < n for point multiplication.
function reduceScalar(raw: bigint): bigint {
  const n = ed25519.CURVE.n;
  const reduced = raw % n;
  return reduced === 0n ? 1n : reduced; // 0 would be an invalid scalar
}

// ── ECDH derivation ───────────────────────────────────────────────────────────

/**
 * Compute the Monero ECDH shared derivation:
 *   derivation = 8 × sec_key × pub_key
 *
 * Sender call:    derive(recipient_view_pk, tx_sk)
 * Recipient call: derive(tx_pk, view_sk)
 * Both produce the same 32-byte derivation.
 */
export function derive(pubKey: Uint8Array, secKey: Uint8Array): Uint8Array {
  if (pubKey.length !== KEY_SIZE || secKey.length !== KEY_SIZE) {
    throw new RummurError('derive: keys must be 32 bytes');
  }

  // Monero tx_sk / view_sk are already reduced (sc_reduce32 was applied on
  // generation), but reduce again for safety — noble/curves rejects scalars >= n.
  const scalar = reduceScalar(leToScalar(secKey));
  const point  = ed25519.ExtendedPoint.fromHex(pubKey);

  // scalar × point, then ×8 (cofactor) to clear the small subgroup.
  const result = point.multiply(scalar).multiply(8n);
  return result.toRawBytes();
}

// ── Keystream generation ──────────────────────────────────────────────────────

/**
 * Generate the 256-byte keystream from a derivation using counter-mode Keccak-256.
 * Per PROTOCOL.md §5.2:
 *   for block in 0..7: H = Keccak256(derivation || 0x4D || block_index)
 */
export function generateKeystream(derivation: Uint8Array): Uint8Array {
  if (derivation.length !== KEY_SIZE) {
    throw new RummurError('generateKeystream: derivation must be 32 bytes');
  }

  const keystream = new Uint8Array(KEYSTREAM_SIZE);
  const input = new Uint8Array(34);
  input.set(derivation, 0);
  input[32] = MAGIC; // domain separator

  for (let i = 0; i < 8; i++) {
    input[33] = i;
    const block = keccak_256(input);
    keystream.set(block, i * 32);
  }

  return keystream;
}

// ── XOR encrypt/decrypt ───────────────────────────────────────────────────────

/** XOR two equal-length byte arrays in place (dst ^= src). */
export function xorInPlace(dst: Uint8Array, src: Uint8Array): void {
  if (dst.length !== src.length) {
    throw new RummurError(`xorInPlace: length mismatch ${dst.length} vs ${src.length}`);
  }
  for (let i = 0; i < dst.length; i++) dst[i] ^= src[i];
}

/**
 * Encrypt or decrypt 245 bytes using the first 245 bytes of keystream.
 * XOR is its own inverse, so encrypt = decrypt.
 */
export function encryptPayload(data: Uint8Array, keystream: Uint8Array): Uint8Array {
  if (data.length !== CIPHERTEXT_SIZE) {
    throw new RummurError(`encryptPayload: data must be ${CIPHERTEXT_SIZE} bytes`);
  }
  const result = new Uint8Array(data);
  for (let i = 0; i < CIPHERTEXT_SIZE; i++) result[i] ^= keystream[i];
  return result;
}

// ── TX keypair ────────────────────────────────────────────────────────────────

/**
 * Generate a random Monero transaction keypair.
 * tx_pk = tx_sk × G  (standard primary address convention)
 */
export function generateTxKeypair(): { txSk: Uint8Array; txPk: Uint8Array } {
  const raw = crypto.getRandomValues(new Uint8Array(KEY_SIZE));
  const scalar = reduceScalar(leToScalar(raw));

  // Convert scalar back to 32-byte little-endian
  const txSk = new Uint8Array(KEY_SIZE);
  let tmp = scalar;
  for (let i = 0; i < KEY_SIZE; i++) {
    txSk[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }

  // Compute tx_pk = txSk × G
  const txPk = ed25519.ExtendedPoint.BASE.multiply(scalar).toRawBytes();

  return { txSk, txPk };
}

// ── Public key from secret key ────────────────────────────────────────────────

export function secretKeyToPublicKey(sk: Uint8Array): Uint8Array {
  return ed25519.ExtendedPoint.BASE.multiply(reduceScalar(leToScalar(sk))).toRawBytes();
}
