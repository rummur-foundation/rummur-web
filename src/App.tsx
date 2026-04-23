import { useState } from 'react';
import type { WalletKeys, EncodeResult } from './protocol/types';
import { StepIndicator } from './components/StepIndicator';
import { WalletPanel } from './components/WalletPanel';
import { ComposePanel } from './components/ComposePanel';
import { NonceInspector } from './components/NonceInspector';
import { TxPanel } from './components/TxPanel';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { number: 1, label: 'Connect',  sublabel: 'wallet' },
  { number: 2, label: 'Compose',  sublabel: 'message' },
  { number: 3, label: 'Inspect',  sublabel: 'nonce' },
  { number: 4, label: 'Broadcast', sublabel: 'send' },
];

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [wallet, setWallet] = useState<WalletKeys | null>(null);
  const [encoded, setEncoded] = useState<EncodeResult | null>(null);
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [txId, setTxId] = useState('');

  function handleWalletConnect(keys: WalletKeys) {
    setWallet(keys);
    setStep(2);
  }

  function handleEncoded(result: EncodeResult, addr: string, msg: string) {
    setEncoded(result);
    setRecipient(addr);
    setMessage(msg);
    setStep(3);
  }

  function handleSent(id: string) {
    setTxId(id);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-xmr-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="font-semibold tracking-tight">rummur</span>
            <span className="text-zinc-600 text-xs font-mono ml-1">v0.1</span>
          </div>
          <div className="text-xs text-zinc-500">
            Private messaging over Monero
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* Step indicator */}
        <div className="flex justify-center">
          <StepIndicator steps={STEPS} currentStep={step} />
        </div>

        {/* Protocol explanation (shown only on step 1) */}
        {step === 1 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-medium text-zinc-200">How Rummur works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ProtocolCard
                icon="🔐"
                title="ECDH Encryption"
                body="Messages are encrypted with 8 × tx_sk × view_pk — Monero's own key derivation. No new cryptography."
              />
              <ProtocolCard
                icon="⛓"
                title="On-chain"
                body="The 255-byte encrypted nonce is embedded in tx_extra_nonce of a standard Monero transaction."
              />
              <ProtocolCard
                icon="👤"
                title="Identity-free"
                body="Your Monero address is your identity. No registration, no accounts, no servers."
              />
            </div>
          </div>
        )}

        {/* Active panel */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          {step === 1 && <WalletPanel onConnect={handleWalletConnect} />}
          {step === 2 && wallet && <ComposePanel wallet={wallet} onEncoded={handleEncoded} />}
          {step === 3 && encoded && (
            <NonceInspector
              result={encoded}
              recipientAddress={recipient}
              message={message}
              onProceed={() => setStep(4)}
            />
          )}
          {step === 4 && wallet && encoded && (
            <TxPanel
              wallet={wallet}
              encoded={encoded}
              recipientAddress={recipient}
              onSent={handleSent}
            />
          )}
        </div>

        {/* Nav buttons */}
        {step > 1 && (
          <div className="flex justify-between items-center">
            <button
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
              className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              ← Back
            </button>
            {step === 4 && txId && (
              <button
                onClick={() => {
                  setStep(1);
                  setWallet(null);
                  setEncoded(null);
                  setRecipient('');
                  setMessage('');
                  setTxId('');
                }}
                className="text-sm text-xmr-400 hover:text-xmr-300"
              >
                Send another →
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-700 space-y-1 pt-4">
          <div>
            Rummur Protocol v0.1 — messages are indistinguishable from standard Monero transactions
          </div>
          <div>
            Keys never leave your browser •{' '}
            <a href="https://github.com/rummur" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-500">
              GitHub
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function ProtocolCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
      <div className="text-lg">{icon}</div>
      <div className="text-xs font-medium text-zinc-200">{title}</div>
      <div className="text-xs text-zinc-500 leading-relaxed">{body}</div>
    </div>
  );
}
