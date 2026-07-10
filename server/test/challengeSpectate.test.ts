import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { buildServer } from '../src/index.ts';
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

/** A tiny message-collecting WS client with a typed waitFor (mirrors social.test.ts). */
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

  waitFor<T extends ServerMessage['type']>(type: T, timeoutMs = 3000): Promise<Extract<ServerMessage, { type: T }>> {
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

/** Spin up a server with two authed clients (NOT paired). */
async function startHarness() {
  const srv = buildServer(TEST_CONFIG);
  await new Promise<void>((resolve) => srv.http.listen(0, resolve));
  const port = (srv.http.address() as AddressInfo).port;
  const wsUrl = `ws://localhost:${port}/ws`;

  const u1 = await srv.auth.registerWithEmail(`a${port}@x.com`, 'password123', `alice${port}`);
  const u2 = await srv.auth.registerWithEmail(`b${port}@x.com`, 'password123', `bob${port}`);
  const u3 = await srv.auth.registerWithEmail(`c${port}@x.com`, 'password123', `carol${port}`);

  const c1 = new TestClient(wsUrl);
  const c2 = new TestClient(wsUrl);
  const c3 = new TestClient(wsUrl);
  await Promise.all([c1.open(), c2.open(), c3.open()]);

  c1.send({ type: 'auth', token: u1.tokens.accessToken });
  c2.send({ type: 'auth', token: u2.tokens.accessToken });
  c3.send({ type: 'auth', token: u3.tokens.accessToken });
  await Promise.all([c1.waitFor('auth.ok'), c2.waitFor('auth.ok'), c3.waitFor('auth.ok')]);

  async function teardown() {
    c1.close();
    c2.close();
    c3.close();
    srv.gameServer.stop();
    await new Promise<void>((resolve) => srv.wss.close(() => resolve()));
    await new Promise<void>((resolve) => srv.http.close(() => resolve()));
  }

  return {
    srv,
    port,
    c1,
    c2,
    c3,
    u1,
    u2,
    u3,
    host: c1,
    joiner: c2,
    hostId: u1.user.id,
    joinerId: u2.user.id,
    teardown,
  };
}

test('challenge create -> join forms a match with the host as White', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create', options: { color: 'W' } });
    const created = await h.host.waitFor('challenge.created');
    assert.equal(created.color, 'W');
    assert.equal(created.ranked, true, 'ranked by default');
    assert.ok(created.code.length >= 6 && created.code.length <= 8, 'short code');
    assert.ok(/^[A-Za-z2-9]+$/.test(created.code), 'no ambiguous chars (0/O/1/I/l)');

    h.joiner.send({ type: 'challenge.join', code: created.code });
    const [hs, js] = await Promise.all([h.host.waitFor('match.start'), h.joiner.waitFor('match.start')]);
    assert.equal(hs.matchId, js.matchId);
    assert.equal(hs.color, 'W', 'host took White');
    assert.equal(js.color, 'B', 'joiner took Black');
    // Server-derived opponent identity + rank present.
    assert.equal(hs.opponent.userId, h.joinerId);
    assert.ok(typeof hs.opponent.rank === 'object' || typeof hs.opponent.rank === 'string');
  } finally {
    await h.teardown();
  }
});

test('challenge with host color B seats the host as Black', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create', options: { color: 'B' } });
    const created = await h.host.waitFor('challenge.created');
    assert.equal(created.color, 'B');

    h.joiner.send({ type: 'challenge.join', code: created.code });
    const [hs, js] = await Promise.all([h.host.waitFor('match.start'), h.joiner.waitFor('match.start')]);
    assert.equal(hs.color, 'B', 'host took Black');
    assert.equal(js.color, 'W', 'joiner took White');
  } finally {
    await h.teardown();
  }
});

test('random color yields a valid, opposite pairing', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create', options: { color: 'random' } });
    const created = await h.host.waitFor('challenge.created');
    assert.equal(created.color, 'random', 'preference echoed unresolved');

    h.joiner.send({ type: 'challenge.join', code: created.code });
    const [hs, js] = await Promise.all([h.host.waitFor('match.start'), h.joiner.waitFor('match.start')]);
    assert.notEqual(hs.color, js.color, 'colors are opposite');
    assert.ok(hs.color === 'W' || hs.color === 'B');
  } finally {
    await h.teardown();
  }
});

test('ranked flag is honored on the resulting match', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create', options: { color: 'W', ranked: true } });
    const created = await h.host.waitFor('challenge.created');
    assert.equal(created.ranked, true);

    h.joiner.send({ type: 'challenge.join', code: created.code });
    const [hs] = await Promise.all([h.host.waitFor('match.start'), h.joiner.waitFor('match.start')]);

    // Verify the live Match really is ranked by ending it and checking a rating change.
    h.host.send({ type: 'match.resign', matchId: hs.matchId });
    const end = await h.host.waitFor('match.end');
    assert.notEqual(end.ratingChange, null, 'ranked game produces a rating change');
  } finally {
    await h.teardown();
  }
});

test('unranked challenge produces no rating change on finish', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create', options: { color: 'W', ranked: false } });
    const created = await h.host.waitFor('challenge.created');
    assert.equal(created.ranked, false, 'host opted the invite out of ranking');
    h.joiner.send({ type: 'challenge.join', code: created.code });
    const [hs] = await Promise.all([h.host.waitFor('match.start'), h.joiner.waitFor('match.start')]);

    h.host.send({ type: 'match.resign', matchId: hs.matchId });
    const end = await h.host.waitFor('match.end');
    assert.equal(end.ratingChange, null, 'friendly game has no rating change');
  } finally {
    await h.teardown();
  }
});

test('joining your own code errors with own-challenge', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create' });
    const created = await h.host.waitFor('challenge.created');
    h.host.send({ type: 'challenge.join', code: created.code });
    const err = await h.host.waitFor('error');
    assert.equal(err.code, 'own-challenge');
  } finally {
    await h.teardown();
  }
});

test('joining an unknown code errors with no-challenge', async () => {
  const h = await startHarness();
  try {
    h.joiner.send({ type: 'challenge.join', code: 'NoSuch7' });
    const err = await h.joiner.waitFor('error');
    assert.equal(err.code, 'no-challenge');
  } finally {
    await h.teardown();
  }
});

test('cancel removes the challenge so a later join fails', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create' });
    const created = await h.host.waitFor('challenge.created');
    h.host.send({ type: 'challenge.cancel' });
    await h.host.waitFor('challenge.cancelled');

    h.joiner.send({ type: 'challenge.join', code: created.code });
    const err = await h.joiner.waitFor('error');
    assert.equal(err.code, 'no-challenge');
  } finally {
    await h.teardown();
  }
});

test('creating a second challenge replaces the first (old code invalid)', async () => {
  const h = await startHarness();
  try {
    h.host.send({ type: 'challenge.create', options: { color: 'W' } });
    const first = await h.host.waitFor('challenge.created');
    h.host.send({ type: 'challenge.create', options: { color: 'B' } });
    const second = await h.host.waitFor('challenge.created');
    assert.notEqual(first.code, second.code);

    h.joiner.send({ type: 'challenge.join', code: first.code });
    const err = await h.joiner.waitFor('error');
    assert.equal(err.code, 'no-challenge', 'the replaced code no longer works');
  } finally {
    await h.teardown();
  }
});

/** Form a friendly match between host(c1) and joiner(c2); return the matchId
 *  and which client is White. */
async function formMatch(h: Awaited<ReturnType<typeof startHarness>>) {
  h.host.send({ type: 'challenge.create', options: { color: 'W' } });
  const created = await h.host.waitFor('challenge.created');
  h.joiner.send({ type: 'challenge.join', code: created.code });
  const [hs] = await Promise.all([h.host.waitFor('match.start'), h.joiner.waitFor('match.start')]);
  return { matchId: hs.matchId };
}

test('spectate.list returns the active game with both seats + rank', async () => {
  const h = await startHarness();
  try {
    const { matchId } = await formMatch(h);
    h.c3.send({ type: 'spectate.list' });
    const list = await h.c3.waitFor('spectate.games');
    const game = list.games.find((g) => g.matchId === matchId);
    assert.ok(game, 'the active match appears in the list');
    assert.equal(game!.white.userId, h.hostId, 'host is White');
    assert.equal(game!.black.userId, h.joinerId, 'joiner is Black');
    assert.ok(game!.white.rank !== undefined, 'rank present on a seat');
    assert.equal(game!.moveCount, 0);
    assert.equal(game!.ranked, true);
  } finally {
    await h.teardown();
  }
});

test('spectate.watch yields spectate.started, then spectate.update after a move, then spectate.ended', async () => {
  const h = await startHarness();
  try {
    const { matchId } = await formMatch(h);

    h.c3.send({ type: 'spectate.watch', matchId });
    const started = await h.c3.waitFor('spectate.started');
    assert.equal(started.matchId, matchId);
    assert.equal(started.white.userId, h.hostId);
    assert.equal(started.black.userId, h.joinerId);
    assert.equal(started.state.moveCount, 0);

    // White (host) plays a real, server-legal opening move; spectator sees it.
    const opening = h.srv.manager.getMatch(matchId)!.legalMovesForCurrent()[0]!;
    h.host.send({ type: 'match.move', matchId, from: opening.from, to: opening.to });
    const upd = await h.c3.waitFor('spectate.update');
    assert.equal(upd.matchId, matchId);
    assert.ok(upd.lastMove, 'update carries the last move');
    assert.equal(upd.state.moveCount, 1);

    // Resignation ends the spectated game.
    h.host.send({ type: 'match.resign', matchId });
    const ended = await h.c3.waitFor('spectate.ended');
    assert.equal(ended.matchId, matchId);
    assert.equal(ended.reason, 'resignation');
    assert.equal(ended.winner, 'B', 'White resigned, Black wins');
  } finally {
    await h.teardown();
  }
});

test('spectate.watch on an unknown match errors with no-match', async () => {
  const h = await startHarness();
  try {
    h.c3.send({ type: 'spectate.watch', matchId: 'does-not-exist' });
    const err = await h.c3.waitFor('error');
    assert.equal(err.code, 'no-match');
  } finally {
    await h.teardown();
  }
});

test('a spectator cannot act in the match (move is rejected)', async () => {
  const h = await startHarness();
  try {
    const { matchId } = await formMatch(h);
    h.c3.send({ type: 'spectate.watch', matchId });
    await h.c3.waitFor('spectate.started');

    // Spectator attempts a real legal move -> still rejected (they hold no color).
    const opening = h.srv.manager.getMatch(matchId)!.legalMovesForCurrent()[0]!;
    h.c3.send({ type: 'match.move', matchId, from: opening.from, to: opening.to });
    const err = await h.c3.waitFor('error');
    assert.ok(['not-a-player', 'illegal-move', 'not-your-turn'].includes(err.code), `got ${err.code}`);
  } finally {
    await h.teardown();
  }
});

test('spectate.stop unsubscribes (no further updates)', async () => {
  const h = await startHarness();
  try {
    const { matchId } = await formMatch(h);
    h.c3.send({ type: 'spectate.watch', matchId });
    await h.c3.waitFor('spectate.started');
    h.c3.send({ type: 'spectate.stop', matchId });

    // Give the stop a beat to register, then make a move.
    await new Promise((r) => setTimeout(r, 50));
    const opening = h.srv.manager.getMatch(matchId)!.legalMovesForCurrent()[0]!;
    h.host.send({ type: 'match.move', matchId, from: opening.from, to: opening.to });

    // The mover (host) gets its own update; the stopped spectator must not.
    await h.host.waitFor('match.update');
    await assert.rejects(h.c3.waitFor('spectate.update', 300), /Timed out/);
  } finally {
    await h.teardown();
  }
});
