import { useState } from 'react';
import type { EncodeResult } from '../protocol/types';
import {
  CIPHERTEXT_OFFSET, CIPHERTEXT_SIZE, THREAD_NONCE_OFFSET, THREAD_NONCE_SIZE,
  FLAG_SENDER_ADDR, FLAG_IS_REPLY,
} from '../protocol/types';

interface NonceInspectorProps {
  result: EncodeResult;
  recipientAddress: string;
  message: string;
  onProceed: () => void;
}

type DisplayMode = 'nonce' | 'plaintext' | 'keys';

const REGION_COLORS: Record<string, string> = {
  magic:        'text-xmr-400 bg-xmr-950',
  versionFlags: 'text-blue-400 bg-blue-950',
  threadNonce:  'text-green-400 bg-green-950',
  ciphertext:   'text-zinc-400 bg-zinc-800',
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getRegion(offset: number): keyof typeof REGION_COLORS {
  if (offset === 0) return 'magic';
  if (offset === 1) return 'versionFlags';
  if (offset >= THREAD_NONCE_OFFSET && offset < THREAD_NONCE_OFFSET + THREAD_NONCE_SIZE) return 'threadNonce';
  return 'ciphertext';
}

interface HexDumpProps {
  data: Uint8Array;
  label: string;
  annotate?: boolean;
  flags?: number;
}

function HexDump({ data, annotate = false }: HexDumpProps) {
  const [hoveredByte, setHoveredByte] = useState<number | null>(null);
  const bytesPerRow = 16;
  const rows: JSX.Element[] = [];

  for (let row = 0; row < Math.ceil(data.length / bytesPerRow); row++) {
    const rowBytes: JSX.Element[] = [];
    const rowChars: JSX.Element[] = [];

    for (let col = 0; col < bytesPerRow; col++) {
      const offset = row * bytesPerRow + col;
      if (offset >= data.length) break;

      const byte = data[offset];
      const region = annotate ? getRegion(offset) : 'ciphertext';
      const color = REGION_COLORS[region];
      const isHovered = hoveredByte === offset;

      rowBytes.push(
        <span
          key={col}
          onMouseEnter={() => setHoveredByte(offset)}
          onMouseLeave={() => setHoveredByte(null)}
          className={`inline-block px-0.5 rounded cursor-default transition-colors ${color} ${isHovered ? 'ring-1 ring-white/50' : ''}`}
        >
          {byte.toString(16).padStart(2, '0')}
        </span>
      );

      const char = byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.';
      rowChars.push(
        <span key={col} className={`${color} cursor-default`} onMouseEnter={() => setHoveredByte(offset)} onMouseLeave={() => setHoveredByte(null)}>
          {char}
        </span>
      );
    }

    rows.push(
      <div key={row} className="flex gap-3 items-baseline leading-5">
        <span className="text-zinc-600 select-none w-10 text-right shrink-0">
          {(row * bytesPerRow).toString(16).padStart(4, '0')}
        </span>
        <div className="flex flex-wrap gap-x-1 gap-y-0.5 font-mono text-[11px] flex-1">
          {rowBytes}
        </div>
        <div className="font-mono text-[11px] text-zinc-600 tracking-wider select-none hidden sm:block shrink-0">
          {rowChars}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rows}
      {annotate && hoveredByte !== null && (
        <div className="mt-2 pt-2 border-t border-zinc-700 text-xs text-zinc-400">
          Byte {hoveredByte} (0x{hoveredByte.toString(16)}): 0x{data[hoveredByte].toString(16).padStart(2,'0')}
          {' — '}
          {getRegionLabel(hoveredByte)}
        </div>
      )}
    </div>
  );
}

function getRegionLabel(offset: number): string {
  if (offset === 0) return 'magic byte (0x4D = "M")';
  if (offset === 1) return 'version_flags (version nibble | flags nibble)';
  if (offset >= 2 && offset <= 9) return `thread_nonce[${offset - 2}]`;
  return `ciphertext[${offset - CIPHERTEXT_OFFSET}]`;
}

export function NonceInspector({ result, message, onProceed }: NonceInspectorProps) {
  const [mode, setMode] = useState<DisplayMode>('nonce');

  const flags = result.nonce[1] & 0x0f;
  const version = (result.nonce[1] >> 4) & 0x0f;
  const hasSender = (flags & FLAG_SENDER_ADDR) !== 0;
  const isReply   = (flags & FLAG_IS_REPLY) !== 0;

  // Parse plaintext fields for display
  const pt = result.plaintext;
  const msgLen = (pt[1] << 8) | pt[2];
  const msgText = new TextDecoder().decode(pt.slice(3, 3 + msgLen));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Nonce Inspector</h2>
        <p className="text-sm text-zinc-400">
          The 255-byte encrypted payload that will be embedded in{' '}
          <span className="font-mono text-zinc-300">tx_extra_nonce</span>.
        </p>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge label="Magic" value="0x4D" color="xmr" />
        <Badge label="Version" value={`v${version}`} color="blue" />
        <Badge label="Flags" value={`0x${flags.toString(16).padStart(2,'0')}`} color="purple" />
        {hasSender && <Badge label="SENDER_ADDR" value="set" color="green" />}
        {isReply && <Badge label="IS_REPLY" value="set" color="yellow" />}
        <Badge label="Message" value={`"${message.slice(0, 20)}${message.length > 20 ? '…' : ''}"`} color="zinc" />
      </div>

      {/* Legend (nonce view) */}
      {mode === 'nonce' && (
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries({
            magic:        'Byte 0 — magic 0x4D',
            versionFlags: 'Byte 1 — version|flags',
            threadNonce:  'Bytes 2–9 — thread_nonce',
            ciphertext:   'Bytes 10–254 — ciphertext',
          }).map(([key, desc]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${REGION_COLORS[key]} border border-current opacity-70`} />
              <span className="text-zinc-400">{desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
        {(['nonce', 'plaintext', 'keys'] as DisplayMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${
              mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {m === 'nonce' ? 'Nonce (255 bytes)' : m === 'plaintext' ? 'Plaintext (245 bytes)' : 'Crypto values'}
          </button>
        ))}
      </div>

      {/* Hex dump */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto">
        {mode === 'nonce' && <HexDump data={result.nonce} label="Nonce" annotate flags={flags} />}
        {mode === 'plaintext' && <HexDump data={result.plaintext} label="Plaintext" />}
        {mode === 'keys' && (
          <div className="space-y-4 font-mono text-xs">
            <KeyBlock label="tx_sk (transaction secret key)" value={bytesToHex(result.txSk)} sensitive />
            <KeyBlock label="tx_pk (transaction public key)" value={bytesToHex(result.txPk)} />
            <KeyBlock label="derivation (8 × tx_sk × view_pk)" value={bytesToHex(result.derivation)} />
            <KeyBlock label="thread_nonce (8 bytes)" value={bytesToHex(result.threadNonce)} />
          </div>
        )}
      </div>

      {/* Plaintext parse summary */}
      {mode === 'plaintext' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs space-y-2">
          <div className="text-zinc-400 font-medium">Payload parse</div>
          <div className="flex gap-4">
            <div><span className="text-zinc-500">payload_type</span> <span className="font-mono text-zinc-200">0x01 (TEXT)</span></div>
            <div><span className="text-zinc-500">msg_len</span> <span className="font-mono text-zinc-200">{msgLen} bytes</span></div>
          </div>
          <div>
            <span className="text-zinc-500">message text</span>{' '}
            <span className="text-zinc-200 break-all">"{msgText}"</span>
          </div>
          {hasSender && (
            <div><span className="text-zinc-500">sender_addr</span> <span className="font-mono text-zinc-200">{new TextDecoder().decode(pt.slice(3 + msgLen, 3 + msgLen + 95))}</span></div>
          )}
          <div><span className="text-zinc-500">padding</span> <span className="text-zinc-400">{245 - 3 - msgLen - (hasSender ? 95 : 0)} bytes (random)</span></div>
        </div>
      )}

      {/* Copy nonce hex */}
      <div className="flex gap-3">
        <button
          onClick={() => navigator.clipboard.writeText(bytesToHex(result.nonce))}
          className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded px-3 py-1.5 transition-all"
        >
          Copy nonce hex
        </button>
        <button
          onClick={() => {
            const txExtra = new Uint8Array(1 + 32 + 1 + 1 + 255);
            let off = 0;
            txExtra[off++] = 0x01;
            txExtra.set(result.txPk, off); off += 32;
            txExtra[off++] = 0x02;
            txExtra[off++] = 0xFF;
            txExtra.set(result.nonce, off);
            navigator.clipboard.writeText(bytesToHex(txExtra));
          }}
          className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded px-3 py-1.5 transition-all"
        >
          Copy tx_extra hex
        </button>
      </div>

      <button
        onClick={onProceed}
        className="w-full bg-xmr-500 hover:bg-xmr-600 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-all"
      >
        Broadcast Transaction →
      </button>
    </div>
  );
}

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    xmr:    'bg-xmr-950 text-xmr-400 border-xmr-800',
    blue:   'bg-blue-950 text-blue-400 border-blue-800',
    purple: 'bg-purple-950 text-purple-400 border-purple-800',
    green:  'bg-green-950 text-green-400 border-green-800',
    yellow: 'bg-yellow-950 text-yellow-400 border-yellow-800',
    zinc:   'bg-zinc-800 text-zinc-300 border-zinc-700',
  };
  return (
    <div className={`px-2 py-1 rounded border text-xs font-mono ${colors[color] ?? colors.zinc}`}>
      <span className="opacity-60 mr-1">{label}:</span>{value}
    </div>
  );
}

function KeyBlock({ label, value, sensitive }: { label: string; value: string; sensitive?: boolean }) {
  const [revealed, setRevealed] = useState(!sensitive);
  return (
    <div>
      <div className="text-zinc-500 mb-0.5">{label}</div>
      <div className="flex items-start gap-2">
        <div className={`flex-1 text-zinc-300 break-all ${sensitive && !revealed ? 'blur-sm select-none' : ''}`}>
          {value}
        </div>
        {sensitive && (
          <button onClick={() => setRevealed(!revealed)} className="text-zinc-600 hover:text-zinc-400 shrink-0 text-[10px]">
            {revealed ? 'hide' : 'show'}
          </button>
        )}
      </div>
    </div>
  );
}
