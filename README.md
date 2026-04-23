# rummur-web

Browser-based showcase for the [Rummur protocol](https://github.com/rummur-foundation/rummur-protocol) — private messaging layered on top of Monero.

## What it demonstrates

The app walks through the full send-message flow in four steps:

1. **Connect wallet** — enter a 25-word Monero seed phrase; keys are derived locally and never leave the browser
2. **Compose** — enter a recipient Monero address and message text (up to 242 bytes); optionally include your return address or mark as a reply
3. **Inspect nonce** — see the 255-byte encrypted payload that will be embedded in `tx_extra_nonce`, with a colour-coded hex dump, plaintext parse, and ECDH intermediate values
4. **Broadcast** — connect to a Monero daemon, sync the wallet, and send the transaction

## How the protocol works

A Rummur message is carried inside a standard Monero transaction. The 255-byte payload is encrypted end-to-end using Monero's own ECDH key derivation — no new cryptography, no new key material:

```
derivation  = 8 × tx_sk × recipient_view_pk     (Edwards25519)
keystream   = Keccak-256(derivation ‖ 0x4D ‖ i)  for i in 0..7  →  256 bytes
ciphertext  = plaintext XOR keystream[0..244]

nonce layout (255 bytes):
  [0]       magic         0x4D ('M')
  [1]       version_flags (version nibble | flags nibble)
  [2..9]    thread_nonce  (8 random bytes)
  [10..254] ciphertext    (245 bytes)
```

The nonce is placed in the `tx_extra_nonce` field (tag `0x02`) of the transaction. On-chain it is indistinguishable from any other Monero transaction.

See [`PROTOCOL.md`](https://github.com/rummur-foundation/rummur-protocol/blob/main/PROTOCOL.md) for the full normative specification.

## Tech stack

| Layer | Library |
|---|---|
| UI | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Ed25519 / ECDH | `@noble/curves` |
| Keccak-256 | `@noble/hashes` |
| Monero wallet | `monero-ts` 0.11.x (WASM) |

The protocol encoding layer (`src/protocol/`) is a pure TypeScript port of `libxmrmsg` and has no native dependencies. Cross-verification against the C++ test vectors is planned once `PROTOCOL.md §13` vectors are published.

## Known limitation — tx_extra injection

`monero-ts`'s public `createTxs()` API does not expose custom `tx_extra_nonce` data. The nonce encoding is complete and correct in the browser; the app falls back to a standard transfer when broadcasting (the XMR dust reaches the recipient but without the rummur nonce). The raw `tx_extra` hex is always shown so it can be broadcast manually via the native `libxmrmsg` CLI once that ships in Phase 2.

Full in-browser send with the nonce embedded will be addressed when `libxmrmsg` is compiled to WASM (Phase 5 of the roadmap).

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
```

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers — required for `monero-ts`'s use of `SharedArrayBuffer`.

## Project structure

```
src/
├── protocol/
│   ├── types.ts      protocol constants and TypeScript interfaces
│   ├── address.ts    Monero block-based base58 + Keccak-256 checksum
│   ├── crypto.ts     ECDH derivation, keystream, XOR encryption
│   └── encode.ts     255-byte nonce assembly
├── wallet/
│   └── wallet.ts     monero-ts integration (key derivation + daemon sync + broadcast)
└── components/
    ├── StepIndicator.tsx
    ├── WalletPanel.tsx
    ├── ComposePanel.tsx
    ├── NonceInspector.tsx
    └── TxPanel.tsx
```
