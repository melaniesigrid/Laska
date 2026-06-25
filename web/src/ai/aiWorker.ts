/**
 * Web Worker that runs the Laska search off the main thread, so the React UI
 * never blocks while the engine thinks. It is a thin transport: all decision
 * logic stays in the shared engine (`src/ai.ts`) — the worker only marshals a
 * request in and a result out.
 *
 * Two request kinds share the one worker:
 *  - `move`    — pick a move to play (the AI opponent). Honours difficulty.
 *  - `analyze` — score EVERY legal move at a fixed depth (the hint button and the
 *                post-game review). Returns the full ranked list so the caller
 *                can find both the best move and how the played move ranked.
 *
 * Determinism: the engine's RNG is a function and can't cross `postMessage`, so
 * a `move` request carries a numeric `seed` and the worker rebuilds the same LCG
 * the tests use. Omit the seed for normal play (defaults to Math.random in-engine).
 * Analysis is deterministic (no blunder roll), so it needs no seed.
 *
 * Typed against the DOM lib (the web tsconfig has no "webworker" lib) via a
 * minimal cast of `self`, which avoids the Window.postMessage signature clash.
 */
import { chooseMove, scoreMoves } from '../../../src/index.ts';
import type { GameState, Difficulty, Move, ScoredMove } from '../../../src/index.ts';

/** Ask the worker to pick a move to PLAY (the AI opponent). */
export interface AIMoveRequest {
  kind?: 'move';
  id: number;
  state: GameState;
  difficulty: Difficulty;
  depth?: number;
  seed?: number;
}

/** Ask the worker to SCORE every legal move (hint + game review). */
export interface AIAnalyzeRequest {
  kind: 'analyze';
  id: number;
  state: GameState;
  /** Search depth in plies. Quiescence is always on so scores never lie mid-swap. */
  depth: number;
}

export type AIRequest = AIMoveRequest | AIAnalyzeRequest;

export interface AIMoveResponse {
  id: number;
  kind: 'move';
  move: Move | null;
  elapsedMs: number;
}

export interface AIAnalyzeResponse {
  id: number;
  kind: 'analyze';
  /** Every legal move scored from the side to move, best first. */
  scored: ScoredMove[];
  elapsedMs: number;
}

export type AIResponse = AIMoveResponse | AIAnalyzeResponse;

/** The seedable LCG mirrored from `test/ai.test.ts` for reproducible games. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AIRequest>) => void) | null;
  postMessage(msg: AIResponse): void;
};

ctx.onmessage = (e) => {
  const req = e.data;
  const t0 = now();
  if (req.kind === 'analyze') {
    const scored = scoreMoves(req.state, req.depth, { quiescence: true });
    ctx.postMessage({ id: req.id, kind: 'analyze', scored, elapsedMs: now() - t0 });
    return;
  }
  const { id, state, difficulty, depth, seed } = req;
  const move = chooseMove(state, {
    difficulty,
    ...(depth !== undefined ? { depth } : {}),
    ...(seed !== undefined ? { random: lcg(seed) } : {}),
  });
  ctx.postMessage({ id, kind: 'move', move, elapsedMs: now() - t0 });
};
