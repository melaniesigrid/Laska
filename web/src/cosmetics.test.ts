/**
 * Unit tests for the cosmetics module (`cosmetics.ts`).
 *
 * The web package has no configured test runner, but `cosmetics.ts` imports only
 * TYPES from the .tsx modules (erased by Node's TS stripping), so it runs directly
 * under Node's built-in test runner the same way `streak.test.ts` does:
 *
 *     node --test web/src/cosmetics.test.ts     # from the web/ dir, or absolute
 *
 * `localStorage` is not a Node global, so each test installs a small in-memory
 * stub on `globalThis`. The module reads storage inside the functions (never at
 * import time), so installing the stub after the import is enough.
 *
 * The rule under test (see `reconcileCosmetics`): on login the SERVER value wins,
 * else the locally-stored value, else the documented default.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSelectedMascotTint,
  setSelectedMascotTint,
  reconcileCosmetics,
  DEFAULT_MASCOT_TINT,
} from './cosmetics.ts';

const MASCOT_KEY = 'laska-mascot-tint';
const PIECE_KEY = 'laska-piece-theme';
const THEME_KEY = 'laska-theme';

/** Minimal in-memory Storage stub (only the methods cosmetics.ts calls). */
function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const m = new Map<string, string>(Object.entries(initial));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
  return m;
}

/** A storage that throws on every access — Safari private mode / disabled cookies. */
function installThrowingStorage(): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
}

// ---- getSelectedMascotTint / setSelectedMascotTint -------------------------

test('getSelectedMascotTint falls back to the default when nothing is stored', () => {
  installStorage();
  assert.equal(getSelectedMascotTint(), DEFAULT_MASCOT_TINT);
});

test('getSelectedMascotTint returns a valid stored tint', () => {
  installStorage({ [MASCOT_KEY]: 'mint' });
  assert.equal(getSelectedMascotTint(), 'mint');
});

test('getSelectedMascotTint ignores a stored value outside the allow-list', () => {
  installStorage({ [MASCOT_KEY]: 'neon' });
  assert.equal(getSelectedMascotTint(), DEFAULT_MASCOT_TINT);
});

test('getSelectedMascotTint survives a throwing localStorage (private mode)', () => {
  installThrowingStorage();
  assert.equal(getSelectedMascotTint(), DEFAULT_MASCOT_TINT);
});

test('setSelectedMascotTint persists the pick', () => {
  const m = installStorage();
  setSelectedMascotTint('sky');
  assert.equal(m.get(MASCOT_KEY), 'sky');
  assert.equal(getSelectedMascotTint(), 'sky');
});

test('setSelectedMascotTint swallows quota/security errors instead of throwing', () => {
  installThrowingStorage();
  assert.doesNotThrow(() => setSelectedMascotTint('coral'));
});

// ---- reconcileCosmetics: mascot tint ---------------------------------------

test('reconcile with no signed-in user uses the locally-stored tint', () => {
  installStorage({ [MASCOT_KEY]: 'sun' });
  assert.equal(reconcileCosmetics(null).mascotTint, 'sun');
});

test('reconcile with no user and nothing stored uses the default', () => {
  installStorage();
  assert.equal(reconcileCosmetics(null).mascotTint, DEFAULT_MASCOT_TINT);
});

test('server tint wins over the local pick AND is written back to storage', () => {
  const m = installStorage({ [MASCOT_KEY]: 'sun' });
  const out = reconcileCosmetics({
    selectedMascotTint: 'mint',
    selectedPieceTheme: null,
    selectedBoardTheme: null,
  });
  assert.equal(out.mascotTint, 'mint', 'server value wins');
  assert.equal(m.get(MASCOT_KEY), 'mint', 'resolved tint is mirrored back to storage');
});

test('a null server tint leaves the local pick intact', () => {
  installStorage({ [MASCOT_KEY]: 'sun' });
  const out = reconcileCosmetics({
    selectedMascotTint: null,
    selectedPieceTheme: null,
    selectedBoardTheme: null,
  });
  assert.equal(out.mascotTint, 'sun');
});

test('an out-of-allow-list server tint falls back to the local pick', () => {
  installStorage({ [MASCOT_KEY]: 'sky' });
  const out = reconcileCosmetics({
    selectedMascotTint: 'neon',
    selectedPieceTheme: null,
    selectedBoardTheme: null,
  });
  assert.equal(out.mascotTint, 'sky', 'a bogus server value never wins');
});

// ---- reconcileCosmetics: piece theme ---------------------------------------

test('server piece theme wins over the stored one', () => {
  installStorage({ [PIECE_KEY]: 'heirloom' });
  const out = reconcileCosmetics({
    selectedMascotTint: null,
    selectedPieceTheme: 'dots',
    selectedBoardTheme: null,
  });
  assert.equal(out.pieceTheme, 'dots');
});

test('an invalid server piece theme falls back to the stored one', () => {
  installStorage({ [PIECE_KEY]: 'lineage' });
  const out = reconcileCosmetics({
    selectedMascotTint: null,
    selectedPieceTheme: 'bogus',
    selectedBoardTheme: null,
  });
  assert.equal(out.pieceTheme, 'lineage');
});

test('piece theme is null when neither server nor storage has a valid one', () => {
  installStorage({ [PIECE_KEY]: 'bogus' });
  const out = reconcileCosmetics({
    selectedMascotTint: null,
    selectedPieceTheme: null,
    selectedBoardTheme: null,
  });
  assert.equal(out.pieceTheme, null);
});

// ---- reconcileCosmetics: board theme ---------------------------------------

test('server board theme wins over the stored palette', () => {
  installStorage({ [THEME_KEY]: 'navy' });
  const out = reconcileCosmetics({
    selectedMascotTint: null,
    selectedPieceTheme: null,
    selectedBoardTheme: 'twilight',
  });
  assert.equal(out.boardTheme, 'twilight');
});

test('a null server board theme leaves the stored palette intact', () => {
  installStorage({ [THEME_KEY]: 'navy' });
  const out = reconcileCosmetics({
    selectedMascotTint: null,
    selectedPieceTheme: null,
    selectedBoardTheme: null,
  });
  assert.equal(out.boardTheme, 'navy');
});

test('board theme is null for a fresh browser with no signed-in user', () => {
  installStorage();
  assert.equal(reconcileCosmetics(null).boardTheme, null);
});

test('reconcile survives a throwing localStorage and still resolves a tint', () => {
  installThrowingStorage();
  const out = reconcileCosmetics({
    selectedMascotTint: 'grape',
    selectedPieceTheme: 'dots',
    selectedBoardTheme: 'dark',
  });
  assert.equal(out.mascotTint, 'grape');
  assert.equal(out.pieceTheme, 'dots');
  assert.equal(out.boardTheme, 'dark');
});
