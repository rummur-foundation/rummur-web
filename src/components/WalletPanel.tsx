import { useState } from 'react';
import type { WalletKeys } from '../protocol/types';
import { walletFromSeed } from '../wallet/wallet';
import { bytesToHex } from '../wallet/wallet';

interface WalletPanelProps {
  onConnect: (keys: WalletKeys) => void;
}

type Network = 'mainnet' | 'stagenet' | 'testnet';

const DEMO_SEED = 'algebra veered lush nowhere copy woken jukebox huge nucleus bypass tissue actress onward opus rekindle zebra jargon extra liquid gang vague tossed tulips bypass';

export function WalletPanel({ onConnect }: WalletPanelProps) {
  const [seed, setSeed]       = useState('');
  const [network, setNetwork] = useState<Network>('stagenet');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [preview, setPreview] = useState<WalletKeys | null>(null);

  async function handleConnect() {
    const trimmed = seed.trim();
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount !== 25) {
      setError(`Seed phrase must be exactly 25 words (got ${wordCount})`);
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const keys = await walletFromSeed(trimmed, network);
      setPreview(keys);
      onConnect(keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    setSeed(DEMO_SEED);
    setNetwork('stagenet');
  }

  const wordCount = seed.trim() ? seed.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Connect Wallet</h2>
        <p className="text-sm text-zinc-400">
          Your seed phrase never leaves the browser — all key derivation happens locally.
        </p>
      </div>

      {/* Network selector */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
          Network
        </label>
        <div className="flex gap-2">
          {(['mainnet', 'stagenet', 'testnet'] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNetwork(n)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                network === n
                  ? n === 'mainnet'
                    ? 'bg-xmr-500 text-white'
                    : 'bg-zinc-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700'
              }`}
            >
              {n}
              {n === 'stagenet' && ' (test)'}
            </button>
          ))}
        </div>
        {network === 'mainnet' && (
          <p className="mt-2 text-xs text-xmr-400">
            ⚠ Mainnet — transactions use real XMR
          </p>
        )}
      </div>

      {/* Seed phrase input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
            25-Word Seed Phrase
          </label>
          <span className={`text-xs ${wordCount === 25 ? 'text-green-400' : 'text-zinc-500'}`}>
            {wordCount}/25 words
          </span>
        </div>
        <textarea
          value={seed}
          onChange={(e) => { setSeed(e.target.value); setError(''); }}
          rows={4}
          placeholder="word1 word2 word3 ... word25"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-xmr-500 focus:border-transparent resize-none"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleConnect}
          disabled={loading || wordCount !== 25}
          className="flex-1 bg-xmr-500 hover:bg-xmr-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Deriving keys…
            </>
          ) : (
            'Connect Wallet'
          )}
        </button>
        <button
          onClick={fillDemo}
          className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-all"
        >
          Use Demo
        </button>
      </div>

      {/* Key preview */}
      {preview && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-xs font-medium text-green-400 uppercase tracking-wider">Wallet Connected</span>
          </div>
          <KeyRow label="Address" value={preview.address} mono />
          <KeyRow label="View Key" value={bytesToHex(preview.viewSk)} mono sensitive />
          <KeyRow label="Spend Key" value={bytesToHex(preview.spendSk)} mono sensitive />
          <KeyRow label="Network" value={preview.network} />
        </div>
      )}
    </div>
  );
}

function KeyRow({ label, value, mono, sensitive }: {
  label: string;
  value: string;
  mono?: boolean;
  sensitive?: boolean;
}) {
  const [revealed, setRevealed] = useState(!sensitive);
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={`flex-1 text-xs break-all ${mono ? 'font-mono' : ''} ${
            sensitive && !revealed ? 'blur-sm select-none' : 'text-zinc-300'
          }`}
        >
          {value}
        </div>
        {sensitive && (
          <button
            onClick={() => setRevealed(!revealed)}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 shrink-0"
          >
            {revealed ? 'hide' : 'show'}
          </button>
        )}
      </div>
    </div>
  );
}
