import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryBroker } from '../src/cluster/memory.ts';
import type { NodeEnvelope, QueueMember } from '../src/cluster/types.ts';

function member(userId: string, rating: number, nodeId: string, now = 1_000_000): QueueMember {
  return { userId, rating, nodeId, joinedAt: now };
}

test('formPairings pairs close-rated members and removes them from the shared queue', async () => {
  const broker = new InMemoryBroker();
  const n1 = broker.attach('n1');
  await n1.enqueue(member('a', 1500, 'n1'));
  await n1.enqueue(member('b', 1520, 'n1'));
  const pairs = await n1.formPairings(1_000_000);
  assert.equal(pairs.length, 1);
  assert.deepEqual(new Set([pairs[0]![0].userId, pairs[0]![1].userId]), new Set(['a', 'b']));
  assert.equal(await n1.isQueued('a'), false);
  assert.equal(await n1.isQueued('b'), false);
});

test('two nodes share ONE queue; either node can form the pair', async () => {
  const broker = new InMemoryBroker();
  const n1 = broker.attach('n1');
  const n2 = broker.attach('n2');
  await n1.enqueue(member('a', 1500, 'n1'));
  await n2.enqueue(member('b', 1510, 'n2'));
  // n2 forms the pairing; the queue is shared so it sees n1's member.
  const pairs = await n2.formPairings(1_000_000);
  assert.equal(pairs.length, 1);
  // And n1 now sees an empty shared queue.
  assert.equal(await n1.formPairings(1_000_000).then((p) => p.length), 0);
});

test('only one node wins a member: no double-pairing across nodes', async () => {
  const broker = new InMemoryBroker();
  const n1 = broker.attach('n1');
  const n2 = broker.attach('n2');
  await n1.enqueue(member('a', 1500, 'n1'));
  await n1.enqueue(member('b', 1500, 'n1'));
  const fromN1 = await n1.formPairings(1_000_000);
  const fromN2 = await n2.formPairings(1_000_000);
  assert.equal(fromN1.length + fromN2.length, 1, 'the pair is formed exactly once');
});

test('deliverToUser routes a message to the node hosting the user', async () => {
  const broker = new InMemoryBroker();
  const n1 = broker.attach('n1');
  const n2 = broker.attach('n2');
  const n1Inbox: NodeEnvelope[] = [];
  const n2Inbox: NodeEnvelope[] = [];
  n1.onEnvelope((e) => n1Inbox.push(e));
  n2.onEnvelope((e) => n2Inbox.push(e));

  // User "bob" is connected to n2.
  await n2.setPresence('bob');
  // n1 wants to message bob — it should arrive on n2.
  await n1.deliverToUser('bob', { type: 'pong' });
  assert.equal(n1Inbox.length, 0);
  assert.equal(n2Inbox.length, 1);
  assert.deepEqual(n2Inbox[0], { kind: 'deliver', userId: 'bob', msg: { type: 'pong' } });
});

test('match ownership + user index resolve across nodes; sendAction reaches the owner', async () => {
  const broker = new InMemoryBroker();
  const n1 = broker.attach('n1');
  const n2 = broker.attach('n2');
  const ownerInbox: NodeEnvelope[] = [];
  n1.onEnvelope((e) => ownerInbox.push(e));

  // n1 owns match m1 between alice (white) and bob (black).
  await n1.registerMatch('m1', 'alice', 'bob');
  assert.equal(await n2.matchOwner('m1'), 'n1');
  assert.equal(await n2.userMatch('bob'), 'm1');

  // n2 forwards bob's resign action to the owner n1.
  await n2.sendAction('n1', { type: 'resign', matchId: 'm1', userId: 'bob' });
  assert.equal(ownerInbox.length, 1);
  assert.deepEqual(ownerInbox[0], { kind: 'action', action: { type: 'resign', matchId: 'm1', userId: 'bob' } });

  await n1.unregisterMatch('m1', 'alice', 'bob');
  assert.equal(await n2.matchOwner('m1'), null);
  assert.equal(await n2.userMatch('bob'), null);
});

test('clearPresence only clears when it still points at the clearing node', async () => {
  const broker = new InMemoryBroker();
  const n1 = broker.attach('n1');
  const n2 = broker.attach('n2');
  await n1.setPresence('u');
  // u reconnects on n2.
  await n2.setPresence('u');
  // n1's stale disconnect must NOT clear u's (now n2) presence.
  await n1.clearPresence('u');
  const inbox: NodeEnvelope[] = [];
  n2.onEnvelope((e) => inbox.push(e));
  await n1.deliverToUser('u', { type: 'pong' });
  assert.equal(inbox.length, 1, 'presence still resolves to n2');
});
