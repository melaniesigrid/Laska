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

  const [s1] = await Promise.all([c1.waitFor('match.start'), c2.waitFor('match.start')]);
  const matchId = s1.matchId;

  const white = s1.color === 'W' ? c1 : c2;
  const black = s1.color === 'W' ? c2 : c1;
  // The token for whichever user is BLACK (used to reconnect black in the presence test).
  const blackToken = s1.color === 'W' ? u2.tokens.accessToken : u1.tokens.accessToken;

  async function teardown() {
    c1.close();
    c2.close();
    srv.gameServer.stop();
    await new Promise<void>((resolve) => srv.wss.close(() => resolve()));
    await new Promise<void>((resolve) => srv.http.close(() => resolve()));
  }

  return { srv, matchId, white, black, blackToken, c1, c2, wsUrl, port, teardown };
}

test('match.typing reaches ONLY the opponent, with the sender color, and is not echoed back', async () => {
  const h: Harness = await startHarness();
  try {
    h.white.send({ type: 'match.typing', matchId: h.matchId, typing: true });
    const got = await h.black.waitFor('typing');
    assert.equal(got.matchId, h.matchId);
    assert.equal(got.by, 'W', 'color derived from the authenticated socket, not the client claim');
    assert.equal(got.typing, true);

    // Settle window: the sender must NOT receive an echo of their own typing.
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(h.white.drain('typing').length, 0, 'typing must not echo to the sender');

    // typing:false flows the same way (still only to the opponent).
    h.white.send({ type: 'match.typing', matchId: h.matchId, typing: false });
    const stopped = await h.black.waitFor('typing');
    assert.equal(stopped.by, 'W');
    assert.equal(stopped.typing, false);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(h.white.drain('typing').length, 0);
  } finally {
    await h.teardown();
  }
});

test('opponent presence: socket close yields online:false, reconnect yields online:true', async () => {
  const h: Harness = await startHarness();
  try {
    // Black's connection drops -> White is told the opponent went offline.
    h.black.close();
    const offline = await h.white.waitFor('presence');
    assert.equal(offline.matchId, h.matchId);
    assert.equal(offline.color, 'B', 'whose presence changed, derived from the match');
    assert.equal(offline.online, false);

    // Black reconnects (fresh socket, same account) -> White is told online again.
    const black2 = new TestClient(h.wsUrl);
    await black2.open();
    black2.send({ type: 'auth', token: h.blackToken });
    await black2.waitFor('auth.ok');
    // On reconnect black also resyncs its own state; that is unrelated to White.
    await black2.waitFor('match.update');

    const online = await h.white.waitFor('presence');
    assert.equal(online.color, 'B');
    assert.equal(online.online, true);
    black2.close();
  } finally {
    await h.teardown();
  }
});

test('presence: only the opponent is notified (the leaver gets nothing), and color is server-derived', async () => {
  const h: Harness = await startHarness();
  try {
    // White leaves -> Black hears online:false for color W. White receives no presence.
    h.white.close();
    const offline = await h.black.waitFor('presence');
    assert.equal(offline.color, 'W');
    assert.equal(offline.online, false);
  } finally {
    await h.teardown();
  }
});
