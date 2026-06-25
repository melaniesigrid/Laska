/**
 * Async, framework-agnostic entry point to the AI engine. The React layer calls
 * `getBestMove(state, { difficulty })` to get the opponent's move, or
 * `analyzePosition(state, { depth })` to score every legal move for the hint
 * button and the post-game review — and awaits a result. It never touches the
 * engine or blocks the UI thread on search.
 *
 *   const move   = await getBestMove(state, { difficulty: 'expert' });
 *   const scored = await analyzePosition(state, { depth: 5 });
 *
 * Both run the search in a Web Worker (`aiWorker.ts`) when the environment
 * supports one, and fall back to a synchronous in-thread call otherwise (SSR,
 * ancient browsers, or a worker that failed to spawn) so callers get one stable
 * API regardless.
 *
 * Pass a numeric `seed` to `getBestMove` for reproducible games (tests, replays).
 * Determinism is carried as a seed, not a function, because functions can't be
 * postMessage'd. Analysis is already deterministic, so it needs no seed.
 */
import { chooseMove, scoreMoves } from '../../../src/index.ts';
import type { GameState, Difficulty, Move, ScoredMove } from '../../../src/index.ts';
import type { AIRequest, AIResponse } from './aiWorker.ts';

export interface BestMoveOptions {
  difficulty: Difficulty;
  /** Override the tier's search depth (plies). */
  depth?: number;
  /** Seed for a reproducible move; omit for normal (Math.random) play. */
  seed?: number;
}

export interface AnalyzeOptions {
  /** Search depth in plies. Quiescence is always on for honest scores. */
  depth: number;
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

function syncAnalyze(state: GameState, opts: AnalyzeOptions): ScoredMove[] {
  return scoreMoves(state, opts.depth, { quiescence: true });
}

interface Pending {
  /** Resolve with whatever the matching response carries (move | scored). */
  resolve: (value: unknown) => void;
  /** Recompute in-thread if the worker dies mid-flight, so no promise hangs. */
  fallback: () => unknown;
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
        p.resolve(e.data.kind === 'analyze' ? e.data.scored : e.data.move);
      }
    };
    // If the worker dies, drain every in-flight request synchronously so no
    // promise hangs, and fall back to the in-thread path for future calls.
    worker.onerror = () => {
      for (const [, p] of pending) p.resolve(p.fallback());
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
    kind: 'move',
    id,
    state,
    difficulty: opts.difficulty,
    ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
  };
  return new Promise<Move | null>((resolve) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      fallback: () => syncMove(state, opts),
    });
    w.postMessage(req);
  });
}

/** Score every legal move from the side to move (best first), off the main
 *  thread. Powers the hint button and the post-game review. Resolves to an empty
 *  array when the position is terminal (no legal moves). */
export function analyzePosition(state: GameState, opts: AnalyzeOptions): Promise<ScoredMove[]> {
  const w = getWorker();
  if (!w) return Promise.resolve(syncAnalyze(state, opts));

  const id = nextId++;
  const req: AIRequest = { kind: 'analyze', id, state, depth: opts.depth };
  return new Promise<ScoredMove[]>((resolve) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      fallback: () => syncAnalyze(state, opts),
    });
    w.postMessage(req);
  });
}
