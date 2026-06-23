/**
 * MctsAgent — Monte Carlo Tree Search with the UCT selection rule.
 *
 * This is the research layer's genuinely DIFFERENT algorithm (the search agents
 * are all alpha-beta variants). MCTS builds an asymmetric tree by repeatedly:
 *   1. SELECT  — descend via UCB1 until a not-fully-expanded node,
 *   2. EXPAND  — add one new child,
 *   3. SIMULATE— play a (semi-)random rollout to a terminal/heuristic result,
 *   4. BACKPROP— propagate the result up the visited path.
 * The move played at the root is the most-visited child (the "robust child").
 *
 * Reference (verify against the primary source):
 *   - UCT: Kocsis & Szepesvári, "Bandit based Monte-Carlo Planning" (ECML 2006).
 *   - Survey: Browne et al., "A Survey of Monte Carlo Tree Search Methods"
 *     (IEEE TCIAMG, approximately 2012).
 * I am confident these are real works that introduce/survey UCT and MCTS, but
 * you should confirm exact titles/years against the papers before citing them.
 *
 * NOTE ON STRENGTH (honest): plain MCTS with RANDOM rollouts is usually weak in
 * sharp, forced-capture tactical games like Laska, where a shallow alpha-beta
 * search reads concrete lines that random play misses. Treat this agent as a
 * research comparison point and a stylistically-different opponent, NOT as a
 * presumed top of the ladder. Strengthening it (heuristic-guided rollouts, or a
 * learned policy/value net à la the AlphaZero family) is a much larger effort
 * that needs training infrastructure — see AI_RESEARCH.md.
 */
import type { GameState, Move, PlayerColor, GameOutcome } from '../index.ts';
import { legalMoves, applyMove, gameStatus, opponent, evaluate } from '../index.ts';
import type { Agent, AgentContext } from './agent.ts';
import { pick } from './rng.ts';

export interface MctsAgentConfig {
  id?: string;
  name?: string;
  blurb?: string;
  /** Number of MCTS iterations (select→expand→simulate→backprop) per move. */
  iterations?: number;
  /** UCB1 exploration constant. ~1.4 (≈ √2) is the textbook default. */
  exploration?: number;
  /** Max plies a single random rollout may run before falling back to the
   *  static evaluation, as a safety net against long quiet phases. */
  rolloutCap?: number;
}

interface MctsNode {
  state: GameState;
  toMove: PlayerColor;
  /** The move that led here from the parent (null at the root). */
  parentMove: Move | null;
  parent: MctsNode | null;
  untried: Move[];
  children: MctsNode[];
  visits: number;
  /**
   * Total reward from the perspective of the player who MOVED INTO this node
   * (i.e. `opponent(toMove)`). Maximising a child's mean reward therefore
   * chooses the best move for the player to move at this node.
   */
  reward: number;
  terminal: GameOutcome | null;
}

function makeNode(state: GameState, parent: MctsNode | null, parentMove: Move | null): MctsNode {
  const status = gameStatus(state);
  const terminal = status.state === 'ongoing' ? null : status;
  return {
    state,
    toMove: state.toMove,
    parentMove,
    parent,
    untried: terminal ? [] : legalMoves(state),
    children: [],
    visits: 0,
    reward: 0,
    terminal,
  };
}

/** Result in [0,1] for `player` given a finished/heuristic outcome. */
function rewardFor(player: PlayerColor, outcome: GameOutcome): number {
  if (outcome.state === 'win') return outcome.winner === player ? 1 : 0;
  return 0.5; // draw
}

function ucbSelect(node: MctsNode, c: number): MctsNode {
  let best: MctsNode | null = null;
  let bestVal = -Infinity;
  const logN = Math.log(node.visits);
  for (const child of node.children) {
    const exploit = child.reward / child.visits;
    const explore = c * Math.sqrt(logN / child.visits);
    const val = exploit + explore;
    if (val > bestVal) {
      bestVal = val;
      best = child;
    }
  }
  return best!;
}

/**
 * Random playout from `state` to a terminal position, or to `cap` plies — at
 * which point the static `evaluate` decides a pseudo-winner. Returns the outcome
 * used for backprop. Rollouts are random (the defining trait of vanilla MCTS).
 */
function rollout(state: GameState, cap: number, rng: () => number): GameOutcome {
  let s = state;
  for (let i = 0; i < cap; i++) {
    const status = gameStatus(s);
    if (status.state !== 'ongoing') return status;
    const moves = legalMoves(s);
    if (moves.length === 0) {
      // No moves = loss for the side to move (mirrors gameStatus).
      return { state: 'win', winner: opponent(s.toMove), reason: 'no-moves' };
    }
    s = applyMove(s, pick(moves, rng));
  }
  // Horizon reached: use the static evaluation as a heuristic verdict.
  const whiteEdge = evaluate(s, 'W');
  if (whiteEdge > 0) return { state: 'win', winner: 'W', reason: 'no-pieces' };
  if (whiteEdge < 0) return { state: 'win', winner: 'B', reason: 'no-pieces' };
  return { state: 'draw', reason: 'agreement' };
}

export function createMctsAgent(cfg: MctsAgentConfig = {}): Agent {
  const iterations = cfg.iterations ?? 2000;
  const c = cfg.exploration ?? Math.SQRT2;
  const cap = cfg.rolloutCap ?? 80;

  return {
    id: cfg.id ?? 'mcts',
    name: cfg.name ?? 'Monte',
    blurb:
      cfg.blurb ??
      'A wildcard who simulates thousands of random futures — unconventional, occasionally brilliant, occasionally naive.',
    family: 'mcts',
    chooseMove(state: GameState, ctx?: AgentContext): Move | null {
      const rootMoves = legalMoves(state);
      if (rootMoves.length === 0) return null;
      if (rootMoves.length === 1) return rootMoves[0]!;
      const rng = ctx?.random ?? Math.random;

      const root = makeNode(state, null, null);

      for (let iter = 0; iter < iterations; iter++) {
        // 1. SELECT: descend fully-expanded, non-terminal nodes via UCB1.
        let node = root;
        while (node.terminal === null && node.untried.length === 0 && node.children.length > 0) {
          node = ucbSelect(node, c);
        }

        // 2. EXPAND: add one random untried child (unless terminal).
        if (node.terminal === null && node.untried.length > 0) {
          const idx = Math.floor(rng() * node.untried.length);
          const move = node.untried.splice(idx, 1)[0]!;
          const child = makeNode(applyMove(node.state, move), node, move);
          node.children.push(child);
          node = child;
        }

        // 3. SIMULATE: random rollout (or read off a terminal node directly).
        const outcome = node.terminal ?? rollout(node.state, cap, rng);

        // 4. BACKPROP: credit each node from ITS mover's perspective.
        for (let n: MctsNode | null = node; n !== null; n = n.parent) {
          n.visits++;
          const mover = opponent(n.toMove); // the player who moved into n
          n.reward += rewardFor(mover, outcome);
        }
      }

      // Play the robust child: most visited, ties broken by mean reward then RNG.
      let best: MctsNode[] = [];
      let bestVisits = -1;
      for (const child of root.children) {
        if (child.visits > bestVisits) {
          bestVisits = child.visits;
          best = [child];
        } else if (child.visits === bestVisits) {
          best.push(child);
        }
      }
      best.sort((a, b) => b.reward / b.visits - a.reward / a.visits);
      const topMean = best.length ? best[0]!.reward / best[0]!.visits : 0;
      const tied = best.filter((n) => n.reward / n.visits === topMean);
      return pick(tied, rng).parentMove!;
    },
  };
}
