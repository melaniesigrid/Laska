/**
 * Copies a shareable replay link for the game on screen. Prefers the native
 * share sheet when the browser offers one (mobile), otherwise copies the link
 * to the clipboard and confirms inline. The whole game travels in the URL (see
 * share.ts), so a shared link needs no account and no server.
 */
import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { shareUrlFor, type MovePair } from './share.ts';
import type { VariantId } from '../../src/index.ts';

export function ShareButton({
  moves,
  variant = 'laska',
  className = 'btn',
}: {
  moves: MovePair[];
  variant?: VariantId;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (moves.length === 0) return;
    const url = shareUrlFor(moves, variant);
    // Native share sheet (mobile / supported browsers) — best when present.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'A game of Laska', url });
        return;
      } catch {
        /* user dismissed the sheet — fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link to share the game:', url);
    }
  };

  return (
    <button
      className={className}
      onClick={share}
      disabled={moves.length === 0}
      aria-label="Share this game"
      title="Copy a shareable link to this game"
    >
      {copied ? <Check size={16} /> : <Share2 size={16} />} {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
