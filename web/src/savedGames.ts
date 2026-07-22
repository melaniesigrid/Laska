/**
 * Saved games — a player's own match history, persisted in the browser.
 *
 * A saved game stores only the *moves* (from/to/captures + per-ply notes), never
 * board snapshots: positions are reconstructed by replaying the moves through the
 * real engine (`rebuildGame`), exactly as `games.ts` does for the historic games.
 * That keeps saves tiny and self-validating — if a move ever fails to replay, the
 * save is corrupt (or the rules drifted), and we surface that instead of papering
 * over it. Local games need no account, so this lives in localStorage alongside
 * the theme/variant preferences; the shape is deliberately compatible with the
 * server's MatchRecord so online history can be imported later.
 */
import {
  createInitialState,
  legalMoves,
  applyMove,
  LASKA,
  VARIANTS,
  type Variant,
  type VariantId,
  type GameState,
  type Move,
  type PlayerColor,
} from '../../src/index.ts';

const STORAGE_KEY = 'laska-saved-games';
const SCHEMA_VERSION = 1;

/** One recorded ply: the move plus an optional note the player added later. */
export interface SavedMove {
  from: number;
  to: number;
  captures: number[];
  by: PlayerColor;
  /** Free-text annotation the player attached to this ply in the replay viewer. */
  note?: string;
}

export type SavedResult = 'W' | 'B' | 'draw' | 'unfinished';

export interface SavedGame {
  v: number; // schema version
  id: string;
  title: string;
  white: string;
  black: string;
  mode: 'ai' | 'hotseat' | 'online';
  difficulty?: string;
  aiColor?: PlayerColor;
  /** Rule variant name, when the build supports variants (single ruleset today). */
  variant?: string;
  result: SavedResult;
  resultReason?: string;
  moves: SavedMove[];
  /** A note about the game as a whole (shown above the board in the viewer). */
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/* ---- persistence ---------------------------------------------------------- */

function readAll(): SavedGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only well-formed entries; a single corrupt record shouldn't blank the list.
    return parsed.filter((g) => g && typeof g.id === 'string' && Array.isArray(g.moves));
  } catch {
    return [];
  }
}

function writeAll(games: SavedGame[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    /* quota or privacy mode — saving is best-effort */
  }
}

/** All saved games, newest first. */
export function loadSavedGames(): SavedGame[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSavedGame(id: string): SavedGame | undefined {
  return readAll().find((g) => g.id === id);
}

/** Insert or replace a game by id; returns the persisted record. */
export function upsertSavedGame(game: SavedGame): SavedGame {
  const games = readAll();
  const idx = games.findIndex((g) => g.id === game.id);
  if (idx >= 0) games[idx] = game;
  else games.push(game);
  writeAll(games);
  return game;
}

export function deleteSavedGame(id: string): void {
  writeAll(readAll().filter((g) => g.id !== id));
}

/* ---- construction --------------------------------------------------------- */

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `game-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export interface NewGameInput {
  moves: Move[];
  mode: SavedGame['mode'];
  variant?: string;
  result: SavedResult;
  resultReason?: string;
  difficulty?: string;
  aiColor?: PlayerColor;
  white?: string;
  black?: string;
  title?: string;
}

/** A friendly default title from the match metadata + today's date. */
export function defaultGameTitle(input: Pick<NewGameInput, 'mode' | 'difficulty'>): string {
  const day = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (input.mode === 'ai') {
    const diff = input.difficulty ? input.difficulty[0]!.toUpperCase() + input.difficulty.slice(1) : 'Computer';
    return `You vs Computer · ${diff} · ${day}`;
  }
  if (input.mode === 'hotseat') return `Two players · ${day}`;
  return `Online game · ${day}`;
}

/** Build a brand-new SavedGame from the live move list (used by the Save button). */
export function buildSavedGame(input: NewGameInput): SavedGame {
  const now = Date.now();
  const moves: SavedMove[] = input.moves.map((m, i) => ({
    from: m.from,
    to: m.to,
    captures: [...m.captures],
    by: i % 2 === 0 ? 'W' : 'B',
  }));
  return {
    v: SCHEMA_VERSION,
    id: newId(),
    title: input.title ?? defaultGameTitle(input),
    white: input.white ?? (input.mode === 'ai' && input.aiColor === 'W' ? 'Computer' : 'You'),
    black: input.black ?? (input.mode === 'ai' && input.aiColor === 'B' ? 'Computer' : input.mode === 'ai' ? 'You' : 'Player 2'),
    mode: input.mode,
    result: input.result,
    moves,
    createdAt: now,
    updatedAt: now,
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.difficulty ? { difficulty: input.difficulty } : {}),
    ...(input.aiColor ? { aiColor: input.aiColor } : {}),
    ...(input.resultReason ? { resultReason: input.resultReason } : {}),
  };
}

/**
 * Re-record `current` onto an existing save: keep its id/title/notes/createdAt,
 * refresh the move list + result, and carry forward per-ply notes by index so an
 * annotated game you kept playing doesn't lose its annotations.
 */
export function mergeIntoSave(existing: SavedGame, input: NewGameInput): SavedGame {
  const fresh = buildSavedGame(input);
  return {
    ...fresh,
    id: existing.id,
    title: existing.title,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
    note: existing.note,
    moves: fresh.moves.map((m, i) => {
      const prevNote = existing.moves[i]?.note;
      return prevNote ? { ...m, note: prevNote } : m;
    }),
  };
}

/* ---- replay reconstruction ------------------------------------------------ */

export interface RebuiltGame {
  /** states[0] = opening; states[k] = position after ply k. length = moves+1. */
  states: GameState[];
  /** The resolved engine Move for each ply (carries the full capture `path`). */
  resolved: Move[];
}

function sameCaptures(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Replay a saved game through the engine into renderable states + resolved moves.
 * Throws on the first move that isn't legal in its position — a real signal the
 * save is corrupt or the rules changed under it, which the viewer reports.
 */
/** The rule variant a saved game was played under (defaults to Laska). */
export function savedGameVariant(game: Pick<SavedGame, 'variant'>): Variant {
  const id = game.variant as VariantId | undefined;
  return (id && VARIANTS[id]) || LASKA;
}

export function rebuildGame(game: SavedGame): RebuiltGame {
  let state = createInitialState(savedGameVariant(game));
  const states: GameState[] = [state];
  const resolved: Move[] = [];
  game.moves.forEach((sm, i) => {
    const legal = legalMoves(state);
    const move =
      legal.find((m) => m.from === sm.from && m.to === sm.to && sameCaptures(m.captures, sm.captures)) ??
      // Tolerate a save that recorded a different capture-chain ordering: fall back
      // to the unique (or longest) legal move with that origin and destination.
      legal
        .filter((m) => m.from === sm.from && m.to === sm.to)
        .sort((a, b) => b.captures.length - a.captures.length)[0];
    if (!move) {
      throw new Error(`Saved move ${i + 1} (${sm.from}→${sm.to}) is not legal — the save may be from an older ruleset.`);
    }
    state = applyMove(state, move);
    states.push(state);
    resolved.push(move);
  });
  return { states, resolved };
}

/* ---- notation ------------------------------------------------------------- */

/** Engine square index → lasca.org algebraic (e.g. 0 → "a1"), on `variant`'s
 *  board (defaults to Laska). Bashni's 8×8 maps files a–h × ranks 1–8. */
export function squareToAlgebraic(square: number, variant: Variant = LASKA): string {
  const rc = variant.squareToRc[square];
  if (!rc) return String(square);
  return `${String.fromCharCode(97 + rc.col)}${rc.row + 1}`;
}

/** A resolved Move → algebraic SAN, e.g. "c3-d4" or "c3xe5xg7", on `variant`'s board. */
export function moveToSan(move: Move, variant: Variant = LASKA): string {
  const from = squareToAlgebraic(move.from, variant);
  if (!move.isCapture) return `${from}-${squareToAlgebraic(move.to, variant)}`;
  return from + move.path.map((p) => `x${squareToAlgebraic(p, variant)}`).join('');
}
