/**
 * Real-time game server, node-aware so it can run as one of several nodes
 * behind a shared cluster fabric. Server-authoritative throughout — clients send
 * intents, the owning node validates with the engine and broadcasts state.
 *
 * Cross-node model (see ../cluster):
 *   - Presence maps a user to the node holding their socket.
 *   - Matchmaking is a shared queue; the node that forms a pairing OWNS the
 *     resulting match (its `MatchManager` holds the authoritative state).
 *   - A move from a player on another node is forwarded to the owner; the owner
 *     processes it and broadcasts `match.update`/`match.end` back to both players
 *     via the fabric (which routes each message to the right node's sockets).
 *
 * With the in-memory single-node broker this collapses to exactly the previous
 * behavior (everything is local), so existing tests are unchanged.
 */
import type { WebSocket } from 'ws';
import type { Repository } from '../storage/types.ts';
import { AuthService } from '../auth/service.ts';
import { MatchManager } from '../game/manager.ts';
import { Match, type MatchEndInfo } from '../game/match.ts';
import type { Cluster, MatchAction, NodeEnvelope, QueueMember } from '../cluster/types.ts';
import {
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
  type MatchStateDTO,
  type MoveDTO,
} from './protocol.ts';

interface Conn {
  ws: WebSocket;
  userId: string | null;
}

export class GameServer {
  private conns = new Set<Conn>();
  private userSockets = new Map<string, Set<WebSocket>>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private repo: Repository,
    private auth: AuthService,
    private manager: MatchManager,
    private cluster: Cluster,
  ) {
    // Inbound from the fabric: deliver messages to our sockets, or process a
    // match action forwarded to us because we own the match.
    this.cluster.onEnvelope((env: NodeEnvelope) => {
      if (env.kind === 'deliver') this.deliverLocally(env.userId, env.msg);
      else void this.applyActionLocally(env.action);
    });
  }

  start(intervalMs = 1000): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => void this.tick(), intervalMs);
    if (typeof this.tickTimer.unref === 'function') this.tickTimer.unref();
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  handleConnection(ws: WebSocket): void {
    const conn: Conn = { ws, userId: null };
    this.conns.add(conn);
    ws.on('message', (data: unknown) => {
      const raw = typeof data === 'string' ? data : String(data);
      void this.onMessage(conn, raw);
    });
    ws.on('close', () => void this.onClose(conn));
    ws.on('error', () => void this.onClose(conn));
  }

  private async onClose(conn: Conn): Promise<void> {
    this.conns.delete(conn);
    if (!conn.userId) return;
    const set = this.userSockets.get(conn.userId);
    if (set) {
      set.delete(conn.ws);
      if (set.size === 0) {
        this.userSockets.delete(conn.userId);
        // No more local sockets for this user: drop presence + queue entry. An
        // active match keeps running on its clock so a reconnect can resume (or
        // the opponent wins on time / abandonment via the clock tick).
        // Tolerate the fabric being mid-shutdown (e.g. during server teardown).
        try {
          await this.cluster.clearPresence(conn.userId);
          await this.cluster.dequeue(conn.userId);
        } catch {
          /* cluster closing or transient fabric error — nothing to clean up */
        }
      }
    }
  }

  /** Send straight to one socket (pre-auth replies, auth.ok, queue acks). */
  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  /** Deliver to a user's sockets ON THIS NODE (called from a 'deliver' envelope). */
  private deliverLocally(userId: string, msg: ServerMessage): void {
    const set = this.userSockets.get(userId);
    if (!set) return;
    for (const ws of set) this.send(ws, msg);
  }

  /** Route a message to a user wherever they are connected. */
  private sendToUser(userId: string, msg: ServerMessage): Promise<void> {
    return this.cluster.deliverToUser(userId, msg);
  }

  private async onMessage(conn: Conn, raw: string): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) return this.send(conn.ws, { type: 'error', code: 'bad-message', message: 'Malformed message' });

    if (msg.type === 'auth') return this.onAuth(conn, msg);
    if (msg.type === 'ping') return this.send(conn.ws, { type: 'pong' });

    if (!conn.userId) {
      return this.send(conn.ws, { type: 'error', code: 'unauthenticated', message: 'Send auth first' });
    }
    const userId = conn.userId;

    switch (msg.type) {
      case 'queue.join':
        return this.onQueueJoin(conn, msg);
      case 'queue.leave':
        await this.cluster.dequeue(userId);
        return this.send(conn.ws, { type: 'queue.left' });
      case 'match.move': {
        const action: MatchAction = msg.captures
          ? { type: 'move', matchId: msg.matchId, userId, from: msg.from, to: msg.to, captures: msg.captures }
          : { type: 'move', matchId: msg.matchId, userId, from: msg.from, to: msg.to };
        return this.dispatchAction(action);
      }
      case 'match.resign':
        return this.dispatchAction({ type: 'resign', matchId: msg.matchId, userId });
      case 'match.offerDraw':
        return this.dispatchAction({ type: 'offerDraw', matchId: msg.matchId, userId });
      case 'match.acceptDraw':
        return this.dispatchAction({ type: 'acceptDraw', matchId: msg.matchId, userId });
      case 'match.sync':
        return this.dispatchAction({ type: 'sync', matchId: msg.matchId, userId });
      default:
        return this.send(conn.ws, { type: 'error', code: 'unknown-type', message: 'Unknown message type' });
    }
  }

  private async onAuth(conn: Conn, msg: Extract<ClientMessage, { type: 'auth' }>): Promise<void> {
    let user;
    try {
      ({ user } = await this.auth.authenticate(msg.token));
    } catch {
      return this.send(conn.ws, { type: 'error', code: 'auth-failed', message: 'Invalid or expired token' });
    }
    conn.userId = user.id;
    let set = this.userSockets.get(user.id);
    if (!set) {
      set = new Set();
      this.userSockets.set(user.id, set);
    }
    set.add(conn.ws);
    await this.cluster.setPresence(user.id);
    this.send(conn.ws, { type: 'auth.ok', userId: user.id, username: user.username, rating: user.rating });

    // Reconnect resync: if the user has an active match (possibly owned by
    // another node), ask the owner to resend the authoritative state.
    const matchId = await this.cluster.userMatch(user.id);
    if (matchId) await this.dispatchAction({ type: 'sync', matchId, userId: user.id });
  }

  private async onQueueJoin(conn: Conn, msg: Extract<ClientMessage, { type: 'queue.join' }>): Promise<void> {
    const userId = conn.userId!;
    if (await this.cluster.userMatch(userId)) {
      return this.send(conn.ws, { type: 'error', code: 'already-in-match', message: 'Finish your current match first' });
    }
    const user = await this.repo.getUserById(userId);
    if (!user) return;
    const member: QueueMember = msg.timeControl
      ? { userId, rating: user.rating, nodeId: this.cluster.nodeId, joinedAt: Date.now(), timeControl: msg.timeControl }
      : { userId, rating: user.rating, nodeId: this.cluster.nodeId, joinedAt: Date.now() };
    await this.cluster.enqueue(member);
    this.send(conn.ws, { type: 'queue.joined' });
    await this.drainMatchmaking();
  }

  private async drainMatchmaking(): Promise<void> {
    const pairs = await this.cluster.formPairings(Date.now());
    for (const [a, b] of pairs) {
      // Random color assignment.
      const aIsWhite = Math.random() < 0.5;
      const white = aIsWhite ? a : b;
      const black = aIsWhite ? b : a;
      const tc = white.timeControl ?? black.timeControl;
      const match = this.manager.createMatch(white.userId, black.userId, {
        ranked: true,
        ...(tc ? { timeControl: tc } : {}),
      });
      await this.cluster.registerMatch(match.id, match.whiteId, match.blackId);
      await this.announceStart(match);
    }
  }

  private async announceStart(match: Match): Promise<void> {
    const white = await this.repo.getUserById(match.whiteId);
    const black = await this.repo.getUserById(match.blackId);
    if (!white || !black) return;
    const state = this.stateDTO(match);
    await this.sendToUser(match.whiteId, {
      type: 'match.start',
      matchId: match.id,
      color: 'W',
      opponent: { userId: black.id, username: black.username, rating: black.rating },
      timeControl: match.timeControl,
      state,
    });
    await this.sendToUser(match.blackId, {
      type: 'match.start',
      matchId: match.id,
      color: 'B',
      opponent: { userId: white.id, username: white.username, rating: white.rating },
      timeControl: match.timeControl,
      state,
    });
  }

  /** Route a match action to its owning node (or process locally if we own it). */
  private async dispatchAction(action: MatchAction): Promise<void> {
    const owner = await this.cluster.matchOwner(action.matchId);
    if (!owner) {
      return this.sendToUser(action.userId, { type: 'error', code: 'no-match', message: 'Match not found' });
    }
    if (owner === this.cluster.nodeId) return this.applyActionLocally(action);
    return this.cluster.sendAction(owner, action);
  }

  /** Authoritative processing — only ever runs on the node that owns the match. */
  private async applyActionLocally(action: MatchAction): Promise<void> {
    const match = this.manager.getMatch(action.matchId);
    if (!match) {
      return this.sendToUser(action.userId, { type: 'error', code: 'no-match', message: 'Match not found' });
    }
    try {
      switch (action.type) {
        case 'move': {
          const mover = match.colorOf(action.userId)!; // color about to move, captured before apply
          const intent = action.captures
            ? { from: action.from, to: action.to, captures: action.captures }
            : { from: action.from, to: action.to };
          const { move, ended } = match.submitMove(action.userId, intent);
          await this.broadcastUpdate(match, { from: move.from, to: move.to, captures: move.captures, by: mover });
          if (ended) await this.finishAndBroadcast(match.id, ended);
          break;
        }
        case 'resign':
          await this.finishAndBroadcast(match.id, match.resign(action.userId));
          break;
        case 'offerDraw':
          match.offerDraw(action.userId);
          await this.broadcastUpdate(match, null);
          break;
        case 'acceptDraw':
          await this.finishAndBroadcast(match.id, match.acceptDraw(action.userId));
          break;
        case 'sync':
          await this.sendToUser(action.userId, { type: 'match.update', state: this.stateDTO(match), lastMove: null });
          break;
      }
    } catch (e) {
      await this.sendToUser(action.userId, {
        type: 'error',
        code: (e as { code?: string }).code ?? 'action-failed',
        message: (e as Error).message,
      });
    }
  }

  private stateDTO(match: Match): MatchStateDTO {
    return {
      matchId: match.id,
      position: match.encoded(),
      toMove: match.toMove,
      clock: match.clockState(),
      drawOfferBy: match.pendingDrawOfferBy,
      moveCount: match.moveCount,
    };
  }

  private async broadcastUpdate(match: Match, lastMove: MoveDTO | null): Promise<void> {
    const state = this.stateDTO(match);
    await this.sendToUser(match.whiteId, { type: 'match.update', state, lastMove });
    await this.sendToUser(match.blackId, { type: 'match.update', state, lastMove });
  }

  private async finishAndBroadcast(matchId: string, end: MatchEndInfo): Promise<void> {
    const match = this.manager.getMatch(matchId);
    const whiteId = match?.whiteId;
    const blackId = match?.blackId;
    const summary = await this.manager.finalize(matchId, end);
    const msg: ServerMessage = {
      type: 'match.end',
      matchId,
      result: end.result,
      reason: end.reason,
      winner: end.winner,
      ratingChange: summary.ratingChange,
    };
    if (whiteId) await this.sendToUser(whiteId, msg);
    if (blackId) await this.sendToUser(blackId, msg);
    if (whiteId && blackId) await this.cluster.unregisterMatch(matchId, whiteId, blackId);
  }

  /** Periodic: form pairings whose windows have grown, and enforce clocks on the
   *  matches THIS node owns. */
  private async tick(): Promise<void> {
    await this.drainMatchmaking();
    const now = Date.now();
    for (const match of this.manager.activeMatches()) {
      const end = match.checkTimeout(now);
      if (end) await this.finishAndBroadcast(match.id, end);
    }
  }
}
