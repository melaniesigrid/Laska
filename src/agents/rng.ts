/**
 * Deterministic, seedable PRNG for reproducible matches and research.
 *
 * Uses mulberry32 — a small, well-known 32-bit generator. It is NOT
 * cryptographically secure; it exists purely so a given seed reproduces an
 * identical game/tournament (essential for comparing agents fairly and for
 * deterministic tests). Do not use it for anything security-sensitive.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a uniformly random element of a non-empty array using `rng`. */
export function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}
