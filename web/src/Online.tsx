import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  Send,
  Handshake,
  Sparkles,
  Hand,
  ThumbsUp,
  Star,
  Flame,
  Frown,
  Hourglass,
  type LucideIcon,
} from 'lucide-react';
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
import { EMOTES, CHAT_MAX_LEN, type EmoteId, type RankDTO } from '../../server/src/net/protocol.ts';
import { BoardView } from './Board.tsx';
import { useOnline, type ChatEntry, type RatingChangeSide } from './useOnline.ts';
import { RankBadge } from './RankBadge.tsx';
import { DotMascot, WinConfetti } from './mascots.tsx';

/** A fitting lucide icon per canned emote id (no emoji — design-system rule). */
const EMOTE_ICON: Record<EmoteId, LucideIcon> = {
  gg: Handshake,
  gl: Sparkles,
  hello: Hand,
  nice: ThumbsUp,
  wow: Star,
  close: Flame,
  oops: Frown,
  thinking: Hourglass,
};

/** Short wall-clock time for a chat/emote line (e.g. "3:07 PM"). */
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

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
      <div className="lobby-identity">
        <RankBadge rank={u.rank} size="lg" />
        <div className="lobby-identity-text">
          <strong>{u.username}</strong>
          <span className="muted">
            rating {u.rating}
            {u.isGuest && ' · guest'} · <span className={`dot ${online.status}`} /> {online.status}
          </span>
        </div>
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

/** Quick-bar of canned emotes — one button per `EMOTES` entry, each a lucide
 *  icon + its label. Disabled while reconnecting (mirrors the other actions). */
function EmoteBar({ online, disabled }: { online: ReturnType<typeof useOnline>; disabled: boolean }) {
  return (
    <div className="emote-bar" role="group" aria-label="Quick emotes">
      {(Object.keys(EMOTES) as EmoteId[]).map((id) => {
        const Icon = EMOTE_ICON[id];
        return (
          <button
            key={id}
            type="button"
            className="emote-btn"
            onClick={() => online.sendEmote(id)}
            disabled={disabled}
            title={EMOTES[id]}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{EMOTES[id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One rendered feed line: a chat bubble or an inline emote chip. */
function ChatLine({ entry }: { entry: ChatEntry }) {
  if (entry.kind === 'emote' && entry.emote) {
    const Icon = EMOTE_ICON[entry.emote];
    return (
      <div className={`chat-line ${entry.mine ? 'mine' : 'theirs'}`}>
        <span className="chat-emote-chip">
          <Icon size={14} aria-hidden="true" />
          {EMOTES[entry.emote]}
        </span>
        <span className="chat-meta">
          {entry.mine ? 'You' : entry.fromName} · {fmtTime(entry.ts)}
        </span>
      </div>
    );
  }
  return (
    <div className={`chat-line ${entry.mine ? 'mine' : 'theirs'}`}>
      <div className="chat-bubble">{entry.text}</div>
      <span className="chat-meta">
        {entry.mine ? 'You' : entry.fromName} · {fmtTime(entry.ts)}
      </span>
    </div>
  );
}

/** In-match social panel: scrollable feed (auto-scrolls to latest) + composer.
 *  Shown both during and after a match (players want to say "gg"). Marks chat
 *  read on mount and whenever new lines land while it's on screen. */
function ChatPanel({ online, disabled }: { online: ReturnType<typeof useOnline>; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const feedRef = useRef<HTMLDivElement | null>(null);
  const { chatLog, unreadChat, markChatRead } = online;

  // Auto-scroll to the latest line on every new message.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatLog.length]);

  // The panel is always visible while shown, so clear the unread badge whenever
  // it's non-zero (e.g. a line arrives while the player is looking at it).
  useEffect(() => {
    if (unreadChat > 0) markChatRead();
  }, [unreadChat, markChatRead]);

  const submit = () => {
    online.sendChat(draft);
    setDraft('');
  };

  const remaining = CHAT_MAX_LEN - draft.length;
  const nearLimit = remaining <= 20;

  return (
    <div className="chat-panel">
      <div className="chat-feed" ref={feedRef}>
        {chatLog.length === 0 ? (
          <p className="chat-empty">Say hello, or send an emote below.</p>
        ) : (
          chatLog.map((entry) => <ChatLine key={entry.id} entry={entry} />)
        )}
      </div>
      <EmoteBar online={online} disabled={disabled} />
      <div className="chat-composer">
        <input
          className="chat-input"
          value={draft}
          maxLength={CHAT_MAX_LEN}
          placeholder="Message…"
          aria-label="Chat message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className="chat-send"
          aria-label="Send message"
          onClick={submit}
          disabled={!draft.trim()}
        >
          <Send size={16} aria-hidden="true" />
        </button>
        {nearLimit && <span className="chat-counter">{remaining}</span>}
      </div>
    </div>
  );
}

/** A short, neumorphic-styled label for a rank (used in the promotion line). */
function rankLabel(rank: RankDTO): string {
  return rank.tier === 'general' ? `${rank.name} ★${rank.stars}` : rank.name;
}

/** End-screen rank + rating outcome for the local player.
 *  - rank index INCREASED → a celebratory "Promoted to …" moment (crossing into
 *    the General tier is the biggest one).
 *  - DECREASED → a quiet, dignified "Demoted to …" note (no punishment theatrics).
 *  - otherwise → the rating delta with the current RankBadge.
 *  All motion is CSS-driven and respects prefers-reduced-motion (see styles.css). */
function RankResult({ side }: { side: RatingChangeSide }) {
  const before = side.rank.before;
  const after = side.rank.after;
  const promoted = after.index > before.index;
  const demoted = after.index < before.index;
  // Crossing climb → general is the headline promotion.
  const intoGeneral = promoted && before.tier !== 'general' && after.tier === 'general';
  const sign = side.delta >= 0 ? '+' : '';

  if (promoted) {
    return (
      <div className={`rank-result rank-promote${intoGeneral ? ' into-general' : ''}`} role="status" aria-live="polite">
        <div className="rank-result-burst" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <Sparkles key={i} size={14} style={{ ['--i' as string]: i }} aria-hidden="true" />
          ))}
        </div>
        <span className="rank-result-eyebrow">
          {intoGeneral ? 'You made General' : 'Promoted'}
        </span>
        <RankBadge rank={after} size="lg" />
        <span className="rank-result-line">
          Promoted to <b>{rankLabel(after)}</b>!
        </span>
        <span className="rank-result-rating">
          Rating {side.before} → {side.after}{' '}
          <span className="rating-delta up">({sign}{side.delta})</span>
        </span>
      </div>
    );
  }

  if (demoted) {
    return (
      <div className="rank-result rank-demote" role="status" aria-live="polite">
        <RankBadge rank={after} size="md" />
        <span className="rank-result-line quiet">
          Demoted to <b>{rankLabel(after)}</b>.
        </span>
        <span className="rank-result-rating">
          Rating {side.before} → {side.after}{' '}
          <span className="rating-delta down">({sign}{side.delta})</span>
        </span>
      </div>
    );
  }

  return (
    <div className="rank-result rank-steady">
      <RankBadge rank={after} size="md" />
      <span className="rank-result-rating">
        Rating {side.before} → {side.after}{' '}
        <span className={`rating-delta ${side.delta > 0 ? 'up' : side.delta < 0 ? 'down' : ''}`}>
          ({sign}{side.delta})
        </span>
      </span>
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
          <div
            className={`clock ${clock?.running === oppColor ? 'active' : ''}${
              clock?.running === oppColor && oppClockMs < 10000 ? ' low' : ''
            }`}
          >
            <span className="clock-name">
              <RankBadge rank={match.opponent.rank} size="sm" showLabel={false} />
              {match.opponent.username} ({COLOR_NAME[oppColor]}) · {match.opponent.rating}
            </span>
            <span className="clock-time">{fmtClock(oppClockMs)}</span>
          </div>
          <div
            className={`clock ${clock?.running === myColor ? 'active' : ''}${
              clock?.running === myColor && myClockMs < 10000 ? ' low' : ''
            }`}
          >
            <span className="clock-name">
              <RankBadge rank={online.user.rank} size="sm" showLabel={false} />
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
              <button className="secondary" onClick={() => online.declineDraw()} disabled={online.status !== 'connected'}>
                Decline
              </button>
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
              <RankResult side={myColor === 'W' ? end.ratingChange.white : end.ratingChange.black} />
            )}
            {online.rematchSent ? (
              <div className="rematch-wait status">
                Waiting for opponent…
                <div className="buttons">
                  <button
                    className="secondary"
                    onClick={() => online.declineRematch()}
                    disabled={online.status !== 'connected'}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            ) : (
              <div className="buttons">
                <button
                  className={online.rematchOfferBy === oppColor ? 'rematch-ready' : ''}
                  onClick={() => online.offerRematch()}
                  disabled={online.status !== 'connected'}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  {online.rematchOfferBy === oppColor ? 'Rematch — opponent is ready' : 'Rematch'}
                </button>
                <button className="secondary" onClick={() => online.newOnlineGame()}>
                  Back to lobby
                </button>
              </div>
            )}
          </>
        )}

        {online.error && !end && <div className="status draw">{online.error}</div>}

        <ChatPanel online={online} disabled={online.status !== 'connected'} />

        <div className="conn-note">
          <span className={`dot ${online.status}`} /> {online.status}
          {online.status !== 'connected' && ' — reconnecting…'}
        </div>
      </aside>
    </div>
  );
}
