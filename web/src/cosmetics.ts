/**
 * Player cosmetics — the mascot tint, piece-insignia theme, and board palette a
 * player has chosen. These are *display* preferences: they live in localStorage
 * so a guest (or a logged-out player) keeps their pick, and — when logged in —
 * mirror the server's allow-listed `PublicUser` fields so the choice follows the
 * account across devices.
 *
 * Reconciliation rule (see `reconcileCosmetics`): on login the SERVER value wins;
 * otherwise the locally-stored value; otherwise the documented default. The piece
 * theme already had its own key (`laska-piece-theme`) and the board palette its
 * own (`laska-theme`); this module owns the new mascot-tint key and a single
 * read/write surface other screens (e.g. a topbar avatar) can call.
 */
import type { MascotTint } from './mascots.tsx';
import type { PieceTheme } from './pieceTheme.tsx';

/** Selectable mascot tints — the server's allow-list (coral|sun|mint|sky|grape). */
export const MASCOT_TINTS: MascotTint[] = ['coral', 'sun', 'mint', 'sky', 'grape'];

export const MASCOT_TINT_LABEL: Record<MascotTint, string> = {
  coral: 'Coral',
  sun: 'Sun',
  mint: 'Mint',
  sky: 'Sky',
  grape: 'Grape',
};

/** The swatch colour for each tint — mirrors the `--dot-*` fallbacks in mascots.tsx
 *  so a picker card reads the right hue even in themes that don't define the tokens. */
export const MASCOT_TINT_HEX: Record<MascotTint, string> = {
  coral: '#f4796b',
  sun: '#ffc94d',
  mint: '#4fc59a',
  sky: '#58b4e6',
  grape: '#8a63d2',
};

export const DEFAULT_MASCOT_TINT: MascotTint = 'grape';

const MASCOT_KEY = 'laska-mascot-tint';
/** Owned by App.tsx, but mirrored here so cosmetics read/write through one place. */
const PIECE_KEY = 'laska-piece-theme';
const THEME_KEY = 'laska-theme';

const PIECE_THEMES: PieceTheme[] = ['heirloom', 'lineage', 'dots'];

function isTint(v: unknown): v is MascotTint {
  return typeof v === 'string' && (MASCOT_TINTS as string[]).includes(v);
}

/** The player's chosen mascot tint, readable from anywhere (defaults to grape). */
export function getSelectedMascotTint(): MascotTint {
  try {
    const v = localStorage.getItem(MASCOT_KEY);
    if (isTint(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_MASCOT_TINT;
}

export function setSelectedMascotTint(tint: MascotTint): void {
  try {
    localStorage.setItem(MASCOT_KEY, tint);
  } catch {
    /* quota / privacy mode — best-effort */
  }
}

/**
 * Reconcile a freshly-resolved set of cosmetics for a (possibly null) signed-in
 * user: server value wins, else localStorage, else the default. Returns the
 * resolved trio AND writes the mascot tint back to localStorage so the rest of
 * the app reads a consistent value. Piece/board themes are owned by App.tsx's
 * own effects, so only the *resolved* values are returned for those.
 */
export function reconcileCosmetics(server: {
  selectedMascotTint: string | null;
  selectedPieceTheme: string | null;
  selectedBoardTheme: string | null;
} | null): { mascotTint: MascotTint; pieceTheme: PieceTheme | null; boardTheme: string | null } {
  let mascotTint: MascotTint;
  if (server && isTint(server.selectedMascotTint)) {
    mascotTint = server.selectedMascotTint;
    setSelectedMascotTint(mascotTint);
  } else {
    mascotTint = getSelectedMascotTint();
  }

  const storedPiece = (() => {
    try {
      const v = localStorage.getItem(PIECE_KEY);
      return PIECE_THEMES.includes(v as PieceTheme) ? (v as PieceTheme) : null;
    } catch {
      return null;
    }
  })();
  const pieceTheme =
    (server && PIECE_THEMES.includes(server.selectedPieceTheme as PieceTheme)
      ? (server.selectedPieceTheme as PieceTheme)
      : null) ?? storedPiece;

  const storedBoard = (() => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();
  const boardTheme = (server && server.selectedBoardTheme) || storedBoard;

  return { mascotTint, pieceTheme, boardTheme };
}
