/**
 * Shared helpers for `platformStats` so all three Repository backends bucket
 * days identically (UTC calendar days, last-30-window with gap-fill). Kept in
 * `storage/` so it never leaks into game/net code.
 */

/** 'YYYY-MM-DD' for the UTC calendar day containing `epochMs`. */
export function utcDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** Rolling-window cutoffs (epoch ms) used across every stats query. */
export function windows(now: number): { d1: number; d7: number; d30: number } {
  const DAY = 24 * 60 * 60 * 1000;
  return { d1: now - DAY, d7: now - 7 * DAY, d30: now - 30 * DAY };
}

/**
 * The last 30 UTC calendar days ending on `now`'s day (oldest→newest), as an
 * ordered list of 'YYYY-MM-DD' keys plus the inclusive epoch-ms lower bound of
 * the oldest bucket. Counts for days with no signups must be filled with 0.
 */
export function signupDayWindow(now: number): { days: string[]; sinceMs: number } {
  const DAY = 24 * 60 * 60 * 1000;
  // Midnight UTC of `now`'s calendar day.
  const todayMidnight = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    days.push(utcDay(todayMidnight - i * DAY));
  }
  return { days, sinceMs: todayMidnight - 29 * DAY };
}

/** Build the gap-filled signupsByDay array from a day->count map. */
export function fillSignupDays(
  days: string[],
  counts: Map<string, number>,
): { day: string; count: number }[] {
  return days.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}
