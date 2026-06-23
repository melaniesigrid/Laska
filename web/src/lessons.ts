/**
 * Strategy lessons, scripted over the *real* engine.
 *
 * These are the Phase-2/Phase-4 strategy lessons (column strategy & tactics),
 * the deeper counterpart to the Phase-1 first-run "5-tap" script described in
 * TUTORIAL.md. Each lesson is a short sequence of engine-validated steps rendered
 * over the real `BoardView`: a `position` (FEN-like `decodePosition` string), a
 * coach `prompt`, the `expectedMoves` the learner must play, a `hint`, and
 * `successText`. Steps the learner does NOT play (the opponent's forced replies)
 * are marked `actor: 'opponent'` and are auto-played.
 *
 * Like games.ts / openings.ts, EVERY position and EVERY scripted move is resolved
 * and validated through the engine at import time (`buildLesson`). If a position
 * can't be decoded, or a scripted move isn't in `legalMoves`, or an opponent's
 * "forced" reply turns out not to be forced, this module THROWS on load — that is
 * a real bug in the lesson data, never something to paper over by editing the
 * engine. The content here traces directly to STRATEGY.md (section refs below).
 *
 * Data shape matches TUTORIAL.md → "Tutorial step shape (implementation)":
 *   { position, prompt, expectedMoves, hint, successText, highlight }
 * plus `actor` (whose move the step is) and per-lesson metadata, so a
 * `TutorialBoard` wrapper highlights squares and gates input to the expected
 * move(s). `LessonsPage` exposes the validated scripts in the app.
 *
 * Coordinate mapping is identical to the engine: files a–g → cols 0–6, ranks 1–7
 * → rows 0–6, White at the bottom moving toward higher ranks.
 */
import {
  decodePosition,
  legalMoves,
  applyMove,
  RC_TO_SQUARE,
  SQUARE_TO_RC,
  type GameState,
  type Move,
} from '../../src/index.ts';

// ---------------------------------------------------------------------------
// Coordinate helpers (algebraic <-> engine square index)
// ---------------------------------------------------------------------------

/** Algebraic square (e.g. "c3") → engine square index 0..24. */
function sq(alg: string): number {
  const col = alg.charCodeAt(0) - 97; // 'a' -> 0
  const row = Number(alg[1]) - 1; // '1' -> 0
  const idx = RC_TO_SQUARE[row * 7 + col];
  if (idx == null || idx === -1) throw new Error(`bad square "${alg}"`);
  return idx;
}

/** Engine square index → algebraic (e.g. 8 → "c3"). For display/debug. */
export function squareToAlg(idx: number): string {
  const rc = SQUARE_TO_RC[idx];
  if (!rc) throw new Error(`bad square index ${idx}`);
  return String.fromCharCode(97 + rc.col) + (rc.row + 1);
}

/** Decode a FEN-like position string into a full, playable `GameState`. */
function stateFrom(position: string): GameState {
  const { board, toMove } = decodePosition(position);
  return { board, toMove, plyNoProgress: 0, positionCounts: {} };
}

/**
 * Resolve one move written as "from-to" / "fromxto" (algebraic) to the matching
 * legal `Move` in `state`. A jump chain may be written compactly as origin +
 * final landing ("a1xc3"); the unique/longest legal move with that origin and
 * destination is taken. Throws if no legal move matches.
 */
function resolveMove(state: GameState, notation: string): Move {
  const tok = notation.trim();
  const sep = tok.includes('x') ? 'x' : '-';
  const sqs = tok.split(sep).map(sq);
  const from = sqs[0]!;
  const to = sqs[sqs.length - 1]!;
  const moves = legalMoves(state);
  // Exact path match first (when every traversed landing is spelled out).
  const landings = sqs.slice(1);
  const exact = moves.find(
    (m) =>
      m.from === from &&
      m.path.length === landings.length &&
      m.path.every((p, i) => p === landings[i]),
  );
  if (exact) return exact;
  // Otherwise the longest legal move with that origin + destination.
  const byFromTo = moves
    .filter((m) => m.from === from && m.to === to)
    .sort((a, b) => b.path.length - a.path.length);
  if (byFromTo[0]) return byFromTo[0];
  throw new Error(
    `lesson move "${notation}" (from ${squareToAlg(from)} to ${squareToAlg(to)}) is not legal; ` +
      `legal moves: ${moves.map((m) => squareToAlg(m.from) + '->' + m.path.map(squareToAlg).join('x')).join(', ')}`,
  );
}

// ---------------------------------------------------------------------------
// Lesson data shapes
// ---------------------------------------------------------------------------

/** Who plays a given step: the learner, or the (auto-played) opponent reply. */
export type StepActor = 'learner' | 'opponent';

/** Authored (raw) step — what content writers fill in. */
interface RawStep {
  /** Whose move this is. Defaults to 'learner'. Opponent steps auto-play. */
  actor?: StepActor;
  /** ≤ ~12-word coach line shown above the board for this step. */
  prompt: string;
  /**
   * The move(s) that satisfy this step, in "from-to"/"fromxto" notation. The
   * learner's input is gated to these; the FIRST entry is what an opponent step
   * auto-plays. For an opponent step this is normally a single FORCED move
   * (validated to be the only legal move at build time).
   */
  moves: string[];
  /** Shown after a wrong/slow learner attempt. Omit for opponent steps. */
  hint?: string;
  /** Micro-celebration / takeaway shown after the step resolves. */
  successText: string;
  /**
   * Extra squares to glow beyond the move's own from/to (e.g. the column being
   * attacked, the edge being aimed at). Algebraic.
   */
  highlight?: string[];
}

/** Authored (raw) lesson. */
interface RawLesson {
  id: string;
  title: string;
  /** The STRATEGY.md section this lesson teaches, e.g. "§4". */
  strategyRef: string;
  /** Difficulty tier for ordering the course; 1 = easiest. */
  difficulty: number;
  /** One-sentence framing shown before the board. */
  intro: string;
  /** Closing line shown on completion (the strategic takeaway). */
  outro: string;
  /** Starting position (FEN-like; `decodePosition`). */
  position: string;
  steps: RawStep[];
}

/** A built step: raw fields + the resolved engine `Move`s + the state it acts on. */
export interface LessonStep {
  actor: StepActor;
  prompt: string;
  hint?: string;
  successText: string;
  /** Resolved, engine-legal moves accepted for this step (first = canonical). */
  expectedMoves: Move[];
  /** Glow squares (engine indices): the move's from/to plus any extra highlight. */
  highlight: number[];
  /** Board state this step is played from. */
  state: GameState;
}

/** A built, fully-validated lesson ready for a `TutorialBoard` renderer. */
export interface Lesson {
  id: string;
  title: string;
  strategyRef: string;
  difficulty: number;
  intro: string;
  outro: string;
  /** states[0] = start; states[k] = position after step k. length = steps+1. */
  states: GameState[];
  steps: LessonStep[];
}

// ---------------------------------------------------------------------------
// Builder — validates the whole lesson against the engine at import time.
// ---------------------------------------------------------------------------

function buildLesson(raw: RawLesson): Lesson {
  let state = stateFrom(raw.position);
  const states: GameState[] = [state];
  const steps: LessonStep[] = raw.steps.map((rs, i) => {
    const actor: StepActor = rs.actor ?? 'learner';
    const legal = legalMoves(state);

    // Opponent steps assert their move is FORCED — the lesson's claim that the
    // reply is mandatory must be true in the engine, or the script is wrong.
    if (actor === 'opponent' && rs.moves.length === 1 && legal.length !== 1) {
      throw new Error(
        `lesson "${raw.id}" step ${i}: opponent reply "${rs.moves[0]}" is presented as forced, ` +
          `but ${legal.length} legal moves exist: ` +
          legal.map((m) => squareToAlg(m.from) + '->' + m.path.map(squareToAlg).join('x')).join(', '),
      );
    }

    const expectedMoves = rs.moves.map((n) => resolveMove(state, n));

    // Glow = every from/to of the accepted moves + any authored extra squares.
    const glow = new Set<number>();
    for (const m of expectedMoves) {
      glow.add(m.from);
      glow.add(m.to);
    }
    for (const h of rs.highlight ?? []) glow.add(sq(h));

    const built: LessonStep = {
      actor,
      prompt: rs.prompt,
      successText: rs.successText,
      expectedMoves,
      highlight: [...glow],
      state,
      ...(rs.hint !== undefined ? { hint: rs.hint } : {}),
    };

    // Advance the canonical line (first accepted move) so the next step's
    // `state` is exactly the position the learner will face.
    state = applyMove(state, expectedMoves[0]!);
    states.push(state);
    return built;
  });

  return {
    id: raw.id,
    title: raw.title,
    strategyRef: raw.strategyRef,
    difficulty: raw.difficulty,
    intro: raw.intro,
    outro: raw.outro,
    states,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Lesson 1 — Column strength is positional (STRATEGY.md §1)
// ---------------------------------------------------------------------------
// A tall White officer column at b2 (the star general riding two prisoners) can
// retreat to the a-file edge (a3/a1) or wander into the centre (c3/c1). The edge
// can only be approached from ONE diagonal; the centre from two. There are no
// captures here — it is a pure positional choice. Single learner step.

const LESSON_COLUMN_STRENGTH: RawLesson = {
  id: 'column-strength',
  title: 'Where a tall column is safe',
  strategyRef: '§1',
  difficulty: 1,
  intro:
    'Two columns of equal height are not equally strong. Strength is positional — and the edge is friendlier than the centre.',
  outro:
    'A tall column has many lives — each capture only peels its commander. Keep that value on the edge, where it can be approached from one diagonal, not two.',
  // White officer column (3 men) at b2; Black soldiers loitering in the centre.
  position: 'W:4=BsWsWo,9=Bs,12=Bs',
  steps: [
    {
      prompt: 'Walk your tall column out to the edge — tap b2, then a3.',
      moves: ['b2-a3', 'b2-a1'],
      hint: 'The a-file is the edge. From a3 or a1 only one diagonal reaches you; in the centre, two do.',
      successText: 'On the edge, your column is approachable from one side only — far safer.',
      // Glow the two centre squares to show what we are AVOIDING.
      highlight: ['c3', 'c1'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Lesson 2 — Guarding a weak column (STRATEGY.md §3)
// ---------------------------------------------------------------------------
// A lone White soldier on the edge (a3) is a weak column: Black can sacrifice a
// piece on b4 to FORCE a3 to capture (a3xc5), dragging it off the edge into the
// open. The defence: post the officer as a guard on c3. Now if Black ever throws
// a piece on b4, the officer (c3xa5) does the recapturing instead, so the weak
// column never has to leave the edge. Single learner step; the lesson text names
// the cost (two pieces tied up) and the better fix (don't form weak columns).

const LESSON_GUARD_WEAK_COLUMN: RawLesson = {
  id: 'guard-weak-column',
  title: 'Guarding a weak column',
  strategyRef: '§3',
  difficulty: 2,
  intro:
    'Your lone soldier on a3 is a weak column. Black wants to throw a piece on b4 to FORCE it to capture — dragging it off the edge into the open.',
  outro:
    'The officer on c3 now guards b4: a sacrifice there is simply recaptured, so a3 stays put. The cost — two pieces tied to one job. Better still: never form weak columns (spread your captures).',
  // Weak White soldier a3; White officer at d2 ready to guard; a distant Black lurer.
  position: 'W:7=Ws,5=Wo,19=Bs',
  steps: [
    {
      prompt: 'Post your officer as a guard — tap d2, then c3.',
      moves: ['d2-c3'],
      hint: 'c3 covers b4. Then a sacrifice on b4 meets your officer, not your weak edge column.',
      successText: 'Guarded. A lure on b4 now loses to your officer — the weak column stays safe on a3.',
      highlight: ['a3', 'b4'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Lesson 3 — The one-handed attack (STRATEGY.md §4) — flagship tactic.
// ---------------------------------------------------------------------------
// Three plies, fully forcing:
//   1. BAIT (learner): White quietly drops a soldier on c3, in front of the
//      Black column on d4. (No capture exists yet — it is a true sacrifice.)
//   2. FORCED (opponent): Black has exactly one legal move, the mandatory
//      capture d4xb2 — it must take the bait, landing in front of White's tower.
//   3. CONVERT (learner): White's OFFICER column a1 marches in, a1xc3, a two-jump
//      chain that buries BOTH Black men and leaves White's column standing.
// Encodes all three conditions: attacker (a1, 3 men) > defender (d4, 2 men); the
// attacker is officer-topped so it can chain "backward"; the path is clear.

const LESSON_ONE_HANDED_ATTACK: RawLesson = {
  id: 'one-handed-attack',
  title: 'The one-handed attack',
  strategyRef: '§4',
  difficulty: 3,
  intro:
    'Three things make this work: your column has MORE men than theirs, your commander is an officer (so it can strike both ways), and the path is clear. Offer bait, force the trade, convert.',
  outro:
    'That is the one-handed attack: the bait forces a capture, then your taller officer column marches through and turns their men into prisoners — while your column still stands.',
  // White officer column a1 (3); a bait soldier d2; Black column d4 (2).
  position: 'W:0=WsWsWo,5=Ws,12=BsBs',
  steps: [
    {
      actor: 'learner',
      prompt: 'Offer the bait — tap d2, then c3, in front of their column.',
      moves: ['d2-c3'],
      hint: 'Step right in front of d4. With no other capture, Black will be forced to take it.',
      successText: 'Bait set. The mandatory-capture rule means Black now has no choice.',
      highlight: ['d4'],
    },
    {
      actor: 'opponent',
      prompt: 'Black must capture the bait…',
      moves: ['d4-b2'],
      successText: 'Forced. Black landed right in front of your tower — exactly where you want it.',
    },
    {
      actor: 'learner',
      prompt: 'Convert — tap a1, then c3. Your officer chains over them.',
      // Full chain: jump to c3, then continue back to a1, taking BOTH Black men.
      moves: ['a1xc3xa1'],
      hint: 'Your officer can strike both directions; the jump from b2 continues until both men are taken.',
      successText: 'Both Black men are now your prisoners — and your column still stands.',
      highlight: ['b2'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Lesson 4 — Attack over defence (STRATEGY.md §5)
// ---------------------------------------------------------------------------
// White's officer on e3 is threatened (Black's f4xd2 would take it next ply).
// The passive retreat e3->d2 "achieves very little". The counter-attack b2->a3
// ignores the threat and creates a BIGGER one: White now threatens a3xc5, winning
// Black's b4. Lasker's dictum — Lasca is a game of attack, not defence: risk a
// short-term loss for long-term initiative. The lesson FIRST lets the learner try
// the passive move (rejected as "achieves little"), then asks for the counter.

const LESSON_ATTACK_OVER_DEFENCE: RawLesson = {
  id: 'attack-over-defence',
  title: 'Attack over defence',
  strategyRef: '§5',
  difficulty: 4,
  intro:
    'Your officer on e3 is attacked — Black threatens to take it next move. You could retreat it to safety. But Lasca rewards initiative: look for the stronger reply.',
  outro:
    'A passive retreat saves a piece but achieves little. b2–a3 ignored the threat and made a bigger one — winning b4. Risk a short-term loss for long-term initiative: attack beats defence.',
  // White officer e3 (threatened); White counter-attacker b2; Black f4 (attacker)
  // + g5 (blocks e3's own capture) + b4 (the counter-attack's target).
  position: 'W:9=Wo,4=Ws,13=Bs,17=Bs,11=Bs',
  steps: [
    {
      prompt: 'Counter-attack instead of retreating — tap b2, then a3.',
      // Only the counter-attack is accepted. The passive retreat (e3-d2 / e3-d4)
      // is deliberately NOT in the accepted set, so the gate nudges the learner
      // toward the aggressive move (the hint names why the retreat is weak).
      moves: ['b2-a3'],
      hint: 'Retreating e3 only saves one piece. b2–a3 threatens a3xc5 — winning their b4. Make the bigger threat.',
      successText: 'Now you threaten a3xc5 to win b4. Even if they grab your officer, you keep the initiative — and the trade.',
      highlight: ['e3', 'b4', 'c5'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Exported, validated lessons (ordered by difficulty).
// ---------------------------------------------------------------------------

/**
 * The "Column strategy & Tactics" lessons, built & validated against the engine
 * at import time. Ordered easiest → hardest. Throws on load if any position or
 * scripted move is illegal (a real content bug).
 */
export const STRATEGY_LESSONS: Lesson[] = [
  LESSON_COLUMN_STRENGTH,
  LESSON_GUARD_WEAK_COLUMN,
  LESSON_ONE_HANDED_ATTACK,
  LESSON_ATTACK_OVER_DEFENCE,
].map(buildLesson);

/** Look up a single lesson by id. */
export function getLesson(id: string): Lesson | undefined {
  return STRATEGY_LESSONS.find((l) => l.id === id);
}
