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
import { RateLimiter } from './rateLimiter.ts';
import {
  parseClientMessage,
  isEmoteId,
  CHAT_MAX_LEN,
  type ClientMessage,
  type ServerMessage,
  type MatchStateDTO,
  type MoveDTO,
} from './protocol.ts';
import type { PlayerColor, VariantId } from '../../../src/index.ts';
import type { TimeControl } from '../game/match.ts';

interface Conn {
  ws: WebSocket;
  userId: string | null;
}

/**
 * A rematch window kept alive on the owning node after a match finishes, so
 * rematch actions still route to us (the cluster registration is held open for
 * `REMATCH_WINDOW_MS`). Captures everything we need to spin up the next match,
 * since the finished `Match` object is removed from the manager at finalize.
 */
interface RematchWindow {
  matchId: string;
  whiteId: string;
  blackId: string;
  variant: VariantId;
  timeControl: TimeControl;
  /** Colors that have offered a rematch so far. */
  offered: Set<PlayerColor>;
  /** Wall-clock deadline after which the window expires. */
  deadline: number;
}

/** How long after a match ends a rematch can still be offered/accepted. */
const REMATCH_WINDOW_MS = 60_000;
/** Per-(user, match) chat/emote burst allowance. */
const CHAT_BURST = 5;
/** Sustained chat/emote rate: ~1 message per second over the window. */
const CHAT_WINDOW_MS = 5_000;

export class GameServer {
  private conns = new Set<Conn>();
  private userSockets = new Map<string, Set<WebSocket>>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  /** Throttles chat + emote, keyed by `${matchId}:${userId}`. Burst then sustained. */
  private chatLimiter = new RateLimiter({ max: CHAT_BURST, windowMs: CHAT_WINDOW_MS });
  /** Open rematch windows on THIS node, keyed by the finished match id. */
  private rematchWindows = new Map<string, RematchWindow>();

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
        // Best-effort: if this user was party to an open rematch window, close it
        // and let the still-present opponent know the offer is off.
        await this.abandonRematchWindows(conn.userId);
      }
    }
  }

  /** Tear down any rematch windows this (now-gone) user was part of. */
  private async abandonRematchWindows(userId: string): Promise<void> {
    for (const win of [...this.rematchWindows.values()]) {
      if (win.whiteId !== userId && win.blackId !== userId) continue;
      const opponentId = win.whiteId === userId ? win.blackId : win.whiteId;
      this.closeRematchWindow(win);
      try {
        await this.sendToUser(opponentId, { type: 'rematch.declined', matchId: win.matchId });
      } catch {
        /* fabric closing — nothing to clean up */
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
      case 'match.declineDraw':
        return this.dispatchAction({ type: 'declineDraw', matchId: msg.matchId, userId });
      case 'match.sync':
        return this.dispatchAction({ type: 'sync', matchId: msg.matchId, userId });
      // ---- social ----
      case 'match.chat':
        return this.dispatchAction({ type: 'chat', matchId: msg.matchId, userId, text: msg.text });
      case 'match.emote':
        return this.dispatchAction({ type: 'emote', matchId: msg.matchId, userId, emote: msg.emote });
      case 'match.rematchOffer':
        return this.dispatchAction({ type: 'rematchOffer', matchId: msg.matchId, userId });
      case 'match.rematchDecline':
        return this.dispatchAction({ type: 'rematchDecline', matchId: msg.matchId, userId });
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
    const member: QueueMember = {
      userId,
      rating: user.rating,
      nodeId: this.cluster.nodeId,
      joinedAt: Date.now(),
      ...(msg.timeControl ? { timeControl: msg.timeControl } : {}),
      ...(msg.variant ? { variant: msg.variant } : {}),
    };
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
      // Both members are in the same variant bucket (findPairing guarantees it).
      const variant = white.variant ?? black.variant;
      const match = this.manager.createMatch(white.userId, black.userId, {
        ranked: true,
        ...(tc ? { timeControl: tc } : {}),
        ...(variant ? { variant } : {}),
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
    // Rematch actions target a FINISHED match: it is unregistered from the
    // cluster, but the owning node still holds a transient rematch window in
    // memory. If that window is here, process it locally. (Single-node — what
    // production runs — always lands here. Cross-node degrades gracefully: the
    // window lives on the node that finished the match; if a rematch action
    // arrives elsewhere we cannot route it and reply with a friendly error.)
    if (action.type === 'rematchOffer' || action.type === 'rematchDecline') {
      if (this.rematchWindows.has(action.matchId)) return this.applyActionLocally(action);
      if (action.type === 'rematchOffer') {
        return this.sendToUser(action.userId, { type: 'error', code: 'no-rematch', message: 'Rematch window has closed' });
      }
      return; // a decline with no window is a no-op
    }

    const owner = await this.cluster.matchOwner(action.matchId);
    if (!owner) {
      return this.sendToUser(action.userId, { type: 'error', code: 'no-match', message: 'Match not found' });
    }
    if (owner === this.cluster.nodeId) return this.applyActionLocally(action);
    return this.cluster.sendAction(owner, action);
  }

  /** Authoritative processing — only ever runs on the node that owns the match. */
  private async applyActionLocally(action: MatchAction): Promise<void> {
    // Rematch actions operate on the post-game window, not the live Match, so
    // they are handled before the active-match lookup.
    if (action.type === 'rematchOffer') return this.handleRematchOffer(action.matchId, action.userId);
    if (action.type === 'rematchDecline') return this.handleRematchDecline(action.matchId, action.userId);

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
        case 'declineDraw':
          match.declineDraw(action.userId);
          await this.broadcastUpdate(match, null);
          break;
        case 'sync':
          await this.sendToUser(action.userId, { type: 'match.update', state: this.stateDTO(match), lastMove: null });
          break;
        case 'chat':
          await this.handleChat(match, action.userId, action.text);
          break;
        case 'emote':
          await this.handleEmote(match, action.userId, action.emote);
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

  // ---- social: chat + emote --------------------------------------------

  /** Returns false (and silently drops) when the sender is over their rate. */
  private withinChatRate(matchId: string, userId: string): boolean {
    return this.chatLimiter.check(`${matchId}:${userId}`).allowed;
  }

  /**
   * Normalize a client chat line: trim, drop ASCII control chars, collapse
   * whitespace runs, and cap length. Returns null if nothing remains. We do NOT
   * HTML-escape — the client renders chat as text, not markup.
   */
  private sanitizeChat(text: unknown): string | null {
    if (typeof text !== 'string') return null;
    const cleaned = text
      // Replace ASCII control chars (0x00-0x1F and 0x7F, incl. tabs/newlines)
      // with spaces, then collapse whitespace runs.
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, CHAT_MAX_LEN);
    return cleaned.length > 0 ? cleaned : null;
  }

  private async handleChat(match: Match, userId: string, rawText: string): Promise<void> {
    const color = match.colorOf(userId);
    if (!color) {
      return this.sendToUser(userId, { type: 'error', code: 'not-a-player', message: 'You are not a player in this match' });
    }
    const text = this.sanitizeChat(rawText);
    if (!text) return; // empty after normalization — silently drop
    if (!this.withinChatRate(match.id, userId)) return; // over-rate — silently drop
    const fromName = (await this.repo.getUserById(userId))?.username ?? 'Player';
    const dto = { type: 'chat' as const, matchId: match.id, from: userId, fromColor: color, fromName, ts: Date.now(), text };
    await this.sendToUser(match.whiteId, dto);
    await this.sendToUser(match.blackId, dto);
  }

  private async handleEmote(match: Match, userId: string, emote: unknown): Promise<void> {
    const color = match.colorOf(userId);
    if (!color) {
      return this.sendToUser(userId, { type: 'error', code: 'not-a-player', message: 'You are not a player in this match' });
    }
    if (!isEmoteId(emote)) {
      return this.sendToUser(userId, { type: 'error', code: 'bad-emote', message: 'Unknown emote' });
    }
    if (!this.withinChatRate(match.id, userId)) return; // shares the chat limiter
    const fromName = (await this.repo.getUserById(userId))?.username ?? 'Player';
    const dto = { type: 'emote' as const, matchId: match.id, from: userId, fromColor: color, fromName, ts: Date.now(), emote };
    await this.sendToUser(match.whiteId, dto);
    await this.sendToUser(match.blackId, dto);
  }

  // ---- rematch lifecycle -----------------------------------------------

  /** Tear down a rematch window (the match was already unregistered at finish). */
  private closeRematchWindow(win: RematchWindow): void {
    this.rematchWindows.delete(win.matchId);
  }

  private async handleRematchOffer(matchId: string, userId: string): Promise<void> {
    const win = this.rematchWindows.get(matchId);
    if (!win) {
      return this.sendToUser(userId, { type: 'error', code: 'no-rematch', message: 'Rematch window has closed' });
    }
    const color: PlayerColor | null =
      userId === win.whiteId ? 'W' : userId === win.blackId ? 'B' : null;
    if (!color) {
      return this.sendToUser(userId, { type: 'error', code: 'not-a-player', message: 'You are not a player in this match' });
    }
    win.offered.add(color);
    const opponentId = color === 'W' ? win.blackId : win.whiteId;

    if (win.offered.has('W') && win.offered.has('B')) {
      // Both sides in — start a fresh match with colors swapped, same settings.
      const newMatch = this.manager.createMatch(win.blackId, win.whiteId, {
        ranked: true,
        timeControl: win.timeControl,
        variant: win.variant,
      });
      await this.cluster.registerMatch(newMatch.id, newMatch.whiteId, newMatch.blackId);
      this.closeRematchWindow(win);
      await this.announceStart(newMatch);
      return;
    }

    // Only one side so far — notify the opponent of the standing offer.
    await this.sendToUser(opponentId, { type: 'rematch.offered', matchId, by: color });
  }

  private async handleRematchDecline(matchId: string, userId: string): Promise<void> {
    const win = this.rematchWindows.get(matchId);
    if (!win) return; // window already gone — nothing to decline
    const isPlayer = userId === win.whiteId || userId === win.blackId;
    if (!isPlayer) {
      return this.sendToUser(userId, { type: 'error', code: 'not-a-player', message: 'You are not a player in this match' });
    }
    const opponentId = userId === win.whiteId ? win.blackId : win.whiteId;
    this.closeRematchWindow(win);
    await this.sendToUser(opponentId, { type: 'rematch.declined', matchId });
  }

  private stateDTO(match: Match): MatchStateDTO {
    return {
      matchId: match.id,
      position: match.encoded(),
      toMove: match.toMove,
      clock: match.clockState(),
      drawOfferBy: match.pendingDrawOfferBy,
      moveCount: match.moveCount,
      variant: match.variantId,
    };
  }

  private async broadcastUpdate(match: Match, lastMove: MoveDTO | null): Promise<void> {
    const state = this.stateDTO(match);
    await this.sendToUser(match.whiteId, { type: 'match.update', state, lastMove });
    await this.sendToUser(match.blackId, { type: 'match.update', state, lastMove });
  }

  private async finishAndBroadcast(matchId: string, end: MatchEndInfo): Promise<void> {
    const match = this.manager.getMatch(matchId);
    // Capture rematch settings BEFORE finalize removes the Match.
    const whiteId = match?.whiteId;
    const blackId = match?.blackId;
    const variant = match?.variantId;
    const timeControl = match?.timeControl;
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

    // Release the match cluster-wide so the user->match index frees up (the
    // players can re-queue immediately) and ownership stops resolving here.
    if (whiteId && blackId) await this.cluster.unregisterMatch(matchId, whiteId, blackId);

    // Open a rematch window on THIS node (the owner that just finished the
    // match). Rematch actions are routed to this node locally — see
    // dispatchAction — so we don't need to keep the cluster registration alive.
    // The window is torn down on accept/decline/leave or by expiry in tick().
    if (whiteId && blackId && variant && timeControl) {
      this.rematchWindows.set(matchId, {
        matchId,
        whiteId,
        blackId,
        variant,
        timeControl,
        offered: new Set(),
        deadline: Date.now() + REMATCH_WINDOW_MS,
      });
    }
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
    // Expire stale rematch windows: notify any still-waiting offerer's opponent
    // that the offer lapsed.
    for (const win of [...this.rematchWindows.values()]) {
      if (now < win.deadline) continue;
      this.closeRematchWindow(win);
      for (const color of win.offered) {
        const opponentId = color === 'W' ? win.blackId : win.whiteId;
        await this.sendToUser(opponentId, { type: 'rematch.declined', matchId: win.matchId });
      }
    }
  }
}
