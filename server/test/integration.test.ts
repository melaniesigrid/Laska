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

  close(): void {
    this.ws.close();
  }
}

test('two clients: auth, matchmaking, server-validated move, resign, ranked rating change', async () => {
  const srv = buildServer(TEST_CONFIG);
  await new Promise<void>((resolve) => srv.http.listen(0, resolve));
  const port = (srv.http.address() as AddressInfo).port;
  const wsUrl = `ws://localhost:${port}/ws`;

  // Create two registered users via the auth service (so the match is ranked).
  const alice = await srv.auth.registerWithEmail('alice@x.com', 'password123', 'alice');
  const bob = await srv.auth.registerWithEmail('bob@x.com', 'password123', 'bob');

  const ca = new TestClient(wsUrl);
  const cb = new TestClient(wsUrl);
  await Promise.all([ca.open(), cb.open()]);

  ca.send({ type: 'auth', token: alice.tokens.accessToken });
  cb.send({ type: 'auth', token: bob.tokens.accessToken });
  const [aOk, bOk] = await Promise.all([ca.waitFor('auth.ok'), cb.waitFor('auth.ok')]);
  assert.equal(aOk.username, 'alice');
  assert.equal(bOk.username, 'bob');

  // Both queue; the second join triggers the pairing.
  ca.send({ type: 'queue.join' });
  await ca.waitFor('queue.joined');
  cb.send({ type: 'queue.join' });
  await cb.waitFor('queue.joined');

  const [aStart, bStart] = await Promise.all([ca.waitFor('match.start'), cb.waitFor('match.start')]);
  assert.equal(aStart.matchId, bStart.matchId);
  assert.notEqual(aStart.color, bStart.color, 'players get opposite colors');

  const matchId = aStart.matchId;
  // Identify the white client and play a real, server-legal opening move.
  const whiteClient = aStart.color === 'W' ? ca : cb;
  const blackClient = aStart.color === 'W' ? cb : ca;

  const match = srv.manager.getMatch(matchId)!;
  const opening = match.legalMovesForCurrent()[0]!;

  // An illegal move is rejected and does not change the turn.
  whiteClient.send({ type: 'match.move', matchId, from: 0, to: 24 });
  const err = await whiteClient.waitFor('error');
  assert.equal(err.code, 'illegal-move');
  assert.equal(match.toMove, 'W', 'turn unchanged after a rejected move');

  // A legal move is accepted and broadcast to BOTH players authoritatively.
  whiteClient.send({ type: 'match.move', matchId, from: opening.from, to: opening.to });
  const [upA, upB] = await Promise.all([
    whiteClient.waitFor('match.update'),
    blackClient.waitFor('match.update'),
  ]);
  assert.equal(upA.state.toMove, 'B');
  assert.equal(upB.state.toMove, 'B');
  assert.equal(upA.lastMove?.by, 'W');
  assert.equal(upA.state.moveCount, 1);

  // White resigns; both get match.end and a ranked rating change is applied.
  whiteClient.send({ type: 'match.resign', matchId });
  const [endA, endB] = await Promise.all([
    whiteClient.waitFor('match.end'),
    blackClient.waitFor('match.end'),
  ]);
  assert.equal(endA.matchId, matchId);
  assert.equal(endA.winner, 'B');
  assert.equal(endA.result, '0-1');
  assert.ok(endA.ratingChange, 'ranked game produces a rating change');
  assert.ok(endB.ratingChange);
  // The winner (Black) gained, the loser (White) lost.
  assert.ok(endA.ratingChange!.black.delta > 0);
  assert.ok(endA.ratingChange!.white.delta < 0);

  // Persistence: ratings updated in the repo and a match record saved.
  const whiteId = aStart.color === 'W' ? alice.user.id : bob.user.id;
  const blackId = aStart.color === 'W' ? bob.user.id : alice.user.id;
  const updatedWhite = await srv.repo.getUserById(whiteId);
  const updatedBlack = await srv.repo.getUserById(blackId);
  assert.equal(updatedWhite!.ratedGames, 1);
  assert.equal(updatedBlack!.ratedGames, 1);
  assert.ok(updatedBlack!.rating > 1200);
  assert.ok(updatedWhite!.rating < 1200);

  const history = await srv.repo.getUserMatches(blackId, 10);
  assert.equal(history.length, 1);
  assert.equal(history[0]!.result, '0-1');
  assert.equal(history[0]!.endReason, 'resignation');

  const board = await srv.repo.topByRating(10);
  assert.equal(board[0]!.userId, blackId, 'winner tops the leaderboard');

  ca.close();
  cb.close();
  srv.gameServer.stop();
  await new Promise<void>((resolve) => srv.wss.close(() => resolve()));
  await new Promise<void>((resolve) => srv.http.close(() => resolve()));
});
