import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  VARIANTS,
  LASKA,
  beginCaptureChain,
  nextHopTargets,
  advanceCaptureChain,
  moveStepBoards,
  matchLegalMove,
  type Board,
  type CaptureChain,
  type GameState,
  type Move,
  type PlayerColor,
} from '../../src/index.ts';
import { BoardView } from './Board.tsx';
import { useOnline } from './useOnline.ts';
import { DotMascot, WinConfetti } from './mascots.tsx';

/** ms per leap while animating an opponent's multi-jump. */
const ANIM_LEAP_MS = 300;

const COLOR_NAME: Record<PlayerColor, string> = { W: 'White', B: 'Black' };

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AuthPanel({ online }: { online: ReturnType<typeof useOnline> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  return (
    <div className="online-auth panel">
      <div className="status" role="status">
        Play online — sign in, or jump in as a guest.
      </div>
      <div className="buttons">
        <button onClick={() => online.guest()}>Play as guest</button>
      </div>
      <fieldset className="controls">
        <legend>{mode === 'login' ? 'Sign in' : 'Create account'}</legend>
        {mode === 'register' && (
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
        )}
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" type="email" />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" type="password" />
        </label>
        <div className="buttons">
          {mode === 'login' ? (
            <button onClick={() => online.login(email, password)}>Sign in</button>
          ) : (
            <button onClick={() => online.register(email, password, username)}>Create account</button>
          )}
        </div>
        <button className="linklike" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </fieldset>
      {online.error && <div className="status draw">{online.error}</div>}
    </div>
  );
}

function Lobby({ online }: { online: ReturnType<typeof useOnline> }) {
  const u = online.user!;
  return (
    <div className="panel">
      <div className="status">
        Signed in as <strong>{u.username}</strong> · rating {u.rating}
        {u.isGuest && ' (guest)'} · <span className={`dot ${online.status}`} /> {online.status}
      </div>
      {online.phase === 'idle' && (
        <div className="buttons">
          <button onClick={() => online.joinQueue('laska')} disabled={online.status !== 'connected'}>
            Play Laska (ranked)
          </button>
          <button onClick={() => online.joinQueue('bashni')} disabled={online.status !== 'connected'}>
            Play Bashni (ranked)
          </button>
        </div>
      )}
      {online.phase === 'queued' && (
        <div className="buttons" style={{ flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
          <DotMascot tint="sky" mood="idle" size={72} />
          <span className="searching">Searching for an opponent near your rating…</span>
          <button onClick={() => online.leaveQueue()}>Cancel</button>
        </div>
      )}
      <div className="buttons">
        <button className="secondary" onClick={() => online.logout()}>
          Sign out
        </button>
      </div>
      {online.error && <div className="status draw">{online.error}</div>}
    </div>
  );
}

export function OnlinePanel({ online }: { online: ReturnType<typeof useOnline> }) {
  const [selected, setSelected] = useState<number | null>(null);
  // A multi-jump the local player is performing one leap at a time.
  const [chain, setChain] = useState<CaptureChain | null>(null);
  // Intermediate board shown mid-chain (between leaps), and the override used to
  // animate an opponent's multi-jump leap by leap. Both take precedence over the
  // (already optimistic) rendered board.
  const [previewBoard, setPreviewBoard] = useState<Board | null>(null);
  const [animBoard, setAnimBoard] = useState<Board | null>(null);

  const match = online.match;
  const gs = online.gameState;
  const legal = online.legalMoves;

  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);

  // While a chain is live, only the chained column's current square is "movable";
  // a tap there does nothing (you must pick a landing), but it keeps the column lit.
  const movingSquare = chain ? chain.steps[chain.steps.length - 1]! : selected;

  // The chain currently driving destination squares: an in-progress one, or a
  // freshly-begun one for the selected column if that column can capture.
  const activeChain = useMemo<CaptureChain | null>(() => {
    if (chain) return chain;
    if (selected != null && gs) return beginCaptureChain(legal, selected);
    return null;
  }, [chain, selected, gs, legal]);

  // Destination squares → the representative Move reached by tapping there.
  const destinations = useMemo(() => {
    if (activeChain) return nextHopTargets(activeChain);
    if (selected == null) return new Map<number, Move>();
    const map = new Map<number, Move>();
    for (const m of legal) if (m.from === selected) map.set(m.to, m);
    return map;
  }, [activeChain, selected, legal]);

  const mustCapture = legal.length > 0 && legal.every((m) => m.isCapture);
  const captureTargets = useMemo(
    () => new Set([...destinations].filter(([, m]) => m.isCapture).map(([sq]) => sq)),
    [destinations],
  );

  // A server update invalidates any in-progress local selection or chain.
  useEffect(() => {
    setSelected(null);
    setChain(null);
    setPreviewBoard(null);
  }, [match?.matchId, gs]);

  // Never leave a stale selection/chain active while the socket is reconnecting.
  useEffect(() => {
    if (online.status !== 'connected') {
      setSelected(null);
      setChain(null);
      setPreviewBoard(null);
    }
  }, [online.status]);

  // ---- opponent multi-jump animation (behavior A) ----
  // Track the previously rendered state so we can reconstruct the move's path
  // (the MoveDTO carries from/to/captures only) and step its boards.
  const prevStateRef = useRef<GameState | null>(null);
  const lastMove = online.lastMove;
  const myColorOpt = match?.myColor;

  useEffect(() => {
    if (!lastMove || !myColorOpt) {
      // Keep prevState in sync even when not animating, so the NEXT opponent
      // chain reconstructs from the board as it stood before that move.
      prevStateRef.current = gs;
      return;
    }
    const prev = prevStateRef.current;
    // Advance the "previous state" pointer to the now-current board for the next move.
    prevStateRef.current = gs;

    const isOpponent = lastMove.by !== myColorOpt;
    if (!isOpponent || lastMove.captures.length < 2 || !prev) {
      setAnimBoard(null);
      return;
    }
    const move = matchLegalMove(prev, lastMove);
    if (!move) {
      setAnimBoard(null); // can't reconstruct the path → just snap.
      return;
    }
    const steps = moveStepBoards(prev, move);
    // steps[last] === the settled board; show each intermediate leap, then clear.
    let i = 0;
    setAnimBoard(steps[0] ?? null);
    const id = setInterval(() => {
      i += 1;
      if (i >= steps.length - 1) {
        clearInterval(id);
        setAnimBoard(null); // settle to the real (authoritative) rendered board.
      } else {
        setAnimBoard(steps[i] ?? null);
      }
    }, ANIM_LEAP_MS);
    return () => {
      clearInterval(id);
      setAnimBoard(null);
    };
    // gs changes on every server update, which is exactly when a new lastMove
    // arrives — depending on lastMove alone is enough and keeps prev correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMove, myColorOpt]);

  if (!online.user) return <AuthPanel online={online} />;
  if (!match || online.phase === 'idle' || online.phase === 'queued') return <Lobby online={online} />;

  // Resolve tapping `sq` as the next leap of the active chain.
  const advance = (sq: number) => {
    if (!activeChain || !gs) return;
    const res = advanceCaptureChain(activeChain, sq);
    if (!res) return;
    if (res.kind === 'commit') {
      online.submitMove(res.move);
      setChain(null);
      setPreviewBoard(null);
      setSelected(null);
      return;
    }
    // More forced leaps remain: show the board after this leap and await the next tap.
    const depth = activeChain.steps.length;
    const steps = moveStepBoards(gs, res.chain.candidates[0]!);
    setPreviewBoard(steps[depth] ?? null);
    setChain(res.chain);
    setSelected(sq);
  };

  const handleClick = (sq: number) => {
    if (!online.myTurn || online.status !== 'connected') return;
    const move = destinations.get(sq);
    if (move) {
      if (move.isCapture) advance(sq);
      else {
        online.submitMove(move);
        setSelected(null);
        setChain(null);
        setPreviewBoard(null);
      }
      return;
    }
    // Don't let a stray tap abort a chain that's mid-jump.
    if (chain) return;
    if (movable.has(sq)) {
      setSelected((cur) => (cur === sq ? null : sq));
      return;
    }
    setSelected(null);
  };

  const clock = online.clock;
  const myColor = match.myColor;
  const oppColor: PlayerColor = myColor === 'W' ? 'B' : 'W';
  const variant = VARIANTS[match.variant] ?? LASKA;
  const end = online.end;

  const myClockMs = clock ? (myColor === 'W' ? clock.whiteMs : clock.blackMs) : 0;
  const oppClockMs = clock ? (oppColor === 'W' ? clock.whiteMs : clock.blackMs) : 0;

  let statusLine: string;
  if (end) {
    const me = end.winner == null ? null : end.winner === myColor;
    statusLine =
      end.winner == null
        ? `Draw — ${end.reason.replace('-', ' ')}.`
        : `${me ? 'You won' : 'You lost'} — ${end.reason.replace('-', ' ')}.`;
  } else if (online.status !== 'connected') {
    statusLine = 'Game paused while reconnecting.';
  } else if (online.myTurn) {
    statusLine = 'Your move.';
  } else {
    statusLine = `Waiting for ${match.opponent.username}…`;
  }

  return (
    <div className="online-match">
      <BoardView
        board={previewBoard ?? animBoard ?? (gs ? gs.board : [])}
        dim={variant.boardDim}
        rcToSquare={variant.rcToSquare}
        selected={movingSquare}
        movable={chain ? new Set(movingSquare == null ? [] : [movingSquare]) : movable}
        destinations={new Set(destinations.keys())}
        onSquareClick={handleClick}
        activeColor={gs?.toMove}
        mustCapture={mustCapture}
        captureTargets={captureTargets}
        flipped={myColor === 'B'}
        interactive={online.myTurn && !end && online.status === 'connected'}
      />

      <aside className="panel">
        {online.status !== 'connected' && (
          <div className="connection-banner" role="status" aria-live="polite">
            <RefreshCw size={17} aria-hidden="true" />
            <div>
              <strong>{online.status === 'connecting' ? 'Connecting…' : 'Connection interrupted'}</strong>
              <span>Moves are paused. The board will resync from the server automatically.</span>
            </div>
          </div>
        )}

        <div className="clocks">
          <div className={`clock ${clock?.running === oppColor ? 'active' : ''}`}>
            <span className="clock-name">
              {match.opponent.username} ({COLOR_NAME[oppColor]}) · {match.opponent.rating}
            </span>
            <span className="clock-time">{fmtClock(oppClockMs)}</span>
          </div>
          <div className={`clock ${clock?.running === myColor ? 'active' : ''}`}>
            <span className="clock-name">
              You ({COLOR_NAME[myColor]}) · {online.user.rating}
            </span>
            <span className="clock-time">{fmtClock(myClockMs)}</span>
          </div>
        </div>

        <div className={`status ${end ? (end.winner == null ? 'draw' : 'win') : ''}`} role="status" aria-live="polite">
          {statusLine}
        </div>

        {online.drawOfferBy && online.drawOfferBy === oppColor && !end && (
          <div className="status">
            {match.opponent.username} offers a draw.
            <div className="buttons">
              <button onClick={() => online.acceptDraw()} disabled={online.status !== 'connected'}>Accept</button>
            </div>
          </div>
        )}

        {!end ? (
          <div className="buttons">
            <button className="secondary" onClick={() => online.offerDraw()} disabled={online.status !== 'connected'}>
              Offer draw
            </button>
            <button className="danger" onClick={() => online.resign()} disabled={online.status !== 'connected'}>
              Resign
            </button>
          </div>
        ) : (
          <>
            {end.winner === myColor && (
              <>
                <WinConfetti />
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.4rem' }}>
                  <DotMascot tint="sun" mood="cheer" size={80} label="You won!" />
                </div>
              </>
            )}
            {end.ratingChange && (
              <div className="status">
                Rating:{' '}
                {(() => {
                  const c = myColor === 'W' ? end.ratingChange.white : end.ratingChange.black;
                  const sign = c.delta >= 0 ? '+' : '';
                  return `${c.before} → ${c.after} (${sign}${c.delta})`;
                })()}
              </div>
            )}
            <div className="buttons">
              <button onClick={() => online.newOnlineGame()}>Back to lobby</button>
            </div>
          </>
        )}

        {online.error && !end && <div className="status draw">{online.error}</div>}
        <div className="conn-note">
          <span className={`dot ${online.status}`} /> {online.status}
          {online.status !== 'connected' && ' — reconnecting…'}
        </div>
      </aside>
    </div>
  );
}
