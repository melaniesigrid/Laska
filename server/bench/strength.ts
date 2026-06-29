/**
 * Official AI-strength benchmark for Laska.
 *
 * Plays the AI difficulty tiers against each other through the REAL engine and
 * reports their relative strength as (1) a win-rate matrix and (2) Glicko-2
 * ratings mapped to the military rank ladder — the same rating code production
 * uses to finalize ranked games.
 *
 * This file lives in server/ (not the engine root) because it imports BOTH the
 * engine (../../src/index.ts) and the server-only rating layer
 * (../src/rating/...). The engine must never import server code, so the
 * benchmark that bridges them belongs here.
 *
 * Run (from server/):
 *   node --experimental-transform-types bench/strength.ts            # --quick (default)
 *   node --experimental-transform-types bench/strength.ts --full     # all six tiers (slow)
 *   node --experimental-transform-types bench/strength.ts --seed=123  # override seed
 *
 * Determinism: every game's RNG is seeded from the global seed + a per-game
 * counter (mulberry32), so the same seed produces a byte-identical table on
 * every run. No Math.random anywhere.
 *
 * !!! PlayerColor IS 'W' | 'B' (NOT 'white'/'black'). Side-to-move dispatch AND
 * winner attribution compare against 'W'/'B'. Getting this wrong silently makes
 * every game "tier-vs-itself" and misattributes all wins — a plausible-looking
 * but totally wrong table. This is load-bearing; do not "simplify" it.
 */

import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  chooseMove,
  type Difficulty,
  type GameState,
  type PlayerColor,
} from '../../src/index.ts';
import {
  updatePlayer,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
  STARTING_RATING,
  type Glicko2State,
  type Score,
} from '../src/rating/glicko2.ts';
import { rankFor } from '../src/rating/rank.ts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Fast, human-range tiers — fully round-robined for a trustworthy ladder. */
const FAST_TIERS: Difficulty[] = ['beginner', 'easy', 'intermediate', 'medium'];
/** Deep tiers — gated behind --full and given far fewer games (each is ~1000x
 *  the cost of a fast tier and tends to drag to long games). */
const DEEP_TIERS: Difficulty[] = ['hard', 'expert'];

/** Games per ordered direction per pair in --quick. Total per pair = 2x this
 *  (colors alternate), so 12 ⇒ 24 games/pair. */
const QUICK_GAMES_PER_DIR = 12;
/** Games per ordered direction per pair when both tiers are fast, in --full. */
const FULL_FAST_GAMES_PER_DIR = 8;
/** Games per ordered direction for any pair involving a deep tier, in --full. */
const FULL_DEEP_GAMES_PER_DIR = 3;

/**
 * Generous safety cap on plies per game. Engine-natural termination
 * (gameStatus) should end every game far below this; if a game ever hits the
 * cap it is scored 0.5 AND counted as `unterminated` (which should be ~0).
 * Do NOT tighten this — a tight cap scores still-live games as bogus draws.
 */
const SAFETY_PLY_CAP = 400;

/** Default seed; override with --seed=N. */
const DEFAULT_SEED = 0x1a5ca;

// Rough per-game wall-clock cost (ms) for the --full estimate banner only.
const APPROX_MS_PER_GAME: Record<Difficulty, number> = {
  beginner: 10,
  easy: 300,
  intermediate: 500,
  medium: 1500,
  hard: 60000,
  expert: 100000,
};

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Game runner
// ---------------------------------------------------------------------------

interface GameResult {
  /** White's score: 1 White win, 0.5 draw, 0 Black win. */
  scoreWhite: Score;
  plies: number;
  /** True iff the game hit SAFETY_PLY_CAP without natural termination. */
  unterminated: boolean;
}

/**
 * Play one game `white` (as 'W') vs `black` (as 'B') through the real engine,
 * with a per-game seeded RNG so results are reproducible. Returns White's score.
 */
function playGame(white: Difficulty, black: Difficulty, seed: number): GameResult {
  const rng = mulberry32(seed);
  let state: GameState = createInitialState();

  for (let ply = 0; ply < SAFETY_PLY_CAP; ply++) {
    const status = gameStatus(state);
    if (status.state === 'win') {
      // winner is a PlayerColor ('W' | 'B'). White scores 1 iff White won.
      return { scoreWhite: status.winner === 'W' ? 1 : 0, plies: ply, unterminated: false };
    }
    if (status.state === 'draw') {
      return { scoreWhite: 0.5, plies: ply, unterminated: false };
    }

    // Defensive: gameStatus already encodes no-moves as a win, but if a state
    // ever reports ongoing with no legal moves, the side to move loses.
    const moves = legalMoves(state);
    if (moves.length === 0) {
      return { scoreWhite: state.toMove === 'W' ? 0 : 1, plies: ply, unterminated: false };
    }

    // Side-to-move dispatch keys off the 'W' | 'B' color, NOT a tier name.
    const toMove: PlayerColor = state.toMove;
    const difficulty: Difficulty = toMove === 'W' ? white : black;
    const move = chooseMove(state, { difficulty, random: rng });
    if (!move) {
      // No move returned ⇒ treat as the side-to-move having no play (loses).
      return { scoreWhite: state.toMove === 'W' ? 0 : 1, plies: ply, unterminated: false };
    }
    state = applyMove(state, move);
  }

  // Hit the generous cap without natural termination — score a draw and flag it.
  return { scoreWhite: 0.5, plies: SAFETY_PLY_CAP, unterminated: true };
}

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

interface TierRecord {
  w: number;
  l: number;
  d: number;
}

/** Per-pair score accumulator, indexed [tier][opponent] from `tier`'s view. */
type Matrix = Map<Difficulty, Map<Difficulty, { score: number; games: number }>>;

function freshGlicko(): Glicko2State {
  return { rating: STARTING_RATING, ratingDeviation: DEFAULT_RD, volatility: DEFAULT_VOLATILITY };
}

function tally(rec: TierRecord, myScore: number): void {
  if (myScore === 1) rec.w++;
  else if (myScore === 0) rec.l++;
  else rec.d++;
}

function bumpMatrix(m: Matrix, tier: Difficulty, opp: Difficulty, myScore: number): void {
  const row = m.get(tier)!;
  const cell = row.get(opp)!;
  cell.score += myScore;
  cell.games += 1;
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** One scheduled game: who is White, who is Black. */
interface ScheduledGame {
  white: Difficulty;
  black: Difficulty;
}

/**
 * Build an interleaved schedule: for each pair we emit `gamesPerDir` games in
 * each color direction, but we ROUND-ROBIN across pairs (one game from each
 * pair, then the next) rather than playing all of a pair's games back-to-back.
 * This lets the streaming Glicko-2 update converge fairly across the field.
 */
function buildSchedule(
  tiers: Difficulty[],
  gamesPerDir: (a: Difficulty, b: Difficulty) => number,
): ScheduledGame[] {
  // Per-pair queues of scheduled games.
  const queues: ScheduledGame[][] = [];
  for (let i = 0; i < tiers.length; i++) {
    for (let j = i + 1; j < tiers.length; j++) {
      const a = tiers[i]!;
      const b = tiers[j]!;
      // gamesPerDir games in EACH color direction ⇒ 2*n total, exactly balanced.
      const n = gamesPerDir(a, b);
      const q: ScheduledGame[] = [];
      for (let g = 0; g < 2 * n; g++) {
        // Alternate colors so each side plays White exactly n times.
        q.push(g % 2 === 0 ? { white: a, black: b } : { white: b, black: a });
      }
      queues.push(q);
    }
  }

  // Interleave: drain one game from each queue per round until all empty.
  const schedule: ScheduledGame[] = [];
  let remaining = true;
  let idx = 0;
  while (remaining) {
    remaining = false;
    for (const q of queues) {
      if (idx < q.length) {
        schedule.push(q[idx]!);
        remaining = true;
      }
    }
    idx++;
  }
  return schedule;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { full: boolean; seed: number } {
  let full = false;
  let seed = DEFAULT_SEED;
  for (const arg of argv) {
    if (arg === '--full') full = true;
    else if (arg === '--quick') full = false;
    else if (arg.startsWith('--seed=')) {
      const v = Number(arg.slice('--seed='.length));
      if (Number.isFinite(v)) seed = v >>> 0;
    }
  }
  return { full, seed };
}

function fmtScorePct(score: number, games: number): string {
  if (games === 0) return '   - ';
  return `${((score / games) * 100).toFixed(0)}%`.padStart(4);
}

function rankLabel(rk: ReturnType<typeof rankFor>): string {
  const stars = rk.stars ? ` ${'*'.repeat(rk.stars)}` : '';
  const prov = rk.provisional ? ' ?' : '';
  return `${rk.name}${stars}${prov}`;
}

function main(): void {
  const { full, seed } = parseArgs(process.argv.slice(2));
  const tiers: Difficulty[] = full ? [...FAST_TIERS, ...DEEP_TIERS] : [...FAST_TIERS];

  const isDeep = (t: Difficulty): boolean => DEEP_TIERS.includes(t);
  const gamesPerDir = (a: Difficulty, b: Difficulty): number => {
    if (!full) return QUICK_GAMES_PER_DIR;
    return isDeep(a) || isDeep(b) ? FULL_DEEP_GAMES_PER_DIR : FULL_FAST_GAMES_PER_DIR;
  };

  const schedule = buildSchedule(tiers, gamesPerDir);

  // Up-front estimate for --full (it may take 30-60 min).
  if (full) {
    let estMs = 0;
    for (const g of schedule) {
      // A game costs roughly as much as its slower participant.
      estMs += Math.max(APPROX_MS_PER_GAME[g.white], APPROX_MS_PER_GAME[g.black]);
    }
    const estMin = (estMs / 60000).toFixed(0);
    console.log('=== Laska AI-strength benchmark (--full) ===');
    console.log(`Scheduled ${schedule.length} games across ${tiers.length} tiers.`);
    console.log(`Rough wall-clock estimate: ~${estMin} min.`);
    console.log('WARNING: --full includes the deep tiers and may take 30-60 min.');
    console.log('Deep-tier rows have few games / high RD and are marked provisional.\n');
  } else {
    console.log('=== Laska AI-strength benchmark (--quick) ===');
    console.log(`Round-robin of ${tiers.join(', ')} — ${schedule.length} games.\n`);
  }

  // State.
  const glicko = new globalThis.Map<Difficulty, Glicko2State>();
  const records = new globalThis.Map<Difficulty, TierRecord>();
  const matrix: Matrix = new globalThis.Map();
  for (const t of tiers) {
    glicko.set(t, freshGlicko());
    records.set(t, { w: 0, l: 0, d: 0 });
    const row = new globalThis.Map<Difficulty, { score: number; games: number }>();
    for (const o of tiers) if (o !== t) row.set(o, { score: 0, games: 0 });
    matrix.set(t, row);
  }

  const t0 = Date.now();
  let unterminated = 0;
  let played = 0;

  for (let i = 0; i < schedule.length; i++) {
    const { white, black } = schedule[i]!;
    // Per-game seed = global seed mixed with the game index ⇒ reproducible.
    const gameSeed = (seed ^ (i * 0x9e3779b1)) >>> 0;
    const res = playGame(white, black, gameSeed);
    if (res.unterminated) unterminated++;

    const scoreWhite = res.scoreWhite;
    const scoreBlack = (1 - scoreWhite) as Score;

    // Stream both players through Glicko-2 (rating period = 1 game), exactly
    // like production finalize. Both updates read the SAME pre-game states.
    const wState = glicko.get(white)!;
    const bState = glicko.get(black)!;
    glicko.set(white, updatePlayer(wState, bState, scoreWhite));
    glicko.set(black, updatePlayer(bState, wState, scoreBlack));

    // Records + matrix (each tier's view of the pairing).
    tally(records.get(white)!, scoreWhite);
    tally(records.get(black)!, scoreBlack);
    bumpMatrix(matrix, white, black, scoreWhite);
    bumpMatrix(matrix, black, white, scoreBlack);

    played++;
    // Progress heartbeat every 25 games (and for deep tiers, every game).
    if (played % 25 === 0 || isDeep(white) || isDeep(black)) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`  ...${played}/${schedule.length} games (${secs}s)`);
    }
  }

  const wallSecs = ((Date.now() - t0) / 1000).toFixed(1);

  // -------------------------------------------------------------------------
  // 1) Win-rate matrix
  // -------------------------------------------------------------------------
  const colW = 9;
  let out = '\n--- Win-rate matrix (cell = row tier\'s score% vs column; n = games) ---\n\n';
  out += 'vs'.padEnd(14);
  for (const o of tiers) out += o.slice(0, colW).padStart(colW + 1);
  out += '\n';
  for (const t of tiers) {
    out += t.padEnd(14);
    for (const o of tiers) {
      if (o === t) {
        out += '—'.padStart(colW + 1);
      } else {
        const cell = matrix.get(t)!.get(o)!;
        out += fmtScorePct(cell.score, cell.games).padStart(colW + 1);
      }
    }
    out += '\n';
  }
  // Per-pair game count footnote (symmetric, so report once per unordered pair).
  out += '\n  games per pair: ';
  const seen = new Set<string>();
  const pairNotes: string[] = [];
  for (const t of tiers) {
    for (const o of tiers) {
      if (o === t) continue;
      const key = [t, o].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairNotes.push(`${t}/${o}=${matrix.get(t)!.get(o)!.games}`);
    }
  }
  out += pairNotes.join(', ') + '\n';

  // -------------------------------------------------------------------------
  // 2) Glicko ladder
  // -------------------------------------------------------------------------
  const rows = tiers
    .map((t) => {
      const s = glicko.get(t)!;
      const rec = records.get(t)!;
      const games = rec.w + rec.l + rec.d;
      const rank = rankFor({ rating: s.rating, ratingDeviation: s.ratingDeviation, ratedGames: games });
      return { t, s, rec, games, rank };
    })
    .sort((x, y) => y.s.rating - x.s.rating);

  out += '\n--- Glicko-2 ladder (sorted by rating) ---\n\n';
  out += '  tier'.padEnd(16) + 'rating'.padStart(7) + 'RD'.padStart(6) + '  ' +
    'rank'.padEnd(18) + 'W'.padStart(4) + 'L'.padStart(4) + 'D'.padStart(4) + 'games'.padStart(7) + '\n';
  out += '  ' + '-'.repeat(70) + '\n';
  for (const r of rows) {
    out += '  ' + r.t.padEnd(14) +
      String(r.s.rating).padStart(7) +
      String(Math.round(r.s.ratingDeviation)).padStart(6) + '  ' +
      rankLabel(r.rank).padEnd(18) +
      String(r.rec.w).padStart(4) +
      String(r.rec.l).padStart(4) +
      String(r.rec.d).padStart(4) +
      String(r.games).padStart(7) + '\n';
  }

  // -------------------------------------------------------------------------
  // 3) Footer
  // -------------------------------------------------------------------------
  out += '\n--- Run info ---\n';
  out += `  seed:          ${seed} (0x${seed.toString(16)})\n`;
  out += `  mode:          ${full ? '--full (all six tiers)' : '--quick (fast tiers)'}\n`;
  out += `  total games:   ${played}\n`;
  out += `  wall-clock:    ${wallSecs}s\n`;
  out += `  unterminated:  ${unterminated}` +
    (unterminated > 0 ? '  (!!! games that hit the safety cap — expected 0)' : '') + '\n';

  console.log(out);
}

main();
