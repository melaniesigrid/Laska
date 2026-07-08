/**
 * React + persistence + analytics glue for the pure streak module (`streak.ts`).
 *
 * This is the ONLY place streak state touches localStorage, the analytics seam, or
 * React. The rules themselves live in `streak.ts` and stay pure/unit-testable.
 *
 * SSR / prerender safety: this app is being SEO-rearchitected with SSG/prerender,
 * so `window`/`localStorage` may be absent at module-eval / first-render time.
 * Every storage access is guarded (try/catch + typeof window) and the hook seeds
 * from `initialStreakState()` on the server, then reconciles in a mount effect on
 * the client. Storage key follows the existing `laska-…` convention.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from './analytics/index.ts';
import {
  initialStreakState,
  recordAction,
  reconcile,
  dayKey,
  isBroken,
  type StreakState,
} from './streak.ts';

const KEY = 'laska-streak';

function readState(): StreakState {
  if (typeof window === 'undefined') return initialStreakState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialStreakState();
    const parsed = JSON.parse(raw) as Partial<StreakState> | null;
    if (parsed && typeof parsed === 'object') {
      // Coerce defensively — a hand-edited / older blob shouldn't crash the app.
      return {
        current: numOr(parsed.current, 0),
        longest: numOr(parsed.longest, 0),
        lastActiveDay: typeof parsed.lastActiveDay === 'string' ? parsed.lastActiveDay : null,
        freezes: numOr(parsed.freezes, 0),
        freezeProgress: numOr(parsed.freezeProgress, 0),
      };
    }
  } catch {
    /* unreadable / blocked storage — start fresh, ephemeral */
  }
  return initialStreakState();
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function writeState(state: StreakState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — keep in-memory state only */
  }
}

export interface UseStreak {
  state: StreakState;
  /** True once a match is finished today (the daily action is satisfied). */
  countedToday: boolean;
  /** Record the daily qualifying action (a finished match). Idempotent per day. */
  recordDailyAction: () => void;
}

/**
 * Hook owning the player's streak. On client mount it reconciles any silent lapse
 * (and emits `streak.broken` if a streak died while away). `recordDailyAction`
 * advances the streak and emits `streak.advanced`, persisting after each change.
 */
export function useStreak(): UseStreak {
  // SSR-safe initial value; the real client value is loaded in the mount effect
  // to avoid a hydration mismatch and to keep first render deterministic.
  const [state, setState] = useState<StreakState>(initialStreakState);
  const reconciled = useRef(false);

  useEffect(() => {
    if (reconciled.current) return;
    reconciled.current = true;
    const loaded = readState();
    const today = dayKey();
    const { state: next, brokenFrom } = reconcile(loaded, today);
    if (brokenFrom != null && brokenFrom > 0) {
      track('streak.broken', { previousLength: brokenFrom });
    }
    if (next !== loaded) writeState(next);
    setState(next);
  }, []);

  const recordDailyAction = useCallback(() => {
    setState((prev) => {
      const today = dayKey();
      const transition = recordAction(prev, today);
      if (transition.kind === 'already-counted') return prev;

      if (transition.kind === 'reset-then-advanced') {
        // The old streak lapsed between visits without a prior reconcile catching
        // it; report the loss before the fresh advance so the funnel sees both.
        track('streak.broken', { previousLength: transition.previousLength });
      }
      track('streak.advanced', { length: transition.length });
      writeState(transition.state);
      return transition.state;
    });
  }, []);

  return {
    state,
    countedToday: state.lastActiveDay === dayKey() && state.current > 0,
    recordDailyAction,
  };
}

/** Re-export for the indicator so it doesn't reach into the pure module directly. */
export { isBroken };
