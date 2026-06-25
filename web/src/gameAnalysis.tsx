/**
 * Shared engine-review machinery for any move-by-move replay (your saved games
 * and the historic games alike). Wraps the off-thread `analyzePosition` search
 * and the pure scoring in `analysis.ts` into one hook + a few presentational
 * pieces, so every replay surface shows the SAME eval bar, mistake summary and
 * per-move quality marks without copying the logic.
 *
 *   const review = useGameAnalysis(states, moves, { resetKey: id, terminalEval });
 *   review.run();                       // kick off the (sequential, off-thread) search
 *   review.reviews[i]                   // quality of move i, once analysed
 *   <EvalBar white={review.analysis?.[ply]?.whiteEval ?? 0} />
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Move, ScoredMove } from '../../src/index.ts';
import { analyzePosition } from './ai/aiClient.ts';
import {
  reviewMove,
  whiteEval,
  formatEval,
  QUALITY_LABEL,
  QUALITY_GLYPH,
  type MoveQuality,
  type MoveReview,
} from './analysis.ts';

/** Plies each position is searched at. Modest so a full game analyses in a couple
 *  of seconds, with quiescence on (in analyzePosition) for honest scores. */
export const ANALYSIS_DEPTH = 4;

/** Qualities worth counting in the per-side summary (best/good/forced are fine). */
const SUMMARY_QUALITIES: MoveQuality[] = ['inaccuracy', 'mistake', 'blunder'];

/** One analysed position: its White-positive eval and every legal move scored. */
export interface PositionEval {
  whiteEval: number;
  scored: ScoredMove[];
}

export interface GameAnalysis {
  /** One entry per state (0..lastPly); null until `run` finishes. */
  analysis: PositionEval[] | null;
  analyzing: boolean;
  /** Positions searched so far / total, for a progress label. */
  progress: number;
  total: number;
  /** Start the search. No-op while already analysing. */
  run: () => void;
  /** Quality of each move (parallel to `moves`); entries null until analysed. */
  reviews: (MoveReview | null)[];
  /** Per-side tally of inaccuracies / mistakes / blunders; null until analysed. */
  summary: Record<'W' | 'B', Record<MoveQuality, number>> | null;
}

/**
 * Analyse a replay. `states[k]` is the position after ply k (length = moves+1);
 * `moves[i]` is the move played from `states[i]`. `resetKey` discards a prior
 * analysis when the underlying game changes (a different historic game, or a
 * re-recorded save) — pick something that changes with the MOVES, not with
 * cosmetic edits like notes, so annotating doesn't throw the analysis away.
 * `terminalEval` is the White-positive eval to show for a position with no legal
 * moves (a finished game), since a terminal position can't be scored by search.
 */
export function useGameAnalysis(
  states: GameState[],
  moves: Move[],
  opts: { resetKey: string; terminalEval: number },
): GameAnalysis {
  const { resetKey, terminalEval } = opts;
  const [analysis, setAnalysis] = useState<PositionEval[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  // Bumped to abandon an in-flight run when the game changes or we unmount, so a
  // stale async pass can never write results for the wrong game.
  const token = useRef(0);

  useEffect(() => {
    setAnalysis(null);
    setProgress(0);
    token.current += 1;
  }, [resetKey]);

  useEffect(() => () => void (token.current += 1), []);

  const run = () => {
    if (analyzing || states.length === 0) return;
    const mine = ++token.current;
    const snapshot = states;
    const result: PositionEval[] = [];
    setAnalyzing(true);
    setProgress(0);
    void (async () => {
      for (let i = 0; i < snapshot.length; i++) {
        const st = snapshot[i]!;
        const scored = await analyzePosition(st, { depth: ANALYSIS_DEPTH });
        if (token.current !== mine) return; // superseded — drop these results
        result.push({
          whiteEval: scored.length > 0 ? whiteEval(scored[0]!.score, st.toMove) : terminalEval,
          scored,
        });
        setProgress(i + 1);
      }
      setAnalysis(result);
      setAnalyzing(false);
    })();
  };

  const reviews = useMemo<(MoveReview | null)[]>(() => {
    if (!analysis) return moves.map(() => null);
    return moves.map((m, i) => (analysis[i] ? reviewMove(m, analysis[i]!.scored) : null));
  }, [analysis, moves]);

  const summary = useMemo(() => {
    if (!analysis) return null;
    const blank = () => ({ best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0 } as Record<MoveQuality, number>);
    const tally: Record<'W' | 'B', Record<MoveQuality, number>> = { W: blank(), B: blank() };
    moves.forEach((_, i) => {
      const q = reviews[i]?.quality;
      // White always moves first, so even plies are White's.
      if (q && SUMMARY_QUALITIES.includes(q)) tally[i % 2 === 0 ? 'W' : 'B'][q] += 1;
    });
    return tally;
  }, [analysis, moves, reviews]);

  return { analysis, analyzing, progress, total: states.length, run, reviews, summary };
}

/* ---- presentational pieces ----------------------------------------------- */

/** A horizontal advantage bar: White's fill grows rightward as its eval rises
 *  (centre = even), through a soft cap so one decisive swing can't flatten the
 *  rest of the game. */
export function EvalBar({ white }: { white: number }) {
  const frac = Math.max(-1, Math.min(1, white / 800)); // ±8 columns ≈ pinned
  const whitePct = 50 + frac * 50;
  return (
    <div
      className="eval-bar"
      role="img"
      aria-label={`Engine evaluation ${formatEval(white)} (positive favours White)`}
    >
      <span className="eval-fill" style={{ width: `${whitePct}%` }} />
      <span className="eval-readout">{formatEval(white)}</span>
    </div>
  );
}

/** Both sides' inaccuracy / mistake / blunder counts. */
export function AnalysisSummary({
  summary,
}: {
  summary: Record<'W' | 'B', Record<MoveQuality, number>>;
}) {
  return (
    <div className="analysis-summary">
      <SummarySide label="White" tally={summary.W} />
      <SummarySide label="Black" tally={summary.B} />
    </div>
  );
}

function SummarySide({ label, tally }: { label: string; tally: Record<MoveQuality, number> }) {
  return (
    <div className="summary-side">
      <span className="summary-name">{label}</span>
      <span className="summary-counts">
        <em className="q-inaccuracy" title="Inaccuracies">
          {tally.inaccuracy} {QUALITY_GLYPH.inaccuracy}
        </em>
        <em className="q-mistake" title="Mistakes">
          {tally.mistake} {QUALITY_GLYPH.mistake}
        </em>
        <em className="q-blunder" title="Blunders">
          {tally.blunder} {QUALITY_GLYPH.blunder}
        </em>
      </span>
    </div>
  );
}

/** Pill badge for the stepped move's quality (everything but `forced`). */
export function ReviewBadge({ review }: { review: MoveReview | null }) {
  if (!review || review.quality === 'forced') return null;
  return (
    <span className={`quality-badge q-${review.quality}`}>
      {QUALITY_GLYPH[review.quality]} {QUALITY_LABEL[review.quality]}
    </span>
  );
}

/** "Engine preferred X — gave up N columns", shown when the move wasn't best. */
export function BestLine({ review, sanOf }: { review: MoveReview | null; sanOf: (m: Move) => string }) {
  if (!review?.best) return null;
  return (
    <p className="best-line">
      Engine preferred <b>{sanOf(review.best)}</b> — gave up {(review.loss / 100).toFixed(1)} columns.
    </p>
  );
}

/** Compact move-list mark for sub-par moves only (inaccuracy/mistake/blunder). */
export function QualityMark({ review }: { review: MoveReview | null | undefined }) {
  if (!review) return null;
  const q = review.quality;
  if (q !== 'inaccuracy' && q !== 'mistake' && q !== 'blunder') return null;
  return (
    <span className={`q-mark q-${q}`} aria-label={QUALITY_LABEL[q]} title={QUALITY_LABEL[q]}>
      {QUALITY_GLYPH[q]}
    </span>
  );
}
