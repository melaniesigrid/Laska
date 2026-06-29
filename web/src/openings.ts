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
  LASKA,
  BASHNI,
  type GameState,
  type Move,
  type Variant,
  type VariantId,
} from '../../src/index.ts';

/**
 * Algebraic square (e.g. "c3") → engine square index, on `v`'s geometry.
 *
 * Both variants use the same convention — file a–h → cols 0–7, rank 1–8 →
 * rows 0–7, White at the bottom moving up — but the board WIDTH differs (Laska
 * is 7 wide, Bashni 8), so the (row, col) → index lookup must consult the
 * variant's own `rcToSquare` table. Hardcoding `row * 7` (as the original
 * Laska-only version did) would silently mis-index every Bashni square.
 */
function sq(v: Variant, alg: string): number {
  const col = alg.charCodeAt(0) - 97; // 'a' -> 0
  const row = Number(alg[1]) - 1; // '1' -> 0
  const idx = v.rcToSquare[row * v.boardDim + col];
  if (idx == null || idx === -1) throw new Error(`bad square "${alg}" on ${v.name}`);
  return idx;
}

/** A move token → {from, landings} on `v`. lasca.org algebraic only: `x`
 *  separates landing squares, `-` separates traversed squares. A trailing "*"
 *  is ignored. */
function parseToken(v: Variant, raw: string): { from: number; landings: number[] } {
  const tok = raw.replace(/\*/g, '').trim();
  if (tok.includes('x')) {
    const sqs = tok.split('x').map((a) => sq(v, a));
    return { from: sqs[0]!, landings: sqs.slice(1) };
  }
  const sqs = tok.split('-').map((a) => sq(v, a));
  if (sqs.length === 2) return { from: sqs[0]!, landings: [sqs[1]!] };
  const landings: number[] = [];
  for (let i = 2; i < sqs.length; i += 2) landings.push(sqs[i]!);
  return { from: sqs[0]!, landings };
}

/** Resolve a notation token to the matching legal Move in `state`. The state's
 *  variant (read off `state`) drives both the geometry and the legal-move set,
 *  so the same resolver validates a Laska or a Bashni line. */
function resolveMove(state: GameState, v: Variant, tok: string): Move {
  const { from, landings } = parseToken(v, tok);
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
  /** Which variant this line is theory for. Drives the board geometry and the
   *  legal-move set every ply is validated against. */
  variant: VariantId;
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
interface RawOpening extends Omit<Opening, 'mainLine' | 'variations' | 'states' | 'variant'> {
  /** Which variant this line is theory for. Optional; defaults to Laska so the
   *  three Lasker openings keep their original (variant-less) declarations. */
  variant?: VariantId;
  /** Main-line move scores in lasca.org algebraic, alternating White/Black. */
  moves: string[];
  variations: RawVariation[];
  /** Ply index the variations branch from (0 = start position). Defaults to the
   *  end of the main line; set it lower when a listed branch *replaces* a
   *  main-line ply (e.g. Berlin's d6-e5 is an alternative to the final c5-b4). */
  branchAfter?: number;
}

/** The engine `Variant` for an opening's `variant` id (Laska when unset). */
function variantFor(id: VariantId | undefined): Variant {
  return id === 'bashni' ? BASHNI : LASKA;
}

/** Replay a raw opening through the engine into renderable states + plies. The
 *  opening's variant drives BOTH the start position and every legal-move check,
 *  so a bad ply throws at import time exactly as a bad Laska ply always has. */
function build(raw: RawOpening): Opening {
  const v = variantFor(raw.variant);
  let state = createInitialState(v);
  const states: GameState[] = [state];
  const mainLine: OpeningPly[] = raw.moves.map((san, i) => {
    const side: 'W' | 'B' = i % 2 === 0 ? 'W' : 'B';
    const move = resolveMove(state, v, san);
    state = applyMove(state, move);
    states.push(state);
    return { san, side, moveNo: Math.floor(i / 2) + 1, move };
  });
  // Variations branch from `branchAfter` (default: end of the main line),
  // resolved against that position. Unresolved branches keep their text but
  // carry move = null.
  const branchIdx = raw.branchAfter ?? states.length - 1;
  const branchState = states[branchIdx]!;
  const variations: OpeningVariation[] = raw.variations.map((vr) => {
    const side: 'W' | 'B' = branchState.toMove;
    if (vr.unresolved) return { san: vr.san, side, move: null, note: vr.note };
    return { san: vr.san, side, move: resolveMove(branchState, v, vr.san), note: vr.note };
  });
  const { moves: _omit, variations: _omitV, branchAfter: _omitB, variant: _omitVar, ...meta } = raw;
  return { ...meta, variant: raw.variant ?? 'laska', mainLine, variations, states };
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

// ===========================================================================
// Bashni openings — principled lines, NOT a named historical canon.
// ===========================================================================
//
// Bashni (Russian "towers" draughts) is the ancestor Laska descends from, on an
// 8x8 board with 12 men a side. Its rules diverge from Laska — men capture in
// ALL four directions, kings fly, and a man that promotes mid-capture keeps
// capturing — so the Lasker-named Laska openings above do NOT transfer. Each
// line below is replayed from `createInitialState(BASHNI)` through the SAME
// engine resolver, on Bashni's 8-wide geometry; an illegal ply throws at import.
//
// Authentic *named* Bashni opening theory is sparse and not reliably sourced, so
// — unlike the three Lasker openings — these are honestly labelled PRINCIPLED
// lines (centre development, a forced central fork, a wing advance), not famous
// names we'd be fabricating. They illustrate sound first principles a student
// can replay over the real board, with the same engine-validation contract.
//
// Coordinate convention is identical to Laska's, just one file/rank wider:
// files a–h → cols 0–7, ranks 1–8 → rows 0–7, White at the bottom moving up.

/**
 * Central Exchange — 1. c3-d4 f6-e5 2. d4xf6 g7xe5 3. g3-f4 e5xg3 4. h2xf4.
 * White contests the centre with c3-d4; Black challenges with f6-e5, forcing a
 * symmetric exchange (mandatory captures both ways) that opens lines while
 * keeping material level. A clean, balanced way to learn Bashni's two-way
 * capturing.
 */
const BASHNI_CENTRAL_EXCHANGE: RawOpening = {
  id: 'bashni-central-exchange',
  name: 'Central Exchange',
  variant: 'bashni',
  firstMove: '1. c3-d4',
  description:
    'White stakes the centre with c3-d4; Black answers f6-e5 and a forced symmetric exchange follows (d4xf6 g7xe5, then g3-f4 e5xg3 h2xf4). Material stays level while the centre opens — a model of Bashni’s mandatory, two-way captures.',
  sourceNote:
    'Principled line (not a named historical opening) — validated move-for-move from the Bashni start position through the live engine.',
  moves: ['c3-d4', 'f6-e5', 'd4xf6', 'g7xe5', 'g3-f4', 'e5xg3', 'h2xf4'],
  // Black's recapture choice (g7xe5 vs e7xg5) branches after White's 2. d4xf6.
  branchAfter: 3,
  variations: [
    {
      san: 'e7xg5',
      note: 'Instead of g7xe5, Black recaptures toward the kingside with e7xg5 — equally sound. Validates cleanly through the engine.',
    },
  ],
};

/**
 * Central Fork — 1. c3-d4 d6-c5 2. e3-f4 c5xe3xg5. After c3-d4 d6-c5, the
 * thrust e3-f4 offers a man Black cannot decline: c5xe3xg5 is a forced double
 * jump (capture is mandatory in Bashni). A sharp lesson in chain captures and
 * the danger of an unsupported flank push.
 */
const BASHNI_CENTRAL_FORK: RawOpening = {
  id: 'bashni-central-fork',
  name: 'Central Fork',
  variant: 'bashni',
  firstMove: '1. c3-d4',
  description:
    'A tactical motif: after c3-d4 d6-c5, White’s e3-f4 walks into a forced double capture, c5xe3xg5 — captures are mandatory in Bashni, so Black must take the whole chain. A pointed warning about unsupported pushes and a clean example of a multi-jump.',
  sourceNote:
    'Principled line illustrating Bashni’s forced chain captures (not a named historical opening) — validated through the live engine.',
  moves: ['c3-d4', 'd6-c5', 'e3-f4', 'c5xe3xg5'],
  variations: [],
};

/**
 * Quiet Symmetric — 1. c3-d4 d6-c5 2. g3-f4 e7-d6. A calm, capture-free
 * development: both sides build a broad pawn front across the centre and
 * kingside before contact. Good for studying Bashni structure before the
 * tactics begin.
 */
const BASHNI_QUIET_SYMMETRIC: RawOpening = {
  id: 'bashni-quiet-symmetric',
  name: 'Quiet Symmetric',
  variant: 'bashni',
  firstMove: '1. c3-d4',
  description:
    'A capture-free build-up: c3-d4 d6-c5, g3-f4 e7-d6. Both armies develop a broad front across the centre and kingside before any contact — the positional counterweight to the Central Fork, ideal for learning Bashni structure.',
  sourceNote:
    'Principled developing line (not a named historical opening) — validated through the live engine.',
  moves: ['c3-d4', 'd6-c5', 'g3-f4', 'e7-d6'],
  // Black's 2nd move (e7-d6 vs the kingside h6-g5) branches after White's 2. g3-f4.
  branchAfter: 3,
  variations: [
    {
      san: 'h6-g5',
      note: 'Instead of e7-d6, Black expands on the far wing with h6-g5 — but this exposes the man to f4xh6 next, so it is the more committal try. Validates cleanly through the engine.',
    },
  ],
};

/**
 * Wing Advance — 1. a3-b4 b6-a5 2. e3-d4 f6-e5 3. d4xf6 g7xe5. White opens on
 * the queenside wing with a3-b4; after Black mirrors with b6-a5, White pivots
 * to the centre (e3-d4) and a central exchange resolves. Shows how a flank move
 * and a central break combine.
 */
const BASHNI_WING_ADVANCE: RawOpening = {
  id: 'bashni-wing-advance',
  name: 'Wing Advance',
  variant: 'bashni',
  firstMove: '1. a3-b4',
  description:
    'A flank-then-centre plan: a3-b4 b6-a5 stakes the queenside, then White pivots with e3-d4 and a central exchange follows (f6-e5 d4xf6 g7xe5). Demonstrates pairing a wing advance with a central break.',
  sourceNote:
    'Principled line (not a named historical opening) — validated move-for-move through the live engine.',
  moves: ['a3-b4', 'b6-a5', 'e3-d4', 'f6-e5', 'd4xf6', 'g7xe5'],
  variations: [],
};

/** The curated Bashni opening repertoire — principled lines, engine-validated. */
export const BASHNI_OPENINGS: Opening[] = [
  build(BASHNI_CENTRAL_EXCHANGE),
  build(BASHNI_CENTRAL_FORK),
  build(BASHNI_QUIET_SYMMETRIC),
  build(BASHNI_WING_ADVANCE),
];

/** Every opening across both variants, in one list for variant-filtered views. */
export const ALL_OPENINGS: Opening[] = [...OPENINGS, ...BASHNI_OPENINGS];

/** Board geometry an opening renders on — pass to a `BoardView` so a Bashni line
 *  paints on the 8x8 board and a Laska line on the 7x7. Sourced from the engine
 *  variant, never re-derived here. */
export function openingGeometry(o: Opening): { boardDim: number; rcToSquare: number[]; numSquares: number } {
  const v = variantFor(o.variant);
  return { boardDim: v.boardDim, rcToSquare: v.rcToSquare, numSquares: v.numSquares };
}

/** The three sources backing this dataset — surfaced in the brochure credits. */
export const OPENING_SOURCES: { label: string; href?: string }[] = [
  { label: 'lasca.org — “Openings”', href: 'http://www.lasca.org/show?6NU' },
  {
    label:
      'Emanuel Lasker, “Brettspiele der Völker” (Board Games of the Nations), Berlin: August Scherl, 1931',
  },
  { label: 'Peter Billam, “Laska — Openings”', href: 'http://www.pjb.com.au/laska/index.html#Openings' },
] as const;
