/**
 * Forward-migration tests for the SQLite backend: an on-disk database created
 * by an OLDER schema (before the cosmetic columns existed) must upgrade in
 * place when reopened by the current `SqliteRepository` — adding the columns
 * without losing existing rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteRepository } from '../src/storage/sqlite.ts';

/** The users-table schema as it existed before cosmetic columns were added. */
const LEGACY_USERS_SCHEMA = `
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  username_lower  TEXT NOT NULL UNIQUE,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  is_guest        INTEGER NOT NULL,
  email_verified  INTEGER NOT NULL,
  rating          INTEGER NOT NULL,
  rated_games     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
`;

function legacyColumns(file: string): Set<string> {
  const db = new DatabaseSync(file);
  const cols = new Set(
    (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name),
  );
  db.close();
  return cols;
}

test('SqliteRepository migrates a legacy DB: adds cosmetic columns, preserves data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laska-migrate-'));
  const file = join(dir, 'legacy.db');
  try {
    // 1. Seed a database with the OLD schema (no cosmetic columns) + one user.
    const legacy = new DatabaseSync(file);
    legacy.exec(LEGACY_USERS_SCHEMA);
    legacy
      .prepare(
        `INSERT INTO users
          (id, username, username_lower, email, password_hash, is_guest, email_verified, rating, rated_games, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('legacy-1', 'OldTimer', 'oldtimer', 'old@x.com', 'scrypt$x', 0, 1, 1337, 42, 5000);
    legacy.close();

    // Sanity: the cosmetic columns truly do not exist yet.
    const before = legacyColumns(file);
    assert.equal(before.has('selected_mascot_tint'), false);
    assert.equal(before.has('selected_piece_theme'), false);
    assert.equal(before.has('selected_board_theme'), false);

    // 2. Opening with the current repository runs the forward migration.
    const repo = new SqliteRepository(file);

    const after = legacyColumns(file);
    assert.ok(after.has('selected_mascot_tint'), 'mascot column added');
    assert.ok(after.has('selected_piece_theme'), 'piece column added');
    assert.ok(after.has('selected_board_theme'), 'board column added');

    // 3. Existing row survives; new columns read back as null; rows are usable.
    const u = await repo.getUserById('legacy-1');
    assert.equal(u?.username, 'OldTimer');
    assert.equal(u?.rating, 1337);
    assert.equal(u?.ratedGames, 42);
    assert.equal(u?.selectedMascotTint, null);
    assert.equal(u?.selectedPieceTheme, null);
    assert.equal(u?.selectedBoardTheme, null);

    // 4. The migrated DB accepts cosmetics writes.
    await repo.updateUserCosmetics('legacy-1', { selectedMascotTint: 'coral', selectedBoardTheme: 'navy' });
    const u2 = await repo.getUserById('legacy-1');
    assert.equal(u2?.selectedMascotTint, 'coral');
    assert.equal(u2?.selectedBoardTheme, 'navy');
    assert.equal(u2?.selectedPieceTheme, null);

    await repo.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SqliteRepository migration is idempotent across reopens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laska-migrate-'));
  const file = join(dir, 'reopen.db');
  try {
    const first = new SqliteRepository(file);
    await first.createUser({
      id: 'u1',
      username: 'Fresh',
      email: 'fresh@x.com',
      passwordHash: 'scrypt$x',
      isGuest: false,
      emailVerified: false,
      rating: 1200,
      ratedGames: 0,
      createdAt: 1000,
      selectedMascotTint: 'sun',
      selectedPieceTheme: 'dots',
      selectedBoardTheme: 'chocolate',
    });
    await first.close();

    // Reopening a DB that ALREADY has the columns must not error or drop data.
    const second = new SqliteRepository(file);
    const u = await second.getUserById('u1');
    assert.equal(u?.selectedMascotTint, 'sun');
    assert.equal(u?.selectedPieceTheme, 'dots');
    assert.equal(u?.selectedBoardTheme, 'chocolate');
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
