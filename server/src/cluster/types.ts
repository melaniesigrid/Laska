/**
 * Cluster fabric: the abstraction that lets the game server run on more than one
 * node. It owns the three pieces of cross-node state/coordination:
 *
 *   1. Presence    — which node currently holds a user's socket(s).
 *   2. Matchmaking — a SHARED queue + atomic pairing across all nodes.
 *   3. Match owner — which node runs a given match's authoritative state, plus
 *                    a user -> match index so a reconnect on any node can resync.
 *
 * Plus a messaging primitive so any node can deliver a `ServerMessage` to a user
 * regardless of which node hosts them, and forward a match action to the node
 * that owns the match.
 *
 * The in-memory implementation (memory.ts) is a single shared broker — used for
 * single-node runs and for deterministically testing the multi-node logic. The
 * Redis implementation (redis.ts) makes it actually multi-node/multi-process.
 */
import type { VariantId } from '../../../src/index.ts';
import type { EmoteId, ServerMessage } from '../net/protocol.ts';
import type { TimeControl } from '../game/match.ts';

export interface QueueMember {
  userId: string;
  rating: number;
  /** The node where this user is connected (so the pairing node can route). */
  nodeId: string;
  joinedAt: number;
  timeControl?: TimeControl;
  /** Rule variant queued for; absent means Laska. Only same-variant members pair. */
  variant?: VariantId;
}

/** A match action forwarded to the owning node for authoritative processing. */
export type MatchAction =
  | { type: 'move'; matchId: string; userId: string; from: number; to: number; captures?: number[] }
  | { type: 'resign'; matchId: string; userId: string }
  | { type: 'offerDraw'; matchId: string; userId: string }
  | { type: 'acceptDraw'; matchId: string; userId: string }
  | { type: 'declineDraw'; matchId: string; userId: string }
  | { type: 'sync'; matchId: string; userId: string }
  // ---- social ----
  | { type: 'chat'; matchId: string; userId: string; text: string }
  | { type: 'emote'; matchId: string; userId: string; emote: EmoteId }
  | { type: 'rematchOffer'; matchId: string; userId: string }
  | { type: 'rematchDecline'; matchId: string; userId: string };

/** What flows on a node's inbound channel. */
export type NodeEnvelope =
  | { kind: 'deliver'; userId: string; msg: ServerMessage }
  | { kind: 'action'; action: MatchAction };

export interface Cluster {
  readonly nodeId: string;

  // ---- presence ----
  setPresence(userId: string): Promise<void>;
  /** Clear this user's presence only if it currently points at this node. */
  clearPresence(userId: string): Promise<void>;

  // ---- matchmaking (shared queue) ----
  enqueue(member: QueueMember): Promise<void>;
  dequeue(userId: string): Promise<void>;
  isQueued(userId: string): Promise<boolean>;
  /**
   * Atomically form and REMOVE as many acceptable pairings as possible. Only one
   * node pairs at a time (the in-memory broker is single-threaded; Redis uses a
   * lock), so a user is never double-paired. The calling node owns the matches
   * it forms here.
   */
  formPairings(now: number): Promise<[QueueMember, QueueMember][]>;

  // ---- match ownership / user index ----
  registerMatch(matchId: string, whiteId: string, blackId: string): Promise<void>;
  matchOwner(matchId: string): Promise<string | null>;
  /** The match a user is currently in (any node), for cross-node reconnect. */
  userMatch(userId: string): Promise<string | null>;
  unregisterMatch(matchId: string, whiteId: string, blackId: string): Promise<void>;

  // ---- messaging ----
  /** Deliver a message to a user wherever they are connected. */
  deliverToUser(userId: string, msg: ServerMessage): Promise<void>;
  /** Forward a match action to the node that owns the match. */
  sendAction(ownerNodeId: string, action: MatchAction): Promise<void>;

  /** Register this node's inbound handler (deliver to sockets / process actions). */
  onEnvelope(handler: (env: NodeEnvelope) => void): void;

  close(): Promise<void>;
}
