/**
 * The ARENA — plays agents against each other and tallies results, so AI changes
 * can be judged by HEAD-TO-HEAD outcomes instead of intuition. This is the core
 * research tool: pick two (or many) agents, run N games, read the win rates.
 *
 * Fairness: every match alternates which agent plays White (White moves first in
 * Laska, a real first-move edge), and every game is driven by a SEEDED RNG so a
 * given seed reproduces the exact same games — essential for honest comparison.
 */
import type { GameState, PlayerColor, GameOutcome } from '../index.ts';
import { createInitialState, applyMove, gameStatus } from '../index.ts';
import type { Agent } from './agent.ts';
import { makeRng } from './rng.ts';

export type GameWinner = PlayerColor | 'draw';

export interface GameRecord {
  /** Agent id that played White this game. */
  white: string;
  /** Agent id that played Black this game. */
  black: string;
  winner: GameWinner;
  /** Why the game ended (engine `GameOutcome` reason, or 'ply-cap'). */
  reason: string;
  plies: number;
}

export interface PlayGameOptions {
  /** RNG for both agents' tie-breaking/blunders and any rollouts. */
  random?: () => number;
  /** Hard safety cap on plies (the no-progress draw rule usually ends first). */
  maxPlies?: number;
}

/** Play ONE game; `white` moves first. Returns the result record. */
export function playGame(white: Agent, black: Agent, opts: PlayGameOptions = {}): GameRecord {
  const rng = opts.random ?? Math.random;
  const maxPlies = opts.maxPlies ?? 400;
  let state: GameState = createInitialState();
  let plies = 0;

  for (;;) {
    const status: GameOutcome = gameStatus(state);
    if (status.state !== 'ongoing') {
      return {
        white: white.id,
        black: black.id,
        winner: status.state === 'win' ? status.winner : 'draw',
        reason: status.reason,
        plies,
      };
    }
    if (plies >= maxPlies) {
      return { white: white.id, black: black.id, winner: 'draw', reason: 'ply-cap', plies };
    }
    const agent = state.toMove === 'W' ? white : black;
    const move = agent.chooseMove(state, { random: rng });
    if (move === null) {
      // No move available = the side to move has lost (defensive; gameStatus
      // should already have caught this above).
      return {
        white: white.id,
        black: black.id,
        winner: state.toMove === 'W' ? 'B' : 'W',
        reason: 'no-moves',
        plies,
      };
    }
    state = applyMove(state, move);
    plies++;
  }
}

export interface MatchResult {
  a: string;
  b: string;
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  records: GameRecord[];
}

export interface PlayMatchOptions {
  /** Number of games to play (colours alternate each game). */
  games?: number;
  /** Base seed; game i uses seed + i so the whole match is reproducible. */
  seed?: number;
  maxPlies?: number;
}

/**
 * Play a match of `games` games between agents `a` and `b`, alternating colours
 * each game to cancel the first-move advantage. Wins are tallied per AGENT
 * (not per colour).
 */
export function playMatch(a: Agent, b: Agent, opts: PlayMatchOptions = {}): MatchResult {
  const games = opts.games ?? 20;
  const seed = opts.seed ?? 1;
  const result: MatchResult = { a: a.id, b: b.id, games, aWins: 0, bWins: 0, draws: 0, records: [] };

  for (let i = 0; i < games; i++) {
    // Even games: a is White. Odd games: b is White.
    const aIsWhite = i % 2 === 0;
    const white = aIsWhite ? a : b;
    const black = aIsWhite ? b : a;
    const rec = playGame(white, black, {
      random: makeRng(seed + i),
      ...(opts.maxPlies !== undefined ? { maxPlies: opts.maxPlies } : {}),
    });
    result.records.push(rec);
    if (rec.winner === 'draw') {
      result.draws++;
    } else {
      const winnerId = rec.winner === 'W' ? white.id : black.id;
      if (winnerId === a.id) result.aWins++;
      else result.bWins++;
    }
  }
  return result;
}

export interface Standing {
  id: string;
  name: string;
  /** Match-style points: win = 1, draw = 0.5, loss = 0. */
  points: number;
  wins: number;
  draws: number;
  losses: number;
  games: number;
}

export interface RoundRobinResult {
  matches: MatchResult[];
  standings: Standing[];
}

export interface RoundRobinOptions extends PlayMatchOptions {}

/**
 * Round-robin tournament: every agent plays every other agent a `games`-game
 * match. Returns all match results plus a standings table sorted by points.
 */
export function roundRobin(agents: readonly Agent[], opts: RoundRobinOptions = {}): RoundRobinResult {
  const byId = new Map<string, Standing>();
  for (const ag of agents) {
    byId.set(ag.id, { id: ag.id, name: ag.name, points: 0, wins: 0, draws: 0, losses: 0, games: 0 });
  }

  const matches: MatchResult[] = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i]!;
      const b = agents[j]!;
      // Distinct seed per pairing keeps games varied but reproducible.
      const m = playMatch(a, b, { ...opts, seed: (opts.seed ?? 1) + i * 1000 + j });
      matches.push(m);

      const sa = byId.get(a.id)!;
      const sb = byId.get(b.id)!;
      sa.wins += m.aWins;
      sa.losses += m.bWins;
      sa.draws += m.draws;
      sa.games += m.games;
      sa.points += m.aWins + m.draws * 0.5;
      sb.wins += m.bWins;
      sb.losses += m.aWins;
      sb.draws += m.draws;
      sb.games += m.games;
      sb.points += m.bWins + m.draws * 0.5;
    }
  }

  const standings = [...byId.values()].sort((x, y) => y.points - x.points);
  return { matches, standings };
}
