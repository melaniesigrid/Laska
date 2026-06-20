/**
 * Redis-backed cluster fabric — makes the game server genuinely multi-process /
 * multi-node. Same `Cluster` contract as the in-memory broker.
 *
 *   - Matchmaking queue: a Redis HASH `mm:members` (userId -> member JSON).
 *     Pairing is guarded by a short-lived lock so only one node pairs at a time.
 *   - Presence / ownership: plain keys (`presence:<user>`, `match:owner:<id>`,
 *     `user:match:<user>`).
 *   - Messaging: pub/sub, one channel per node (`node:<nodeId>`); a duplicate
 *     connection subscribes to this node's channel.
 *
 * Only constructed when `LASKA_CLUSTER=redis` / `REDIS_URL` is set, so SQLite /
 * memory dev never needs Redis or the `redis` driver at runtime. Exercised by an
 * integration test that is skipped unless `REDIS_URL` is present.
 */
import { createClient, type RedisClientType } from 'redis';
import { findPairing, DEFAULT_MATCHMAKING, type MatchmakingConfig } from '../game/matchmaking.ts';
import type { ServerMessage } from '../net/protocol.ts';
import type { Cluster, MatchAction, NodeEnvelope, QueueMember } from './types.ts';

const MEMBERS_KEY = 'mm:members';
const LOCK_KEY = 'mm:lock';
const presenceKey = (userId: string) => `presence:${userId}`;
const ownerKey = (matchId: string) => `match:owner:${matchId}`;
const userMatchKey = (userId: string) => `user:match:${userId}`;
const nodeChannel = (nodeId: string) => `node:${nodeId}`;

const COMPARE_AND_DEL = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export class RedisCluster implements Cluster {
  private handler: ((env: NodeEnvelope) => void) | null = null;
  /** Envelopes that arrived before onEnvelope() set the handler. */
  private buffer: NodeEnvelope[] = [];

  private constructor(
    public readonly nodeId: string,
    private client: RedisClientType,
    private sub: RedisClientType,
    private config: MatchmakingConfig,
  ) {}

  static async create(
    url: string,
    nodeId: string,
    config: MatchmakingConfig = DEFAULT_MATCHMAKING,
  ): Promise<RedisCluster> {
    const client = createClient({ url }) as RedisClientType;
    await client.connect();
    const sub = client.duplicate() as RedisClientType;
    await sub.connect();
    const instance = new RedisCluster(nodeId, client, sub, config);
    // Subscribe up-front so no cross-node message is missed before the
    // GameServer attaches its handler (any early arrivals are buffered).
    await sub.subscribe(nodeChannel(nodeId), (message: string) => instance.dispatch(message));
    return instance;
  }

  private dispatch(message: string): void {
    let env: NodeEnvelope;
    try {
      env = JSON.parse(message) as NodeEnvelope;
    } catch {
      return;
    }
    if (this.handler) this.handler(env);
    else this.buffer.push(env);
  }

  async setPresence(userId: string): Promise<void> {
    await this.client.set(presenceKey(userId), this.nodeId);
  }
  async clearPresence(userId: string): Promise<void> {
    await this.client.eval(COMPARE_AND_DEL, { keys: [presenceKey(userId)], arguments: [this.nodeId] });
  }

  async enqueue(member: QueueMember): Promise<void> {
    await this.client.hSet(MEMBERS_KEY, member.userId, JSON.stringify(member));
  }
  async dequeue(userId: string): Promise<void> {
    await this.client.hDel(MEMBERS_KEY, userId);
  }
  async isQueued(userId: string): Promise<boolean> {
    return (await this.client.hExists(MEMBERS_KEY, userId)) === true;
  }

  async formPairings(now: number): Promise<[QueueMember, QueueMember][]> {
    // Only one node pairs at a time. Non-blocking: if we can't get the lock,
    // another node is pairing — we return nothing and try again on the next tick.
    const token = `${this.nodeId}:${now}:${Math.random()}`;
    const got = await this.client.set(LOCK_KEY, token, { NX: true, PX: 3000 });
    if (got !== 'OK') return [];
    try {
      const raw = await this.client.hGetAll(MEMBERS_KEY);
      const members: QueueMember[] = Object.values(raw).map((v) => JSON.parse(v) as QueueMember);
      const pairs: [QueueMember, QueueMember][] = [];
      let pool = members;
      let p = findPairing(pool, this.config, now);
      while (p) {
        await this.client.hDel(MEMBERS_KEY, p.a.userId);
        await this.client.hDel(MEMBERS_KEY, p.b.userId);
        pairs.push([p.a as QueueMember, p.b as QueueMember]);
        pool = pool.filter((m) => m.userId !== p!.a.userId && m.userId !== p!.b.userId);
        p = findPairing(pool, this.config, now);
      }
      return pairs;
    } finally {
      await this.client.eval(COMPARE_AND_DEL, { keys: [LOCK_KEY], arguments: [token] });
    }
  }

  async registerMatch(matchId: string, whiteId: string, blackId: string): Promise<void> {
    await Promise.all([
      this.client.set(ownerKey(matchId), this.nodeId),
      this.client.set(userMatchKey(whiteId), matchId),
      this.client.set(userMatchKey(blackId), matchId),
    ]);
  }
  async matchOwner(matchId: string): Promise<string | null> {
    return this.client.get(ownerKey(matchId));
  }
  async userMatch(userId: string): Promise<string | null> {
    return this.client.get(userMatchKey(userId));
  }
  async unregisterMatch(matchId: string, whiteId: string, blackId: string): Promise<void> {
    await Promise.all([
      this.client.del(ownerKey(matchId)),
      this.client.eval(COMPARE_AND_DEL, { keys: [userMatchKey(whiteId)], arguments: [matchId] }),
      this.client.eval(COMPARE_AND_DEL, { keys: [userMatchKey(blackId)], arguments: [matchId] }),
    ]);
  }

  async deliverToUser(userId: string, msg: ServerMessage): Promise<void> {
    const node = await this.client.get(presenceKey(userId));
    if (!node) return;
    const env: NodeEnvelope = { kind: 'deliver', userId, msg };
    await this.client.publish(nodeChannel(node), JSON.stringify(env));
  }
  async sendAction(ownerNodeId: string, action: MatchAction): Promise<void> {
    const env: NodeEnvelope = { kind: 'action', action };
    await this.client.publish(nodeChannel(ownerNodeId), JSON.stringify(env));
  }

  onEnvelope(handler: (env: NodeEnvelope) => void): void {
    this.handler = handler;
    // Flush anything that arrived before the handler was attached.
    const pending = this.buffer;
    this.buffer = [];
    for (const env of pending) handler(env);
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.sub.quit(), this.client.quit()]);
  }
}
