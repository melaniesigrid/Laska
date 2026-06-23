import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Route } from 'lucide-react';
import { RC_TO_SQUARE, SQUARE_TO_RC, BOARD_DIM, type Move, type PlayerColor } from '../../src/index.ts';
import { BoardView } from './Board.tsx';
import { useOnline } from './useOnline.ts';

const COLOR_NAME: Record<PlayerColor, string> = { W: 'White', B: 'Black' };

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function squareName(square: number): string {
  const rc = SQUARE_TO_RC[square];
  if (!rc) return String(square);
  return `${String.fromCharCode(97 + rc.col)}${rc.row + 1}`;
}

/** Human-readable full route for capture chains that end on the same square. */
function moveRoute(move: Move): string {
  const landings = move.path.map(squareName).join(' → ');
  const captured = move.captures.map(squareName).join(', ');
  return `${squareName(move.from)} → ${landings} · takes ${captured}`;
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
          <button onClick={() => online.joinQueue()} disabled={online.status !== 'connected'}>
            Play online (ranked)
          </button>
        </div>
      )}
      {online.phase === 'queued' && (
        <div className="buttons">
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
  const [moveChoices, setMoveChoices] = useState<Move[]>([]);

  const match = online.match;
  const gs = online.gameState;
  const legal = online.legalMoves;

  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const destinations = useMemo(() => {
    if (selected == null) return new Map<number, Move[]>();
    const map = new Map<number, Move[]>();
    for (const m of legal) {
      if (m.from !== selected) continue;
      const options = map.get(m.to) ?? [];
      options.push(m);
      map.set(m.to, options);
    }
    return map;
  }, [legal, selected]);

  const mustCapture = legal.length > 0 && legal.every((m) => m.isCapture);
  const captureTargets = useMemo(
    () => new Set([...destinations].filter(([, moves]) => moves.some((m) => m.isCapture)).map(([sq]) => sq)),
    [destinations],
  );

  // A server update invalidates any in-progress local selection or route choice.
  useEffect(() => {
    setSelected(null);
    setMoveChoices([]);
  }, [match?.matchId, gs]);

  // Never leave a stale choice active while the socket is reconnecting.
  useEffect(() => {
    if (online.status !== 'connected') {
      setSelected(null);
      setMoveChoices([]);
    }
  }, [online.status]);

  if (!online.user) return <AuthPanel online={online} />;
  if (!match || online.phase === 'idle' || online.phase === 'queued') return <Lobby online={online} />;

  const handleClick = (sq: number) => {
    if (!online.myTurn || online.status !== 'connected') return;
    const options = destinations.get(sq);
    if (selected != null && options?.length) {
      if (options.length === 1) {
        online.submitMove(options[0]!);
        setSelected(null);
      } else {
        setMoveChoices(options);
      }
      return;
    }
    if (movable.has(sq)) {
      setSelected((cur) => (cur === sq ? null : sq));
      setMoveChoices([]);
      return;
    }
    setSelected(null);
    setMoveChoices([]);
  };

  const chooseMove = (move: Move) => {
    online.submitMove(move);
    setSelected(null);
    setMoveChoices([]);
  };

  const clock = online.clock;
  const myColor = match.myColor;
  const oppColor: PlayerColor = myColor === 'W' ? 'B' : 'W';
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
        board={gs ? gs.board : []}
        dim={BOARD_DIM}
        rcToSquare={RC_TO_SQUARE}
        selected={selected}
        movable={movable}
        destinations={new Set(destinations.keys())}
        onSquareClick={handleClick}
        activeColor={gs?.toMove}
        mustCapture={mustCapture}
        captureTargets={captureTargets}
        flipped={myColor === 'B'}
        interactive={online.myTurn && !end && online.status === 'connected' && moveChoices.length === 0}
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

        {moveChoices.length > 1 && !end && (
          <section className="capture-choice" role="dialog" aria-labelledby="capture-choice-title">
            <div className="capture-choice-title" id="capture-choice-title">
              <Route size={16} aria-hidden="true" /> Choose the capture route
            </div>
            <p>Both chains land on {squareName(moveChoices[0]!.to)}. Choose the path you intend.</p>
            <div className="capture-routes">
              {moveChoices.map((move, index) => (
                <button key={`${move.path.join('-')}:${move.captures.join('-')}`} onClick={() => chooseMove(move)}>
                  <span>Route {index + 1}</span>
                  {moveRoute(move)}
                </button>
              ))}
            </div>
            <button className="capture-cancel" onClick={() => setMoveChoices([])}>Cancel</button>
          </section>
        )}

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
