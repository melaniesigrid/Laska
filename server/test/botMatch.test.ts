/**
 * Ranked vs-computer matches: server-driven bot moves, pinned bot rating, and
 * the leaderboard excluding bots. The bot opponent runs entirely on the server
 * via the shared engine; every move stays server-validated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { buildServer } from '../src/index.ts';
import { MatchManager } from '../src/game/manager.ts';
import { InMemoryRepository } from '../src/storage/memory.ts';
import { seedBots, botUserId, BOT_RATINGS, BOT_RATING_DEVIATION } from '../src/game/bots.ts';
import type { ServerMessage } from '../src/net/protocol.ts';

const TEST_CONFIG = {
  port: 0,
  accessSecret: 'test-access',
  refreshSecret: 'test-refresh',
  startingRating: 1200,
  usingDefaultSecrets: false,
  db: { kind: 'memory' as const },
  cluster: { kind: 'memory' as const },
  nodeId: 'test-node',
};

class TestClient {
  ws: WebSocket;
  private inbox: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as ServerMessage;
      const idx = this.waiters.findIndex((w) => w.pred(msg));
      if (idx >= 0) {
        const [w] = this.waiters.splice(idx, 1);
        w!.resolve(msg);
      } else {
        this.inbox.push(msg);
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
    });
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  waitFor<T extends ServerMessage['type']>(type: T, timeoutMs = 5000): Promise<Extract<ServerMessage, { type: T }>> {
    const pred = (m: ServerMessage) => m.type === type;
    const existing = this.inbox.findIndex(pred);
    if (existing >= 0) {
      const [m] = this.inbox.splice(existing, 1);
      return Promise.resolve(m as Extract<ServerMessage, { type: T }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { type: T }>);
        },
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

// ---------------------------------------------------------------------------
// (b) finalize updates the human, leaves the bot's rating pinned.
// ---------------------------------------------------------------------------
test('finalize: human rating moves, bot rating/RD/ratedGames stay pinned', async () => {
  const repo = new InMemoryRepository();
  await seedBots(repo);
  // A real player to face the Expert bot.
  await repo.createUser({
    id: 'human',
    username: 'Human',
    email: 'h@x.com',
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
    selectedMascotTint: null,
    selectedPieceTheme: null,
    selectedBoardTheme: null,
  });

  const manager = new MatchManager(repo, 1200);
  const botId = botUserId('expert');
  // Human is White and BEATS the Expert bot (an upset that should move them up).
  const match = manager.createMatch('human', botId, { ranked: true });

  const botBefore = (await repo.getUserById(botId))!;
  const summary = await manager.finalize(match.id, { result: '1-0', reason: 'resignation', winner: 'W' });

  assert.ok(summary.ratingChange, 'a ranked bot match still produces a ratingChange payload');
  // The human (White) gained from beating a higher-rated, confident bot.
  assert.ok(summary.ratingChange!.white.delta > 0, 'human gains for beating a stronger bot');
  // The bot (Black) side reports NO movement — it is a fixed yardstick.
  assert.equal(summary.ratingChange!.black.delta, 0, 'bot side shows zero delta');
  assert.equal(
    summary.ratingChange!.black.before,
    summary.ratingChange!.black.after,
    'bot before == after',
  );

  // Persisted human row moved; persisted bot row is byte-for-byte the seeded one.
  const humanAfter = (await repo.getUserById('human'))!;
  assert.equal(humanAfter.ratedGames, 1, 'human ratedGames incremented');
  assert.ok(humanAfter.rating > 1200, 'human rating increased in the repo');

  const botAfter = (await repo.getUserById(botId))!;
  assert.equal(botAfter.rating, BOT_RATINGS.expert, 'bot rating pinned to the constant');
  assert.equal(botAfter.ratingDeviation, BOT_RATING_DEVIATION, 'bot RD pinned');
  assert.equal(botAfter.ratedGames, 0, 'bot ratedGames did NOT increment');
  assert.equal(botAfter.lastRatedAt, null, 'bot lastRatedAt untouched');
  assert.equal(botAfter.volatility, botBefore.volatility, 'bot volatility untouched');
});

// ---------------------------------------------------------------------------
// (a) a bot match plays to completion with server-driven bot moves.
// ---------------------------------------------------------------------------
test('e2e: ranked bot match runs server-driven bot moves and finalizes the human rating', async () => {
  const srv = buildServer(TEST_CONFIG);
  await srv.gameServer.seedBots();
  await new Promise<void>((resolve) => srv.http.listen(0, resolve));
  const port = (srv.http.address() as AddressInfo).port;
  const wsUrl = `ws://localhost:${port}/ws`;

  const alice = await srv.auth.registerWithEmail('alice@x.com', 'password123', 'alice');

  const c = new TestClient(wsUrl);
  await c.open();
  c.send({ type: 'auth', token: alice.tokens.accessToken });
  await c.waitFor('auth.ok');

  // Human takes Black, so the BOT is White and must move FIRST — proving the
  // server drives a bot move on match start with no human input.
  c.send({ type: 'match.startBot', difficulty: 'beginner', color: 'B' });
  const start = await c.waitFor('match.start');
  assert.equal(start.color, 'B', 'human is Black');
  assert.equal(start.opponent.username, 'Computer (Beginner)');
  assert.equal(start.opponent.rating, BOT_RATINGS.beginner, 'opponent shows the pinned bot rating');

  const matchId = start.matchId;
  // The server-driven bot (White) opens; the human receives a match.update whose
  // lastMove was made by White (the bot).
  const botOpen = await c.waitFor('match.update');
  assert.equal(botOpen.lastMove?.by, 'W', 'bot (White) moved first, server-driven');
  assert.equal(botOpen.state.toMove, 'B', 'now the human (Black) is to move');

  // The human replies with a server-legal move; the bot then replies again.
  const match = srv.manager.getMatch(matchId)!;
  const humanMove = match.legalMovesForCurrent()[0]!;
  c.send({ type: 'match.move', matchId, from: humanMove.from, to: humanMove.to });

  // Expect the human's own move broadcast (by 'B') then the bot's reply (by 'W').
  const afterHuman = await c.waitFor('match.update');
  assert.equal(afterHuman.lastMove?.by, 'B', 'human move broadcast authoritatively');
  const botReply = await c.waitFor('match.update');
  assert.equal(botReply.lastMove?.by, 'W', 'bot replied, server-driven');

  // Finish the match: the human resigns. Both the match.end and a ratingChange
  // (with the human side moving) prove finalize ran through the normal path.
  c.send({ type: 'match.resign', matchId });
  const end = await c.waitFor('match.end');
  assert.equal(end.matchId, matchId);
  assert.ok(end.ratingChange, 'bot match still produces a ratingChange payload');
  // Human is Black and resigned -> they lost -> their delta is negative.
  assert.ok(end.ratingChange!.black.delta < 0, 'human (Black) rating dropped on resign');
  // The bot (White) side is pinned: zero movement.
  assert.equal(end.ratingChange!.white.delta, 0, 'bot (White) rating pinned');

  // The bot's persisted rating is unchanged; the human's moved.
  const botRow = (await srv.repo.getUserById(botUserId('beginner')))!;
  assert.equal(botRow.rating, BOT_RATINGS.beginner);
  assert.equal(botRow.ratedGames, 0);
  const humanRow = (await srv.repo.getUserById(alice.user.id))!;
  assert.equal(humanRow.ratedGames, 1);

  c.close();
  srv.gameServer.stop();
  await new Promise<void>((resolve) => srv.wss.close(() => resolve()));
  await new Promise<void>((resolve) => srv.http.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// Guard rails: bots never appear on the leaderboard even after a bot match.
// ---------------------------------------------------------------------------
test('e2e: a played bot match never puts the bot on the leaderboard', async () => {
  const srv = buildServer(TEST_CONFIG);
  await srv.gameServer.seedBots();
  await new Promise<void>((resolve) => srv.http.listen(0, resolve));
  const port = (srv.http.address() as AddressInfo).port;
  const wsUrl = `ws://localhost:${port}/ws`;

  const alice = await srv.auth.registerWithEmail('alice@x.com', 'password123', 'alice');
  const c = new TestClient(wsUrl);
  await c.open();
  c.send({ type: 'auth', token: alice.tokens.accessToken });
  await c.waitFor('auth.ok');

  // Human is White vs the Expert (1800) bot, then resigns: the human ends rated,
  // the high-rated bot is rated-eligible by raw rating but must be filtered out.
  c.send({ type: 'match.startBot', difficulty: 'expert', color: 'W' });
  const start = await c.waitFor('match.start');
  c.send({ type: 'match.resign', matchId: start.matchId });
  await c.waitFor('match.end');

  const board = await srv.repo.topByRating(50);
  assert.deepEqual(
    board.map((e) => e.username),
    ['alice'],
    'leaderboard shows the human only — never the higher-rated bot',
  );

  c.close();
  srv.gameServer.stop();
  await new Promise<void>((resolve) => srv.wss.close(() => resolve()));
  await new Promise<void>((resolve) => srv.http.close(() => resolve()));
});
