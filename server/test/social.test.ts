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

  /** Count messages of a type seen so far (drained from the inbox). */
  drain<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    const out = this.inbox.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
    this.inbox = this.inbox.filter((m) => m.type !== type);
    return out;
  }

  close(): void {
    this.ws.close();
  }
}

type Harness = Awaited<ReturnType<typeof startHarness>>;

/** Spin up a server, register two users, pair them, and return both clients
 *  identified by color plus their userIds and the matchId. */
async function startHarness() {
  const srv = buildServer(TEST_CONFIG);
  await new Promise<void>((resolve) => srv.http.listen(0, resolve));
  const port = (srv.http.address() as AddressInfo).port;
  const wsUrl = `ws://localhost:${port}/ws`;

  const u1 = await srv.auth.registerWithEmail(`a${port}@x.com`, 'password123', `alice${port}`);
  const u2 = await srv.auth.registerWithEmail(`b${port}@x.com`, 'password123', `bob${port}`);

  const c1 = new TestClient(wsUrl);
  const c2 = new TestClient(wsUrl);
  await Promise.all([c1.open(), c2.open()]);

  c1.send({ type: 'auth', token: u1.tokens.accessToken });
  c2.send({ type: 'auth', token: u2.tokens.accessToken });
  await Promise.all([c1.waitFor('auth.ok'), c2.waitFor('auth.ok')]);

  c1.send({ type: 'queue.join', timeControl: { initialMs: 120_000, incrementMs: 4_000 } });
  await c1.waitFor('queue.joined');
  c2.send({ type: 'queue.join', timeControl: { initialMs: 120_000, incrementMs: 4_000 } });
  await c2.waitFor('queue.joined');

  const [s1, s2] = await Promise.all([c1.waitFor('match.start'), c2.waitFor('match.start')]);
  const matchId = s1.matchId;

  const white = s1.color === 'W' ? c1 : c2;
  const black = s1.color === 'W' ? c2 : c1;
  const whiteId = s1.color === 'W' ? u1.user.id : u2.user.id;
  const blackId = s1.color === 'W' ? u2.user.id : u1.user.id;
  const whiteName = s1.color === 'W' ? `alice${port}` : `bob${port}`;

  async function teardown() {
    c1.close();
    c2.close();
    srv.gameServer.stop();
    await new Promise<void>((resolve) => srv.wss.close(() => resolve()));
    await new Promise<void>((resolve) => srv.http.close(() => resolve()));
  }

  return { srv, matchId, white, black, whiteId, blackId, whiteName, c1, c2, s1, s2, port, teardown };
}

test('chat relays to BOTH players with server-derived color and name', async () => {
  const h: Harness = await startHarness();
  try {
    h.white.send({ type: 'match.chat', matchId: h.matchId, text: '  hi   there  ' });
    const [forWhite, forBlack] = await Promise.all([h.white.waitFor('chat'), h.black.waitFor('chat')]);
    // Sender receives their own message too (server-authoritative ordering).
    assert.equal(forWhite.text, 'hi there', 'whitespace collapsed + trimmed');
    assert.equal(forBlack.text, 'hi there');
    assert.equal(forWhite.from, h.whiteId);
    assert.equal(forWhite.fromColor, 'W', 'color derived server-side');
    assert.equal(forWhite.fromName, h.whiteName, 'name looked up server-side');
    assert.equal(typeof forWhite.ts, 'number');
    assert.equal(forBlack.matchId, h.matchId);
  } finally {
    await h.teardown();
  }
});

test('a chat line that is empty after sanitization is dropped (no broadcast)', async () => {
  const h: Harness = await startHarness();
  try {
    h.white.send({ type: 'match.chat', matchId: h.matchId, text: '   \t  ' });
    // Follow with a valid line; the first valid chat we receive must be the second send.
    h.white.send({ type: 'match.chat', matchId: h.matchId, text: 'real' });
    const got = await h.black.waitFor('chat');
    assert.equal(got.text, 'real');
  } finally {
    await h.teardown();
  }
});

test('emote rejects an unknown id with an error and relays a valid one', async () => {
  const h: Harness = await startHarness();
  try {
    // Unknown id -> only the sender gets an error.
    h.white.send({ type: 'match.emote', matchId: h.matchId, emote: 'definitely-not-an-emote' });
    const err = await h.white.waitFor('error');
    assert.equal(err.code, 'bad-emote');

    // A valid id relays to both with the same server envelope.
    h.white.send({ type: 'match.emote', matchId: h.matchId, emote: 'gg' });
    const [ew, eb] = await Promise.all([h.white.waitFor('emote'), h.black.waitFor('emote')]);
    assert.equal(ew.emote, 'gg');
    assert.equal(eb.emote, 'gg');
    assert.equal(ew.fromColor, 'W');
    assert.equal(ew.from, h.whiteId);
  } finally {
    await h.teardown();
  }
});

test('over-rate chat is silently dropped (burst then throttle)', async () => {
  const h: Harness = await startHarness();
  try {
    // Burst is 5; fire 12 distinct lines back-to-back. Wait until at least the
    // burst has landed, then assert the limiter capped how many got through.
    for (let i = 0; i < 12; i++) {
      h.white.send({ type: 'match.chat', matchId: h.matchId, text: `line ${i}` });
    }
    // Block until the 5th line arrives at black, then give a settle window for
    // any (wrongly) un-throttled extras to show up too.
    for (let i = 0; i < 5; i++) await h.black.waitFor('chat');
    await new Promise((r) => setTimeout(r, 200));
    const whiteLines = h.black.drain('chat').filter((m) => m.from === h.whiteId);
    // 5 already consumed above; total relayed must not exceed the burst of 5.
    assert.equal(whiteLines.length, 0, `over-burst lines must be dropped, got ${whiteLines.length} extra`);
  } finally {
    await h.teardown();
  }
});

test('declineDraw clears a standing offer for both players', async () => {
  const h: Harness = await startHarness();
  try {
    // White offers a draw. BOTH players get a match.update with the offer set;
    // wait for both so neither stale update lingers in an inbox.
    h.white.send({ type: 'match.offerDraw', matchId: h.matchId });
    const [ow, ob] = await Promise.all([h.white.waitFor('match.update'), h.black.waitFor('match.update')]);
    assert.equal(ow.state.drawOfferBy, 'W');
    assert.equal(ob.state.drawOfferBy, 'W');

    // Black declines; both see the offer cleared.
    h.black.send({ type: 'match.declineDraw', matchId: h.matchId });
    const [uw, ub] = await Promise.all([h.white.waitFor('match.update'), h.black.waitFor('match.update')]);
    assert.equal(uw.state.drawOfferBy, null);
    assert.equal(ub.state.drawOfferBy, null);

    // Declining with no opponent offer is an illegal action (error to sender).
    h.white.send({ type: 'match.declineDraw', matchId: h.matchId });
    const err = await h.white.waitFor('error');
    assert.equal(err.code, 'illegal-move');
  } finally {
    await h.teardown();
  }
});

test('rematch: one offer notifies the opponent; two offers start a swapped-color match', async () => {
  const h: Harness = await startHarness();
  try {
    // End the match so a rematch window opens.
    h.white.send({ type: 'match.resign', matchId: h.matchId });
    await Promise.all([h.white.waitFor('match.end'), h.black.waitFor('match.end')]);

    // White offers a rematch -> only Black is notified, with the offerer's color.
    h.white.send({ type: 'match.rematchOffer', matchId: h.matchId });
    const offered = await h.black.waitFor('rematch.offered');
    assert.equal(offered.matchId, h.matchId);
    assert.equal(offered.by, 'W');

    // Black accepts (offers back) -> a brand-new match starts for both, colors swapped.
    h.black.send({ type: 'match.rematchOffer', matchId: h.matchId });
    const [ns1, ns2] = await Promise.all([h.white.waitFor('match.start'), h.black.waitFor('match.start')]);

    assert.notEqual(ns1.matchId, h.matchId, 'a fresh match id');
    assert.equal(ns1.matchId, ns2.matchId);
    // Colors are swapped: the previous White is now Black.
    assert.equal(ns1.color, 'B', 'previous White is now Black');
    assert.equal(ns2.color, 'W', 'previous Black is now White');
    // Same time control carried over.
    assert.equal(ns1.timeControl.initialMs, h.s1.timeControl.initialMs);
    assert.equal(ns1.timeControl.incrementMs, h.s1.timeControl.incrementMs);
    // Same variant.
    assert.equal(ns1.state.variant, h.s1.state.variant);
  } finally {
    await h.teardown();
  }
});

test('rematch decline notifies the opponent and closes the window', async () => {
  const h: Harness = await startHarness();
  try {
    h.white.send({ type: 'match.resign', matchId: h.matchId });
    await Promise.all([h.white.waitFor('match.end'), h.black.waitFor('match.end')]);

    h.white.send({ type: 'match.rematchOffer', matchId: h.matchId });
    await h.black.waitFor('rematch.offered');

    // Black declines -> White is told, window closes.
    h.black.send({ type: 'match.rematchDecline', matchId: h.matchId });
    const declined = await h.white.waitFor('rematch.declined');
    assert.equal(declined.matchId, h.matchId);

    // A subsequent offer to the closed window errors back to the sender.
    h.white.send({ type: 'match.rematchOffer', matchId: h.matchId });
    const err = await h.white.waitFor('error');
    assert.ok(err.code === 'no-rematch' || err.code === 'no-match');
  } finally {
    await h.teardown();
  }
});
