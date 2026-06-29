/**
 * The voice of the game analysis. Turns the dry move-quality verdict from
 * `analysis.ts` (best / good / inaccuracy / mistake / blunder / forced) into a
 * line a human would actually say — aware of the story on the board (who was
 * winning, how big the swing, what to play instead).
 *
 * The critic has PERSONAS. "The Coach" is warm and to the point; "Grandmaster
 * Tovarisch" is an old-school Soviet drama queen — fitting, since Laska's living
 * tradition (Bashni, the Moscow games) is Russian through and through. Players
 * pick the voice; everything here just routes to the chosen persona's phrase
 * pools.
 *
 * Everything is PURE and DETERMINISTIC. We pick a phrasing with a stable hash of
 * the ply, so the same move always reads the same way (no flicker on re-render)
 * while different moves get different lines. No emoji (lucide-only house rule);
 * the prose carries the personality.
 */
import type { Move, PlayerColor } from '../../src/index.ts';
import type { MoveQuality, MoveReview } from './analysis.ts';

/** One column of control ≈ 100 eval units (DEFAULT_WEIGHTS) — the unit our
 *  situational phrases are tuned against. */
const COLUMN = 100;

/** Everything the critic needs to narrate one move. */
export interface MoveContext {
  /** The side that played the move. */
  side: PlayerColor;
  /** 1-based ply index — only used to vary the phrasing deterministically. */
  ply: number;
  /** White-positive eval of the position BEFORE the move. */
  whiteEvalBefore: number;
  /** White-positive eval of the position AFTER the move. */
  whiteEvalAfter: number;
  /** The move that was played (so we can spot a flashy multi-jump). */
  move: Move;
  /** SAN of the engine's preferred move, or null when the played move was best. */
  bestSan: string | null;
}

/* ---- personas ----------------------------------------------------------- */

export type CommentatorId = 'coach' | 'russian';

export interface Commentator {
  id: CommentatorId;
  name: string;
  blurb: string;
}

/** The pickable voices, in display order. */
export const COMMENTATORS: Commentator[] = [
  { id: 'coach', name: 'The Coach', blurb: 'Warm, witty, straight to the point.' },
  { id: 'russian', name: 'Grandmaster Tovarisch', blurb: 'Old-school Soviet drama. Oy!' },
];

/** The default voice — Laska's roots are Russian, so we lead with the drama. */
export const DEFAULT_COMMENTATOR: CommentatorId = 'russian';

/** A persona's complete phrase set. `{side}`/`{opp}`/`{best}` are filled in. */
interface Voice {
  brilliant: string[];
  best: string[];
  good: string[];
  inaccuracy: string[];
  mistake: string[];
  blunder: string[];
  forced: string[];
  /** Trailing clause when a mistake/blunder threw away a winning position. */
  stingerWinning: string[];
  /** Trailing clause when the side was already lost anyway. */
  stingerLosing: string[];
  /** Trailing clause when a brilliancy came from a worse position. */
  stingerComeback: string[];
  /** The live-position nudge; `{best}` = the engine's preferred move. */
  fromHere: string[];
  /** Whole-game verdict from the blunder / mistake / inaccuracy totals. */
  verdict: (blunders: number, mistakes: number, inaccuracies: number) => string;
}

const COACH: Voice = {
  brilliant: [
    'Brilliant. {side} brings the whole column crashing down — Lasker would tip his hat.',
    "Now that's the good stuff: {side} finds the sharpest shot on the board.",
    "Spectacular play by {side}. Search as it might, the engine can't beat it.",
    'Dazzling — the kind of move the textbooks get written around.',
  ],
  best: [
    "Spot on. The engine wouldn't change a thing.",
    'Textbook from {side} — quietly, ruthlessly correct.',
    'Best on the board. No notes.',
    'Exactly right: calm, precise, engine-approved.',
    'Cleanest move available. {side} keeps the screws turning.',
  ],
  good: [
    "Solid. Not the engine's absolute darling, but it holds up just fine.",
    'Sensible stuff — {side} leaves a crumb on the table, nothing more.',
    "A healthy move. The engine raises an eyebrow but can't really complain.",
    'Respectable, a whisker off best. Play on.',
  ],
  inaccuracy: [
    'A touch loose — {side} lets a sliver of the edge slip. {best} was tidier.',
    'Slightly off; the position was quietly asking for {best}.',
    "Not wrong, exactly, but {best} kept more in {side}'s pocket.",
    'A small wobble. {best} was the cleaner path.',
  ],
  mistake: [
    'Ouch — that hands {opp} a real foothold. {best} was the move.',
    'That one stings: {side} gives back a chunk of the game, where {best} held firm.',
    'A genuine slip. The engine was practically begging for {best}.',
    'That loosens things up. {best} would have kept {side} in the driver’s seat.',
  ],
  blunder: [
    'Yikes — a column-shaped hole in the plan. {best} and {side} is comfortable.',
    'Oof, a big one. {best} was screaming to be played; this isn’t it.',
    'Heartbreaker. {best} wins cleanly — this throws the thread away.',
    'The wheels come off. {best} was the rescue {side} needed.',
  ],
  forced: [
    'No choice here — the board made the decision for {side}.',
    'Forced. Nothing else was even legal.',
    '{side} had exactly one move, and played it.',
  ],
  stingerWinning: [' From a winning spot, too — that one will sting.', ' And it was all going so well.'],
  stingerLosing: [' Though things were already grim, in fairness.', ' Not that there was much left to lose.'],
  stingerComeback: [' And from a tough spot, no less.', ' Clawing right back into it.'],
  fromHere: [
    'From here, the engine fancies {best}.',
    "If it were the engine's move, it'd reach for {best}.",
    'The engine has its eye on {best} in this spot.',
    'Best continuation here: {best}.',
  ],
  verdict: (b, m, i) => {
    if (b >= 3) return 'A wild one — columns tumbling and nerves fraying on both sides.';
    if (b >= 1) return 'A real scrap, decided by a costly slip or two.';
    if (m >= 2) return 'Hard-fought, with a few rough patches along the way.';
    if (m >= 1) return 'Mostly sound, with the odd misstep.';
    if (i >= 1) return 'Tidy play all round — only small inaccuracies to nitpick.';
    return 'A clean, careful game — barely a blemish on either side.';
  },
};

/** Grandmaster Tovarisch: a Soviet old-timer who has seen everything, twice,
 *  through a Moscow winter. Affectionate, dramatic, fond of soup metaphors. */
const RUSSIAN: Voice = {
  brilliant: [
    'OY! Like young Tal himself — the column falls and somewhere a babushka weeps with joy.',
    'Bravo, comrade! Even Botvinnik would pour you one small glass for this.',
    'Magnificent. This move I show my students for forty winters.',
    'Da — DA! The board, she trembles. Beautiful, beautiful.',
  ],
  best: [
    'Correct, comrade. The engine and I, we nod together in silence.',
    'Strong, like good borscht. No notes — only respect.',
    'Precisely so. Botvinnik smiles in his grave, just a little.',
    'Da. This is the move. We continue, no fuss.',
  ],
  good: [
    'Is fine, is fine. Not the move of champions, but it will not freeze in Siberia.',
    'Acceptable, comrade. A little salt missing, but the soup is warm.',
    'Solid enough. The engine shrugs the shrug of a tired man.',
    'Eh — good. We have played far worse on cold nights.',
  ],
  inaccuracy: [
    'Oy, careful — you leave the door open and the cold comes in. {best} was warmer.',
    'Tsk. Small mistake, comrade. {best}, the babushka would say.',
    'Not terrible, but {best} is the move your old coach prayed for.',
    'A little slip on the ice. {best} keeps you standing.',
  ],
  mistake: [
    'Oy-oy. This gives {opp} a seat at your table. {best} was the move, comrade.',
    'Ach, my heart. You hand back good soup; {best} kept the bowl full.',
    'No, no, no — {best}! The engine weeps into its tea.',
    'This loosens the screws. {best}, and you stay the boss.',
  ],
  blunder: [
    'OY! Pack your bags, this one goes to Siberia. {best} and all is forgiven.',
    'Catastrophe, comrade! {best} was screaming louder than a Moscow winter.',
    'Bozhe moi… {best} wins the borscht; this spills it on the floor.',
    'The wheels, they fall off the troika. {best} was the rescue, comrade.',
  ],
  forced: [
    'No choice, comrade. The board, she decides for you.',
    'Only one move. Even a tired ox would find it.',
    'Forced. We do what we must, and we do not complain.',
  ],
  stingerWinning: [
    ' And from winning position! Oy, this one keeps you awake at night.',
    ' So close to the medal, comrade. So close.',
  ],
  stingerLosing: [
    ' Though already we skate on thin ice, in truth.',
    ' But the game, she was already cold.',
  ],
  stingerComeback: [
    ' And from the grave you climb — beautiful!',
    ' From nothing, comrade. Like bread in hard winter.',
  ],
  fromHere: [
    'From here, comrade, I would play {best}.',
    'The engine, she whispers: {best}.',
    'My old coach would slap the table for {best}.',
    'Here? {best}. Trust the babushka.',
  ],
  verdict: (b, m, i) => {
    if (b >= 3) return 'Oy, what a circus! Columns flying like snow in a blizzard — both sides, no mercy.';
    if (b >= 1) return 'A true Russian drama, comrade, decided by one cold-blooded slip.';
    if (m >= 2) return 'Hard fight. A few bruises, but you both stood like old oaks.';
    if (m >= 1) return 'Mostly solid, with one little stumble on the ice.';
    if (i >= 1) return 'Clean enough, comrade — only crumbs left on the tablecloth.';
    return 'Flawless, like fresh snow. Lasker himself would tip his fur hat.';
  },
};

const VOICES: Record<CommentatorId, Voice> = { coach: COACH, russian: RUSSIAN };

function voiceOf(persona: CommentatorId): Voice {
  return VOICES[persona] ?? VOICES[DEFAULT_COMMENTATOR];
}

/* ---- helpers ------------------------------------------------------------ */

/** Stable index into a pool of length `n`, varied by ply + the move's squares. */
function pick<T>(pool: T[], ctx: { ply: number; move: Move }): T | undefined {
  if (pool.length === 0) return undefined;
  const seed = ctx.ply * 131 + ctx.move.from * 7 + ctx.move.to * 13;
  return pool[seed % pool.length];
}

const SUBJECT: Record<PlayerColor, string> = { W: 'White', B: 'Black' };
const fill = (line: string, side: PlayerColor, best: string | null) =>
  line
    .replaceAll('{side}', SUBJECT[side])
    .replaceAll('{opp}', SUBJECT[side === 'W' ? 'B' : 'W'])
    .replaceAll('{best}', best ?? 'the engine line');

/** A trailing clause that reacts to HOW the game stood, for extra drama. */
function stinger(
  voice: Voice,
  quality: MoveQuality,
  brilliant: boolean,
  moverEvalBefore: number,
  ctx: MoveContext,
): string {
  if (quality === 'mistake' || quality === 'blunder') {
    if (moverEvalBefore > 2.5 * COLUMN) return pick(voice.stingerWinning, ctx) ?? '';
    if (moverEvalBefore < -2.5 * COLUMN) return pick(voice.stingerLosing, ctx) ?? '';
    return '';
  }
  if (brilliant && moverEvalBefore < -COLUMN) return pick(voice.stingerComeback, ctx) ?? '';
  return '';
}

/** Is this best move flashy enough to crown "brilliant"? Only a `best` move
 *  qualifies, and then only if it's a multi-jump or genuinely swings the
 *  evaluation the mover's way. Shared by the prose and the badge so they agree. */
export function isBrilliant(review: MoveReview, ctx: MoveContext): boolean {
  if (review.quality !== 'best') return false;
  const sign = ctx.side === 'W' ? 1 : -1;
  const swing = sign * (ctx.whiteEvalAfter - ctx.whiteEvalBefore);
  return ctx.move.captures.length >= 2 || swing >= 1.2 * COLUMN;
}

/* ---- public API --------------------------------------------------------- */

/**
 * The headline critic's line for a single move, in the chosen persona's voice.
 * One or two sentences, ready to drop straight under the move's quality badge.
 */
export function describeMove(review: MoveReview, ctx: MoveContext, persona: CommentatorId = DEFAULT_COMMENTATOR): string {
  const voice = voiceOf(persona);
  const sign = ctx.side === 'W' ? 1 : -1;
  const moverEvalBefore = sign * ctx.whiteEvalBefore;

  const brilliant = isBrilliant(review, ctx);
  let pool: string[];
  if (review.quality === 'best') pool = brilliant ? voice.brilliant : voice.best;
  else if (review.quality === 'good') pool = voice.good;
  else if (review.quality === 'inaccuracy') pool = voice.inaccuracy;
  else if (review.quality === 'mistake') pool = voice.mistake;
  else if (review.quality === 'blunder') pool = voice.blunder;
  else pool = voice.forced;

  const base = fill(pick(pool, ctx) ?? '', ctx.side, ctx.bestSan);
  return base + stinger(voice, review.quality, brilliant, moverEvalBefore, ctx);
}

/** The coach's nudge for the live position: what they'd play from here. */
export function coachFromHere(
  bestSan: string,
  ctx: { ply: number; move: Move },
  persona: CommentatorId = DEFAULT_COMMENTATOR,
): string {
  return fill(pick(voiceOf(persona).fromHere, ctx) ?? '', 'W', bestSan);
}

/**
 * A one-line verdict on the whole game, in the chosen persona's voice, from the
 * per-side blunder tallies — the critic's parting shot above the summary counts.
 */
export function gameVerdict(
  summary: Record<'W' | 'B', Record<MoveQuality, number>>,
  persona: CommentatorId = DEFAULT_COMMENTATOR,
): string {
  const blunders = summary.W.blunder + summary.B.blunder;
  const mistakes = summary.W.mistake + summary.B.mistake;
  const inaccuracies = summary.W.inaccuracy + summary.B.inaccuracy;
  return voiceOf(persona).verdict(blunders, mistakes, inaccuracies);
}
