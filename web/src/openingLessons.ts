/**
 * Interactive **Openings course** — Lasker's named Laska openings, taught hands-on
 * over the real board.
 *
 * Unlike the strategy lessons in `lessons.ts` (which author bespoke positions),
 * every opening lesson here is *generated* from the already-engine-validated
 * repertoire data in `openings.ts`. That data replays each opening's main line
 * from `createInitialState` through the live engine at import time, so the moves a
 * student is asked to play are exactly the moves Lasker named — never a
 * hand-asserted line that could drift from the rules.
 *
 * A lesson is the same `Lesson` shape `TutorialBoard` already renders: the
 * learner always plays **White** (the side that opens), and Black's scripted
 * theory replies are `actor: 'opponent'` steps that auto-play. Note these Black
 * replies are *authored opening theory*, not necessarily forced — so we do NOT
 * route them through `lessons.ts`'s `buildLesson` (whose contract asserts an
 * opponent reply is the only legal move). We build the `Lesson`/`LessonStep`
 * objects directly from the opening's pre-resolved `mainLine[i].move` and
 * `states[i]`, attaching per-ply coaching here.
 *
 * Coordinate mapping is the engine's own: files a–g → cols 0–6, ranks 1–7 →
 * rows 0–6, White at the bottom moving toward higher ranks.
 */
import { LASKA, BASHNI, type Variant } from '../../src/index.ts';
import { OPENINGS, type Opening } from './openings.ts';
import type { Lesson, LessonStep, StepActor } from './lessons.ts';

/** The engine `Variant` an opening is theory for (Laska unless tagged bashni). */
function variantFor(o: Opening): Variant {
  return o.variant === 'bashni' ? BASHNI : LASKA;
}

/** Algebraic square (e.g. "d4") → engine square index, on `v`'s geometry. Used
 *  only to glow authored "extra" squares; the move's own from/to glow anyway. */
function sq(v: Variant, alg: string): number {
  const col = alg.charCodeAt(0) - 97; // 'a' -> 0
  const row = Number(alg.slice(1)) - 1; // '1' -> 0
  const idx = v.rcToSquare[row * v.boardDim + col];
  if (idx == null || idx === -1) throw new Error(`bad ${v.id} square "${alg}"`);
  return idx;
}

/** Coaching for a single main-line ply. */
interface PlyCoach {
  /** ≤ ~12-word coach line for this ply. */
  prompt: string;
  /** Micro-takeaway shown after the ply resolves. */
  successText: string;
  /** Shown after a wrong/slow learner attempt (learner plies only). */
  hint?: string;
  /** Extra algebraic squares to glow beyond the move's own from/to. */
  highlight?: string[];
}

/** Authored wrapper around an `openings.ts` `Opening`. */
interface OpeningCoaching {
  /** Lesson title (defaults to the opening's name). */
  title?: string;
  /** Course ordering; 1 = first. */
  difficulty: number;
  /** Framing shown before the board. */
  intro: string;
  /** Strategic takeaway shown on completion. */
  outro: string;
  /** One coach entry per main-line ply, in order. */
  plies: PlyCoach[];
}

/**
 * Generate a `Lesson` from a validated `Opening` + per-ply coaching. White plies
 * become gated learner steps; Black plies auto-play as opponent steps. Throws if
 * the coaching count doesn't match the opening's main line — a content bug.
 */
function buildOpeningLesson(o: Opening, c: OpeningCoaching): Lesson {
  if (c.plies.length !== o.mainLine.length) {
    throw new Error(
      `opening "${o.id}": ${c.plies.length} coach lines for ${o.mainLine.length} plies`,
    );
  }
  const v = variantFor(o);
  const steps: LessonStep[] = o.mainLine.map((ply, i) => {
    const coach = c.plies[i]!;
    const actor: StepActor = ply.side === 'W' ? 'learner' : 'opponent';
    const glow = new Set<number>([ply.move.from, ply.move.to]);
    for (const h of coach.highlight ?? []) glow.add(sq(v, h));
    return {
      actor,
      prompt: coach.prompt,
      successText: coach.successText,
      expectedMoves: [ply.move],
      highlight: [...glow],
      state: o.states[i]!,
      ...(coach.hint !== undefined ? { hint: coach.hint } : {}),
    };
  });
  return {
    id: `opening-${o.id}`,
    title: c.title ?? o.name,
    // Show the opening's first move as the card "ref" chip (e.g. "1. c3-b4").
    strategyRef: o.firstMove,
    difficulty: c.difficulty,
    intro: c.intro,
    outro: c.outro,
    variant: v,
    states: o.states,
    steps,
  };
}

// Look up the three Lasker openings by id so coaching can't silently bind to the
// wrong line if the array order in openings.ts ever changes.
const byId = (id: string): Opening => {
  const o = OPENINGS.find((x) => x.id === id);
  if (!o) throw new Error(`openingLessons: no Laska opening "${id}"`);
  return o;
};
const HAGUE = byId('hague'); //        1. c3-b4 a5xc3 2. b2xd4
const BERLIN = byId('berlin'); //      1. c3-d4 e5xc3 2. b2xd4 c5-b4
const WING = byId('wing-gambit'); //   1. a3-b4 c5xa3 2. e3-d4

// ---------------------------------------------------------------------------
// Lesson 0 — Your first move (foundational; not tied to one named opening).
// ---------------------------------------------------------------------------
// The start position is symmetric, so White has exactly three distinct first
// moves — and they are precisely the first ply of the three named openings. We
// accept all three (any is sound) and explain why the empty centre row makes the
// first move a genuine choice. The canonical (first-listed) move is the central
// c3-d4, so the board's resolved end position matches the most instructive pick.
const FIRST_MOVE_LESSON: Lesson = (() => {
  const start = BERLIN.states[0]!; // identical start state for every Laska opening
  const cd4 = BERLIN.mainLine[0]!.move; // c3-d4 (central)
  const cb4 = HAGUE.mainLine[0]!.move; // c3-b4 (toward the wing)
  const ab4 = WING.mainLine[0]!.move; // a3-b4 (the wing)
  const step: LessonStep = {
    actor: 'learner',
    prompt: 'Open the game — play any first move (try c3 → d4).',
    successText: 'A sound first move. With the centre empty, the battle for it begins now.',
    hint: 'From the symmetric start only three moves exist: c3-d4, c3-b4 or a3-b4. All are sound — pick one.',
    expectedMoves: [cd4, cb4, ab4],
    highlight: [cd4.from, cd4.to, cb4.to, ab4.from, ab4.to],
    state: start,
  };
  return {
    id: 'opening-first-move',
    title: 'Your first move',
    strategyRef: 'Openings',
    difficulty: 1,
    intro:
      'Laska starts symmetric, with the whole centre row empty — so unlike chess there is no “book” forced on you. White has just three distinct first moves, and all three are sound. The choice is which fight you want.',
    outro:
      'The empty centre is the prize: c3-d4 stakes it directly, c3-b4 leans toward the wing, a3-b4 offers a wing man for central tempo. Each leads to one of Lasker’s named openings — which you’ll learn next.',
    variant: LASKA,
    states: [start, BERLIN.states[1]!],
    steps: [step],
  };
})();

// ---------------------------------------------------------------------------
// Lesson 1 — The Hague opening (1. c3-b4 a5xc3 2. b2xd4)
// ---------------------------------------------------------------------------
const HAGUE_LESSON = buildOpeningLesson(HAGUE, {
  difficulty: 2,
  intro:
    'The Hague opening. White nudges a man to b4, inviting Black to capture — then recaptures back toward the centre, planting an early column on d4. A clean lesson in giving a little to get the middle.',
  outro:
    'That early column on d4 is the Hague’s whole point: you let Black take on the wing, then recaptured inward and stood taller in the centre. From here Black develops on the kingside (g5-f4).',
  plies: [
    {
      prompt: 'Offer the man — tap c3, then b4.',
      hint: 'Step c3 up to b4, right where Black’s a5 can take it. The offer is the idea.',
      successText: 'Offered. b4 dares Black to capture — and capture they must.',
      highlight: ['a5'],
    },
    {
      prompt: 'Black accepts — a5 takes on c3…',
      successText: 'Black grabbed the man and landed deep on c3 — now inside your reach.',
    },
    {
      prompt: 'Recapture inward — tap b2, take to d4.',
      hint: 'Jump b2 over the man on c3 and land on d4 — recapturing toward the centre.',
      successText: 'Recaptured into the centre. Your early d4 column is the Hague.',
      highlight: ['d4'],
    },
  ],
});

// ---------------------------------------------------------------------------
// Lesson 2 — The Berlin defence (1. c3-d4 e5xc3 2. b2xd4 c5-b4)
// ---------------------------------------------------------------------------
const BERLIN_LESSON = buildOpeningLesson(BERLIN, {
  difficulty: 3,
  intro:
    'The Berlin defence answers the most direct first move, c3-d4. Black strikes the centre right back with e5xc3; you recapture to d4, and Black develops. A symmetrical, principled fight for the middle.',
  outro:
    'Both sides traded a man for central presence and came out level — the Berlin is solid, not sharp. Black’s c5-b4 keeps developing; an equally good try is d6-e5 on the other wing.',
  plies: [
    {
      prompt: 'Stake the centre — tap c3, then d4.',
      hint: 'c3-d4 is the most direct opening: occupy the middle at once.',
      successText: 'The centre is contested. Now Black hits back.',
      highlight: ['e5'],
    },
    {
      prompt: 'Black counters — e5 takes c3…',
      successText: 'Black refuses to cede the centre and captures on c3.',
    },
    {
      prompt: 'Recapture to d4 — tap b2, take to d4.',
      hint: 'Jump b2 over c3 onto d4, restoring your man in the middle.',
      successText: 'Recaptured. Material is level and the centre is shared.',
      highlight: ['d4'],
    },
    {
      prompt: 'Black develops — c5 steps to b4…',
      successText: 'Black brings up another man. A calm, balanced Berlin position.',
    },
  ],
});

// ---------------------------------------------------------------------------
// Lesson 3 — The Wing gambit (1. a3-b4 c5xa3 2. e3-d4)
// ---------------------------------------------------------------------------
const WING_LESSON = buildOpeningLesson(WING, {
  difficulty: 4,
  intro:
    'A true gambit. White pushes a man on the wing and simply lets Black take it — then, instead of recapturing, seizes the centre. You trade a wing man for tempo and the initiative: Lasker’s “attack over defence” from move one.',
  outro:
    'You’re a man down on the wing — and better for it. e3-d4 turned the lost tempo into a central grip and the initiative. In Laska, initiative is often worth more than the man it costs.',
  plies: [
    {
      prompt: 'Push the wing — tap a3, then b4. You’re offering it.',
      hint: 'a3-b4 puts the man where Black’s c5 can take it. That’s the gambit.',
      successText: 'Offered on the wing. Now resist the urge to defend it.',
      highlight: ['c5'],
    },
    {
      prompt: 'Black takes the gambit — c5 captures to a3…',
      successText: 'Black grabbed the wing man. You’re down material — for now.',
    },
    {
      prompt: 'Don’t recapture — seize the centre with e3 to d4.',
      hint: 'Ignore the lost wing man. e3-d4 takes the centre and the initiative instead.',
      successText: 'Centre seized. A man for the initiative — that’s the Wing gambit.',
      highlight: ['d4'],
    },
  ],
});

// ---------------------------------------------------------------------------
// Exported, validated openings course (ordered easiest → hardest).
// ---------------------------------------------------------------------------
/**
 * The Openings course: a foundational "first move" lesson plus Lasker's three
 * named Laska openings, each generated from the engine-validated lines in
 * `openings.ts` and taught hands-on over the real board.
 */
export const OPENING_LESSONS: Lesson[] = [
  FIRST_MOVE_LESSON,
  HAGUE_LESSON,
  BERLIN_LESSON,
  WING_LESSON,
];
