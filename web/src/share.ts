/**
 * Shareable replays. A finished (or in-progress) game is encoded into a short,
 * URL-safe string of its moves and dropped into a `?g=` link. Opening that link
 * decodes the moves, replays them through the real engine, and shows the game in
 * the same step/analyse viewer as the historic and featured games — no account,
 * no server, the whole game rides in the URL.
 *
 * Encoding: two characters per ply (from, to). Captures are NOT stored — the
 * engine re-derives the capture chain from from+to at decode time (the longest
 * legal capture with that origin and destination), exactly as `rebuildGame`
 * tolerates for saved games. A 30-ply game is ~60 characters.
 *
 * Two on-the-wire formats, distinguished by the first character:
 *  - LEGACY (Laska only): untagged, one char per square 0..24 → 'a'..'y'. Kept
 *    for backward compatibility with links already in the wild; still used for
 *    every Laska game so those links stay short and unchanged.
 *  - TAGGED (any variant): a leading variant tag ('B' = Bashni, 'L' = Laska)
 *    then two URL-safe alphabet chars per ply, covering the larger board. A
 *    legacy code can never begin with an uppercase letter, so the two are
 *    unambiguous.
 */
import { gameStatus, VARIANTS, type VariantId } from '../../src/index.ts';
import { rebuildGame, type SavedGame, type SavedMove, type SavedResult } from './savedGames.ts';
import { buildLiveGame, type HistoricGame } from './games.ts';

/** Just the origin/destination of a move — all a share link needs. */
export interface MovePair {
  from: number;
  to: number;
}

const PARAM = 'g';
const FIRST = 'a'.charCodeAt(0); // square 0 → 'a' (legacy Laska encoding)
const LAST_SQUARE = 24; // 25 playing squares, 0..24 (legacy Laska board)

// URL-safe, order-preserving alphabet for the tagged format — 64 chars, so it
// covers any reasonable board (Bashni needs 32). Index === square number.
const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const VARIANT_TAG: Record<VariantId, string> = { laska: 'L', bashni: 'B' };
const TAG_TO_VARIANT: Record<string, VariantId> = { L: 'laska', B: 'bashni' };

const RESULT_TEXT: Record<SavedResult, string> = {
  W: 'White wins',
  B: 'Black wins',
  draw: 'Draw',
  unfinished: 'Unfinished',
};

function sqChar(sq: number): string {
  return String.fromCharCode(FIRST + sq);
}

function charSq(ch: string): number {
  return ch.charCodeAt(0) - FIRST;
}

/**
 * Encode a move list to the URL-safe share code. Laska uses the short legacy
 * format (so old links keep working); any other variant uses the tagged format.
 */
export function encodeMoves(moves: MovePair[], variant: VariantId = 'laska'): string {
  if (variant === 'laska') {
    return moves.map((m) => sqChar(m.from) + sqChar(m.to)).join('');
  }
  const body = moves.map((m) => ALPH[m.from]! + ALPH[m.to]!).join('');
  return VARIANT_TAG[variant] + body;
}

/** Decode a share code back to its variant + from/to pairs, or null if malformed. */
export function decodeMoves(code: string): { variant: VariantId; moves: MovePair[] } | null {
  if (!code) return null;

  // Tagged format: a leading variant tag, then 2 alphabet chars per ply.
  const tag = TAG_TO_VARIANT[code[0]!];
  if (tag) {
    const body = code.slice(1);
    if (body.length % 2 !== 0) return null;
    const numSquares = VARIANTS[tag].numSquares;
    const moves: MovePair[] = [];
    for (let i = 0; i < body.length; i += 2) {
      const from = ALPH.indexOf(body[i]!);
      const to = ALPH.indexOf(body[i + 1]!);
      if (from < 0 || to < 0 || from >= numSquares || to >= numSquares) return null;
      moves.push({ from, to });
    }
    return moves.length ? { variant: tag, moves } : null;
  }

  // Legacy untagged format: Laska only, one char per square 0..24.
  if (code.length % 2 !== 0) return null;
  const moves: MovePair[] = [];
  for (let i = 0; i < code.length; i += 2) {
    const from = charSq(code[i]!);
    const to = charSq(code[i + 1]!);
    if (
      !Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from > LAST_SQUARE || to < 0 || to > LAST_SQUARE
    ) {
      return null;
    }
    moves.push({ from, to });
  }
  return moves.length ? { variant: 'laska', moves } : null;
}

/** A full share URL for the current page, carrying `moves` (and variant) in `?g=`. */
export function shareUrlFor(moves: MovePair[], variant: VariantId = 'laska'): string {
  const url = new URL(window.location.href);
  url.search = `?${PARAM}=${encodeMoves(moves, variant)}`;
  url.hash = '';
  return url.toString();
}

/** The share code in the current URL, if any. */
export function readShareCode(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(PARAM);
  } catch {
    return null;
  }
}

/** Drop the `?g=` param without reloading, so a refresh/back is clean. */
export function clearShareParam(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* history not available — leave the URL as-is */
  }
}

/**
 * Turn a share code into a playable game by replaying its moves through the
 * engine. Returns null if the code is malformed or the moves don't replay
 * legally (a tampered or stale link), so callers can fall back gracefully.
 */
export function gameFromCode(code: string): HistoricGame | null {
  const decoded = decodeMoves(code);
  if (!decoded) return null;
  const { variant, moves: pairs } = decoded;
  // Reuse the saved-game replay logic to resolve from/to → full engine moves
  // (it re-derives the capture chain and throws on the first illegal ply).
  const stub: SavedGame = {
    v: 1,
    id: 'shared',
    title: 'Shared game',
    white: 'Light army',
    black: 'Dark army',
    mode: 'ai',
    result: 'unfinished',
    variant,
    moves: pairs.map((p, i): SavedMove => ({ from: p.from, to: p.to, captures: [], by: i % 2 === 0 ? 'W' : 'B' })),
    createdAt: 0,
    updatedAt: 0,
  };
  let rebuilt;
  try {
    rebuilt = rebuildGame(stub);
  } catch {
    return null; // doesn't replay — tampered or from an older ruleset
  }
  const { resolved, states } = rebuilt;
  const last = states[states.length - 1]!;
  const status = gameStatus(last);
  const result: SavedResult =
    status.state === 'win' ? status.winner : status.state === 'draw' ? 'draw' : 'unfinished';
  return buildLiveGame(resolved, {
    id: `shared-${code}`,
    title: 'A shared game',
    white: 'Light army',
    black: 'Dark army',
    event: 'Shared replay',
    result: RESULT_TEXT[result],
    sourceNote: 'Shared with you — replayed on the live engine.',
    intro:
      'Someone shared this game with you. Step through it move by move, or let the engine review each move and grade the play.',
    variant: VARIANTS[variant],
  });
}
