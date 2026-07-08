/**
 * Streak indicator — a small neumorphic pill for the top bar.
 *
 * Shows the current streak count (flame) and the freeze inventory (snowflakes).
 * Design system: matches `.btn` (raised neumorphic, two shadows, Lucide icons,
 * uppercase tracked label) per DESIGN.md — no emoji, no flat borders. On a streak
 * advance it plays a CSS-only "ignite" micro-animation (a one-shot flame pop +
 * count tick), gated by `prefers-reduced-motion`. Freezes are shown as cosmetic
 * forgiveness only; nothing here touches ranked play.
 */

import { useEffect, useRef, useState } from 'react';
import { Flame, Snowflake } from 'lucide-react';
import type { StreakState } from './streak.ts';

export interface StreakIndicatorProps {
  state: StreakState;
  /** True once today's qualifying match is done — lights the flame fully. */
  countedToday: boolean;
}

export function StreakIndicator({ state, countedToday }: StreakIndicatorProps) {
  const { current, freezes } = state;
  const prevCurrent = useRef(current);
  const [igniting, setIgniting] = useState(false);

  // Fire the one-shot ignite animation when the count climbs.
  useEffect(() => {
    if (current > prevCurrent.current) {
      setIgniting(true);
      const t = setTimeout(() => setIgniting(false), 720);
      prevCurrent.current = current;
      return () => clearTimeout(t);
    }
    prevCurrent.current = current;
    return undefined;
  }, [current]);

  // Nothing earned yet: stay out of the way until the player has a streak.
  if (current === 0 && freezes === 0) return null;

  const label = current === 1 ? '1 day' : `${current} days`;
  const dim = current > 0 && !countedToday; // streak alive but today not yet logged

  return (
    <div
      className={`streak-pill${igniting ? ' igniting' : ''}${dim ? ' streak-dim' : ''}`}
      role="status"
      aria-label={
        `Daily streak: ${label}.` +
        (freezes > 0 ? ` ${freezes} streak ${freezes === 1 ? 'freeze' : 'freezes'} banked.` : '') +
        (dim ? ' Play a match today to keep it.' : '')
      }
      title={dim ? 'Finish a match today to extend your streak' : 'Your daily streak'}
    >
      <span className="streak-flame" aria-hidden="true">
        <Flame size={16} />
      </span>
      <span className="streak-count">{current}</span>
      {freezes > 0 && (
        <span className="streak-freezes" aria-hidden="true">
          <Snowflake size={13} />
          <span className="streak-freeze-n">{freezes}</span>
        </span>
      )}
    </div>
  );
}
