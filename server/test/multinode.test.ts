/**
 * Two server NODES sharing one cluster broker + one repository. Players connect
 * to DIFFERENT nodes, get matched across the cluster, and play a move that is
 * forwarded to the owning node and broadcast back to both — proving the server
 * is no longer single-node-bound.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { buildServer } from '../src/index.ts';
import { InMemoryRepository } from '../src/storage/memory.ts';
import { InMemoryBroker } from '../src/cluster/memory.ts';
import type { ServerMessage } from '../src/net/protocol.ts';

const BASE_CONFIG = {
  port: 0,
  accessSecret: 'mn-access',
  refreshSecret: 'mn-refresh',
  startingRating: 1200,
  usingDefaultSecrets: false,
  db: { kind: 'memory' as const },
  cluster: { kind: 'memory' as const },
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
  waitFor<T extends ServerMessage['type']>(type: T, timeoutMs = 3000): Promise<Extract<ServerMessage, { type: T }>> {
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

test('players on two different nodes are matched and play a move across the cluster', async () => {
  // One shared broker + one shared repository; two nodes attached to the broker.
  const broker = new InMemoryBroker();
  const repo = new InMemoryRepository();
  const node1 = broker.attach('node-1');
  const node2 = broker.attach('node-2');
  const srv1 = buildServer(BASE_CONFIG, repo, node1);
  const srv2 = buildServer(BASE_CONFIG, repo, node2);

  await new Promise<void>((r) => srv1.http.listen(0, r));
  await new Promise<void>((r) => srv2.http.listen(0, r));
  const url1 = `ws://localhost:${(srv1.http.address() as AddressInfo).port}/ws`;
  const url2 = `ws://localhost:${(srv2.http.address() as AddressInfo).port}/ws`;

  const alice = await srv1.auth.registerWithEmail('alice@mn.com', 'password123', 'mn_alice');
  const bob = await srv1.auth.registerWithEmail('bob@mn.com', 'password123', 'mn_bob');

  // Alice connects to NODE 1, Bob connects to NODE 2.
  const ca = new TestClient(url1);
  const cb = new TestClient(url2);
  await Promise.all([ca.open(), cb.open()]);
  ca.send({ type: 'auth', token: alice.tokens.accessToken });
  cb.send({ type: 'auth', token: bob.tokens.accessToken });
  await Promise.all([ca.waitFor('auth.ok'), cb.waitFor('auth.ok')]);

  // Both queue; Bob's join (node 2) forms the cross-node pairing.
  ca.send({ type: 'queue.join' });
  await ca.waitFor('queue.joined');
  cb.send({ type: 'queue.join' });
  await cb.waitFor('queue.joined');

  const [aStart, bStart] = await Promise.all([ca.waitFor('match.start'), cb.waitFor('match.start')]);
  const matchId = aStart.matchId;
  assert.equal(aStart.matchId, bStart.matchId);
  assert.notEqual(aStart.color, bStart.color);

  // The match is owned by exactly ONE node (node-2, which formed the pairing):
  // it exists in srv2's manager but NOT srv1's. So any move by the player on
  // node 1 MUST be forwarded across the cluster.
  assert.ok(srv2.manager.getMatch(matchId), 'node-2 owns the match');
  assert.equal(srv1.manager.getMatch(matchId), undefined, 'node-1 does not hold the match');

  // White plays a legal opening move (from the owner's authoritative state).
  const ownerMatch = srv2.manager.getMatch(matchId)!;
  const opening = ownerMatch.legalMovesForCurrent()[0]!;
  const whiteClient = aStart.color === 'W' ? ca : cb;
  const blackClient = aStart.color === 'W' ? cb : ca;

  whiteClient.send({ type: 'match.move', matchId, from: opening.from, to: opening.to });
  const [upA, upB] = await Promise.all([whiteClient.waitFor('match.update'), blackClient.waitFor('match.update')]);
  assert.equal(upA.state.toMove, 'B');
  assert.equal(upB.state.toMove, 'B');
  assert.equal(upA.lastMove?.by, 'W');

  // An illegal move from the cross-node player is still rejected by the owner,
  // and the error is routed back to that player's node.
  const offNodePlayer = aStart.color === 'W' ? cb : ca; // the black player
  offNodePlayer.send({ type: 'match.move', matchId, from: 0, to: 24 });
  // It is black's turn now, so this is the right player but an illegal target.
  const err = await offNodePlayer.waitFor('error');
  assert.equal(err.code, 'illegal-move');

  // Resign ends the game cluster-wide; both nodes' players get match.end + Elo.
  whiteClient.send({ type: 'match.resign', matchId });
  const [endA, endB] = await Promise.all([whiteClient.waitFor('match.end'), blackClient.waitFor('match.end')]);
  assert.equal(endA.winner, blackClient === ca ? aStart.color : bStart.color);
  assert.ok(endA.ratingChange && endB.ratingChange);

  // Match ownership is released cluster-wide after it ends.
  assert.equal(await node1.matchOwner(matchId), null);
  assert.equal(await node1.userMatch(alice.user.id), null);

  ca.close();
  cb.close();
  srv1.gameServer.stop();
  srv2.gameServer.stop();
  await new Promise<void>((r) => srv1.wss.close(() => r()));
  await new Promise<void>((r) => srv2.wss.close(() => r()));
  await new Promise<void>((r) => srv1.http.close(() => r()));
  await new Promise<void>((r) => srv2.http.close(() => r()));
});

test('a player reconnecting to a DIFFERENT node resyncs the in-progress match', async () => {
  const broker = new InMemoryBroker();
  const repo = new InMemoryRepository();
  const srv1 = buildServer(BASE_CONFIG, repo, broker.attach('node-1'));
  const srv2 = buildServer(BASE_CONFIG, repo, broker.attach('node-2'));
  await new Promise<void>((r) => srv1.http.listen(0, r));
  await new Promise<void>((r) => srv2.http.listen(0, r));
  const url1 = `ws://localhost:${(srv1.http.address() as AddressInfo).port}/ws`;
  const url2 = `ws://localhost:${(srv2.http.address() as AddressInfo).port}/ws`;

  const alice = await srv1.auth.registerWithEmail('a2@mn.com', 'password123', 'mn_alice2');
  const bob = await srv1.auth.registerWithEmail('b2@mn.com', 'password123', 'mn_bob2');

  // Both start on node 1 to get matched there.
  const ca = new TestClient(url1);
  const cb = new TestClient(url1);
  await Promise.all([ca.open(), cb.open()]);
  ca.send({ type: 'auth', token: alice.tokens.accessToken });
  cb.send({ type: 'auth', token: bob.tokens.accessToken });
  await Promise.all([ca.waitFor('auth.ok'), cb.waitFor('auth.ok')]);
  ca.send({ type: 'queue.join' });
  await ca.waitFor('queue.joined');
  cb.send({ type: 'queue.join' });
  await Promise.all([ca.waitFor('match.start'), cb.waitFor('match.start')]);

  // Alice drops and reconnects to NODE 2. On auth she should be resynced the
  // authoritative match state (owned by node 1) via cross-node sync.
  ca.close();
  const caReconnect = new TestClient(url2);
  await caReconnect.open();
  caReconnect.send({ type: 'auth', token: alice.tokens.accessToken });
  await caReconnect.waitFor('auth.ok');
  const resync = await caReconnect.waitFor('match.update');
  assert.ok(resync.state.matchId, 'reconnect on a different node resyncs the match');

  caReconnect.close();
  cb.close();
  srv1.gameServer.stop();
  srv2.gameServer.stop();
  await new Promise<void>((r) => srv1.wss.close(() => r()));
  await new Promise<void>((r) => srv2.wss.close(() => r()));
  await new Promise<void>((r) => srv1.http.close(() => r()));
  await new Promise<void>((r) => srv2.http.close(() => r()));
  void bob;
});
