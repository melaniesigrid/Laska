import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, legalMoves, applyMove, chooseMove } from '../src/index.ts';
import { DIFFICULTY_DEPTH } from '../src/index.ts';
import type { GameState, Move, Difficulty } from '../src/index.ts';
import {
  ROSTER,
  LADDER,
  cadet,
  pip,
  viktor,
  monte,
  makeRng,
  playGame,
  playMatch,
  roundRobin,
  createMctsAgent,
} from '../src/agents/index.ts';
import type { Agent, AgentContext } from '../src/agents/index.ts';

/** Does `move` appear (by from/to/captures) in the legal move list of `state`? */
function isLegal(state: GameState, move: Move): boolean {
  return legalMoves(state).some(
    (m) =>
      m.from === move.from &&
      m.to === move.to &&
      m.captures.length === move.captures.length &&
      m.captures.every((c, i) => c === move.captures[i]),
  );
}

/** A short scripted opening, reproducible, to reach a non-trivial mid-position. */
function midGameState(seed: number, plies: number): GameState {
  const rng = makeRng(seed);
  let s = createInitialState();
  for (let i = 0; i < plies; i++) {
    const moves = legalMoves(s);
    if (moves.length === 0) break;
    s = applyMove(s, moves[Math.floor(rng() * moves.length)]!);
  }
  return s;
}

test('every roster agent returns a LEGAL move from the opening', () => {
  const state = createInitialState();
  for (const agent of Object.values(ROSTER)) {
    const move = agent.chooseMove(state, { random: makeRng(1) });
    assert.ok(move !== null, `${agent.id} returned null at the opening`);
    assert.ok(isLegal(state, move!), `${agent.id} returned an illegal opening move`);
  }
});

test('every roster agent returns a LEGAL move from several mid-game positions', () => {
  for (const seed of [3, 11, 29]) {
    const state = midGameState(seed, 14);
    if (legalMoves(state).length === 0) continue;
    for (const agent of Object.values(ROSTER)) {
      const move = agent.chooseMove(state, { random: makeRng(seed) });
      assert.ok(move !== null, `${agent.id} returned null mid-game (seed ${seed})`);
      assert.ok(isLegal(state, move!), `${agent.id} returned an illegal move mid-game (seed ${seed})`);
    }
  }
});

test('agents are deterministic given a fixed seeded RNG', () => {
  const state = midGameState(5, 10);
  for (const agent of Object.values(ROSTER)) {
    const a = agent.chooseMove(state, { random: makeRng(42) });
    const b = agent.chooseMove(state, { random: makeRng(42) });
    assert.deepEqual(a, b, `${agent.id} was not reproducible under a fixed seed`);
  }
});

test('a seeded game is fully reproducible', () => {
  const g1 = playGame(viktor, pip, { random: makeRng(99), maxPlies: 300 });
  const g2 = playGame(viktor, pip, { random: makeRng(99), maxPlies: 300 });
  assert.deepEqual(g1, g2);
});

test('playMatch tallies add up to the number of games', () => {
  const m = playMatch(viktor, cadet, { games: 6, seed: 1 });
  assert.equal(m.aWins + m.bWins + m.draws, m.games);
  assert.equal(m.records.length, m.games);
});

test('Viktor (depth-6 search) crushes Cadet (random) over a short match', () => {
  // A real-but-cheap strength check: a calculating searcher should dominate a
  // purely random player. Tolerant threshold so it is not flaky.
  const m = playMatch(viktor, cadet, { games: 10, seed: 3 });
  assert.ok(m.aWins >= 8, `expected Viktor to win >=8/10 vs Cadet, won ${m.aWins}`);
});

test('search (Viktor) dominates one-ply greedy (Pip) — depth beats instinct', () => {
  // The meaningful, stable ordering in Laska is search >> greedy. (Notably,
  // greedy vs. random is NEAR PARITY — grabbing material is weak here because
  // captures only BURY pieces, they never remove them; see AI_RESEARCH.md. So we
  // assert the robust relationship, not the brittle greedy-beats-random one.)
  const m = playMatch(viktor, pip, { games: 10, seed: 4 });
  assert.ok(m.aWins >= 7, `expected Viktor to win >=7/10 vs Pip, won ${m.aWins}`);
});

test('a small MCTS agent returns legal moves and beats random', () => {
  const smallMonte: Agent = createMctsAgent({ id: 'monte-fast', name: 'MonteFast', iterations: 120 });
  const state = createInitialState();
  const move = smallMonte.chooseMove(state, { random: makeRng(1) });
  assert.ok(move !== null && isLegal(state, move), 'MCTS produced an illegal opening move');
  const m = playMatch(smallMonte, cadet, { games: 6, seed: 2 });
  assert.ok(m.aWins >= m.bWins, `expected MCTS to be >= random, got ${m.aWins}-${m.bWins}`);
});

test('roundRobin produces consistent standings (points = wins + 0.5*draws)', () => {
  const { standings } = roundRobin([cadet, pip, viktor], { games: 4, seed: 1 });
  assert.equal(standings.length, 3);
  for (const s of standings) {
    assert.ok(Math.abs(s.points - (s.wins + s.draws * 0.5)) < 1e-9);
    assert.equal(s.wins + s.draws + s.losses, s.games);
  }
  // The strongest agent (Viktor) should not finish last in a 3-way RR.
  assert.notEqual(standings[standings.length - 1]!.id, 'viktor');
});

test('the LADDER is ordered and references real roster agents', () => {
  assert.ok(LADDER.length >= 4);
  for (const a of LADDER) assert.ok(ROSTER[a.id] === a, `${a.id} missing from ROSTER`);
  // Wildcard MCTS exists but is intentionally not on the strength ladder.
  assert.ok(!LADDER.includes(monte));
});

// ---------------------------------------------------------------------------
// CROSS-FAMILY strength regression guard.
//
// `bench-ai-vs-mcts.ts` measures the production AI (`chooseMove` / negamax) vs
// the independent MCTS family — the closest thing to an external reference, since
// no third-party Laska engine exists. This test pins the *reliably true* corner
// of that benchmark so a regression to the production search/eval (or to MCTS)
// trips a fast, deterministic alarm.
//
// HONESTY: the production negamax is NOT a blanket favourite over MCTS. Measured
// (2026-06): depth-3 'intermediate' is ~parity with MCTS-80, and HIGHER-budget
// MCTS (~200 iters) actually BEAT depth-4 'medium' head-to-head on the bench
// seeds. So this guard is deliberately scoped to where production reliably wins:
// the depth-4 'medium' tier (best-play, blunder off) vs a LOW-budget MCTS. The
// threshold has margin (wins clearly, loses zero games at this fixed seed).
// ---------------------------------------------------------------------------

/** Wrap the production `chooseMove` tier as an Agent so it plugs into the arena. */
function productionTierAgent(tier: Difficulty): Agent {
  return {
    id: `prod-${tier}`,
    name: `Prod(${tier}, d${DIFFICULTY_DEPTH[tier]})`,
    blurb: `production negamax at the "${tier}" tier`,
    family: 'search',
    chooseMove(state: GameState, ctx?: AgentContext): Move | null {
      // blunderRate 0: measure the tier's best play, not its human-handicap roll.
      return chooseMove(state, { difficulty: tier, blunderRate: 0, random: ctx?.random ?? Math.random });
    },
  };
}

test('STRENGTH GUARD (cross-family): production depth-4 beats a low-budget MCTS', () => {
  // Fixed seed + small game count chosen so this runs in seconds and is stable.
  // Measured at this exact config: 4W-0D-0L. We assert with margin (>=3 wins,
  // zero losses) so a stray draw does not make it flaky but a real regression
  // (production stops dominating low-budget MCTS) does fail it.
  const prod = productionTierAgent('medium'); // depth 4, best play
  const mcts = createMctsAgent({ id: 'mcts-50', name: 'MCTS(50)', iterations: 50 });
  const m = playMatch(prod, mcts, { games: 4, seed: 13, maxPlies: 120 });

  assert.equal(m.aWins + m.bWins + m.draws, m.games);
  assert.equal(
    m.bWins,
    0,
    `production depth-4 should not LOSE a game to low-budget MCTS here, lost ${m.bWins} (W${m.aWins} D${m.draws})`,
  );
  assert.ok(
    m.aWins >= 3,
    `production depth-4 should beat low-budget MCTS with margin: won ${m.aWins}/${m.games} (D${m.draws} L${m.bWins})`,
  );
});
