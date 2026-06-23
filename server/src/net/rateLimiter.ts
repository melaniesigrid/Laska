/**
 * A tiny dependency-free, in-memory sliding-window rate limiter.
 *
 * Used to throttle abuse of the auth HTTP endpoints (register/login/guest/
 * refresh/link). It is keyed by an arbitrary string (we use client IP +
 * endpoint) and tracks request timestamps within a rolling window.
 *
 * This is intentionally per-process: it protects a single node from bursts and
 * brute-force attempts without adding a dependency. For a multi-node deployment
 * a shared (e.g. Redis-backed) limiter would be the next step, but that belongs
 * to the cluster fabric and is out of scope here.
 */

export interface RateLimiterOptions {
  /** Max requests allowed per key within the window. */
  max: number;
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /** Clock injection for tests; defaults to Date.now. */
  now?: () => number;
}

export interface RateLimitResult {
  /** True when the request is within the limit and should proceed. */
  allowed: boolean;
  /** Requests remaining in the current window after this one. */
  remaining: number;
  /** Milliseconds until at least one slot frees up (0 when allowed). */
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  /** key -> sorted (ascending) request timestamps within the window. */
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(options: RateLimiterOptions) {
    this.max = options.max;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  /**
   * Records a hit for `key` and reports whether it is allowed. A rejected
   * request is NOT counted, so a blocked client cannot push its own window
   * forward by hammering the endpoint.
   */
  check(key: string): RateLimitResult {
    const t = this.now();
    const cutoff = t - this.windowMs;
    this.maybeSweep(t);

    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= this.max) {
      const oldest = recent[0]!;
      this.hits.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, oldest + this.windowMs - t),
      };
    }

    recent.push(t);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.max - recent.length, retryAfterMs: 0 };
  }

  /** Drops a key's history (e.g. after a successful, trusted action). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Periodically evict keys whose entire history has aged out, to cap memory. */
  private maybeSweep(t: number): void {
    if (t - this.lastSweep < this.windowMs) return;
    this.lastSweep = t;
    const cutoff = t - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      const last = timestamps[timestamps.length - 1];
      if (last === undefined || last <= cutoff) this.hits.delete(key);
    }
  }
}
