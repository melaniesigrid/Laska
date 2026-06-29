/**
 * Historic Laska games, replayed through the *real* engine.
 *
 * Each game is stored as its original move score (lasca.org algebraic notation)
 * plus light commentary. On load we parse every ply, resolve it to a concrete
 * legal `Move`, and `applyMove` it — so the board you step through is the engine
 * actually playing the recorded game, not a hand-drawn reproduction. If a score
 * ever fails to validate, that is a real signal (bad transcription or a rules
 * mismatch), not something to paper over.
 *
 * Coordinate mapping: lasca.org files a–g → cols 0–6, ranks 1–7 → rows 0–6,
 * White at the bottom moving up — identical to our engine's geometry.
 */
import {
  createInitialState,
  legalMoves,
  applyMove,
  LASKA,
  BASHNI,
  type GameState,
  type Move,
  type Variant,
} from '../../src/index.ts';
import { moveToSan } from './savedGames.ts';

/** Algebraic square (e.g. "c3") → engine square index, on `v`'s board.
 *  Files a.. → cols 0.., ranks 1.. → rows 0.. — White at the bottom moving up,
 *  identical geometry to the engine; the board side length comes from `v`. */
function sqOn(v: Variant, alg: string): number {
  const col = alg.charCodeAt(0) - 97; // 'a' -> 0
  const row = Number(alg[1]) - 1; // '1' -> 0
  const idx = v.rcToSquare[row * v.boardDim + col];
  if (idx == null || idx === -1) throw new Error(`bad square "${alg}"`);
  return idx;
}

/** A path of square indices → {from, landings}: in lasca.org / Lasker chain
 *  notation, consecutive entries are one diagonal step apart, so jumped squares
 *  sit at odd indices and the squares the piece *lands* on sit at 2,4,…; a
 *  two-entry path is a plain step. */
function pathToMove(sqs: number[]): { from: number; landings: number[] } {
  if (sqs.length === 2) return { from: sqs[0]!, landings: [sqs[1]!] };
  const landings: number[] = [];
  for (let i = 2; i < sqs.length; i += 2) landings.push(sqs[i]!);
  return { from: sqs[0]!, landings };
}

/**
 * A move token → {from, landings}, parsed on `v`'s board. Two source notations
 * are supported:
 *  - algebraic ("c3-d4", "c3xe5xg7"): files+ranks (a-h × 1-8 sized to `v`); `x`
 *    separates landing squares, `-` separates every traversed square. Used for
 *    lasca.org Laska scores and for our Bashni engine-played demonstration game.
 *  - Lasker 1911 brochure numeric ("9—13", "17—13—9"): squares numbered 1..25
 *    (→ index N-1), dashes separate every traversed square. Laska-only.
 * A trailing "*" (promotion/marker) is ignored; the engine handles promotion.
 */
function parseToken(v: Variant, raw: string, numeric: boolean): { from: number; landings: number[] } {
  const tok = raw.replace(/\*/g, '').trim();
  if (numeric) {
    return pathToMove(tok.split(/[—-]/).map((s) => Number(s.trim()) - 1));
  }
  if (tok.includes('x')) {
    const sqs = tok.split('x').map((a) => sqOn(v, a));
    return { from: sqs[0]!, landings: sqs.slice(1) };
  }
  return pathToMove(tok.split('-').map((a) => sqOn(v, a)));
}

/** Resolve a notation token to the matching legal Move in `state`. */
function resolveMove(state: GameState, tok: string, numeric: boolean): Move {
  const v = state.variant ?? LASKA;
  const { from, landings } = parseToken(v, tok, numeric);
  const to = landings[landings.length - 1]!;
  const moves = legalMoves(state);
  const exact = moves.find(
    (m) => m.from === from && m.path.length === landings.length && m.path.every((p, i) => p === landings[i]),
  );
  if (exact) return exact;
  // Some scores abbreviate a jump chain to from+to (e.g. "g3xg7"); take the
  // unique — or longest — legal move with that origin and destination.
  const byFromTo = moves.filter((m) => m.from === from && m.to === to).sort((a, b) => b.path.length - a.path.length);
  if (byFromTo[0]) return byFromTo[0];
  throw new Error(`move "${tok}" (from ${from} to ${to}) is not legal`);
}

export interface ReplayPly {
  san: string;
  side: 'W' | 'B';
  moveNo: number;
  note?: string;
  move: Move;
}

export interface HistoricGame {
  id: string;
  title: string;
  white: string;
  black: string;
  event: string;
  result: string;
  sourceNote: string;
  intro: string;
  plies: ReplayPly[];
  /** states[0] = opening; states[k] = position after ply k. length = plies+1. */
  states: GameState[];
  /** The rule variant; absent means Laska (recorded historic games are all Laska). */
  variant?: Variant;
}

interface RawPly {
  san: string;
  note?: string;
}
interface RawGame extends Omit<HistoricGame, 'plies' | 'states'> {
  moves: RawPly[];
  /** true → moves are in Lasker's 1-25 brochure numbering, not algebraic. */
  numeric?: boolean;
}

/** Replay a raw game through the engine into renderable states + resolved plies.
 *  Honors `raw.variant` (Laska when unset), so a Bashni score replays on the 8x8
 *  board and resolves through the Bashni rules just as Laska scores do on 7x7. */
function build(raw: RawGame): HistoricGame {
  let state = createInitialState(raw.variant ?? LASKA);
  const states: GameState[] = [state];
  const numeric = raw.numeric ?? false;
  const plies: ReplayPly[] = raw.moves.map((rp, i) => {
    const side: 'W' | 'B' = i % 2 === 0 ? 'W' : 'B';
    const move = resolveMove(state, rp.san, numeric);
    state = applyMove(state, move);
    states.push(state);
    return { san: rp.san, side, moveNo: Math.floor(i / 2) + 1, note: rp.note, move };
  });
  const { numeric: _omit, ...meta } = raw;
  return { ...meta, plies, states };
}

/**
 * Assemble a `HistoricGame` from a list of already-resolved engine moves — used
 * for live games the engine just played (e.g. the landing-page self-play demo),
 * so they replay and analyse through the exact same viewer as the recorded
 * historic scores. SAN is generated from each move; states are folded from the
 * opening. The moves are trusted (they came from the engine), so no re-resolving.
 */
export function buildLiveGame(
  moves: Move[],
  meta: Omit<HistoricGame, 'plies' | 'states'>,
): HistoricGame {
  const variant = meta.variant ?? LASKA;
  let state = createInitialState(variant);
  const states: GameState[] = [state];
  const plies: ReplayPly[] = moves.map((move, i) => {
    const side: 'W' | 'B' = i % 2 === 0 ? 'W' : 'B';
    state = applyMove(state, move);
    states.push(state);
    return { san: moveToSan(move, variant), side, moveNo: Math.floor(i / 2) + 1, move };
  });
  return { ...meta, plies, states };
}

/** Build a Lasker-brochure game from a comma-separated numeric move string and
 *  a sparse map of ply-index → annotation. Display dashes are normalised to em. */
function laskerGame(
  meta: Omit<HistoricGame, 'plies' | 'states'>,
  movesStr: string,
  notes: Record<number, string> = {},
): HistoricGame {
  const moves: RawPly[] = movesStr.split(',').map((s, i) => ({
    san: s.trim().replace(/-/g, '—'),
    note: notes[i],
  }));
  return build({ ...meta, numeric: true, moves });
}

/** Build a game from a comma-separated algebraic move string (files+ranks, `x`
 *  for jump landings, `-` for a quiet step). Variant comes from `meta.variant`
 *  (Bashni for the 8x8 demonstration game). Notes are a sparse ply-index map. */
function algebraicGame(
  meta: Omit<HistoricGame, 'plies' | 'states'>,
  movesStr: string,
  notes: Record<number, string> = {},
): HistoricGame {
  const moves: RawPly[] = movesStr.split(',').map((s, i) => ({
    san: s.trim(),
    note: notes[i],
  }));
  return build({ ...meta, moves });
}

/**
 * Game 3 (Moscow, 1996) — Tatarinow vs Roschtschin. Source: "Twee Laska
 * partijnotaties uit Rusland", Hoofdlijn No. 48 (1996), via lasca.org. A short,
 * decisive game: White marches a soldier the length of the board, crowns an
 * officer on g7, and the resulting column is overwhelming. This score validates
 * cleanly through our engine end to end.
 */
const MOSCOW_1996: RawGame = {
  id: 'moscow-1996',
  title: 'Moscow, 1996',
  white: 'Tatarinow',
  black: 'Roschtschin',
  event: 'Moscow, 1996',
  result: 'White wins (Black resigns)',
  sourceNote: 'Score: Hoofdlijn No. 48 (1996), via lasca.org',
  intro:
    'Lasca is still played in Russia. A crisp, brutal miniature: White feeds the centre, then runs a soldier all the way to the back rank — and the crowned column it builds decides the game.',
  moves: [
    { san: 'c3-d4', note: 'The standard centre opening — contest the middle immediately.' },
    { san: 'e5xc3' },
    { san: 'b2xd4', note: 'Recapturing toward the centre, the usual idea.' },
    { san: 'c5-b4' },
    { san: 'a3xc5' },
    { san: 'd6xb4' },
    { san: 'g3-f4' },
    { san: 'f6-e5' },
    { san: 'f4xd6' },
    { san: 'c7xe5' },
    { san: 'd4xf6' },
    { san: 'd6xf4' },
    { san: 'f2-g3' },
    { san: 'g7xe5' },
    { san: 'c3-d4' },
    { san: 'e5xc3' },
    { san: 'g3xg7*', note: 'The key blow: White jumps the length of the board and crowns. A general now sits on g7 with prisoners stacked beneath it.' },
    { san: 'c5-d4' },
    { san: 'g7xe5', note: 'The new general sweeps back down — a column this strong dominates the board.' },
    { san: 'd4xf2' },
    { san: 'g1xe3' },
    { san: 'b6-c5' },
    { san: 'f2-g3' },
    { san: 'a7-b6' },
    { san: 'e5-f6', note: 'Black resigns: the crowned column and material edge are decisive.' },
  ],
};

/**
 * Lasker's Explanatory Game 2 — from his own 1911 booklet "Rules of Lasca".
 * Squares are Lasker's 1–25 numbering. This score validates through our engine
 * for all 39 plies: the strongest possible confirmation our rules match his.
 * Both sides mirror through a sharp opening; White breaks through and leaves
 * Black with no move.
 */
const LASKER_1911_G2 = laskerGame(
  {
    id: 'lasker-1911-g2',
    title: 'Lasker’s Game 2 (1911)',
    white: 'White',
    black: 'Black',
    event: 'Explanatory Game 2 · Lasker’s 1911 booklet',
    result: 'White wins (Black cannot move)',
    sourceNote: '“Rules of Lasca, the Great Military Game”, Dr. Emanuel Lasker, 1911',
    intro:
      'One of the five teaching games Lasker printed in his original 1911 brochure — replayed here move-for-move on the live engine. A symmetric, theory-laden opening gives way to a breakthrough that leaves Black frozen.',
  },
  '9-13,17-13-9,5-9-13,21-17,13-17-21,25-21-17,10-13,16-13-10,7-10-13,19-16,13-16-19,22-19-16,10-14,18-14-10,6-10-14,15-12,9-12-15,16-13,10-13-16-19-22,17-13-9,22-19-16,20-16-12,4-7,16-13,8-12-16,21-18,12-9-6,13-9-5,2-5-8,18-14-10-6-2,11-14-17,23-20,17-20-23,24-21,23-20,21-18,7-10,18-14,10-14-18',
  {
    0: 'White leads off, contesting the open centre (squares 12–14 start empty).',
    18: 'A four-jump chain to square 22 — the man crowns as it reaches the last line, and the run ends there.',
    29: 'Black answers with a sweeping capture of his own down to square 2.',
    38: 'White’s last man steps up; Black has no legal reply and loses.',
  },
);

/**
 * Lasker's Explanatory Game 3 (1911 booklet) — a long manoeuvring battle, also
 * valid through our engine for all 78 plies. It ends with White’s last two men
 * blocked, unable to move.
 */
const LASKER_1911_G3 = laskerGame(
  {
    id: 'lasker-1911-g3',
    title: 'Lasker’s Game 3 (1911)',
    white: 'White',
    black: 'Black',
    event: 'Explanatory Game 3 · Lasker’s 1911 booklet',
    result: 'Black wins (White’s last men blocked)',
    sourceNote: '“Rules of Lasca, the Great Military Game”, Dr. Emanuel Lasker, 1911',
    intro:
      'The longest of Lasker’s teaching games — a patient column-building battle that runs 78 half-moves and validates end-to-end on the engine. A study in manoeuvre, ending with White’s last pieces shut in.',
  },
  '9-13,17-13-9,6-9-12,16-13,10-13-16,19-16-13,9-13-17,15-12-9,13-16-19,21-17-13,8-12-16,20-16-12,7-10,23-19-15,5-8,13-10-7,4-7-10,24-21,2-5,17-14,11-14-17,21-17-13,7-11,13-10-7,5-9-13-17-21,25-21-17,9-13,17-13-9,11-14,7-4,14-17,21-17-13,17-21,10-7,3-7-11,9-6,21-24,6-2,24-21,13-9,21-17,9-5,1-5-9,12-9-6,17-21,16-12,8-12-16,19-16-13,21-17,5-1,17-21,6-3,21-17,2-5,17-21,9-6,21-24,6-2,24-21,2-6,21-24,6-9,24-21,9-12,21-24,13-9,24-21,16-13,21-24,12-16,24-21,9-6,21-24,13-9,24-21,16-13,21-24,13-17',
  {
    0: 'Both sides develop toward the centre, building columns rather than trading them off.',
    24: 'A five-square march to 21 — the longest single run of the game.',
    77: 'Black settles on 17 and blocks White’s last two pieces: White cannot move and loses.',
  },
);

/**
 * Bashni demonstration game — the engine playing itself on the 8x8 board, NOT a
 * historic human score (Bashni's recorded games are not readily verifiable, and
 * we will not fabricate a provenance). It was generated deterministically by
 * engine self-play under the BASHNI variant — a fixed depth-4 negamax search with
 * a seeded RNG (mulberry32, seed 4) — and is recorded here as its algebraic move
 * list. Like every game in this file it replays move-for-move through the real
 * engine at import (it throws on the first illegal ply), so it is proof the
 * Bashni rules — forward-only quiet moves, four-way captures, flying kings, and
 * promotion-continues — all work end to end. Black wins: White is left with no
 * legal move. The finale (44. c1xe3xb6xd4xg1) is a flying-king chain that turns
 * three corners — the clearest possible showcase of Bashni's long-range capture.
 */
const BASHNI_DEMO = algebraicGame(
  {
    id: 'bashni-engine-demo',
    title: 'Bashni — engine self-play',
    white: 'Engine (White)',
    black: 'Engine (Black)',
    event: 'Engine self-play · BASHNI variant',
    result: 'Black wins (White cannot move)',
    sourceNote: 'Generated by deterministic engine self-play — not a historic score',
    intro:
      'Not a historic game: this is the engine playing itself under Bashni rules — the Russian “towers” draughts Lasca grew from — recorded so you can watch flying kings and four-way captures on the 8×8 board. Every ply replays on the live engine. It ends with a flying-king sweep that turns three corners and freezes White.',
    variant: BASHNI,
  },
  'c3-b4,d6-c5,b4xd6,e7xc5,e3-d4,c5xe3,d2xf4,d6-e5,f4xd6,c7xe5,g3-f4,e5xg3,h2xf4,d6-c5,b2-c3,b8-c7,c3-b4,c7-d6,c1-d2,f6-g5,b4-a5,d8-c7,g3-h4,g7-f6,g1-h2,h8-g7,h2-g3,c5-d4,e3xc5xe3,b6-c5,a3-b4,c5xa3,a1-b2,a3xc1,a5-b6,c7xa5,f4-e5,d6xf4xh2,f2-g3,h2xf4,e1-f2,e5-d4,e3xc5,c1xe3xb6xd4xg1',
  {
    0: 'Bashni opens like draughts — men step diagonally forward only; the back two rows stay home until a capture pulls them out.',
    28: 'A two-jump chain that loops back to e3 — Bashni men capture in any of the four diagonals, forward or backward, unlike Lasca privates.',
    33: 'Promotion mid-capture: this man lands on the back rank (c1) and is crowned. In Bashni the crown comes immediately and, were more jumps available, the new king would keep capturing.',
    43: 'A flying king sweeps c1→e3→b6→d4→g1, taking prisoners in every diagonal direction — long range and backward captures, the Bashni signature. White has no reply.',
  },
);

export const HISTORIC_GAMES: HistoricGame[] = [
  build(MOSCOW_1996),
  LASKER_1911_G2,
  LASKER_1911_G3,
  BASHNI_DEMO,
];
