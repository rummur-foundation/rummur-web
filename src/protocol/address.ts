/**
 * Monero address parsing.
 *
 * Monero base58 is block-based and NOT identical to Bitcoin base58.
 * Blocks of 8 bytes encode to 11 base58 characters; partial final blocks
 * use a size-dependent character count (see BLOCK_OUTPUT_SIZES).
 *
 * Address format (69 decoded bytes):
 *   [0]     prefix byte  (network + address type)
 *   [1..32] spend public key
 *   [33..64] view public key
 *   [65..68] checksum: first 4 bytes of Keccak-256([0..64])
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { ADDRESS_LEN, KEY_SIZE, ParsedAddress, RummurError } from './types';

// ── Base58 alphabet & lookup ───────────────────────────────────────────────────

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CHAR_TO_VAL = new Uint8Array(256).fill(0xff);
for (let i = 0; i < ALPHABET.length; i++) CHAR_TO_VAL[ALPHABET.charCodeAt(i)] = i;

// Monero base58 block sizes: input_bytes → output_chars
const BLOCK_OUTPUT_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];
const BLOCK_INPUT_SIZE  = 8;
const FULL_BLOCK_OUTPUT = 11;

// ── Network prefix bytes ──────────────────────────────────────────────────────

const PREFIX_PRIMARY: Record<number, 'mainnet' | 'stagenet' | 'testnet'> = {
  18: 'mainnet',
  24: 'stagenet',
  53: 'testnet',
};
const PREFIX_SUBADDR: Record<number, 'mainnet' | 'stagenet' | 'testnet'> = {
  42: 'mainnet',
  36: 'stagenet',
  63: 'testnet',
};

// ── Block decoder ─────────────────────────────────────────────────────────────

function decodeBlock(enc: string, encOffset: number, encLen: number, out: Uint8Array, outOffset: number): void {
  const outLen = BLOCK_OUTPUT_SIZES.indexOf(encLen);
  if (outLen <= 0) throw new RummurError(`Invalid base58 block enc length: ${encLen}`);

  let num = 0n;
  for (let i = encOffset; i < encOffset + encLen; i++) {
    const v = CHAR_TO_VAL[enc.charCodeAt(i)];
    if (v === 0xff) throw new RummurError(`Invalid base58 character: ${enc[i]}`);
    num = num * 58n + BigInt(v);
  }

  // Write big-endian into output block
  for (let i = outOffset + outLen - 1; i >= outOffset; i--) {
    out[i] = Number(num & 0xffn);
    num >>= 8n;
  }
  if (num !== 0n) throw new RummurError('Base58 block overflow');
}

// ── Public decoder ────────────────────────────────────────────────────────────

export function moneroBase58Decode(encoded: string): Uint8Array {
  if (encoded.length !== ADDRESS_LEN) {
    throw new RummurError(`Address must be ${ADDRESS_LEN} characters, got ${encoded.length}`);
  }

  // Calculate output size: 8 full blocks (8×11=88 chars) + partial block (7 chars for 5 bytes)
  // 95 chars = 8 full blocks (88 chars) + 1 partial (7 chars)
  const fullBlocks = Math.floor(encoded.length / FULL_BLOCK_OUTPUT);
  const lastBlockEncLen = encoded.length % FULL_BLOCK_OUTPUT;
  const lastBlockDecLen = lastBlockEncLen > 0
    ? BLOCK_OUTPUT_SIZES.indexOf(lastBlockEncLen)
    : 0;
  const totalDecoded = fullBlocks * BLOCK_INPUT_SIZE + lastBlockDecLen;

  const decoded = new Uint8Array(totalDecoded);

  for (let block = 0; block < fullBlocks; block++) {
    decodeBlock(encoded, block * FULL_BLOCK_OUTPUT, FULL_BLOCK_OUTPUT, decoded, block * BLOCK_INPUT_SIZE);
  }

  if (lastBlockEncLen > 0) {
    decodeBlock(
      encoded,
      fullBlocks * FULL_BLOCK_OUTPUT,
      lastBlockEncLen,
      decoded,
      fullBlocks * BLOCK_INPUT_SIZE,
    );
  }

  return decoded;
}

// ── Monero base58 encoder ─────────────────────────────────────────────────────

function encodeBlock(data: Uint8Array, offset: number, len: number): string {
  const outLen = BLOCK_OUTPUT_SIZES[len];
  let num = 0n;
  for (let i = offset; i < offset + len; i++) {
    num = (num << 8n) | BigInt(data[i]);
  }
  let result = '';
  for (let i = 0; i < outLen; i++) {
    result = ALPHABET[Number(num % 58n)] + result;
    num /= 58n;
  }
  return result;
}

export function moneroBase58Encode(data: Uint8Array): string {
  const fullBlocks = Math.floor(data.length / BLOCK_INPUT_SIZE);
  const lastBlockLen = data.length % BLOCK_INPUT_SIZE;
  let result = '';
  for (let block = 0; block < fullBlocks; block++) {
    result += encodeBlock(data, block * BLOCK_INPUT_SIZE, BLOCK_INPUT_SIZE);
  }
  if (lastBlockLen > 0) {
    result += encodeBlock(data, fullBlocks * BLOCK_INPUT_SIZE, lastBlockLen);
  }
  return result;
}

// ── Address parser ────────────────────────────────────────────────────────────

export function parseAddress(address: string): ParsedAddress {
  const decoded = moneroBase58Decode(address);
  if (decoded.length !== 69) {
    throw new RummurError(`Decoded address must be 69 bytes, got ${decoded.length}`);
  }

  // Verify checksum: first 4 bytes of Keccak-256 of the first 65 bytes
  const payload  = decoded.slice(0, 65);
  const checksum = decoded.slice(65);
  const hash     = keccak_256(payload);
  if (hash[0] !== checksum[0] || hash[1] !== checksum[1] ||
      hash[2] !== checksum[2] || hash[3] !== checksum[3]) {
    throw new RummurError('Invalid address checksum');
  }

  const prefix = decoded[0];
  let isSubaddress: boolean;
  let network: 'mainnet' | 'stagenet' | 'testnet';

  if (prefix in PREFIX_PRIMARY) {
    isSubaddress = false;
    network = PREFIX_PRIMARY[prefix];
  } else if (prefix in PREFIX_SUBADDR) {
    isSubaddress = true;
    network = PREFIX_SUBADDR[prefix];
  } else {
    throw new RummurError(`Unknown address prefix: ${prefix}`);
  }

  return {
    isSubaddress,
    network,
    spendPk: decoded.slice(1,      1 + KEY_SIZE),
    viewPk:  decoded.slice(1 + KEY_SIZE, 1 + 2 * KEY_SIZE),
  };
}

export function validateAddress(address: string): boolean {
  try {
    parseAddress(address);
    return true;
  } catch {
    return false;
  }
}
