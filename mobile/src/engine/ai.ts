/**
 * Native AI host — same async surface as the web's getBestMove
 * (web/src/ai/aiClient.ts) but without a Web Worker (RN has none).
 *
 * The search (`chooseMove`) is pure and shared. v1 runs it on the JS thread but
 * yields one tick first so React can paint a "thinking" state before the
 * (synchronous) search blocks. For current difficulty depths this is acceptable;
 * if deep tiers jank on low-end devices, move the search to a JS worker thread
 * (VERIFY a current/maintained option) mirroring the web Worker design — the
 * engine code does not change, only the host.
 */
import { chooseMove, type GameState, type Difficulty, type Move } from './index.ts';

export interface BestMoveOptions {
  difficulty: Difficulty;
  /** Override the tier's search depth (plies). */
  depth?: number;
  /** Seed for a reproducible move; omit for normal play. */
  seed?: number;
}

// Mirrors the web client's deterministic LCG so seeded games match across
// platforms (tests, replays).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

export async function getBestMove(
  state: GameState,
  opts: BestMoveOptions,
): Promise<Move | null> {
  // Yield once so the UI can show "thinking" before the blocking search.
  await new Promise<void>((r) => setTimeout(r, 0));
  return chooseMove(state, {
    difficulty: opts.difficulty,
    ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
    ...(opts.seed !== undefined ? { random: lcg(opts.seed) } : {}),
  });
}
