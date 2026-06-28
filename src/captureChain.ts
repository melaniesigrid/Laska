/**
 * Capture-chain helpers — pure move-sequencing on top of `legalMoves`/`Move.path`.
 *
 * A multi-jump in Laska is a single legal `Move` whose `path` lists each landing
 * in order. These helpers let a UI play that move out one leap at a time — so a
 * human jumps each enemy themselves, and an opponent's chain can be animated leap
 * by leap — without any surface re-deriving capture rules. Every surface (web
 * local/online/tutorial, the native app) drives the same logic from here.
 *
 * All functions are pure and depend only on the engine; no UI, timing or state.
 */
import type { GameState, Move } from './types.ts';
import { legalMoves } from './rules.ts';

/** An in-progress, hand-played capture for one column. */
export interface CaptureChain {
  /** The square the chained column started from. */
  origin: number;
  /** Landing squares chosen so far, in order (empty = no leap taken yet). */
  steps: number[];
  /** Legal capture moves whose `path` still matches origin + every step so far. */
  candidates: Move[];
}

/**
 * Start a capture chain for the column on `origin`, given the side-to-move's full
 * legal-move list. Returns null when `origin` has no capture available — the
 * caller should then treat a tap as an ordinary one-step move. The chain begins at
 * depth 0, so `nextHopTargets` yields the first legal leap squares.
 */
export function beginCaptureChain(legal: Move[], origin: number): CaptureChain | null {
  const candidates = legal.filter((m) => m.from === origin && m.isCapture);
  if (candidates.length === 0) return null;
  return { origin, steps: [], candidates };
}

/**
 * The legal landing squares for the NEXT leap of `chain`, each mapped to the
 * deepest candidate move passing through it. The value is only a representative
 * (useful for "is this a capture?" styling); the chosen route is resolved by
 * `advanceCaptureChain`.
 */
export function nextHopTargets(chain: CaptureChain): Map<number, Move> {
  const depth = chain.steps.length;
  const map = new Map<number, Move>();
  for (const m of chain.candidates) {
    const next = m.path[depth];
    if (next === undefined) continue;
    const best = map.get(next);
    if (!best || m.path.length > best.path.length) map.set(next, m);
  }
  return map;
}

export type CaptureHop =
  | { kind: 'commit'; move: Move }
  | { kind: 'continue'; chain: CaptureChain };

/**
 * Resolve choosing `sq` as the next leap of `chain`:
 *  - `commit` when `sq` finishes a capture (no further leap is forced) — carries
 *    the full Move to apply;
 *  - `continue` with a deeper chain when more leaps remain;
 *  - `null` when `sq` is not a legal next leap.
 *
 * Laska forces a capture to continue while one exists, so a square is never both a
 * finish and a fork: if any candidate continues past `sq`, none stop there.
 */
export function advanceCaptureChain(chain: CaptureChain, sq: number): CaptureHop | null {
  const depth = chain.steps.length;
  const matched = chain.candidates.filter((m) => m.path[depth] === sq);
  if (matched.length === 0) return null;
  const reached = depth + 1;
  const finish = matched.find((m) => m.path.length === reached);
  const longer = matched.filter((m) => m.path.length > reached);
  if (finish && longer.length === 0) return { kind: 'commit', move: finish };
  return {
    kind: 'continue',
    chain: { origin: chain.origin, steps: [...chain.steps, sq], candidates: longer },
  };
}

/**
 * The full legal Move (with its `path`) matching a by-outcome description
 * `{ from, to, captures }`. Used to recover the leap sequence of a move that was
 * transmitted without its path (e.g. the online `MoveDTO`), so it can be animated
 * leap by leap. Matches on from/to and the exact ordered capture list; returns
 * null when no legal move matches (caller falls back to a direct render).
 */
export function matchLegalMove(
  state: GameState,
  outcome: { from: number; to: number; captures: number[] },
): Move | null {
  const sameCaps = (a: number[], b: number[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  return (
    legalMoves(state).find(
      (m) =>
        m.from === outcome.from && m.to === outcome.to && sameCaps(m.captures, outcome.captures),
    ) ?? null
  );
}
