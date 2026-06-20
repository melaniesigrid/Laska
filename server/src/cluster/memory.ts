/**
 * In-memory cluster broker. A single shared object that multiple `Cluster` node
 * handles attach to. Because JavaScript is single-threaded and these operations
 * have no internal awaits, pairing is naturally atomic — no lock needed.
 *
 * Used for:
 *   - single-node deployments (one broker, one node) — behaves exactly like the
 *     old in-process matchmaker/manager wiring; and
 *   - tests that simulate several nodes sharing one fabric (attach N nodes).
 */
import {
  findPairing,
  DEFAULT_MATCHMAKING,
  type MatchmakingConfig,
} from '../game/matchmaking.ts';
import type { ServerMessage } from '../net/protocol.ts';
import type { Cluster, MatchAction, NodeEnvelope, QueueMember } from './types.ts';

export class InMemoryBroker {
  private queue: QueueMember[] = [];
  private presence = new Map<string, string>(); // userId -> nodeId
  private owners = new Map<string, string>(); // matchId -> nodeId
  private userMatchMap = new Map<string, string>(); // userId -> matchId
  private handlers = new Map<string, (env: NodeEnvelope) => void>(); // nodeId -> inbound handler

  constructor(private config: MatchmakingConfig = DEFAULT_MATCHMAKING) {}

  /** Create a node handle bound to `nodeId`. */
  attach(nodeId: string): Cluster {
    return new InMemoryCluster(this, nodeId);
  }

  // ---- internals used by the node handles ----
  _registerHandler(nodeId: string, handler: (env: NodeEnvelope) => void): void {
    this.handlers.set(nodeId, handler);
  }
  _detach(nodeId: string): void {
    this.handlers.delete(nodeId);
  }
  _setPresence(userId: string, nodeId: string): void {
    this.presence.set(userId, nodeId);
  }
  _clearPresence(userId: string, nodeId: string): void {
    if (this.presence.get(userId) === nodeId) this.presence.delete(userId);
  }
  _enqueue(member: QueueMember): void {
    this._dequeue(member.userId);
    this.queue.push(member);
  }
  _dequeue(userId: string): void {
    this.queue = this.queue.filter((m) => m.userId !== userId);
  }
  _isQueued(userId: string): boolean {
    return this.queue.some((m) => m.userId === userId);
  }
  _formPairings(now: number): [QueueMember, QueueMember][] {
    const pairs: [QueueMember, QueueMember][] = [];
    let p = findPairing(this.queue, this.config, now);
    while (p) {
      this._dequeue(p.a.userId);
      this._dequeue(p.b.userId);
      // findPairing returns the same objects we passed in, which are QueueMembers.
      pairs.push([p.a as QueueMember, p.b as QueueMember]);
      p = findPairing(this.queue, this.config, now);
    }
    return pairs;
  }
  _registerMatch(matchId: string, whiteId: string, blackId: string, nodeId: string): void {
    this.owners.set(matchId, nodeId);
    this.userMatchMap.set(whiteId, matchId);
    this.userMatchMap.set(blackId, matchId);
  }
  _matchOwner(matchId: string): string | null {
    return this.owners.get(matchId) ?? null;
  }
  _userMatch(userId: string): string | null {
    return this.userMatchMap.get(userId) ?? null;
  }
  _unregisterMatch(matchId: string, whiteId: string, blackId: string): void {
    this.owners.delete(matchId);
    if (this.userMatchMap.get(whiteId) === matchId) this.userMatchMap.delete(whiteId);
    if (this.userMatchMap.get(blackId) === matchId) this.userMatchMap.delete(blackId);
  }
  _deliverToUser(userId: string, msg: ServerMessage): void {
    const node = this.presence.get(userId);
    if (!node) return;
    this.handlers.get(node)?.({ kind: 'deliver', userId, msg });
  }
  _sendAction(ownerNodeId: string, action: MatchAction): void {
    this.handlers.get(ownerNodeId)?.({ kind: 'action', action });
  }
}

class InMemoryCluster implements Cluster {
  constructor(
    private broker: InMemoryBroker,
    public readonly nodeId: string,
  ) {}

  async setPresence(userId: string): Promise<void> {
    this.broker._setPresence(userId, this.nodeId);
  }
  async clearPresence(userId: string): Promise<void> {
    this.broker._clearPresence(userId, this.nodeId);
  }
  async enqueue(member: QueueMember): Promise<void> {
    this.broker._enqueue(member);
  }
  async dequeue(userId: string): Promise<void> {
    this.broker._dequeue(userId);
  }
  async isQueued(userId: string): Promise<boolean> {
    return this.broker._isQueued(userId);
  }
  async formPairings(now: number): Promise<[QueueMember, QueueMember][]> {
    return this.broker._formPairings(now);
  }
  async registerMatch(matchId: string, whiteId: string, blackId: string): Promise<void> {
    this.broker._registerMatch(matchId, whiteId, blackId, this.nodeId);
  }
  async matchOwner(matchId: string): Promise<string | null> {
    return this.broker._matchOwner(matchId);
  }
  async userMatch(userId: string): Promise<string | null> {
    return this.broker._userMatch(userId);
  }
  async unregisterMatch(matchId: string, whiteId: string, blackId: string): Promise<void> {
    this.broker._unregisterMatch(matchId, whiteId, blackId);
  }
  async deliverToUser(userId: string, msg: ServerMessage): Promise<void> {
    this.broker._deliverToUser(userId, msg);
  }
  async sendAction(ownerNodeId: string, action: MatchAction): Promise<void> {
    this.broker._sendAction(ownerNodeId, action);
  }
  onEnvelope(handler: (env: NodeEnvelope) => void): void {
    this.broker._registerHandler(this.nodeId, handler);
  }
  async close(): Promise<void> {
    this.broker._detach(this.nodeId);
  }
}
