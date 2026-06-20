/**
 * Multi-node integration against a REAL Redis. Two server nodes share a live
 * Redis cluster fabric (separate connections + pub/sub) plus one repository.
 * Players on different nodes are matched and play across the cluster — the same
 * scenario as multinode.test.ts, but every cross-node hop goes through Redis.
 *
 * Skipped unless REDIS_URL is set. The test FLUSHES the target Redis DB, so
 * point it at a throwaway instance/DB, e.g.:
 *   REDIS_URL=redis://127.0.0.1:6390/0 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createClient, type RedisClientType } from 'redis';
import { buildServer } from '../src/index.ts';
import { InMemoryRepository } from '../src/storage/memory.ts';
import { RedisCluster } from '../src/cluster/redis.ts';
import type { ServerMessage } from '../src/net/protocol.ts';

const REDIS_URL = process.env.REDIS_URL;
const skip = REDIS_URL ? false : 'set REDIS_URL to run the Redis integration test';

const CONFIG = {
  port: 0,
  accessSecret: 'redis-access',
  refreshSecret: 'redis-refresh',
  startingRating: 1200,
  usingDefaultSecrets: false,
  db: { kind: 'memory' as const },
  cluster: { kind: 'redis' as const },
  nodeId: 'unused',
};

class TestClient {
  ws: WebSocket;
  private inbox: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as ServerMessage;
      const i = this.waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(msg);
      else this.inbox.push(msg);
    });
  }
  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
    });
  }
  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }
  waitFor<T extends ServerMessage['type']>(type: T, timeoutMs = 5000): Promise<Extract<ServerMessage, { type: T }>> {
    const pred = (m: ServerMessage) => m.type === type;
    const i = this.inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
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

test('Redis cluster: two nodes match cross-node and play through Redis pub/sub', { skip }, async () => {
  // Clean slate on the target DB.
  const admin = createClient({ url: REDIS_URL! }) as RedisClientType;
  await admin.connect();
  await admin.flushDb();

  const node1 = await RedisCluster.create(REDIS_URL!, 'rnode-1');
  const node2 = await RedisCluster.create(REDIS_URL!, 'rnode-2');
  const repo = new InMemoryRepository();
  const srv1 = buildServer(CONFIG, repo, node1);
  const srv2 = buildServer(CONFIG, repo, node2);

  await new Promise<void>((r) => srv1.http.listen(0, r));
  await new Promise<void>((r) => srv2.http.listen(0, r));
  const url1 = `ws://localhost:${(srv1.http.address() as AddressInfo).port}/ws`;
  const url2 = `ws://localhost:${(srv2.http.address() as AddressInfo).port}/ws`;

  const alice = await srv1.auth.registerWithEmail('alice@redis.com', 'password123', 'redis_alice');
  const bob = await srv1.auth.registerWithEmail('bob@redis.com', 'password123', 'redis_bob');

  // Alice on node 1, Bob on node 2.
  const ca = new TestClient(url1);
  const cb = new TestClient(url2);
  await Promise.all([ca.open(), cb.open()]);
  ca.send({ type: 'auth', token: alice.tokens.accessToken });
  cb.send({ type: 'auth', token: bob.tokens.accessToken });
  await Promise.all([ca.waitFor('auth.ok'), cb.waitFor('auth.ok')]);

  // Queue both; the pairing is formed via the shared Redis queue + lock.
  ca.send({ type: 'queue.join' });
  await ca.waitFor('queue.joined');
  cb.send({ type: 'queue.join' });
  await cb.waitFor('queue.joined');

  const [aStart, bStart] = await Promise.all([ca.waitFor('match.start'), cb.waitFor('match.start')]);
  const matchId = aStart.matchId;
  assert.equal(aStart.matchId, bStart.matchId);
  assert.notEqual(aStart.color, bStart.color);

  // The match is owned by exactly one node; ownership resolves through Redis.
  const owner = await node1.matchOwner(matchId);
  assert.ok(owner === 'rnode-1' || owner === 'rnode-2');
  const ownerSrv = owner === 'rnode-1' ? srv1 : srv2;
  const ownerMatch = ownerSrv.manager.getMatch(matchId)!;
  assert.ok(ownerMatch, 'the owning node holds the authoritative match');

  // White moves; the update is broadcast to both players through Redis pub/sub.
  const opening = ownerMatch.legalMovesForCurrent()[0]!;
  const whiteClient = aStart.color === 'W' ? ca : cb;
  const blackClient = aStart.color === 'W' ? cb : ca;
  whiteClient.send({ type: 'match.move', matchId, from: opening.from, to: opening.to });
  const [upA, upB] = await Promise.all([whiteClient.waitFor('match.update'), blackClient.waitFor('match.update')]);
  assert.equal(upA.state.toMove, 'B');
  assert.equal(upB.state.toMove, 'B');
  assert.equal(upA.lastMove?.by, 'W');

  // Resign ends the game; both nodes' players get the result + ranked Elo.
  whiteClient.send({ type: 'match.resign', matchId });
  const [endA, endB] = await Promise.all([whiteClient.waitFor('match.end'), blackClient.waitFor('match.end')]);
  assert.equal(endA.matchId, matchId);
  assert.ok(endA.ratingChange && endB.ratingChange);

  // Ownership released cluster-wide (resolved via Redis from the OTHER node).
  assert.equal(await node2.matchOwner(matchId), null);
  assert.equal(await node2.userMatch(alice.user.id), null);

  // Ratings persisted in the shared repository.
  const updated = await repo.getUserById(bob.user.id);
  assert.equal(updated?.ratedGames, 1);

  // Teardown.
  srv1.gameServer.stop();
  srv2.gameServer.stop();
  ca.close();
  cb.close();
  // Let the server-side socket-close handlers drain their cluster ops before we
  // close the Redis connections under them.
  await new Promise((r) => setTimeout(r, 150));
  await Promise.all([
    new Promise<void>((r) => srv1.wss.close(() => r())),
    new Promise<void>((r) => srv2.wss.close(() => r())),
  ]);
  await Promise.all([
    new Promise<void>((r) => srv1.http.close(() => r())),
    new Promise<void>((r) => srv2.http.close(() => r())),
  ]);
  await node1.close();
  await node2.close();
  await admin.flushDb();
  await admin.quit();
});
