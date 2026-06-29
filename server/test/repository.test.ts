import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryRepository } from '../src/storage/memory.ts';
import { SqliteRepository } from '../src/storage/sqlite.ts';
import type { MatchRecord, Repository, User } from '../src/storage/types.ts';

function makeUser(over: Partial<User> = {}): User {
  return {
    id: over.id ?? 'u1',
    username: over.username ?? 'Alice',
    email: over.email !== undefined ? over.email : 'alice@x.com',
    passwordHash: over.passwordHash ?? 'scrypt$x',
    isGuest: over.isGuest ?? false,
    emailVerified: over.emailVerified ?? false,
    rating: over.rating ?? 1200,
    ratedGames: over.ratedGames ?? 0,
    createdAt: over.createdAt ?? 1000,
    selectedMascotTint: over.selectedMascotTint !== undefined ? over.selectedMascotTint : null,
    selectedPieceTheme: over.selectedPieceTheme !== undefined ? over.selectedPieceTheme : null,
    selectedBoardTheme: over.selectedBoardTheme !== undefined ? over.selectedBoardTheme : null,
  };
}

function makeMatch(over: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: over.id ?? 'm1',
    whiteId: over.whiteId ?? 'u1',
    blackId: over.blackId ?? 'u2',
    moves: over.moves ?? [{ from: 7, to: 11, captures: [], by: 'W' }],
    result: over.result ?? '1-0',
    endReason: over.endReason ?? 'resignation',
    ranked: over.ranked ?? true,
    whiteRatingBefore: over.whiteRatingBefore ?? 1200,
    blackRatingBefore: over.blackRatingBefore ?? 1200,
    whiteRatingAfter: over.whiteRatingAfter ?? 1215,
    blackRatingAfter: over.blackRatingAfter ?? 1185,
    startedAt: over.startedAt ?? 1000,
    endedAt: over.endedAt ?? 2000,
  };
}

// Run the identical behavioral contract against every backend.
const backends: { name: string; make: () => Repository }[] = [
  { name: 'InMemoryRepository', make: () => new InMemoryRepository() },
  { name: 'SqliteRepository(:memory:)', make: () => new SqliteRepository(':memory:') },
];

for (const backend of backends) {
  test(`[${backend.name}] create and fetch a user by id/email/username`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser());
    assert.equal(await repo.getUserById('missing'), null);
    const byId = await repo.getUserById('u1');
    assert.equal(byId?.username, 'Alice');
    assert.equal(byId?.rating, 1200);
    // Email and username lookups are case-insensitive.
    assert.equal((await repo.getUserByEmail('ALICE@X.COM'))?.id, 'u1');
    assert.equal((await repo.getUserByUsername('alice'))?.id, 'u1');
  });

  test(`[${backend.name}] rejects duplicate id, email, and (case-insensitive) username`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser());
    await assert.rejects(() => repo.createUser(makeUser({ username: 'Other', email: 'o@x.com' })), /id already exists/);
    await assert.rejects(
      () => repo.createUser(makeUser({ id: 'u2', username: 'Other', email: 'ALICE@x.com' })),
      /Email already registered/,
    );
    await assert.rejects(
      () => repo.createUser(makeUser({ id: 'u3', username: 'ALICE', email: 'a3@x.com' })),
      /Username already taken/,
    );
  });

  test(`[${backend.name}] allows multiple guests with null email`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser({ id: 'g1', username: 'guest1', email: null, isGuest: true }));
    await repo.createUser(makeUser({ id: 'g2', username: 'guest2', email: null, isGuest: true }));
    assert.equal((await repo.getUserById('g1'))?.email, null);
    assert.equal((await repo.getUserById('g2'))?.email, null);
  });

  test(`[${backend.name}] updateUser patches fields and keeps username lookup in sync`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser());
    await repo.updateUser('u1', { rating: 1320, ratedGames: 5 });
    const u = await repo.getUserById('u1');
    assert.equal(u?.rating, 1320);
    assert.equal(u?.ratedGames, 5);
    await repo.updateUser('u1', { username: 'AliceRenamed' });
    assert.equal((await repo.getUserByUsername('alicerenamed'))?.id, 'u1');
    assert.equal(await repo.getUserByUsername('alice'), null);
  });

  test(`[${backend.name}] updateUser rejects moving to a taken email`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser());
    await repo.createUser(makeUser({ id: 'u2', username: 'Bob', email: 'bob@x.com' }));
    await assert.rejects(() => repo.updateUser('u2', { email: 'alice@x.com' }), /Email already registered/);
  });

  test(`[${backend.name}] guest->account linking updates email/username/isGuest in place`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser({ id: 'g1', username: 'guest-abc', email: null, isGuest: true }));
    await repo.updateUser('g1', { username: 'real', email: 'real@x.com', isGuest: false });
    const u = await repo.getUserById('g1');
    assert.equal(u?.isGuest, false);
    assert.equal(u?.email, 'real@x.com');
    assert.equal((await repo.getUserByEmail('real@x.com'))?.id, 'g1');
  });

  test(`[${backend.name}] new users default to null cosmetics`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser());
    const u = await repo.getUserById('u1');
    assert.equal(u?.selectedMascotTint, null);
    assert.equal(u?.selectedPieceTheme, null);
    assert.equal(u?.selectedBoardTheme, null);
  });

  test(`[${backend.name}] updateUserCosmetics sets, partially patches, and clears`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser());
    await repo.updateUserCosmetics('u1', {
      selectedMascotTint: 'mint',
      selectedPieceTheme: 'lineage',
      selectedBoardTheme: 'twilight',
    });
    let u = await repo.getUserById('u1');
    assert.equal(u?.selectedMascotTint, 'mint');
    assert.equal(u?.selectedPieceTheme, 'lineage');
    assert.equal(u?.selectedBoardTheme, 'twilight');

    // Partial patch only touches provided fields.
    await repo.updateUserCosmetics('u1', { selectedMascotTint: 'sky' });
    u = await repo.getUserById('u1');
    assert.equal(u?.selectedMascotTint, 'sky');
    assert.equal(u?.selectedPieceTheme, 'lineage', 'omitted field unchanged');

    // Explicit null clears back to default.
    await repo.updateUserCosmetics('u1', { selectedBoardTheme: null });
    u = await repo.getUserById('u1');
    assert.equal(u?.selectedBoardTheme, null);
  });

  test(`[${backend.name}] updateUserCosmetics rejects an unknown user`, async () => {
    const repo = backend.make();
    await assert.rejects(() => repo.updateUserCosmetics('ghost', { selectedMascotTint: 'coral' }), /No such user/);
  });

  test(`[${backend.name}] save and fetch matches; history is newest-first and limited`, async () => {
    const repo = backend.make();
    await repo.saveMatch(makeMatch({ id: 'm1', whiteId: 'u1', blackId: 'u2', endedAt: 1000 }));
    await repo.saveMatch(makeMatch({ id: 'm2', whiteId: 'u3', blackId: 'u1', endedAt: 3000 }));
    await repo.saveMatch(makeMatch({ id: 'm3', whiteId: 'u1', blackId: 'u4', endedAt: 2000 }));

    assert.equal((await repo.getMatch('m2'))?.whiteId, 'u3');
    assert.equal(await repo.getMatch('nope'), null);

    const all = await repo.getUserMatches('u1', 10);
    assert.deepEqual(all.map((m) => m.id), ['m2', 'm3', 'm1'], 'newest ended_at first, both colors');
    const limited = await repo.getUserMatches('u1', 2);
    assert.deepEqual(limited.map((m) => m.id), ['m2', 'm3']);
    // Moves round-trip through serialization.
    assert.deepEqual((await repo.getMatch('m1'))?.moves, [{ from: 7, to: 11, captures: [], by: 'W' }]);
  });

  test(`[${backend.name}] leaderboard excludes guests and unrated, sorts by rating desc`, async () => {
    const repo = backend.make();
    await repo.createUser(makeUser({ id: 'a', username: 'a', email: 'a@x.com', rating: 1500, ratedGames: 10 }));
    await repo.createUser(makeUser({ id: 'b', username: 'b', email: 'b@x.com', rating: 1700, ratedGames: 4 }));
    await repo.createUser(makeUser({ id: 'c', username: 'c', email: 'c@x.com', rating: 1900, ratedGames: 0 })); // unrated
    await repo.createUser(makeUser({ id: 'g', username: 'g', email: null, isGuest: true, rating: 2000, ratedGames: 9 })); // guest

    const board = await repo.topByRating(10);
    assert.deepEqual(board.map((e) => e.userId), ['b', 'a'], 'only rated non-guests, highest first');
    assert.equal((await repo.topByRating(1)).length, 1);
  });

  // Some backends (SQLite) hold a file/handle; close if supported.
  test(`[${backend.name}] close() is callable`, async () => {
    const repo = backend.make();
    await repo.close?.();
  });
}

test('SqliteRepository persists data across a reopen (durability)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laska-db-'));
  const file = join(dir, 'durable.db');
  try {
    const first = new SqliteRepository(file);
    await first.createUser(makeUser({ id: 'persist', username: 'Persisted', email: 'p@x.com', rating: 1444, ratedGames: 7 }));
    await first.saveMatch(makeMatch({ id: 'pm', whiteId: 'persist', blackId: 'u2' }));
    await first.close();

    // Reopen the SAME file in a brand-new instance.
    const second = new SqliteRepository(file);
    const u = await second.getUserById('persist');
    assert.equal(u?.username, 'Persisted');
    assert.equal(u?.rating, 1444);
    const matches = await second.getUserMatches('persist', 10);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.id, 'pm');
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
