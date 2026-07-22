/**
 * Cosmetics allow-list parity: the server's validation lists MUST mirror the
 * option sets the web app actually offers.
 *
 * Regression guard. `PIECE_THEMES` on the server was missing 'crown' while the
 * client rendered a Crown chip, so a signed-in player could pick it, see it
 * apply locally, and never have it saved — `PATCH /me/cosmetics` rejected the
 * value with `invalid-cosmetic` and the client's optimistic catch swallowed the
 * error. Silent, and invisible until you logged in on a second device.
 *
 * The engine boundary forbids `server/` importing `web/` source (see CLAUDE.md),
 * so this reads the web modules as TEXT and extracts the literal arrays. That
 * keeps the packages decoupled while still failing loudly the moment the lists
 * drift apart — which is the only thing that makes the bug class recur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MASCOT_TINTS, PIECE_THEMES, BOARD_THEMES } from '../src/auth/service.ts';

const WEB_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'src');

/**
 * Pull a string-literal array out of a source file by declaration name, e.g.
 * `export const PIECE_THEMES: PieceTheme[] = ['a', 'b'];` -> ['a','b'].
 * Throws (failing the test) if the declaration moved or changed shape — a
 * silent [] would defeat the entire point of this guard.
 */
function literalArray(file: string, name: string): string[] {
  const src = readFileSync(join(WEB_SRC, file), 'utf8');
  const re = new RegExp(`const\\s+${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`);
  const m = re.exec(src);
  assert.ok(m, `could not find "const ${name} = [...]" in web/src/${file} — did it move or get renamed?`);
  const items = m![1]!
    .split(',')
    .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
    .filter((s) => s.length > 0);
  assert.ok(items.length > 0, `parsed an empty list for ${name} in web/src/${file}`);
  return items;
}

/** Both directions, with distinct messages so a failure says which side drifted. */
function assertMirrors(serverList: readonly string[], webList: string[], what: string, webFile: string): void {
  const server = new Set(serverList);
  const web = new Set(webList);

  const clientOnly = webList.filter((v) => !server.has(v));
  assert.deepEqual(
    clientOnly,
    [],
    `web/src/${webFile} offers ${what} the server REJECTS: ${clientOnly.join(', ')}. ` +
      `A player can pick these and the save silently fails — add them to ` +
      `server/src/auth/service.ts.`,
  );

  const serverOnly = [...server].filter((v) => !web.has(v));
  assert.deepEqual(
    serverOnly,
    [],
    `server accepts ${what} the web app no longer offers: ${serverOnly.join(', ')}. ` +
      `Dead allow-list entries — drop them from server/src/auth/service.ts.`,
  );
}

test('piece-theme allow-list mirrors web/src/pieceTheme.tsx', () => {
  const web = literalArray('pieceTheme.tsx', 'PIECE_THEMES');
  // The regression that motivated this file: 'crown' shipped client-side only.
  assert.ok(web.includes('crown'), 'sanity: the web app still offers the Crown piece theme');
  assertMirrors(PIECE_THEMES, web, 'piece themes', 'pieceTheme.tsx');
});

test('mascot-tint allow-list mirrors web/src/cosmetics.ts', () => {
  const web = literalArray('cosmetics.ts', 'MASCOT_TINTS');
  assertMirrors(MASCOT_TINTS, web, 'mascot tints', 'cosmetics.ts');
});

test('board-theme allow-list mirrors the web THEMES palette list', () => {
  const web = literalArray('App.tsx', 'THEMES');
  assertMirrors(BOARD_THEMES, web, 'board themes', 'App.tsx');
});
