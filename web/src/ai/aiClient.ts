/**
 * Async, framework-agnostic entry point to the AI opponent. The React layer
 * calls `getBestMove(state, { difficulty })` and awaits a move — it never
 * touches the engine or blocks on search.
 *
 *   const move = await getBestMove(state, { difficulty: 'expert' });
 *
 * Runs the search in a Web Worker (`aiWorker.ts`) when the environment supports
 * one, and falls back to a synchronous in-thread call otherwise (SSR, ancient
 * browsers, or a worker that failed to spawn) so callers get one stable API.
 *
 * Pass a numeric `seed` for reproducible games (tests, replays). Determinism is
 * carried as a seed, not a function, because functions can't be postMessage'd.
 */
import { chooseMove } from '../../../src/index.ts';
import type { GameState, Difficulty, Move } from '../../../src/index.ts';
import type { AIRequest, AIResponse } from './aiWorker.ts';

export interface BestMoveOptions {
  difficulty: Difficulty;
  /** Override the tier's search depth (plies). */
  depth?: number;
  /** Seed for a reproducible move; omit for normal (Math.random) play. */
  seed?: number;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

/** Synchronous compute — the fallback path and the worker's behaviour mirror. */
function syncMove(state: GameState, opts: BestMoveOptions): Move | null {
  return chooseMove(state, {
    difficulty: opts.difficulty,
    ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
    ...(opts.seed !== undefined ? { random: lcg(opts.seed) } : {}),
  });
}

interface Pending {
  resolve: (m: Move | null) => void;
  state: GameState;
  opts: BestMoveOptions;
}

let worker: Worker | null = null;
let triedWorker = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (triedWorker) return worker;
  triedWorker = true;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<AIResponse>) => {
      const p = pending.get(e.data.id);
      if (p) {
        pending.delete(e.data.id);
        p.resolve(e.data.move);
      }
    };
    // If the worker dies, drain every in-flight request synchronously so no
    // promise hangs, and fall back to the in-thread path for future calls.
    worker.onerror = () => {
      for (const [, p] of pending) p.resolve(syncMove(p.state, p.opts));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Choose a move for the side to move, off the main thread. Resolves to `null`
 *  only when the position has no legal move (the game is already decided). */
export function getBestMove(state: GameState, opts: BestMoveOptions): Promise<Move | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(syncMove(state, opts));

  const id = nextId++;
  const req: AIRequest = {
    id,
    state,
    difficulty: opts.difficulty,
    ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
  };
  return new Promise<Move | null>((resolve) => {
    pending.set(id, { resolve, state, opts });
    w.postMessage(req);
  });
}
