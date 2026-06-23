/**
 * The research layer's pluggable-agent abstraction.
 *
 * An `Agent` is anything that can pick a move for the side to move. This is a
 * deliberately thin contract so genuinely different move-selection algorithms —
 * random, one-ply heuristic, alpha-beta search, Monte Carlo Tree Search — all
 * implement the SAME interface and can therefore be pitted against each other in
 * the arena (`arena.ts`) for honest, apples-to-apples comparison.
 *
 * STRICT SEPARATION: agents consume the rules engine (`legalMoves` / `applyMove`
 * / `gameStatus`) but never modify it. Nothing in this directory changes game
 * correctness — it only decides which legal move to play.
 */
import type { GameState, Move } from '../types.ts';

/** Per-move context an agent may use. */
export interface AgentContext {
  /**
   * RNG in [0,1). Inject a seeded generator (see `makeRng`) for reproducible
   * matches and tests; defaults to `Math.random` when omitted.
   */
  random?: () => number;
}

/** The algorithmic family an agent belongs to (for grouping in reports). */
export type AgentFamily = 'random' | 'greedy' | 'search' | 'mcts';

export interface Agent {
  /** Stable machine id (kebab-case), unique within the registry. */
  readonly id: string;
  /** Human display name / personality (e.g. "Viktor"). */
  readonly name: string;
  /** One-line personality blurb that telegraphs the playstyle to the user. */
  readonly blurb: string;
  /** Which algorithm family this agent uses. */
  readonly family: AgentFamily;
  /**
   * Choose a move for the side to move. Returns `null` ONLY when the position
   * has no legal moves (the side to move has already lost) — every agent must
   * return a legal move otherwise.
   */
  chooseMove(state: GameState, ctx?: AgentContext): Move | null;
}
