/**
 * Laska's three named openings, replayed through the *real* engine.
 *
 * Because the start position is symmetrical there are only three distinct first
 * moves: a3-b4, c3-b4 and c3-d4. In "Brettspiele der Völker" (Berlin: August
 * Scherl, 1931) Emanuel Lasker — the game's inventor — named three openings that
 * branch from them: the Hague opening, the Berlin defence and the Wing gambit.
 *
 * As with the historic games (see games.ts), each move is stored as its original
 * lasca.org algebraic score and resolved to a concrete legal `Move` through the
 * engine at import time. A move that fails to validate is a real signal — a
 * transcription slip or a rules mismatch — not something to paper over.
 *
 * Coordinate mapping: lasca.org files a–g → cols 0–6, ranks 1–7 → rows 0–6,
 * White at the bottom moving up — identical to our engine's geometry.
 *
 * Sources (and only these):
 *  - lasca.org "Openings" page — http://www.lasca.org/show?6NU
 *  - Emanuel Lasker, "Brettspiele der Völker" (Board Games of the Nations),
 *    Berlin: August Scherl, 1931 — where Lasker named the openings.
 *  - Peter Billam, "Laska — Openings",
 *    http://www.pjb.com.au/laska/index.html#Openings
 */
import {
  createInitialState,
  legalMoves,
  applyMove,
  RC_TO_SQUARE,
  type GameState,
  type Move,
} from '../../src/index.ts';

/** Algebraic square (e.g. "c3") → engine square index 0..24. */
function sq(alg: string): number {
  const col = alg.charCodeAt(0) - 97; // 'a' -> 0
  const row = Number(alg[1]) - 1; // '1' -> 0
  const idx = RC_TO_SQUARE[row * 7 + col];
  if (idx == null || idx === -1) throw new Error(`bad square "${alg}"`);
  return idx;
}

/** A move token → {from, landings}. lasca.org algebraic only: `x` separates
 *  landing squares, `-` separates traversed squares. A trailing "*" is ignored. */
function parseToken(raw: string): { from: number; landings: number[] } {
  const tok = raw.replace(/\*/g, '').trim();
  if (tok.includes('x')) {
    const sqs = tok.split('x').map(sq);
    return { from: sqs[0]!, landings: sqs.slice(1) };
  }
  const sqs = tok.split('-').map(sq);
  if (sqs.length === 2) return { from: sqs[0]!, landings: [sqs[1]!] };
  const landings: number[] = [];
  for (let i = 2; i < sqs.length; i += 2) landings.push(sqs[i]!);
  return { from: sqs[0]!, landings };
}

/** Resolve a notation token to the matching legal Move in `state`. */
function resolveMove(state: GameState, tok: string): Move {
  const { from, landings } = parseToken(tok);
  const to = landings[landings.length - 1]!;
  const moves = legalMoves(state);
  const exact = moves.find(
    (m) => m.from === from && m.path.length === landings.length && m.path.every((p, i) => p === landings[i]),
  );
  if (exact) return exact;
  const byFromTo = moves.filter((m) => m.from === from && m.to === to).sort((a, b) => b.path.length - a.path.length);
  if (byFromTo[0]) return byFromTo[0];
  throw new Error(`opening move "${tok}" (from ${from} to ${to}) is not legal`);
}

export interface OpeningPly {
  san: string;
  side: 'W' | 'B';
  moveNo: number;
  move: Move;
}

/** A continuation that branches from the main line (e.g. the Hague's g5-f4). */
export interface OpeningVariation {
  /** The single move score, in lasca.org algebraic notation. */
  san: string;
  side: 'W' | 'B';
  /** The move resolved through the engine, or null if it does not validate. */
  move: Move | null;
  /** Plain-language note; explains a discrepancy when `move` is null. */
  note: string;
}

export interface Opening {
  id: string;
  name: string;
  /** First move(s) this opening springs from, e.g. "1. c3-b4". */
  firstMove: string;
  description: string;
  sourceNote: string;
  /** The validated main-line move scores, paired with their notation. */
  mainLine: OpeningPly[];
  /** Listed branch continuations. */
  variations: OpeningVariation[];
  /** states[0] = start; states[k] = position after main-line ply k. */
  states: GameState[];
}

interface RawVariation {
  san: string;
  note: string;
  /** true → this branch is printed on lasca.org but does NOT validate; keep its
   *  text, set `move` to null, and surface the discrepancy. Defaults to false. */
  unresolved?: boolean;
}
interface RawOpening extends Omit<Opening, 'mainLine' | 'variations' | 'states'> {
  /** Main-line move scores in lasca.org algebraic, alternating White/Black. */
  moves: string[];
  variations: RawVariation[];
  /** Ply index the variations branch from (0 = start position). Defaults to the
   *  end of the main line; set it lower when a listed branch *replaces* a
   *  main-line ply (e.g. Berlin's d6-e5 is an alternative to the final c5-b4). */
  branchAfter?: number;
}

/** Replay a raw opening through the engine into renderable states + plies. */
function build(raw: RawOpening): Opening {
  let state = createInitialState();
  const states: GameState[] = [state];
  const mainLine: OpeningPly[] = raw.moves.map((san, i) => {
    const side: 'W' | 'B' = i % 2 === 0 ? 'W' : 'B';
    const move = resolveMove(state, san);
    state = applyMove(state, move);
    states.push(state);
    return { san, side, moveNo: Math.floor(i / 2) + 1, move };
  });
  // Variations branch from `branchAfter` (default: end of the main line),
  // resolved against that position. Unresolved branches keep their text but
  // carry move = null.
  const branchIdx = raw.branchAfter ?? states.length - 1;
  const branchState = states[branchIdx]!;
  const variations: OpeningVariation[] = raw.variations.map((v) => {
    const side: 'W' | 'B' = branchState.toMove;
    if (v.unresolved) return { san: v.san, side, move: null, note: v.note };
    return { san: v.san, side, move: resolveMove(branchState, v.san), note: v.note };
  });
  const { moves: _omit, variations: _omitV, branchAfter: _omitB, ...meta } = raw;
  return { ...meta, mainLine, variations, states };
}

/**
 * The Hague opening — 1. c3-b4 a5xc3 2. b2xd4. White offers a man on b4; Black
 * takes and White recaptures toward the centre, building an early column on d4.
 * Black then chooses how to develop.
 *
 * NOTE on the second variation: lasca.org prints "c5-b5", but b5 is not a
 * playing square — on a Laska board rank 5 only has dark squares at files a, c,
 * e, g, so "b5" cannot exist. This is consistent with the faded-scan digit
 * ambiguity flagged in transcription. The natural Black development that the
 * line clearly intends is c5-b4 (a simple forward step), which validates
 * cleanly; we surface the printed token as a noted discrepancy rather than
 * silently rewriting Lasker's score or shipping an impossible coordinate.
 */
const HAGUE: RawOpening = {
  id: 'hague',
  name: 'The Hague opening',
  firstMove: '1. c3-b4',
  description:
    'White offers a man on b4. Black accepts (a5xc3) and White recaptures into the centre (b2xd4), planting an early column on d4. From there Black develops with g5-f4 on the wing or contests the centre.',
  sourceNote: 'Named by Emanuel Lasker in “Brettspiele der Völker” (Berlin: August Scherl, 1931).',
  moves: ['c3-b4', 'a5xc3', 'b2xd4'],
  variations: [
    {
      san: 'g5-f4',
      note: 'Black develops on the kingside wing, mirroring White’s thrust toward the centre. Validates cleanly through the engine.',
    },
    {
      san: 'c5-b5',
      unresolved: true,
      note:
        'As printed on lasca.org. b5 is not a playing square (rank 5 has dark squares only at files a, c, e, g), so this token cannot be a legal Laska move — a faded-scan digit slip. The intended development is almost certainly c5-b4, a plain forward step that validates; we leave the printed token flagged rather than overwrite the original score.',
    },
  ],
};

/**
 * The Berlin defence — 1. c3-d4 e5xc3 2. b2xd4 c5-b4. Against the standard
 * centre push c3-d4, Black strikes back with e5xc3; White recaptures to d4 and
 * Black continues c5-b4. Black may instead play d6-e5.
 */
const BERLIN: RawOpening = {
  id: 'berlin',
  name: 'The Berlin defence',
  firstMove: '1. c3-d4',
  description:
    'Black’s reply to the standard centre opening c3-d4: e5xc3 grabs the offered man, White recaptures to d4, and Black develops with c5-b4. A solid, symmetrical fight for the middle.',
  sourceNote: 'Named by Emanuel Lasker in “Brettspiele der Völker” (Berlin: August Scherl, 1931).',
  moves: ['c3-d4', 'e5xc3', 'b2xd4', 'c5-b4'],
  // d6-e5 is Black's alternative to the final c5-b4, so it branches after ply 3.
  branchAfter: 3,
  variations: [
    {
      san: 'd6-e5',
      note: 'Instead of c5-b4, Black develops the other wing with d6-e5. Validates cleanly through the engine.',
    },
  ],
};

/**
 * The Wing gambit — 1. a3-b4 c5xa3 2. e3-d4. White offers the a3 man on the
 * wing; Black takes it (c5xa3) and White answers in the centre with e3-d4,
 * trading the wing pawn for central tempo.
 */
const WING_GAMBIT: RawOpening = {
  id: 'wing-gambit',
  name: 'The Wing gambit',
  firstMove: '1. a3-b4',
  description:
    'A true gambit: White pushes a3-b4 and lets Black capture on the wing (c5xa3), then seizes the centre with e3-d4 — sacrificing a wing man for central development and the initiative.',
  sourceNote: 'Named by Emanuel Lasker in “Brettspiele der Völker” (Berlin: August Scherl, 1931).',
  moves: ['a3-b4', 'c5xa3', 'e3-d4'],
  variations: [],
};

export const OPENINGS: Opening[] = [build(HAGUE), build(BERLIN), build(WING_GAMBIT)];

/** The three distinct first moves from the symmetrical start position. */
export const FIRST_MOVES = ['a3-b4', 'c3-b4', 'c3-d4'] as const;

/** The three sources backing this dataset — surfaced in the brochure credits. */
export const OPENING_SOURCES: { label: string; href?: string }[] = [
  { label: 'lasca.org — “Openings”', href: 'http://www.lasca.org/show?6NU' },
  {
    label:
      'Emanuel Lasker, “Brettspiele der Völker” (Board Games of the Nations), Berlin: August Scherl, 1931',
  },
  { label: 'Peter Billam, “Laska — Openings”', href: 'http://www.pjb.com.au/laska/index.html#Openings' },
] as const;
