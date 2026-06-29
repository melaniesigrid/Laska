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
    ratingDeviation: over.ratingDeviation ?? 350,
    volatility: over.volatility ?? 0.06,
    ratedGames: over.ratedGames ?? 0,
    lastRatedAt: over.lastRatedAt !== undefined ? over.lastRatedAt : null,
    createdAt: over.createdAt ?? 1000,
  };
}

function makeMatch(over: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: over.id ?? 'm1',
    whiteId: over.whiteId ?? 'u1',
    blackId: over.blackId ?? 'u2',
    variant: over.variant ?? 'laska',
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

// Run the identical behavioral contract against every backend. `make` is async
// so a backend can do setup (schema init / cleanup) before each test.
const backends: { name: string; make: () => Promise<Repository> }[] = [
  { name: 'InMemoryRepository', make: async () => new InMemoryRepository() },
  { name: 'SqliteRepository(:memory:)', make: async () => new SqliteRepository(':memory:') },
];

// Postgres is included only when DATABASE_URL is set (e.g. in CI with a real
// Postgres service); otherwise it's silently skipped, exactly like a missing
// optional dependency — no separate skip flag to remember. CI must point
// DATABASE_URL at a throwaway database: each make() TRUNCATEs so every test
// starts from an empty store, just like the other backends.
if (process.env.DATABASE_URL) {
  const { PostgresRepository } = await import('../src/storage/postgres.ts');
  backends.push({
    name: 'PostgresRepository(DATABASE_URL)',
    make: async () => {
      const repo = new PostgresRepository(process.env.DATABASE_URL!);
      await repo.init();
      await (repo as unknown as { pool: { query: (q: string) => Promise<unknown> } }).pool.query(
        'TRUNCATE users, matches',
      );
      return repo;
    },
  });
}

for (const backend of backends) {
  test(`[${backend.name}] create and fetch a user by id/email/username`, async () => {
    const repo = await backend.make();
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
    const repo = await backend.make();
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
    const repo = await backend.make();
    await repo.createUser(makeUser({ id: 'g1', username: 'guest1', email: null, isGuest: true }));
    await repo.createUser(makeUser({ id: 'g2', username: 'guest2', email: null, isGuest: true }));
    assert.equal((await repo.getUserById('g1'))?.email, null);
    assert.equal((await repo.getUserById('g2'))?.email, null);
  });

  test(`[${backend.name}] updateUser patches fields and keeps username lookup in sync`, async () => {
    const repo = await backend.make();
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
    const repo = await backend.make();
    await repo.createUser(makeUser());
    await repo.createUser(makeUser({ id: 'u2', username: 'Bob', email: 'bob@x.com' }));
    await assert.rejects(() => repo.updateUser('u2', { email: 'alice@x.com' }), /Email already registered/);
  });

  test(`[${backend.name}] guest->account linking updates email/username/isGuest in place`, async () => {
    const repo = await backend.make();
    await repo.createUser(makeUser({ id: 'g1', username: 'guest-abc', email: null, isGuest: true }));
    await repo.updateUser('g1', { username: 'real', email: 'real@x.com', isGuest: false });
    const u = await repo.getUserById('g1');
    assert.equal(u?.isGuest, false);
    assert.equal(u?.email, 'real@x.com');
    assert.equal((await repo.getUserByEmail('real@x.com'))?.id, 'g1');
  });

  test(`[${backend.name}] save and fetch matches; history is newest-first and limited`, async () => {
    const repo = await backend.make();
    await repo.saveMatch(makeMatch({ id: 'm1', whiteId: 'u1', blackId: 'u2', endedAt: 1000 }));
    await repo.saveMatch(makeMatch({ id: 'm2', whiteId: 'u3', blackId: 'u1', endedAt: 3000, variant: 'bashni' }));
    await repo.saveMatch(makeMatch({ id: 'm3', whiteId: 'u1', blackId: 'u4', endedAt: 2000 }));

    assert.equal((await repo.getMatch('m2'))?.whiteId, 'u3');
    assert.equal(await repo.getMatch('nope'), null);

    const all = await repo.getUserMatches('u1', 10);
    assert.deepEqual(all.map((m) => m.id), ['m2', 'm3', 'm1'], 'newest ended_at first, both colors');
    const limited = await repo.getUserMatches('u1', 2);
    assert.deepEqual(limited.map((m) => m.id), ['m2', 'm3']);
    // Moves round-trip through serialization.
    assert.deepEqual((await repo.getMatch('m1'))?.moves, [{ from: 7, to: 11, captures: [], by: 'W' }]);
    // The variant round-trips, and defaults to Laska when unset.
    assert.equal((await repo.getMatch('m2'))?.variant, 'bashni');
    assert.equal((await repo.getMatch('m1'))?.variant, 'laska');
  });

  test(`[${backend.name}] leaderboard excludes guests and unrated, sorts by rating desc`, async () => {
    const repo = await backend.make();
    await repo.createUser(makeUser({ id: 'a', username: 'a', email: 'a@x.com', rating: 1500, ratedGames: 10 }));
    await repo.createUser(makeUser({ id: 'b', username: 'b', email: 'b@x.com', rating: 1700, ratedGames: 4 }));
    await repo.createUser(makeUser({ id: 'c', username: 'c', email: 'c@x.com', rating: 1900, ratedGames: 0 })); // unrated
    await repo.createUser(makeUser({ id: 'g', username: 'g', email: null, isGuest: true, rating: 2000, ratedGames: 9 })); // guest

    const board = await repo.topByRating(10);
    assert.deepEqual(board.map((e) => e.userId), ['b', 'a'], 'only rated non-guests, highest first');
    assert.equal((await repo.topByRating(1)).length, 1);
    // Each entry carries the derived rank + the RD it was derived from.
    const top = board[0]!;
    assert.equal(top.ratingDeviation, 350);
    assert.ok(top.rank && typeof top.rank.name === 'string', 'leaderboard entries carry a displayed rank');
    // 'b' at 1700 with only 4 rated games is provisional -> clamped to Colonel.
    assert.equal(top.rank.provisional, true);
    assert.equal(top.rank.name, 'Colonel');
  });

  test(`[${backend.name}] platformStats aggregates users, activity, signups, and matches`, async () => {
    const repo = await backend.make();
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    // Fixed, UTC-noon `now` so day-bucketing is deterministic across backends.
    const now = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15T12:00:00Z

    // Users: 1 verified registered, 1 unverified registered, 2 guests.
    // createdAt placed to land in known rolling windows + signup-by-day buckets.
    await repo.createUser(
      makeUser({ id: 'uv', username: 'uv', email: 'uv@x.com', emailVerified: true, createdAt: now - 2 * HOUR }),
    ); // within d1; day 2026-06-15
    await repo.createUser(
      makeUser({ id: 'uu', username: 'uu', email: 'uu@x.com', emailVerified: false, createdAt: now - 5 * DAY }),
    ); // within d7 not d1; day 2026-06-10
    await repo.createUser(
      makeUser({ id: 'g1', username: 'g1', email: null, isGuest: true, createdAt: now - 20 * DAY }),
    ); // within d30; day 2026-05-26
    await repo.createUser(
      makeUser({ id: 'g2', username: 'g2', email: null, isGuest: true, createdAt: now - 40 * DAY }),
    ); // outside d30 + outside the 30-day signup window

    // Matches: controlled endedAt + ranked flags.
    await repo.saveMatch(makeMatch({ id: 'ma', whiteId: 'uv', blackId: 'uu', ranked: true, endedAt: now - 1 * HOUR })); // d1
    await repo.saveMatch(makeMatch({ id: 'mb', whiteId: 'g1', blackId: 'uu', ranked: false, endedAt: now - 3 * DAY })); // d7 not d1
    await repo.saveMatch(makeMatch({ id: 'mc', whiteId: 'g2', blackId: 'uv', ranked: true, endedAt: now - 25 * DAY })); // d30 not d7

    const s = await repo.platformStats(now);

    assert.equal(s.generatedAt, now);
    assert.deepEqual(s.users, { total: 4, registered: 2, guests: 2, verified: 1 });
    // Active = DISTINCT match participants (both colors) by endedAt window.
    // d1: {uv,uu}=2; d7: +{g1}=3; d30: +{g2}=4.
    assert.deepEqual(s.active, { d1: 2, d7: 3, d30: 4 });
    assert.deepEqual(s.newUsers, { last24h: 1, last7d: 2, last30d: 3 });
    assert.deepEqual(s.matches, { total: 3, ranked: 2, last24h: 1, last7d: 2 });

    // signupsByDay: 30 contiguous UTC days, oldest→newest, gaps filled with 0.
    assert.equal(s.signupsByDay.length, 30);
    assert.equal(s.signupsByDay[0]!.day, '2026-05-17');
    assert.equal(s.signupsByDay[29]!.day, '2026-06-15');
    // Days are strictly increasing and contiguous (no gaps, no dupes).
    for (let i = 1; i < s.signupsByDay.length; i++) {
      assert.ok(s.signupsByDay[i]!.day > s.signupsByDay[i - 1]!.day);
    }
    const byDay = new Map(s.signupsByDay.map((e) => [e.day, e.count]));
    assert.equal(byDay.get('2026-06-15'), 1); // uv
    assert.equal(byDay.get('2026-06-10'), 1); // uu
    assert.equal(byDay.get('2026-05-26'), 1); // g1
    // g2 (created 40d ago) is outside the window -> not counted anywhere here.
    const totalInChart = s.signupsByDay.reduce((n, e) => n + e.count, 0);
    assert.equal(totalInChart, 3);
  });

  // Some backends (SQLite) hold a file/handle; close if supported.
  test(`[${backend.name}] close() is callable`, async () => {
    const repo = await backend.make();
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
