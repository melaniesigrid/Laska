import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteRepository } from '../src/storage/sqlite.ts';
import type { MatchRecord, User } from '../src/storage/types.ts';

function makeUser(over: Partial<User> = {}): User {
  return {
    id: over.id ?? 'u1',
    username: over.username ?? 'Alice',
    email: over.email !== undefined ? over.email : `${over.id ?? 'u1'}@x.com`,
    passwordHash: 'scrypt$x',
    isGuest: false,
    isBot: false,
    emailVerified: false,
    rating: 1200,
    ratingDeviation: 350,
    volatility: 0.06,
    ratedGames: 0,
    lastRatedAt: null,
    createdAt: 1000,
  };
}

// Regression: a production sqlite DB created before per-variant support has a
// `matches` table with no `variant` column. Opening the repository must add it
// (idempotent migration), or every finished-match save throws
// "table matches has no column named variant".
test('sqlite self-heals a pre-variant matches table', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laska-mig-'));
  const path = join(dir, 'old.db');

  // Seed the OLD schema (no `variant`).
  const seed = new DatabaseSync(path);
  seed.exec(`CREATE TABLE matches (
    id TEXT PRIMARY KEY, white_id TEXT NOT NULL, black_id TEXT NOT NULL,
    moves TEXT NOT NULL, result TEXT NOT NULL, end_reason TEXT NOT NULL, ranked INTEGER NOT NULL,
    white_rating_before INTEGER NOT NULL, black_rating_before INTEGER NOT NULL,
    white_rating_after INTEGER NOT NULL, black_rating_after INTEGER NOT NULL,
    started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL
  );`);
  seed.close();

  const repo = new SqliteRepository(path);
  try {
    await repo.createUser(makeUser({ id: 'u1', username: 'W' }));
    await repo.createUser(makeUser({ id: 'u2', username: 'B' }));
    const rec: MatchRecord = {
      id: 'm1',
      whiteId: 'u1',
      blackId: 'u2',
      variant: 'bashni',
      moves: [{ from: 7, to: 11, captures: [], by: 'W' }],
      result: '1-0',
      endReason: 'resignation',
      ranked: true,
      whiteRatingBefore: 1200,
      blackRatingBefore: 1200,
      whiteRatingAfter: 1215,
      blackRatingAfter: 1185,
      startedAt: 1000,
      endedAt: 2000,
    };
    await repo.saveMatch(rec); // pre-fix: throws on the missing column
    const got = await repo.getUserMatches('u1', 10);
    assert.equal(got.length, 1);
    assert.equal(got[0]!.variant, 'bashni');
  } finally {
    await repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
