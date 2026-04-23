import { useState, useEffect } from 'react';
import type { WalletKeys } from '../protocol/types';
import { validateAddress } from '../protocol/address';
import { FLAG_SENDER_ADDR, FLAG_IS_REPLY, MAX_MSG_ANON, MAX_MSG_WITH_SENDER } from '../protocol/types';
import type { EncodeResult } from '../protocol/types';
import { encodeNonce } from '../protocol/encode';

interface ComposePanelProps {
  wallet: WalletKeys;
  onEncoded: (result: EncodeResult, recipientAddress: string, message: string) => void;
}

export function ComposePanel({ wallet, onEncoded }: ComposePanelProps) {
  const [recipient, setRecipient]       = useState('');
  const [message, setMessage]           = useState('');
  const [includeSender, setIncludeSender] = useState(false);
  const [isReply, setIsReply]           = useState(false);
  const [threadNonceHex, setThreadNonceHex] = useState('');
  const [encoding, setEncoding]         = useState(false);
  const [error, setError]               = useState('');

  const encoder = new TextEncoder();
  const msgBytes = encoder.encode(message).length;
  const flags = (includeSender ? FLAG_SENDER_ADDR : 0) | (isReply ? FLAG_IS_REPLY : 0);
  const maxBytes = includeSender ? MAX_MSG_WITH_SENDER : MAX_MSG_ANON;
  const overLimit = msgBytes > maxBytes;

  const recipientValid = recipient.length === 0 ? null : validateAddress(recipient);

  async function handleEncode() {
    if (!validateAddress(recipient)) {
      setError('Invalid recipient address');
      return;
    }
    if (overLimit) {
      setError(`Message too long (${msgBytes}/${maxBytes} bytes)`);
      return;
    }
    if (message.trim().length === 0) {
      setError('Message cannot be empty');
      return;
    }

    setEncoding(true);
    setError('');

    try {
      let threadNonceIn: Uint8Array | undefined;
      if (isReply && threadNonceHex.trim()) {
        const hex = threadNonceHex.trim().replace(/\s/g, '');
        if (hex.length !== 16) throw new Error('Thread nonce must be 8 bytes (16 hex chars)');
        threadNonceIn = new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
          threadNonceIn[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
      }

      const result = encodeNonce({
        recipientAddress: recipient,
        message,
        flags,
        senderAddress: includeSender ? wallet.address : undefined,
        threadNonceIn,
      });

      onEncoded(result, recipient, message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEncoding(false);
    }
  }

  // Reset error on input change
  useEffect(() => { setError(''); }, [recipient, message, includeSender]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Compose Message</h2>
        <p className="text-sm text-zinc-400">
          Sending from <span className="font-mono text-zinc-300">{wallet.address.slice(0, 12)}…</span>
          {' '}on <span className="text-zinc-300">{wallet.network}</span>
        </p>
      </div>

      {/* Recipient */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
          Recipient Monero Address
        </label>
        <div className="relative">
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            placeholder="4… or 8… (primary or subaddress)"
            className={`w-full bg-zinc-900 border rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:border-transparent ${
              recipientValid === false
                ? 'border-red-700 focus:ring-red-500'
                : recipientValid === true
                ? 'border-green-700 focus:ring-green-500'
                : 'border-zinc-700 focus:ring-xmr-500'
            }`}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          {recipientValid !== null && (
            <div className={`absolute right-3 top-3 text-xs ${recipientValid ? 'text-green-400' : 'text-red-400'}`}>
              {recipientValid ? '✓ valid' : '✗ invalid'}
            </div>
          )}
        </div>
      </div>

      {/* Message */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Message
          </label>
          <span className={`text-xs font-mono ${overLimit ? 'text-red-400' : msgBytes > maxBytes * 0.9 ? 'text-yellow-400' : 'text-zinc-500'}`}>
            {msgBytes}/{maxBytes} bytes
          </span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Your private message…"
          className={`w-full bg-zinc-900 border rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:border-transparent resize-none ${
            overLimit ? 'border-red-700 focus:ring-red-500' : 'border-zinc-700 focus:ring-xmr-500'
          }`}
        />
      </div>

      {/* Flags */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Options</div>

        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={includeSender}
            onChange={(e) => setIncludeSender(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-xmr-500 focus:ring-xmr-500 cursor-pointer"
          />
          <div>
            <div className="text-sm text-zinc-200 group-hover:text-white">Include sender address</div>
            <div className="text-xs text-zinc-500">
              Appends your 95-byte address to the encrypted payload.
              Reduces max message length to {MAX_MSG_WITH_SENDER} bytes.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={isReply}
            onChange={(e) => setIsReply(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-xmr-500 focus:ring-xmr-500 cursor-pointer"
          />
          <div>
            <div className="text-sm text-zinc-200 group-hover:text-white">Reply to existing thread</div>
            <div className="text-xs text-zinc-500">
              Sets the IS_REPLY flag and echoes the original thread nonce.
            </div>
          </div>
        </label>

        {isReply && (
          <div className="ml-7">
            <label className="block text-xs text-zinc-400 mb-1">Thread nonce (16 hex chars)</label>
            <input
              value={threadNonceHex}
              onChange={(e) => setThreadNonceHex(e.target.value)}
              placeholder="e.g. a1b2c3d4e5f60708"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-xmr-500"
              maxLength={16}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Fee note */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-400 space-y-1">
        <div className="font-medium text-zinc-300">Transaction fee estimate</div>
        <div className="flex justify-between">
          <span>Slow priority (recommended)</span>
          <span className="font-mono">~0.0006 XMR (~$0.21)</span>
        </div>
        <div className="flex justify-between">
          <span>Output to recipient</span>
          <span className="font-mono">0.000001 XMR (dust)</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={handleEncode}
        disabled={encoding || !recipientValid || overLimit || message.trim().length === 0}
        className="w-full bg-xmr-500 hover:bg-xmr-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
      >
        {encoding ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Encoding nonce…
          </>
        ) : (
          'Encode Nonce →'
        )}
      </button>
    </div>
  );
}
