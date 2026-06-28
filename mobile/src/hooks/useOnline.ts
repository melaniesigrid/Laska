/**
 * Online ranked play state machine — a native port of web/src/useOnline.ts.
 *
 * The server is authoritative for every move. We apply moves optimistically for
 * instant feedback, then snap to the authoritative `match.update`; a rejected
 * move (`error` while a move is pending) rolls back to the last authoritative
 * state. The engine is the single source of truth for legal moves — never
 * re-implemented here.
 *
 * Differences from the web hook:
 *   - endpoints are injected (Expo `Constants.extra`) rather than read from
 *     `import.meta.env`;
 *   - the native client loads tokens asynchronously, so session restore is
 *     `init()` → `restore()`;
 *   - no analytics seam on mobile yet, so the web `track(...)` calls are omitted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  legalMoves,
  applyMove,
  encodePosition,
  decodePosition,
  moveStepBoards,
  matchLegalMove,
  type Board,
  type GameState,
  type Move,
  type PlayerColor,
} from '../engine/index.ts';
import type { ServerMessage, MoveDTO, ClockDTO } from '../net/protocol.ts';
import { LaskaClient, type ConnStatus, type PublicUser, ApiError } from '../net/client.ts';

export type OnlinePhase = 'idle' | 'queued' | 'matched' | 'ended';

/** ms between leaps while animating an opponent's multi-jump. */
const ANIM_LEAP_MS = 300;

export interface MatchInfo {
  matchId: string;
  myColor: PlayerColor;
  opponent: { userId: string; username: string; rating: number };
  timeControl: { initialMs: number; incrementMs: number };
}

export interface EndInfo {
  result: string;
  reason: string;
  winner: PlayerColor | null;
  ratingChange: {
    white: { before: number; after: number; delta: number };
    black: { before: number; after: number; delta: number };
  } | null;
}

export interface LeaderRow {
  userId: string;
  username: string;
  rating: number;
  ratedGames: number;
}

/** Build a minimal GameState from a server position string (enough for legal-move
 *  generation and optimistic application; the server remains the authority). */
function stateFromPosition(position: string): GameState {
  const { board, toMove } = decodePosition(position);
  const key = encodePosition({ board, toMove });
  return { board, toMove, plyNoProgress: 0, positionCounts: { [key]: 1 } };
}

export function useOnline(apiBase: string, wsUrl: string) {
  const clientRef = useRef<LaskaClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new LaskaClient(apiBase, wsUrl);
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
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const pendingRef = useRef(false);

  // Leap-by-leap rendering overrides. While a multi-jump plays out, the engine
  // state has already flipped to the final board, but we paint an intermediate
  // `boardOverride` (with `displayLastMove` driving the per-leap glide):
  //  - the OPPONENT's chain is animated on a timer in the `match.update` handler;
  //  - the local HUMAN's chain preview is pushed in via `setPreview` (the screen
  //    plays each leap itself, then submits the full Move on the final leap).
  const [boardOverride, setBoardOverride] = useState<Board | null>(null);
  const [overrideLastMove, setOverrideLastMove] = useState<MoveDTO | null>(null);
  // Latest rendered state, so the message handler can reconstruct the opponent's
  // move against the position BEFORE the authoritative update landed.
  const renderedRef = useRef<GameState | null>(null);
  renderedRef.current = rendered;
  const animRunId = useRef(0);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAnim = useCallback(() => {
    animRunId.current++;
    if (animTimer.current) clearTimeout(animTimer.current);
    setBoardOverride(null);
    setOverrideLastMove(null);
  }, []);

  // ---- server message handling ----
  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'auth.ok':
          setUser((u) => (u ? { ...u, rating: msg.rating } : u));
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
          clearAnim();
          setMatch({
            matchId: msg.matchId,
            myColor: msg.color,
            opponent: msg.opponent,
            timeControl: msg.timeControl,
          });
          const gs = stateFromPosition(msg.state.position);
          setAuthoritative(gs);
          setRendered(gs);
          setClock(msg.state.clock);
          clockAtRef.current = Date.now();
          setDrawOfferBy(msg.state.drawOfferBy);
          setLastMove(null);
          setEnd(null);
          setPhase('matched');
          pendingRef.current = false;
          break;
        }
        case 'match.update': {
          // The server is authoritative: snap rendered state to it (this both
          // confirms our optimistic move and corrects any divergence).
          const prev = renderedRef.current;
          const gs = stateFromPosition(msg.state.position);
          setAuthoritative(gs);
          setRendered(gs);
          setClock(msg.state.clock);
          clockAtRef.current = Date.now();
          setDrawOfferBy(msg.state.drawOfferBy);
          pendingRef.current = false;

          // Animate the OPPONENT's multi-jump one leap at a time. My own move was
          // already played out leap-by-leap locally, so only the opponent's needs
          // reconstructing (the wire carries no `path`). Single jumps / quiet moves
          // and any move we can't reconstruct fall through to an instant snap.
          const lm = msg.lastMove;
          const mine = match?.myColor;
          if (lm && mine && lm.by !== mine && lm.captures.length > 1 && prev) {
            const full = matchLegalMove(prev, { from: lm.from, to: lm.to, captures: lm.captures });
            if (full) {
              const steps = moveStepBoards(prev, full);
              clearAnim();
              const runId = ++animRunId.current;
              let i = 0;
              const runHop = () => {
                if (runId !== animRunId.current) return;
                const last = i === full.path.length - 1;
                const from = i === 0 ? full.from : full.path[i - 1]!;
                const landing = full.path[i]!;
                setOverrideLastMove({ from, to: landing, captures: [], by: lm.by });
                if (last) {
                  // Final leap: drop the override so the authoritative board shows.
                  setBoardOverride(null);
                  setLastMove(lm);
                } else {
                  setBoardOverride(steps[i]!);
                  i += 1;
                  animTimer.current = setTimeout(runHop, ANIM_LEAP_MS);
                }
              };
              runHop();
              break;
            }
          }
          clearAnim();
          if (lm) setLastMove(lm);
          break;
        }
        case 'match.end': {
          clearAnim();
          setEnd({
            result: msg.result,
            reason: msg.reason,
            winner: msg.winner,
            ratingChange: msg.ratingChange,
          });
          setPhase('ended');
          setClock((c) => (c ? { ...c, running: null } : c));
          client.setCurrentMatch(null);
          if (user && msg.ratingChange) {
            const mine = match?.myColor === 'W' ? msg.ratingChange.white : msg.ratingChange.black;
            setUser((u) => (u ? { ...u, rating: mine.after } : u));
          }
          break;
        }
        case 'error':
          // A rejected move: roll the optimistic board back to authoritative and
          // tear down any in-flight leap preview/animation.
          if (pendingRef.current) {
            pendingRef.current = false;
            setRendered(authoritative);
          }
          clearAnim();
          setError(msg.message);
          break;
        case 'pong':
        default:
          break;
      }
    },
    [client, authoritative, user, match, clearAnim],
  );

  useEffect(() => {
    client.setHandlers({ onMessage, onStatus: setStatus });
  }, [client, onMessage]);

  // Restore a saved session on mount (native: load tokens first, then refresh).
  useEffect(() => {
    let cancelled = false;
    void client
      .init()
      .then(() => client.restore())
      .then((u) => {
        if (!cancelled && u) {
          setUser(u);
          client.connect();
        }
      });
    // Leaderboard is public (no auth) — load it for the lobby right away.
    void client
      .leaderboard(20)
      .then((r) => {
        if (!cancelled) setLeaderboard(r.leaderboard);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      client.disconnect();
    };
  }, [client]);

  // Tick the displayed clock 4x/second while a side is running.
  useEffect(() => {
    if (!clock || clock.running == null || phase === 'ended') return;
    const id = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [clock, phase]);

  // The board will resync from the server on reconnect, so a half-played leap
  // preview or opponent animation would be a lie — tear it down when the socket
  // drops.
  useEffect(() => {
    if (status !== 'connected') clearAnim();
  }, [status, clearAnim]);

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
        client.connect();
      }),
    [client, withError],
  );
  const login = useCallback(
    (email: string, password: string) =>
      withError(async () => {
        setUser(await client.login(email, password));
        client.connect();
      }),
    [client, withError],
  );
  const guest = useCallback(
    () =>
      withError(async () => {
        setUser(await client.guest());
        client.connect();
      }),
    [client, withError],
  );
  /** Upgrade the current guest account to a permanent email/password login. */
  const linkGuest = useCallback(
    (email: string, password: string, username: string) =>
      withError(async () => {
        setUser(await client.linkGuest(email, password, username));
      }),
    [client, withError],
  );
  const logout = useCallback(() => {
    void client.logout();
    clearAnim();
    setUser(null);
    setPhase('idle');
    setMatch(null);
    setRendered(null);
    setEnd(null);
  }, [client, clearAnim]);

  // ---- match actions ----
  const joinQueue = useCallback(() => {
    setError(null);
    setEnd(null);
    client.send({ type: 'queue.join' });
  }, [client]);
  const leaveQueue = useCallback(() => client.send({ type: 'queue.leave' }), [client]);

  const submitMove = useCallback(
    (move: Move) => {
      if (!match || !rendered) return;
      // Optimistic: apply locally for instant feedback, then send. Clear any
      // mid-chain preview — the optimistic final board now supersedes it.
      clearAnim();
      pendingRef.current = true;
      setRendered(applyMove(rendered, move));
      setLastMove({ from: move.from, to: move.to, captures: move.captures, by: match.myColor });
      const payload =
        move.captures.length > 0
          ? { type: 'match.move' as const, matchId: match.matchId, from: move.from, to: move.to, captures: move.captures }
          : { type: 'match.move' as const, matchId: match.matchId, from: move.from, to: move.to };
      client.send(payload);
    },
    [client, match, rendered, clearAnim],
  );

  /** Push a mid-chain preview while the local player jumps each enemy themselves:
   *  `board` is the intermediate position after the leap, `leap` glides one step.
   *  The screen calls this per leap, then `submitMove(fullMove)` on the final one
   *  (which clears the preview). A null board tears the preview down. */
  const setPreview = useCallback(
    (board: Board | null, leap: { from: number; to: number } | null) => {
      animRunId.current++; // cancel any opponent animation that might be running
      if (animTimer.current) clearTimeout(animTimer.current);
      setBoardOverride(board);
      setOverrideLastMove(
        leap && match ? { from: leap.from, to: leap.to, captures: [], by: match.myColor } : null,
      );
    },
    [match],
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

  const refreshLeaderboard = useCallback(async () => {
    try {
      const r = await client.leaderboard(20);
      setLeaderboard(r.leaderboard);
    } catch {
      // best-effort; the lobby keeps the last list on a transient failure.
    }
  }, [client]);

  const newOnlineGame = useCallback(() => {
    clearAnim();
    setPhase('idle');
    setMatch(null);
    setRendered(null);
    setAuthoritative(null);
    setEnd(null);
    setLastMove(null);
    setClock(null);
  }, [clearAnim]);

  // Whose turn, and is it mine right now (based on optimistic state). A leap
  // preview / opponent animation in flight also blocks input (boardOverride set).
  const myTurn = !!(
    rendered &&
    match &&
    rendered.toMove === match.myColor &&
    phase === 'matched' &&
    !pendingRef.current
  );

  // The board to render: a mid-chain/animation override, else the optimistic
  // board. `displayLastMove` is the per-leap glide source while an override is up.
  const displayBoard: Board | null = boardOverride ?? rendered?.board ?? null;
  const displayLastMove = boardOverride ? overrideLastMove : lastMove;

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
    /** The board to render — accounts for the mid-chain / opponent-animation override. */
    board: displayBoard,
    clock: displayClock,
    /** The most recent leap's from/to for the Board glide (per-leap while animating). */
    lastMove: displayLastMove,
    drawOfferBy,
    end,
    myTurn,
    legalMoves: legal,
    leaderboard,
    // actions
    refreshLeaderboard,
    register,
    login,
    guest,
    linkGuest,
    logout,
    joinQueue,
    leaveQueue,
    submitMove,
    setPreview,
    resign,
    offerDraw,
    acceptDraw,
    newOnlineGame,
    clearError: () => setError(null),
  };
}
