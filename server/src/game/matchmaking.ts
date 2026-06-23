/**
 * Rating-based matchmaking queue.
 *
 * Players join with their current rating. A pair is made when two players'
 * ratings are within a window that WIDENS the longer someone waits, so a player
 * is never stuck waiting for a perfect-rating opponent. Colors are assigned at
 * random by the caller (or alternated) — here we just return the pair.
 *
 * This in-process queue is fine for a single node. For multi-node, back it with
 * Redis sorted sets (see TODO.md); the `pair`/`tryMatch` shape stays the same.
 */

import type { RuleVariant } from '../../../src/index.ts';

export interface QueueEntry {
  userId: string;
  rating: number;
  joinedAt: number;
  /**
   * Requested rule variant. Part of the matchmaking KEY: players are only paired
   * with others who requested the SAME variant. Optional/defaulted so callers
   * that don't care get today's 'lasker-classic' behavior.
   */
  variant?: RuleVariant;
}

export interface MatchmakingConfig {
  /** Initial acceptable rating gap. */
  baseWindow: number;
  /** Additional gap allowed per second waited. */
  windowGrowthPerSec: number;
  /** Hard cap on the gap. */
  maxWindow: number;
}

export const DEFAULT_MATCHMAKING: MatchmakingConfig = {
  baseWindow: 100,
  windowGrowthPerSec: 50,
  maxWindow: 1000,
};

export interface Pairing {
  a: QueueEntry;
  b: QueueEntry;
}

function windowFor(entry: QueueEntry, config: MatchmakingConfig, now: number): number {
  const waitedSec = Math.max(0, (now - entry.joinedAt) / 1000);
  return Math.min(config.maxWindow, config.baseWindow + waitedSec * config.windowGrowthPerSec);
}

/** The variant an entry is queued for; absent means today's default. */
function variantOf(entry: QueueEntry): RuleVariant {
  return entry.variant ?? 'lasker-classic';
}

/**
 * Pure pairing: given the current queue entries, return the closest-rated pair
 * whose rating gap fits inside BOTH players' wait-widened windows, or null.
 *
 * The requested rule variant is part of the matchmaking KEY: only two players who
 * asked for the SAME variant are ever paired (a 'nestor-strict' seeker is never
 * matched against a 'lasker-classic' seeker). We partition the queue by variant
 * and run the closest-pair search within each group, then return the overall
 * closest acceptable pair across groups. Does NOT mutate anything — the caller
 * removes the paired members. Shared by the in-process Matchmaker and the
 * Redis-backed cluster store.
 */
export function findPairing(
  entries: QueueEntry[],
  config: MatchmakingConfig,
  now: number,
): Pairing | null {
  if (entries.length < 2) return null;

  // Partition by requested variant; only same-variant entries can pair.
  const groups = new Map<RuleVariant, QueueEntry[]>();
  for (const e of entries) {
    const v = variantOf(e);
    const g = groups.get(v);
    if (g) g.push(e);
    else groups.set(v, [e]);
  }

  let best: { a: QueueEntry; b: QueueEntry; gap: number } | null = null;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((x, y) => x.rating - y.rating);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      const gap = Math.abs(a.rating - b.rating);
      const allowed = Math.min(windowFor(a, config, now), windowFor(b, config, now));
      if (gap <= allowed && (!best || gap < best.gap)) {
        best = { a, b, gap };
      }
    }
  }
  return best ? { a: best.a, b: best.b } : null;
}

export class Matchmaker {
  private queue: QueueEntry[] = [];

  constructor(private config: MatchmakingConfig = DEFAULT_MATCHMAKING) {}

  get size(): number {
    return this.queue.length;
  }

  has(userId: string): boolean {
    return this.queue.some((e) => e.userId === userId);
  }

  /** Add a player. Re-joining replaces the old entry (resets wait time). */
  enqueue(userId: string, rating: number, now = Date.now(), variant?: RuleVariant): void {
    this.remove(userId);
    this.queue.push(variant ? { userId, rating, joinedAt: now, variant } : { userId, rating, joinedAt: now });
  }

  remove(userId: string): void {
    this.queue = this.queue.filter((e) => e.userId !== userId);
  }

  /**
   * Attempt to form one pairing. Returns the pair (already removed from the
   * queue) or null if no acceptable pair exists yet. The net layer should call
   * this on each enqueue and on a periodic tick (so growing windows eventually
   * match waiting players).
   */
  tryMatch(now = Date.now()): Pairing | null {
    const pair = findPairing(this.queue, this.config, now);
    if (!pair) return null;
    this.remove(pair.a.userId);
    this.remove(pair.b.userId);
    return pair;
  }

  /** Drain as many pairings as possible in one pass (e.g. on a tick). */
  matchAll(now = Date.now()): Pairing[] {
    const pairs: Pairing[] = [];
    let p = this.tryMatch(now);
    while (p) {
      pairs.push(p);
      p = this.tryMatch(now);
    }
    return pairs;
  }
}
