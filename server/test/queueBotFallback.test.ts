/**
 * Quick-match queue -> bot fallback.
 *
 * With a cold user base two humans are rarely queued at the same instant, so the
 * human-only queue would leave a lone player waiting forever. The fallback starts
 * a REAL ranked match against a rating-matched built-in bot once a player has
 * waited past `queueBotFallbackMs`, reusing the same bot-match machinery as an
 * explicit `match.startBot`. Human-vs-human pairing always takes precedence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { buildServer } from '../src/index.ts';
import type { ServerConfig } from '../src/config.ts';
import type { ServerMessage } from '../src/net/protocol.ts';
import { BOT_RATINGS, isBotUserId } from '../src/game/bots.ts';

function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    accessSecret: 'test-access',
    refreshSecret: 'test-refresh',
    startingRating: 1200,
    usingDefaultSecrets: false,
    db: { kind: 'memory' as const },
    cluster: { kind: 'memory' as const },
    nodeId: 'test-node',
    ...overrides,
  };
}

/** A tiny message-collecting WS client with a typed waitFor. */
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
      const waiter = {
        pred,
        resolve: (m: ServerMessage) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { type: T }>);
        },
      };
      // On timeout, REMOVE the waiter so a later matching message isn't silently
      // consumed by this dead entry (which would starve the next waitFor).
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /** Assert no message of `type` arrives within `windowMs`. */
  async expectNone<T extends ServerMessage['type']>(type: T, windowMs: number): Promise<void> {
    try {
      await this.waitFor(type, windowMs);
      throw new Error(`Unexpected ${type} within ${windowMs}ms`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Timed out waiting for')) return;
      throw err;
    }
  }

  close(): void {
    this.ws.close();
  }
}

async function boot(config: ServerConfig) {
  const srv = buildServer(config);
  await srv.gameServer.seedBots();
  await new Promise<void>((resolve) => srv.http.listen(0, resolve));
  const port = (srv.http.address() as AddressInfo).port;
  const wsUrl = `ws://localhost:${port}/ws`;
  return { srv, wsUrl };
}

async function teardown(srv: Awaited<ReturnType<typeof boot>>['srv']): Promise<void> {
  srv.gameServer.stop();
  await new Promise<void>((resolve) => srv.wss.close(() => resolve()));
  await new Promise<void>((resolve) => srv.http.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// A lone human who waits past the timeout gets a rating-matched bot match.
// ---------------------------------------------------------------------------
test('queue bot fallback: a lone waiting human is paired with a rating-matched bot', async () => {
  const { srv, wsUrl } = await boot(testConfig({ queueBotFallbackMs: 60 }));

  const alice = await srv.auth.registerWithEmail('alice@x.com', 'password123', 'alice');
  // Bump the rating so tier selection is a non-trivial nearest-match: 1750 is
  // closest to Expert (1800, gap 50) over Hard (1600, gap 150).
  await srv.repo.updateUser(alice.user.id, { rating: 1750 });

  const c = new TestClient(wsUrl);
  await c.open();
  c.send({ type: 'auth', token: alice.tokens.accessToken });
  await c.waitFor('auth.ok');

  srv.gameServer.start(15); // run the periodic tick fast so the fallback fires

  c.send({ type: 'queue.join' });
  await c.waitFor('queue.joined');

  const start = await c.waitFor('match.start');
  assert.ok(isBotUserId(start.opponent.userId), 'lone waiter is matched against a bot account');
  assert.equal(start.opponent.username, 'Computer (Expert)', 'nearest tier to 1750 is Expert');
  assert.equal(start.opponent.rating, BOT_RATINGS.expert, 'opponent shows the pinned Expert rating');

  // The fallback must have removed the human from the shared queue (no double match).
  assert.equal(await srv.cluster.isQueued(alice.user.id), false, 'waiter left the queue on fallback');
  // A real, server-owned ranked match now exists for them.
  const matchId = await srv.cluster.userMatch(alice.user.id);
  assert.equal(matchId, start.matchId, 'the human is registered in the started bot match');

  c.close();
  await teardown(srv);
});

// ---------------------------------------------------------------------------
// Two humans present pair with EACH OTHER — no premature bot fallback.
// ---------------------------------------------------------------------------
test('queue bot fallback: two humans present pair with each other, never a bot', async () => {
  // Deliberately a SHORT fallback: if precedence were wrong, the tick would race
  // the pairing and hand out bots. It must not — pairing wins on the 2nd join.
  const { srv, wsUrl } = await boot(testConfig({ queueBotFallbackMs: 40 }));

  const alice = await srv.auth.registerWithEmail('alice@x.com', 'password123', 'alice');
  const bob = await srv.auth.registerWithEmail('bob@x.com', 'password123', 'bob');

  const ca = new TestClient(wsUrl);
  const cb = new TestClient(wsUrl);
  await Promise.all([ca.open(), cb.open()]);
  ca.send({ type: 'auth', token: alice.tokens.accessToken });
  cb.send({ type: 'auth', token: bob.tokens.accessToken });
  await Promise.all([ca.waitFor('auth.ok'), cb.waitFor('auth.ok')]);

  srv.gameServer.start(10);

  ca.send({ type: 'queue.join' });
  await ca.waitFor('queue.joined');
  cb.send({ type: 'queue.join' });
  await cb.waitFor('queue.joined');

  const [aStart, bStart] = await Promise.all([ca.waitFor('match.start'), cb.waitFor('match.start')]);
  assert.equal(aStart.matchId, bStart.matchId, 'the two humans share one match');
  assert.notEqual(aStart.color, bStart.color, 'opposite colors');
  assert.equal(aStart.opponent.username, 'bob', 'alice faces bob, not a bot');
  assert.equal(bStart.opponent.username, 'alice', 'bob faces alice, not a bot');
  assert.ok(!isBotUserId(aStart.opponent.userId), 'no bot opponent');
  assert.ok(!isBotUserId(bStart.opponent.userId), 'no bot opponent');

  ca.close();
  cb.close();
  await teardown(srv);
});

// ---------------------------------------------------------------------------
// The timeout constant is respected: no bot before it elapses, a bot after.
// ---------------------------------------------------------------------------
test('queue bot fallback: the timeout is respected — no bot before it, a bot after', async () => {
  const { srv, wsUrl } = await boot(testConfig({ queueBotFallbackMs: 400 }));

  const alice = await srv.auth.registerWithEmail('alice@x.com', 'password123', 'alice');

  const c = new TestClient(wsUrl);
  await c.open();
  c.send({ type: 'auth', token: alice.tokens.accessToken });
  await c.waitFor('auth.ok');

  srv.gameServer.start(15);

  c.send({ type: 'queue.join' });
  await c.waitFor('queue.joined');

  // Well before the 400ms timeout, the tick must NOT have handed out a bot.
  await c.expectNone('match.start', 150);
  assert.equal(await srv.cluster.isQueued(alice.user.id), true, 'still waiting before the timeout');

  // After the timeout the fallback fires (default startingRating 1200 -> Intermediate).
  const start = await c.waitFor('match.start', 2000);
  assert.ok(isBotUserId(start.opponent.userId), 'a bot match starts once the timeout passes');
  assert.equal(start.opponent.username, 'Computer (Intermediate)', 'nearest tier to 1200 is Intermediate');

  c.close();
  await teardown(srv);
});
