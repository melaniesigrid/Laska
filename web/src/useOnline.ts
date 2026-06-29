import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  legalMoves,
  applyMove,
  encodePosition,
  decodePosition,
  VARIANTS,
  LASKA,
  type GameState,
  type Move,
  type PlayerColor,
  type VariantId,
} from '../../src/index.ts';
import type { ServerMessage, MoveDTO, ClockDTO, EmoteId, RankDTO } from '../../server/src/net/protocol.ts';
import { CHAT_MAX_LEN } from '../../server/src/net/protocol.ts';
import { LaskaClient, type ConnStatus, type PublicUser, ApiError } from './net/client.ts';
import { track } from './analytics/index.ts';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080';
const WS_URL = API_BASE.replace(/^http/, 'ws') + '/ws';

export type OnlinePhase = 'idle' | 'queued' | 'matched' | 'ended';

export interface MatchInfo {
  matchId: string;
  myColor: PlayerColor;
  opponent: { userId: string; username: string; rating: number; rank: RankDTO };
  timeControl: { initialMs: number; incrementMs: number };
  /** The rule variant this match is played under (so the board sizes correctly). */
  variant: VariantId;
}

/** Per-side rating + rank movement from a finished ranked game (mirrors
 *  RatingChangeSideDTO; `rank.before`/`rank.after` drive the rank-up celebration). */
export interface RatingChangeSide {
  before: number;
  after: number;
  delta: number;
  rank: { before: RankDTO; after: RankDTO };
}

export interface EndInfo {
  result: string;
  reason: string;
  winner: PlayerColor | null;
  ratingChange: {
    white: RatingChangeSide;
    black: RatingChangeSide;
  } | null;
}

/** One rendered line in the in-match social feed — a chat message or an emote.
 *  `mine` is resolved against the local player's color so the UI can lateralize
 *  bubbles without re-deriving it on every render. */
export interface ChatEntry {
  id: string;
  kind: 'chat' | 'emote';
  fromColor: PlayerColor;
  fromName: string;
  mine: boolean;
  ts: number;
  text?: string;
  emote?: EmoteId;
}

/** Build a minimal GameState from a server position string (enough for legal-move
 *  generation and optimistic application; the server remains the authority). */
function stateFromPosition(position: string, variantId: VariantId = 'laska'): GameState {
  const variant = VARIANTS[variantId] ?? LASKA;
  const { board, toMove } = decodePosition(position, variant);
  const key = encodePosition({ board, toMove });
  return { board, toMove, plyNoProgress: 0, positionCounts: { [key]: 1 }, variant };
}

export function useOnline() {
  const clientRef = useRef<LaskaClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new LaskaClient(API_BASE, WS_URL);
  }
  const client = clientRef.current;

  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [phase, setPhase] = useState<OnlinePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [rendered, setRendered] = useState<GameState | null>(null); // optimistic
  const [authoritative, setAuthoritative] = useState<GameState | null>(null);
  const [clock, setClock] = useState<ClockDTO | null>(null);
  const clockAtRef = useRef<number>(0);
  const [, forceTick] = useState(0);
  const [lastMove, setLastMove] = useState<MoveDTO | null>(null);
  const [drawOfferBy, setDrawOfferBy] = useState<PlayerColor | null>(null);
  const [end, setEnd] = useState<EndInfo | null>(null);
  const pendingRef = useRef(false);
  // ---- social layer ----
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [rematchOfferBy, setRematchOfferBy] = useState<PlayerColor | null>(null);
  const [rematchSent, setRematchSent] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  // A monotonic id source for chat entries (the wire carries no per-line id).
  const chatSeqRef = useRef(0);

  // ---- server message handling ----
  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'auth.ok':
          setUser((u) =>
            u ? { ...u, rating: msg.rating, ratingDeviation: msg.ratingDeviation, rank: msg.rank } : u,
          );
          break;
        case 'queue.joined':
          setPhase('queued');
          setError(null);
          break;
        case 'queue.left':
          setPhase('idle');
          break;
        case 'match.start': {
          client.setCurrentMatch(msg.matchId);
          setMatch({
            matchId: msg.matchId,
            myColor: msg.color,
            opponent: msg.opponent,
            timeControl: msg.timeControl,
            variant: msg.state.variant,
          });
          const gs = stateFromPosition(msg.state.position, msg.state.variant);
          setAuthoritative(gs);
          setRendered(gs);
          setClock(msg.state.clock);
          clockAtRef.current = Date.now();
          setDrawOfferBy(msg.state.drawOfferBy);
          setLastMove(null);
          setEnd(null);
          setPhase('matched');
          pendingRef.current = false;
          // match.start also fires for a rematch — wipe the prior match's social
          // state so the fresh game starts with a clean feed and no stale offers.
          setChatLog([]);
          setRematchOfferBy(null);
          setRematchSent(false);
          setUnreadChat(0);
          chatSeqRef.current = 0;
          // Funnel: an online match began. (We don't have a clean per-user
          // "first move" hook online — the server is authoritative — so
          // match.started is the online activation signal.)
          track('match.started', { mode: 'online', color: msg.color });
          break;
        }
        case 'match.update': {
          // The server is authoritative: snap rendered state to it (this both
          // confirms our optimistic move and corrects any divergence).
          const gs = stateFromPosition(msg.state.position, msg.state.variant);
          setAuthoritative(gs);
          setRendered(gs);
          setClock(msg.state.clock);
          clockAtRef.current = Date.now();
          setDrawOfferBy(msg.state.drawOfferBy);
          if (msg.lastMove) setLastMove(msg.lastMove);
          pendingRef.current = false;
          break;
        }
        case 'match.end': {
          setEnd({
            result: msg.result,
            reason: msg.reason,
            winner: msg.winner,
            ratingChange: msg.ratingChange,
          });
          // Funnel: online match finished, scored from this client's seat.
          const myColor = match?.myColor;
          const outcome: 'win' | 'loss' | 'draw' =
            msg.winner == null ? 'draw' : myColor && msg.winner === myColor ? 'win' : 'loss';
          track('match.finished', {
            mode: 'online',
            outcome,
            reason: msg.reason,
            // Authoritative ply count lives server-side; not in match.end today.
            // Reported as 0 (unknown) rather than guessed — see protocol.ts.
            plies: 0,
          });
          setPhase('ended');
          setClock((c) => (c ? { ...c, running: null } : c));
          client.setCurrentMatch(null);
          // Refresh our rating + displayed rank.
          if (user && msg.ratingChange) {
            const mine = match?.myColor === 'W' ? msg.ratingChange.white : msg.ratingChange.black;
            setUser((u) => (u ? { ...u, rating: mine.after, rank: mine.rank.after } : u));
          }
          break;
        }
        case 'chat': {
          const mine = match?.myColor === msg.fromColor;
          const id = `c${chatSeqRef.current++}`;
          setChatLog((log) => [
            ...log,
            { id, kind: 'chat', fromColor: msg.fromColor, fromName: msg.fromName, mine, ts: msg.ts, text: msg.text },
          ]);
          if (!mine) setUnreadChat((n) => n + 1);
          break;
        }
        case 'emote': {
          const mine = match?.myColor === msg.fromColor;
          const id = `c${chatSeqRef.current++}`;
          setChatLog((log) => [
            ...log,
            { id, kind: 'emote', fromColor: msg.fromColor, fromName: msg.fromName, mine, ts: msg.ts, emote: msg.emote },
          ]);
          if (!mine) setUnreadChat((n) => n + 1);
          break;
        }
        case 'rematch.offered':
          setRematchOfferBy(msg.by);
          break;
        case 'rematch.declined':
          setRematchOfferBy(null);
          setRematchSent(false);
          break;
        case 'error':
          // A rejected move: roll the optimistic board back to authoritative.
          if (pendingRef.current) {
            pendingRef.current = false;
            setRendered(authoritative);
          }
          setError(msg.message);
          break;
        case 'pong':
        default:
          break;
      }
    },
    [client, authoritative, user, match],
  );

  useEffect(() => {
    client.setHandlers({ onMessage, onStatus: setStatus });
  }, [client, onMessage]);

  // Restore a saved session on mount.
  useEffect(() => {
    let cancelled = false;
    void client.restore().then((u) => {
      if (!cancelled && u) {
        setUser(u);
        client.connect();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Tick the displayed clock 4x/second while a side is running.
  useEffect(() => {
    if (!clock || clock.running == null || phase === 'ended') return;
    const id = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [clock, phase]);

  const displayClock = useMemo<ClockDTO | null>(() => {
    if (!clock) return null;
    if (clock.running == null || phase === 'ended') return clock;
    const elapsed = Date.now() - clockAtRef.current;
    return {
      whiteMs: clock.running === 'W' ? Math.max(0, clock.whiteMs - elapsed) : clock.whiteMs,
      blackMs: clock.running === 'B' ? Math.max(0, clock.blackMs - elapsed) : clock.blackMs,
      running: clock.running,
    };
  }, [clock, phase]);

  // ---- auth actions ----
  const withError = useCallback(async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }, []);

  const register = useCallback(
    (email: string, password: string, username: string) =>
      withError(async () => {
        setUser(await client.register(email, password, username));
        // Funnel: signup stage. Email/username are NOT sent to analytics — only
        // the method tag — keeping the event PII-free pre-consent.
        track('auth.signup_succeeded', { method: 'email' });
        client.connect();
      }),
    [client, withError],
  );
  const login = useCallback(
    (email: string, password: string) =>
      withError(async () => {
        setUser(await client.login(email, password));
        track('auth.login_succeeded', { method: 'email' });
        client.connect();
      }),
    [client, withError],
  );
  const guest = useCallback(
    () =>
      withError(async () => {
        setUser(await client.guest());
        track('auth.guest_started', {});
        client.connect();
      }),
    [client, withError],
  );
  // Wipe the in-match social state (chat feed + rematch offers + unread count).
  const resetSocial = useCallback(() => {
    setChatLog([]);
    setRematchOfferBy(null);
    setRematchSent(false);
    setUnreadChat(0);
    chatSeqRef.current = 0;
  }, []);

  const logout = useCallback(() => {
    client.logout();
    setUser(null);
    setPhase('idle');
    setMatch(null);
    setRendered(null);
    setEnd(null);
    resetSocial();
  }, [client, resetSocial]);

  // ---- match actions ----
  const joinQueue = useCallback(
    (variant: VariantId = 'laska') => {
      setError(null);
      setEnd(null);
      client.send(variant === 'laska' ? { type: 'queue.join' } : { type: 'queue.join', variant });
    },
    [client],
  );
  const leaveQueue = useCallback(() => client.send({ type: 'queue.leave' }), [client]);

  const submitMove = useCallback(
    (move: Move) => {
      if (!match || !rendered) return;
      // Optimistic: apply locally for instant feedback, then send.
      pendingRef.current = true;
      setRendered(applyMove(rendered, move));
      setLastMove({ from: move.from, to: move.to, captures: move.captures, by: match.myColor });
      const payload =
        move.captures.length > 0
          ? { type: 'match.move' as const, matchId: match.matchId, from: move.from, to: move.to, captures: move.captures }
          : { type: 'match.move' as const, matchId: match.matchId, from: move.from, to: move.to };
      client.send(payload);
    },
    [client, match, rendered],
  );

  const resign = useCallback(() => {
    if (match) client.send({ type: 'match.resign', matchId: match.matchId });
  }, [client, match]);
  const offerDraw = useCallback(() => {
    if (match) client.send({ type: 'match.offerDraw', matchId: match.matchId });
  }, [client, match]);
  const acceptDraw = useCallback(() => {
    if (match) client.send({ type: 'match.acceptDraw', matchId: match.matchId });
  }, [client, match]);

  const newOnlineGame = useCallback(() => {
    setPhase('idle');
    setMatch(null);
    setRendered(null);
    setAuthoritative(null);
    setEnd(null);
    setLastMove(null);
    setClock(null);
    resetSocial();
  }, [resetSocial]);

  // ---- social actions ----
  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!match || !trimmed) return;
      client.send({ type: 'match.chat', matchId: match.matchId, text: trimmed.slice(0, CHAT_MAX_LEN) });
    },
    [client, match],
  );
  const sendEmote = useCallback(
    (emote: EmoteId) => {
      if (match) client.send({ type: 'match.emote', matchId: match.matchId, emote });
    },
    [client, match],
  );
  const offerRematch = useCallback(() => {
    if (!match) return;
    client.send({ type: 'match.rematchOffer', matchId: match.matchId });
    setRematchSent(true);
  }, [client, match]);
  const declineRematch = useCallback(() => {
    if (match) client.send({ type: 'match.rematchDecline', matchId: match.matchId });
    setRematchSent(false);
    setRematchOfferBy(null);
  }, [client, match]);
  const declineDraw = useCallback(() => {
    if (match) client.send({ type: 'match.declineDraw', matchId: match.matchId });
  }, [client, match]);
  const markChatRead = useCallback(() => setUnreadChat(0), []);

  // Whose turn, and is it mine right now (based on optimistic state)?
  const myTurn = !!(rendered && match && rendered.toMove === match.myColor && phase === 'matched' && !pendingRef.current);

  // Legal moves for me when it's my turn.
  const legal = useMemo<Move[]>(() => {
    if (!myTurn || !rendered) return [];
    return legalMoves(rendered);
  }, [myTurn, rendered]);

  return {
    status,
    user,
    phase,
    error,
    match,
    gameState: rendered,
    clock: displayClock,
    lastMove,
    drawOfferBy,
    end,
    myTurn,
    legalMoves: legal,
    // social state
    chatLog,
    rematchOfferBy,
    rematchSent,
    unreadChat,
    // actions
    register,
    login,
    guest,
    logout,
    joinQueue,
    leaveQueue,
    submitMove,
    resign,
    offerDraw,
    acceptDraw,
    newOnlineGame,
    // social actions
    sendChat,
    sendEmote,
    offerRematch,
    declineRematch,
    declineDraw,
    markChatRead,
    clearError: () => setError(null),
  };
}
