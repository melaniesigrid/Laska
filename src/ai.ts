/**
 * Laska AI opponent — negamax search with alpha-beta pruning over the
 * column-aware move generator in `rules.ts`, plus a Laska-specific heuristic.
 *
 * This module is pure and standalone (no UI / networking). It depends only on
 * the rules engine, so it can run on a client for offline single-player or on
 * the server as a bot fallback.
 *
 * Design notes:
 *  - Laska is decisive and forced-capture-heavy, so the effective branching
 *    factor is low and modest depths play a strong game.
 *  - The evaluation is from the perspective of the side to move (negamax form):
 *    a positive score is good for whoever is to move at the root.
 *  - "Material" in Laska is column CONTROL, not raw piece count — every piece is
 *    permanent (captures only bury, never remove), so what matters is how many
 *    columns you command and what you have buried beneath your commanders.
 */

import type { GameState, Move, PlayerColor, RuleOptions } from './types.ts';
import { DEFAULT_RULES } from './types.ts';
import { NUM_SQUARES, SQUARE_TO_RC, BOARD_DIM, promotionRow } from './board.ts';
import { legalMoves, applyMove, opponent, DEFAULT_NO_PROGRESS_PLY_LIMIT } from './rules.ts';
import { encodePosition } from './notation.ts';

// --------------------------------------------------------------------------
// Evaluation
// --------------------------------------------------------------------------

/** Heuristic weights. Tunable; chosen to be reasonable, not yet match-tuned. */
export interface EvalWeights {
  /** Value of controlling a column at all (a "piece in play"). */
  column: number;
  /** Extra value when your commander is an officer (moves both ways). */
  officer: number;
  /**
   * Value of each cross-colour piece buried beneath a commander, scored from
   * the controller's side. NOTE: this is necessarily symmetric — the same
   * buried piece is an asset to the captor and a liability to its owner by the
   * SAME magnitude. A separate, smaller "own pieces lost" penalty would make
   * `evaluate` non-antisymmetric and break the negamax sign-flip, so there
   * deliberately isn't one.
   */
  enemyPrisoner: number;
  /** Per-row value of advancing a soldier-topped column toward promotion. */
  advance: number;
  /** Value of each legal move available (mobility). */
  mobility: number;
  /**
   * STRATEGY.md §1 — edge safety for tall columns. A tall/valuable column is
   * SAFER near the board edge (it can be approached from fewer diagonals) and
   * more exposed marooned in the centre. This is a per-unit-of-"extra height"
   * bonus that grows the closer the column sits to the edge, so it only matters
   * for columns that actually have multiple lives to protect.
   */
  edgeSafety: number;
  /**
   * STRATEGY.md §2 — anti-over-concentration ("capture spreading"). A MILD
   * penalty per piece by which a single column overshoots the controller's
   * average column height, discouraging one fragile over-stuffed tower. Kept
   * small on purpose: deep columns have many lives, so this nudges away from
   * *accidental* fragile towers without ever forbidding a strong tall column.
   */
  overConcentration: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  column: 100,
  officer: 60,
  enemyPrisoner: 18,
  advance: 6,
  mobility: 2,
  // Refinements (STRATEGY.md §1/§2), intentionally small vs. column/officer so
  // they shade the search rather than dominate it. Still reasonable, not yet
  // match-tuned.
  edgeSafety: 4,
  overConcentration: 5,
};

/**
 * Distance of a square from the nearest left/right edge column, in board
 * columns. 0 on the outer files, growing toward the centre file. On the 7-wide
 * Laska board this is 0,1,2,3,2,1,0 across columns 0..6. Used by the §1
 * edge-safety term: a *larger* distance means a more exposed (central) column.
 */
function distanceFromEdge(square: number): number {
  const col = SQUARE_TO_RC[square]!.col;
  return Math.min(col, BOARD_DIM - 1 - col);
}

/** The centre file's distance-from-edge (max value of `distanceFromEdge`). */
const MAX_EDGE_DISTANCE = (BOARD_DIM - 1) / 2; // 3 on a 7-wide board

/**
 * A column has "extra height" once it is taller than a lone commander. Only this
 * surplus carries multiple lives, so both the §1 edge bonus and the §2
 * over-concentration penalty scale off height beyond the first piece.
 */
const HEIGHT_THRESHOLD = 1;

/** A decisive result is scored near ±this, offset by depth to prefer faster wins. */
const WIN_SCORE = 1_000_000;

/**
 * Static evaluation from `me`'s perspective (higher is better for `me`).
 * Does NOT check terminal status — the search handles terminal nodes.
 */
export function evaluate(state: GameState, me: PlayerColor, w: EvalWeights = DEFAULT_WEIGHTS): number {
  const them = opponent(me);
  let score = 0;

  // Pre-pass: average column height per controlling colour, for the §2
  // over-concentration term. This is computed symmetrically for both colours so
  // the resulting penalty is antisymmetric (see below): a column that overshoots
  // ITS OWN side's average is penalised by exactly the magnitude the opponent
  // sees as a bonus via the `sign` flip.
  const totalHeight: Record<PlayerColor, number> = { W: 0, B: 0 };
  const numColumns: Record<PlayerColor, number> = { W: 0, B: 0 };
  for (let sq = 0; sq < NUM_SQUARES; sq++) {
    const col = state.board[sq];
    if (!col || col.length === 0) continue;
    const controller = col[col.length - 1]!.color;
    totalHeight[controller] += col.length;
    numColumns[controller] += 1;
  }
  const avgHeight: Record<PlayerColor, number> = {
    W: numColumns.W > 0 ? totalHeight.W / numColumns.W : 0,
    B: numColumns.B > 0 ? totalHeight.B / numColumns.B : 0,
  };

  for (let sq = 0; sq < NUM_SQUARES; sq++) {
    const col = state.board[sq];
    if (!col || col.length === 0) continue;
    const top = col[col.length - 1]!;
    const controller = top.color;
    const sign = controller === me ? 1 : -1;

    // Column control + officer bonus.
    score += sign * w.column;
    if (top.rank === 'officer') score += sign * w.officer;

    // Buried pieces: enemy-of-controller pieces are prisoners (good for the
    // controller); same-colour buried pieces are just stacked reserves. The
    // `sign` flip makes this antisymmetric automatically — the same prisoner is
    // worth +enemyPrisoner to whoever holds it and −enemyPrisoner to its owner,
    // which is exactly what the negamax sign-flip requires.
    for (let i = 0; i < col.length - 1; i++) {
      const buried = col[i]!;
      if (buried.color !== controller) {
        score += sign * w.enemyPrisoner;
      }
    }

    // Promotion threat: reward soldier-topped columns nearing the back rank.
    if (top.rank === 'soldier') {
      const row = SQUARE_TO_RC[sq]!.row;
      const target = promotionRow(controller);
      const distance = Math.abs(target - row); // 0 at back rank
      const advanced = (BOARD_DIM - 1 - distance); // larger = closer to promotion
      score += sign * w.advance * advanced;
    }

    // §1 Edge safety for tall columns. Only "extra height" (beyond a lone
    // commander) has multiple lives worth sheltering, and a column is safer the
    // closer it is to the edge. `closeness` is 0 in the centre file and
    // MAX_EDGE_DISTANCE on the outer files, so an edge-hugging tall column earns
    // the most and a tall column marooned in the centre earns nothing extra
    // (relative penalty vs. holding it on the edge). Antisymmetric by the same
    // `sign` flip used everywhere else: the controller scores +edgeSafety*..., and
    // from the opponent's evaluate() the identical column is scored with sign=-1,
    // i.e. exactly the negative — so flipping `me` negates this term term-for-term.
    const extraHeight = Math.max(0, col.length - HEIGHT_THRESHOLD);
    if (extraHeight > 0) {
      const closeness = MAX_EDGE_DISTANCE - distanceFromEdge(sq); // 0 centre .. MAX edge
      score += sign * w.edgeSafety * extraHeight * closeness;
    }

    // §2 Anti-over-concentration ("capture spreading"). Penalise (only) the
    // amount by which THIS column overshoots its controller's average column
    // height — i.e. a single tower hoarding far more than its peers. Mild by
    // design (small weight) so the engine still happily builds genuinely strong
    // deep columns; it just avoids *accidentally* lumping everything into one
    // fragile stack. Antisymmetric: the penalty is keyed off the controller's
    // own-side average (avgHeight[controller]) and applied via `sign`, so the
    // controller sees -overConcentration*overshoot while the opponent evaluating
    // the same board sees +overConcentration*overshoot of equal magnitude.
    const overshoot = col.length - avgHeight[controller];
    if (overshoot > 0) {
      score -= sign * w.overConcentration * overshoot;
    }
  }

  // Mobility: difference in number of legal moves. Computed for both sides from
  // the current board (cheap relative to the rest of the search at low depth).
  const myMoves = legalMoves({ ...state, toMove: me }).length;
  const theirMoves = legalMoves({ ...state, toMove: them }).length;
  score += w.mobility * (myMoves - theirMoves);

  return score;
}

// --------------------------------------------------------------------------
// Search
// --------------------------------------------------------------------------

/**
 * Order moves to improve alpha-beta cuts: captures first (more of them when
 * forced anyway), then promotions, then longer capture chains earlier.
 */
function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
    if (a.captures.length !== b.captures.length) return b.captures.length - a.captures.length;
    if (a.promotion !== b.promotion) return a.promotion ? -1 : 1;
    return 0;
  });
}

/**
 * Optional, write-only counters a caller can pass in to learn how hard the
 * search worked. The engine never reads these back — they exist purely so the
 * UI / benchmarks can report *measured* numbers instead of guesses. Create one
 * with `newStats()` and pass it via `AIOptions.stats` or `SearchConfig.stats`.
 */
export interface SearchStats {
  /** Total nodes entered (interior + leaf + terminal). */
  nodes: number;
  /** Static `evaluate()` calls (leaf positions actually scored). */
  leaves: number;
  /** Extra nodes visited by the quiescence (forced-capture) extension. */
  qNodes: number;
  /** Beta cutoffs — branches alpha-beta pruned away without searching. */
  cutoffs: number;
  /** Deepest ply below the root reached, including quiescence extension. */
  maxPlyReached: number;
}

export function newStats(): SearchStats {
  return { nodes: 0, leaves: 0, qNodes: 0, cutoffs: 0, maxPlyReached: 0 };
}

/** Fully-resolved search configuration (the knobs the inner search honours). */
interface SearchConfig {
  weights: EvalWeights;
  /** Alpha-beta pruning. When false the search is plain negamax (for parity
   *  demos / teaching): same move, every branch visited. */
  prune: boolean;
  /**
   * Quiescence search: when a leaf still has a *forced* capture pending (Laska
   * captures are mandatory, so any capture means ALL moves are captures), keep
   * searching the exchange instead of scoring a position in mid-swap. This is
   * the horizon-effect fix — it changes the engine's judgement, so it is opt-in.
   */
  quiescence: boolean;
  /** Hard cap on how many extra plies quiescence may extend, as a safety net. */
  maxQuiescencePly: number;
  /** Active rule variant — affects MOVE GENERATION only (not evaluation). */
  rules: RuleOptions;
  /** Optional measurement sink (see SearchStats). */
  stats?: SearchStats;
}

const DEFAULT_QUIESCENCE_PLY = 12;

/**
 * Negamax. Returns the score from the perspective of the side to move in
 * `state`. One routine serves both players via the negamax identity
 * `max(a, b) = -min(-a, -b)`: each child's score is negated on the way up, so a
 * position is always judged from whoever is on move — which is exactly why the
 * static evaluation must be symmetric (see `evaluate`).
 *
 * Baseline parity: with `{ prune: true, quiescence: false }` this visits nodes
 * in the same order and returns the same scores as a textbook alpha-beta
 * negamax. Terminal and draw handling mirror `gameStatus`, but moves are
 * generated ONCE per node and reused for both the terminal test and the move
 * loop (the previous version regenerated them inside `gameStatus`).
 */
function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  cfg: SearchConfig,
  ply: number,
): number {
  const stats = cfg.stats;
  if (stats) {
    stats.nodes++;
    if (ply > stats.maxPlyReached) stats.maxPlyReached = ply;
  }

  // Generate once; an empty list means the side to move has no move (no pieces
  // or stalemated) — a loss, scored to prefer being mated as late as possible.
  const moves = orderMoves(legalMoves(state, cfg.rules));
  if (moves.length === 0) {
    return -(WIN_SCORE - (100 - depth));
  }

  // Draw conditions (loss already handled above, matching gameStatus priority).
  const key = encodePosition(state);
  if ((state.positionCounts[key] ?? 0) >= 3) return 0;
  if (state.plyNoProgress >= DEFAULT_NO_PROGRESS_PLY_LIMIT) return 0;

  if (depth <= 0) {
    // A leaf still mid-capture is a lie to the evaluator: extend through the
    // forced exchange (without spending main depth) until the dust settles.
    const forcedCapture = moves[0]!.isCapture;
    const extend = cfg.quiescence && forcedCapture && -depth < cfg.maxQuiescencePly;
    if (!extend) {
      if (stats) stats.leaves++;
      return evaluate(state, state.toMove, cfg.weights);
    }
    if (stats) stats.qNodes++;
  }

  let best = -Infinity;
  for (const move of moves) {
    const child = applyMove(state, move, cfg.rules);
    const score = -negamax(child, depth - 1, -beta, -alpha, cfg, ply + 1);
    if (score > best) best = score;
    if (cfg.prune) {
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        if (stats) stats.cutoffs++;
        break; // beta cutoff
      }
    }
  }
  return best;
}

export type Difficulty = 'beginner' | 'easy' | 'intermediate' | 'medium' | 'hard' | 'expert';

/** Difficulty tiers in increasing strength, for building selectors. */
export const DIFFICULTY_ORDER: Difficulty[] = [
  'beginner',
  'easy',
  'intermediate',
  'medium',
  'hard',
  'expert',
];

export interface AIOptions {
  difficulty?: Difficulty;
  /** Override search depth (plies). Takes precedence over `difficulty`. */
  depth?: number;
  /**
   * Probability [0,1] of playing a random legal move instead of the best one,
   * to make lower tiers beatable and less robotic. Defaults per difficulty.
   */
  blunderRate?: number;
  /** Deterministic RNG in [0,1) for reproducible tests. Defaults to Math.random. */
  random?: () => number;
  weights?: EvalWeights;
  /**
   * Enable quiescence (forced-capture extension) — the engine searches through
   * pending exchanges instead of evaluating mid-swap, fixing the horizon effect.
   * Defaults per difficulty (on for hard/expert). This is a strength feature, so
   * it is off for the lower tiers to keep them beatable and identical to before.
   */
  quiescence?: boolean;
  /** Active rule variant for move generation (default Lasker-classic). */
  rules?: RuleOptions;
  /** Optional measurement sink; populated during the search (see SearchStats). */
  stats?: SearchStats;
}

/** Search depth (plies / half-moves looked ahead) per tier. Exported so UIs can
 *  explain "looks N moves ahead". Laska's forced captures keep branching low, so
 *  even depth 8 resolves quickly. */
export const DIFFICULTY_DEPTH: Record<Difficulty, number> = {
  beginner: 1,
  easy: 2,
  intermediate: 3,
  medium: 4,
  hard: 6,
  expert: 8,
};

/** Chance of a deliberate random move, so lower tiers are beatable and human. */
const DIFFICULTY_BLUNDER: Record<Difficulty, number> = {
  beginner: 0.5,
  easy: 0.25,
  intermediate: 0.12,
  medium: 0.06,
  hard: 0.01,
  expert: 0,
};

/** Whether each tier searches through forced captures (quiescence). The top
 *  tiers do, so they never misjudge a position caught mid-exchange; the lower
 *  tiers don't, keeping them faster, weaker and beatable. */
const DIFFICULTY_QUIESCENCE: Record<Difficulty, boolean> = {
  beginner: false,
  easy: false,
  intermediate: false,
  medium: false,
  hard: true,
  expert: true,
};

/** Build a resolved search config, defaulting to baseline (parity) behaviour. */
function resolveConfig(opts: {
  weights?: EvalWeights;
  prune?: boolean;
  quiescence?: boolean;
  rules?: RuleOptions;
  stats?: SearchStats;
} = {}): SearchConfig {
  return {
    weights: opts.weights ?? DEFAULT_WEIGHTS,
    prune: opts.prune ?? true,
    quiescence: opts.quiescence ?? false,
    maxQuiescencePly: DEFAULT_QUIESCENCE_PLY,
    rules: opts.rules ?? DEFAULT_RULES,
    ...(opts.stats ? { stats: opts.stats } : {}),
  };
}

export interface ScoredMove {
  move: Move;
  score: number;
}

/** Extra options for `scoreMoves` (all optional; defaults reproduce the
 *  original baseline behaviour exactly). */
export interface ScoreOptions {
  weights?: EvalWeights;
  /** Search through forced captures at the leaves (off by default). */
  quiescence?: boolean;
  /** Alpha-beta pruning. Default true; set false to measure plain negamax. */
  prune?: boolean;
  /** Active rule variant for move generation (default Lasker-classic). */
  rules?: RuleOptions;
  /** Optional measurement sink; populated during the search. */
  stats?: SearchStats;
}

/**
 * Score every legal move at the given depth. Useful for analysis / hint UIs.
 * Scores are from the perspective of the side to move.
 *
 * Back-compatible: pass a bare `EvalWeights` as the third argument (legacy) or a
 * `ScoreOptions` object. With no options this is bit-for-bit the original search.
 */
export function scoreMoves(
  state: GameState,
  depth: number,
  opts: EvalWeights | ScoreOptions = DEFAULT_WEIGHTS,
): ScoredMove[] {
  // Distinguish a legacy bare-weights argument from a ScoreOptions object.
  const isWeights = typeof (opts as EvalWeights).column === 'number';
  const o: ScoreOptions = isWeights ? { weights: opts as EvalWeights } : (opts as ScoreOptions);
  const cfg = resolveConfig({
    ...(o.weights !== undefined ? { weights: o.weights } : {}),
    ...(o.quiescence !== undefined ? { quiescence: o.quiescence } : {}),
    ...(o.prune !== undefined ? { prune: o.prune } : {}),
    ...(o.rules !== undefined ? { rules: o.rules } : {}),
    ...(o.stats ? { stats: o.stats } : {}),
  });

  const moves = orderMoves(legalMoves(state, cfg.rules));
  const scored: ScoredMove[] = [];
  // Use a full window per root move so every move gets an EXACT score (needed
  // for honest analysis and reliable tie detection). Pruning still happens
  // deep inside each child search.
  for (const move of moves) {
    const child = applyMove(state, move, cfg.rules);
    const score = -negamax(child, depth - 1, -Infinity, Infinity, cfg, 1);
    scored.push({ move, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Choose a move for the side to move. Returns `null` only if there are no legal
 * moves (i.e. the game is already lost for the side to move).
 */
export function chooseMove(state: GameState, opts: AIOptions = {}): Move | null {
  const rules = opts.rules ?? DEFAULT_RULES;
  const moves = legalMoves(state, rules);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0]!;

  const difficulty = opts.difficulty ?? 'medium';
  const depth = opts.depth ?? DIFFICULTY_DEPTH[difficulty];
  const blunderRate = opts.blunderRate ?? DIFFICULTY_BLUNDER[difficulty];
  const rng = opts.random ?? Math.random;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const quiescence = opts.quiescence ?? DIFFICULTY_QUIESCENCE[difficulty];

  if (blunderRate > 0 && rng() < blunderRate) {
    return moves[Math.floor(rng() * moves.length)]!;
  }

  const scored = scoreMoves(state, depth, {
    weights,
    quiescence,
    rules,
    ...(opts.stats ? { stats: opts.stats } : {}),
  });
  const bestScore = scored[0]!.score;
  // Pick uniformly among moves that tie for best, for variety.
  const ties = scored.filter((s) => s.score === bestScore);
  return ties[Math.floor(rng() * ties.length)]!.move;
}
