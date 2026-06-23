/* Anonymous identity + session + first-seen bookkeeping for the funnel.
 *
 * These ids are the minimum needed to compute the funnel (install → ... → D1/D7)
 * WITHOUT collecting PII:
 *   - anonId:   random, per-device, persisted. Lets us de-dupe a device across
 *               sessions so "install" and "D1/D7 return" are computable. It is
 *               NOT an account id and NOT a cross-site identifier.
 *   - sessionId: random, per page-load, in-memory. Groups events within a visit.
 *   - firstSeen: the first time this device ever booted the app (ms). Powers
 *               app.loaded{firstEver} and app.returned{daysSinceFirstSeen}.
 *
 * COMPLIANCE: storing a random anonId in localStorage is low-risk, but a consent
 * banner is still the right gate before turning on a real (off-device) sink and
 * before associating anonId with an account. localStorage can throw (private
 * mode / blocked storage) — every access is guarded and degrades to ephemeral.
 */

const ANON_KEY = 'laska-anon-id';
const FIRST_SEEN_KEY = 'laska-first-seen';

function randomId(): string {
  // crypto.randomUUID is available in all evergreen browsers this app targets.
  try {
    return crypto.randomUUID();
  } catch {
    return `r-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked — ids degrade to per-session only */
  }
}

let cachedAnonId: string | null = null;

/** Stable-per-device anonymous id. Created on first call if absent. */
export function getAnonId(): string {
  if (cachedAnonId) return cachedAnonId;
  let id = read(ANON_KEY);
  if (!id) {
    id = randomId();
    write(ANON_KEY, id);
  }
  cachedAnonId = id;
  return id;
}

/** Fresh id for this page-load; lives only in memory. */
export const sessionId: string = randomId();

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FirstSeenInfo {
  /** True if this is the very first boot on this device (the "install" event). */
  firstEver: boolean;
  /** Whole days between first boot and now (0 on the first boot). */
  daysSinceFirstSeen: number;
}

/** Read-or-initialise the first-seen timestamp and report return-visit info.
 *  Call ONCE per session (App boot). Idempotent within a session via a guard. */
let firstSeenResolved: FirstSeenInfo | null = null;
export function resolveFirstSeen(now: number = Date.now()): FirstSeenInfo {
  if (firstSeenResolved) return firstSeenResolved;
  const stored = read(FIRST_SEEN_KEY);
  if (!stored) {
    write(FIRST_SEEN_KEY, String(now));
    firstSeenResolved = { firstEver: true, daysSinceFirstSeen: 0 };
    return firstSeenResolved;
  }
  const first = Number(stored);
  const days = Number.isFinite(first) ? Math.floor((now - first) / DAY_MS) : 0;
  firstSeenResolved = { firstEver: false, daysSinceFirstSeen: Math.max(0, days) };
  return firstSeenResolved;
}
