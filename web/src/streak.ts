/**
 * Daily-streak retention loop — PURE logic, no React, no storage, no analytics.
 *
 * A "streak" counts consecutive local-calendar days on which the player did the
 * qualifying daily action (finishing a match). The whole module is a set of pure
 * functions over a serialisable `StreakState`, so it is trivially unit-testable
 * and the React hook / localStorage layer (see `useStreak.ts`) stay thin.
 *
 * Days are keyed by LOCAL calendar date (`YYYY-MM-DD`), not UTC and not raw ms:
 * the streak should advance/break on the player's wall clock, and a key is
 * timezone-agnostic to compare (we never do ms arithmetic across a DST boundary).
 *
 * FREEZE MECHANIC (retention only — NEVER pay-to-win, NEVER a ranked advantage):
 * a freeze auto-protects a single missed day so a one-day lapse doesn't reset a
 * long streak. Freezes are a small inventory that the player earns by playing
 * (one per `FREEZE_EARN_EVERY` days of streak, capped at `MAX_FREEZES`). They are
 * spent automatically, oldest-gap-first, and only ever preserve a streak count —
 * they grant zero gameplay, rating, or matchmaking advantage. This is cosmetic
 * forgiveness, nothing more. (If a paid surface ever wants to grant freezes it
 * must stay purely cosmetic; it must not touch ranked integrity.)
 */

/** Local-calendar day key, `YYYY-MM-DD`. The unit a streak is measured in. */
export type DayKey = string;

/** Persisted streak state. PII-free: only counters and local day keys. */
export interface StreakState {
  /** Length of the current run of consecutive (or freeze-bridged) active days. */
  current: number;
  /** Best `current` ever reached on this device. */
  longest: number;
  /** Day key of the most recent qualifying action, or null if never active. */
  lastActiveDay: DayKey | null;
  /** Unspent streak freezes available to auto-protect a missed day. */
  freezes: number;
  /**
   * Progress toward the next earned freeze, in active days since the last grant.
   * Resets to 0 each time a freeze is earned. Earning is capped at MAX_FREEZES.
   */
  freezeProgress: number;
}

/** Starting inventory the first time a streak is established. */
export const STARTING_FREEZES = 2;
/** Hard cap on banked freezes — forgiveness, not a stockpile. */
export const MAX_FREEZES = 3;
/** Earn one freeze for every this-many active days of streak. */
export const FREEZE_EARN_EVERY = 7;

/** A brand-new, never-active streak. */
export function initialStreakState(): StreakState {
  return {
    current: 0,
    longest: 0,
    lastActiveDay: null,
    freezes: 0,
    freezeProgress: 0,
  };
}

/** Local-calendar day key for a timestamp (default: now). Local time, not UTC. */
export function dayKey(at: Date | number = new Date()): DayKey {
  const d = typeof at === 'number' ? new Date(at) : at;
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole local-calendar days from `a` to `b` (b − a). Negative if b precedes a.
 *  Computed by parsing the keys to local midnights, so DST never skews the count. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const da = parseDayKey(a);
  const db = parseDayKey(b);
  // Use UTC math on the two LOCAL midnights: both are constructed at local 00:00,
  // and the difference of two local midnights in ms / 86_400_000 rounds cleanly to
  // the calendar-day delta (a possible ±1h DST offset can't cross the .5 rounding).
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / 86_400_000);
}

function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map((n) => Number(n));
  // Local midnight of that calendar day.
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Is `today` already counted toward the current streak? */
export function isCountedToday(state: StreakState, today: DayKey = dayKey()): boolean {
  return state.lastActiveDay === today;
}

/**
 * Would the streak be considered BROKEN as of `today`, given freezes?
 * The streak survives a gap only if there are enough freezes to bridge every
 * fully-missed day between the last active day and today. (Yesterday-active or
 * today-active is never broken.) This is a read-only projection — it does not
 * mutate state or spend freezes.
 */
export function isBroken(state: StreakState, today: DayKey = dayKey()): boolean {
  if (state.lastActiveDay == null || state.current === 0) return false;
  const gap = daysBetween(state.lastActiveDay, today);
  if (gap <= 1) return false; // today or yesterday — intact
  const missed = gap - 1; // fully-skipped days in between
  return missed > state.freezes;
}

/** Outcome of recording a qualifying action — drives analytics + UI. */
export type StreakTransition =
  | { kind: 'already-counted'; state: StreakState }
  | { kind: 'advanced'; state: StreakState; length: number; freezesSpent: number; freezeEarned: boolean }
  | { kind: 'reset-then-advanced'; state: StreakState; length: number; previousLength: number };

/**
 * Record that the player did the qualifying action on `today`. Pure: returns the
 * next state and a tagged transition; callers map the transition to analytics
 * (`streak.advanced` / `streak.broken`) and persistence.
 *
 * Cases:
 *  - already done today           → no-op (idempotent; finishing 3 matches today
 *                                   counts once).
 *  - first ever action            → start a streak at 1, seed STARTING_FREEZES.
 *  - yesterday active OR gap fully
 *    bridged by freezes           → advance; spend one freeze per missed day.
 *  - gap too large for freezes     → the old streak is BROKEN; a NEW streak starts
 *                                   at 1 (and `previousLength` is reported so the
 *                                   caller can emit `streak.broken`).
 */
export function recordAction(prev: StreakState, today: DayKey = dayKey()): StreakTransition {
  if (prev.lastActiveDay === today) {
    return { kind: 'already-counted', state: prev };
  }

  // First action ever (or after a fully-cleared state): begin a fresh streak.
  if (prev.lastActiveDay == null || prev.current === 0) {
    const started: StreakState = {
      current: 1,
      longest: Math.max(prev.longest, 1),
      lastActiveDay: today,
      // Seed the starting inventory only on the very first streak; keep any banked
      // freezes if we're resuming from a current:0-but-has-freezes edge state.
      freezes: prev.lastActiveDay == null ? STARTING_FREEZES : prev.freezes,
      freezeProgress: 1 % FREEZE_EARN_EVERY,
    };
    return { kind: 'advanced', state: started, length: 1, freezesSpent: 0, freezeEarned: false };
  }

  const gap = daysBetween(prev.lastActiveDay, today);

  // Defensive: a non-positive gap means clock went backwards (tz change / manual
  // clock). Treat as "same logical day already counted" rather than corrupting.
  if (gap <= 0) {
    return { kind: 'already-counted', state: prev };
  }

  const missed = gap - 1; // fully-skipped days between last-active and today

  if (missed <= prev.freezes) {
    // Continue the streak, spending one freeze per missed day.
    const freezesSpent = missed;
    const nextCurrent = prev.current + 1;
    const earn = grantFreeze(prev.freezeProgress, prev.freezes - freezesSpent);
    const next: StreakState = {
      current: nextCurrent,
      longest: Math.max(prev.longest, nextCurrent),
      lastActiveDay: today,
      freezes: earn.freezes,
      freezeProgress: earn.progress,
    };
    return {
      kind: 'advanced',
      state: next,
      length: nextCurrent,
      freezesSpent,
      freezeEarned: earn.earned,
    };
  }

  // Gap too large to bridge — the streak is broken; start a new one at 1.
  const previousLength = prev.current;
  const restarted: StreakState = {
    current: 1,
    longest: Math.max(prev.longest, previousLength),
    lastActiveDay: today,
    // Banked freezes survive a break (they're earned forgiveness, not the streak
    // itself); progress toward the next freeze resets with the new streak.
    freezes: prev.freezes,
    freezeProgress: 1 % FREEZE_EARN_EVERY,
  };
  return { kind: 'reset-then-advanced', state: restarted, length: 1, previousLength };
}

/** Advance freeze-earn progress by one active day and grant a freeze on overflow,
 *  respecting MAX_FREEZES. Pure helper. */
function grantFreeze(
  progress: number,
  freezesAfterSpend: number,
): { freezes: number; progress: number; earned: boolean } {
  const nextProgress = progress + 1;
  if (nextProgress >= FREEZE_EARN_EVERY && freezesAfterSpend < MAX_FREEZES) {
    return { freezes: freezesAfterSpend + 1, progress: 0, earned: true };
  }
  // Keep counting toward a freeze even when capped, but never exceed the period so
  // the progress ring reads sensibly; reset on the period boundary regardless.
  return {
    freezes: freezesAfterSpend,
    progress: nextProgress % FREEZE_EARN_EVERY,
    earned: false,
  };
}

/**
 * Reconcile a loaded state against `today` WITHOUT recording an action. Used on
 * app boot so the indicator shows the truth (e.g. a streak that has silently
 * lapsed since the last visit), and so freezes are consumed for the lapse exactly
 * once. Returns the possibly-mutated state plus, if the streak just lapsed beyond
 * what freezes can cover, the length that was lost (for a `streak.broken` event).
 */
export function reconcile(
  prev: StreakState,
  today: DayKey = dayKey(),
): { state: StreakState; brokenFrom: number | null } {
  if (prev.lastActiveDay == null || prev.current === 0) {
    return { state: prev, brokenFrom: null };
  }
  const gap = daysBetween(prev.lastActiveDay, today);
  if (gap <= 1) {
    // Today or yesterday active — nothing lapsed yet.
    return { state: prev, brokenFrom: null };
  }
  const missed = gap - 1;
  if (missed <= prev.freezes) {
    // Freezes silently absorb the lapse; spend them but DON'T advance the count
    // (no action was taken — the streak is merely held). We mark lastActiveDay to
    // yesterday so it remains "intact" without double-charging on a later action.
    const heldDay = dayKeyOffset(today, -1);
    const next: StreakState = {
      ...prev,
      freezes: prev.freezes - missed,
      lastActiveDay: heldDay,
    };
    return { state: next, brokenFrom: null };
  }
  // Lapsed beyond rescue — reset to 0 (a fresh action will start a new streak).
  const broken: StreakState = {
    ...prev,
    current: 0,
    freezeProgress: 0,
  };
  return { state: broken, brokenFrom: prev.current };
}

/** Day key offset from `key` by `delta` whole calendar days. */
export function dayKeyOffset(key: DayKey, delta: number): DayKey {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}
