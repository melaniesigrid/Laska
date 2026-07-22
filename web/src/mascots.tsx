import { useMemo, type CSSProperties, type ReactNode } from 'react';

/**
 * Dot-mascots — original, lightweight SVG creatures in the *spirit* of the
 * friendly-dot puzzle aesthetic (simple round body + big expressive eyes).
 *
 * These are deliberately ORIGINAL art, not a reproduction of any existing
 * game's characters or assets. They headline the "Confetti" theme's character
 * layer, but render fine in every theme: each tint reads from a `--dot-*`
 * token *with a hard-coded fallback*, so themes that don't define those tokens
 * still get the intended colour.
 *
 * Motion (idle bob + blink, or a one-shot cheer) lives in styles.css under
 * `.dot-mascot`, and is gated by the global `prefers-reduced-motion`
 * kill-switch — nothing here animates when the user opts out.
 */

const TINTS = {
  coral: 'var(--dot-coral, #f4796b)',
  sun: 'var(--dot-sun, #ffc94d)',
  mint: 'var(--dot-mint, #4fc59a)',
  sky: 'var(--dot-sky, #58b4e6)',
  grape: 'var(--dot-grape, #8a63d2)',
} as const;

export type MascotTint = keyof typeof TINTS;
export type MascotMood = 'idle' | 'sleepy' | 'cheer';

type DotMascotProps = {
  tint?: MascotTint;
  /** Overrides `tint` with any CSS colour (e.g. a theme token like
   *  `var(--l-accent)`) so the creature can harmonise with the active palette. */
  color?: string;
  mood?: MascotMood;
  size?: number;
  /** Decorative by default; pass a label to expose it to assistive tech. */
  label?: string;
};

/** A single round dot-creature. Eyes follow the mood; cheer plays once. */
export function DotMascot({ tint = 'grape', color, mood = 'idle', size = 96, label }: DotMascotProps) {
  const fill = color ?? TINTS[tint];
  const decorative = !label;
  // Sleepy = closed, curved eyes; otherwise big round eyes with a highlight.
  const eyes =
    mood === 'sleepy' ? (
      <>
        <path d="M22 30 q6 5 12 0" stroke="#2e3440" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M50 30 q6 5 12 0" stroke="#2e3440" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle className="dm-eye" cx="28" cy="32" r="6.5" fill="#2e3440" />
        <circle className="dm-eye" cx="56" cy="32" r="6.5" fill="#2e3440" />
        <circle cx="30.2" cy="29.8" r="2" fill="#fff" />
        <circle cx="58.2" cy="29.8" r="2" fill="#fff" />
      </>
    );
  // A small mouth — a soft smile, wider when cheering.
  const mouth =
    mood === 'cheer' ? (
      <path d="M32 44 q10 12 20 0" stroke="#2e3440" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M34 45 q8 6 16 0" stroke="#2e3440" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    );

  return (
    <span
      className={`dot-mascot${mood === 'cheer' ? ' cheer' : ''}`}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={label}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 84 84" width={size} height={size}>
        <g className="dm-body">
          <circle cx="42" cy="40" r="34" fill={fill} />
          {/* soft top highlight for a little roundness */}
          <ellipse cx="32" cy="22" rx="14" ry="8" fill="#fff" opacity="0.18" />
          {eyes}
          {mouth}
        </g>
      </svg>
    </span>
  );
}

type MascotStateProps = {
  tint?: MascotTint;
  mood?: MascotMood;
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
};

/** A friendly empty/loading panel: a mascot over a title, subtitle, and slot. */
export function MascotState({ tint = 'grape', mood = 'idle', title, sub, children }: MascotStateProps) {
  return (
    <div className="mascot-state">
      <DotMascot tint={tint} mood={mood} />
      <div className="ms-title">{title}</div>
      {sub ? <div className="ms-sub">{sub}</div> : null}
      {children}
    </div>
  );
}

/** The five friendly dot hues, hard-coded so the celebration reads vividly on
 *  every theme (the `--dot-*` tokens only exist under Confetti). */
const CONFETTI_COLORS = ['#f4796b', '#ffc94d', '#4fc59a', '#58b4e6', '#8a63d2'];

/**
 * WinConfetti — a one-shot victory shower. A fixed full-screen overlay of small
 * falling dots/chips in the friendly palette. Pure CSS motion (keyframes in
 * styles.css under `.confetti-field`); the global `prefers-reduced-motion`
 * kill-switch hides the whole field, so it never animates when the user opts
 * out. Mount it when a game is won — it plays once and then sits off-screen.
 */
export function WinConfetti({ count = 38 }: { count?: number }) {
  // Randomised once per mount (a fresh win remounts → a fresh shower). Math.random
  // is fine in the real React runtime; the spread keeps every chip distinct.
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.45,
        duration: 2.1 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        drift: (Math.random() - 0.5) * 90,
        rot: (Math.random() * 6 - 3) * 180,
        round: Math.random() > 0.5,
        scale: 0.7 + Math.random() * 0.7,
      })),
    [count],
  );
  return (
    <div className="confetti-field" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              borderRadius: p.round ? '50%' : '2px',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
              '--rot': `${p.rot}deg`,
              '--scale': `${p.scale}`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
