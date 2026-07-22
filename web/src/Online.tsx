import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  Swords,
  UserPlus,
  Eye,
  Link as LinkIcon,
  Copy,
  Check,
  Clock,
  Trophy,
  ArrowLeft,
  WifiOff,
  Bot,
  type LucideIcon,
} from 'lucide-react';
import {
  VARIANTS,
  LASKA,
  DIFFICULTY_ORDER,
  DIFFICULTY_DEPTH,
  beginCaptureChain,
  nextHopTargets,
  advanceCaptureChain,
  moveStepBoards,
  matchLegalMove,
  type Board,
  type CaptureChain,
  type Difficulty,
  type GameState,
  type Move,
  type PlayerColor,
  type VariantId,
} from '../../src/index.ts';
import {
  EMOTES,
  CHAT_MAX_LEN,
  type EmoteId,
  type RankDTO,
  type ChallengeColor,
  type BotColorPreference,
  type SpectatorGameDTO,
} from '../../server/src/net/protocol.ts';
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

/** Time-control presets offered for a private invite (the host picks one). */
const TIME_PRESETS: { id: string; label: string; initialMs: number; incrementMs: number }[] = [
  { id: 'blitz5', label: '5 min', initialMs: 5 * 60_000, incrementMs: 0 },
  { id: 'blitz53', label: '5 + 3', initialMs: 5 * 60_000, incrementMs: 3_000 },
  { id: 'rapid10', label: '10 min', initialMs: 10 * 60_000, incrementMs: 0 },
];

/** Short label for an arbitrary time control (e.g. "5 + 3", or "10 min"). */
function fmtTimeControl(tc: { initialMs: number; incrementMs: number }): string {
  const mins = Math.round(tc.initialMs / 60_000);
  const inc = Math.round(tc.incrementMs / 1000);
  return inc > 0 ? `${mins} + ${inc}` : `${mins} min`;
}

/** Extract a challenge code from a raw code OR a pasted full invite link
 *  (`…/#/play/<code>` or `…/#/join/<code>`). Falls back to the trimmed input. */
export function extractChallengeCode(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/(?:#\/(?:play|join)\/)([^/?#\s]+)/i);
  if (m && m[1]) return m[1];
  // A bare "play/CODE" or "join/CODE" fragment without the hash.
  const m2 = trimmed.match(/(?:^|\/)(?:play|join)\/([^/?#\s]+)/i);
  if (m2 && m2[1]) return m2[1];
  return trimmed;
}

const VARIANT_LABEL: Record<VariantId, string> = { laska: 'Laska', bashni: 'Bashni' };

/** Human-friendly tier labels for the ranked-bot difficulty selector. */
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Beginner',
  easy: 'Easy',
  intermediate: 'Intermediate',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

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

type LobbyMode = 'quick' | 'computer' | 'friend' | 'watch';

/** The top-level lobby modes, as a segmented control. */
function LobbyModeBar({ mode, setMode }: { mode: LobbyMode; setMode: (m: LobbyMode) => void }) {
  return (
    <div className="segment lobby-modes" role="tablist" aria-label="Lobby mode">
      <button role="tab" aria-selected={mode === 'quick'} className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}>
        <Swords size={15} /> Quick match
      </button>
      <button role="tab" aria-selected={mode === 'computer'} className={mode === 'computer' ? 'active' : ''} onClick={() => setMode('computer')}>
        <Bot size={15} /> Computer
      </button>
      <button role="tab" aria-selected={mode === 'friend'} className={mode === 'friend' ? 'active' : ''} onClick={() => setMode('friend')}>
        <UserPlus size={15} /> Play a friend
      </button>
      <button role="tab" aria-selected={mode === 'watch'} className={mode === 'watch' ? 'active' : ''} onClick={() => setMode('watch')}>
        <Eye size={15} /> Watch live
      </button>
    </div>
  );
}

/** Quick-match (ranked queue) — the existing Laska/Bashni queue, plus the search
 *  state with its Cancel. */
function QuickMatchPanel({ online }: { online: ReturnType<typeof useOnline> }) {
  if (online.phase === 'queued') {
    return (
      <div className="buttons" style={{ flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
        <DotMascot tint="sky" mood="idle" size={72} />
        <span className="searching">Searching for an opponent near your rating…</span>
        <button onClick={() => online.leaveQueue()}>Cancel</button>
      </div>
    );
  }
  return (
    <div className="buttons">
      <button onClick={() => online.joinQueue('laska')} disabled={online.status !== 'connected'}>
        Play Laska (ranked)
      </button>
      <button onClick={() => online.joinQueue('bashni')} disabled={online.status !== 'connected'}>
        Play Bashni (ranked)
      </button>
    </div>
  );
}

/** "Play the Computer (Ranked)": pick a difficulty tier + your color, then start a
 *  match against the server's bot. Unlike the offline Local-tab computer game, this
 *  runs server-side and is RANKED — it moves your rating on the same leaderboard as
 *  human play. The match begins instantly via the normal match.start path. */
function ComputerPanel({ online }: { online: ReturnType<typeof useOnline> }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [color, setColor] = useState<BotColorPreference>('random');
  const [variant, setVariant] = useState<VariantId>('laska');
  const connected = online.status === 'connected';

  const colorOpts: { id: BotColorPreference; label: string }[] = [
    { id: 'W', label: 'White' },
    { id: 'B', label: 'Black' },
    { id: 'random', label: 'Random' },
  ];

  return (
    <div className="friend-panel">
      <fieldset className="controls">
        <legend>Play the Computer</legend>
        <div className="bot-ranked-note">
          <Trophy size={14} aria-hidden="true" />
          <span>
            <b>Ranked.</b> The computer plays on the server — this match counts toward your rating and
            rank, just like a human game.
          </span>
        </div>
        <div className="invite-field">
          <span className="invite-field-label">Game</span>
          <div className="segment" role="group" aria-label="Variant">
            <button className={variant === 'laska' ? 'active' : ''} onClick={() => setVariant('laska')}>Laska</button>
            <button className={variant === 'bashni' ? 'active' : ''} onClick={() => setVariant('bashni')}>Bashni</button>
          </div>
        </div>
        <div className="invite-field">
          <span className="invite-field-label">Difficulty</span>
          <select
            className="neu-select"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            aria-label="Computer difficulty"
          >
            {DIFFICULTY_ORDER.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]} · {DIFFICULTY_DEPTH[d]} ahead
              </option>
            ))}
          </select>
        </div>
        <div className="invite-field">
          <span className="invite-field-label">Your color</span>
          <div className="segment color-choice" role="group" aria-label="Your color">
            {colorOpts.map((o) => (
              <button key={o.id} className={color === o.id ? 'active' : ''} aria-pressed={color === o.id} onClick={() => setColor(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="buttons">
          <button onClick={() => online.startBotMatch(difficulty, color, variant)} disabled={!connected}>
            <Bot size={15} aria-hidden="true" /> Play Computer ({DIFFICULTY_LABEL[difficulty]})
          </button>
        </div>
      </fieldset>
    </div>
  );
}

/** Segmented White / Black / Random color pick for the invite host. */
function ColorChoice({ value, onChange }: { value: ChallengeColor; onChange: (c: ChallengeColor) => void }) {
  const opts: { id: ChallengeColor; label: string }[] = [
    { id: 'W', label: 'White' },
    { id: 'B', label: 'Black' },
    { id: 'random', label: 'Random' },
  ];
  return (
    <div className="segment color-choice" role="group" aria-label="Your color">
      {opts.map((o) => (
        <button key={o.id} className={value === o.id ? 'active' : ''} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "Play a friend": create an invite (variant/time/color/ranked) and share the
 *  link, or join one by code/link. Once a challenge is open it shows the
 *  shareable link + waiting state + cancel. */
function FriendPanel({ online }: { online: ReturnType<typeof useOnline> }) {
  const [variant, setVariant] = useState<VariantId>('laska');
  const [presetId, setPresetId] = useState<string>(TIME_PRESETS[1]!.id);
  const [color, setColor] = useState<ChallengeColor>('random');
  const [ranked, setRanked] = useState(true);
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);

  const challenge = online.challenge;
  const connected = online.status === 'connected';

  const inviteUrl = challenge ? `${window.location.origin}/#/play/${challenge.code}` : '';

  const copyLink = () => {
    if (!inviteUrl) return;
    void navigator.clipboard?.writeText(inviteUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => {
        /* clipboard blocked — the link is still selectable on screen */
      },
    );
  };

  const create = () => {
    const preset = TIME_PRESETS.find((p) => p.id === presetId) ?? TIME_PRESETS[1]!;
    online.createChallenge({
      variant,
      color,
      ranked,
      timeControl: { initialMs: preset.initialMs, incrementMs: preset.incrementMs },
    });
  };

  // ---- an invite is open: show the shareable link + waiting state ----
  if (challenge) {
    return (
      <div className="friend-panel">
        <div className="invite-card">
          <div className="invite-eyebrow">
            <LinkIcon size={14} aria-hidden="true" /> Your invite is live
          </div>
          <div className="invite-link-row">
            <input className="invite-link" readOnly value={inviteUrl} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
            <button className="invite-copy" onClick={copyLink} aria-label="Copy invite link">
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="invite-code">
            Code <b>{challenge.code}</b>
          </div>
          <div className="invite-meta">
            <span className="invite-chip">{VARIANT_LABEL[challenge.variant]}</span>
            <span className="invite-chip"><Clock size={12} aria-hidden="true" /> {fmtTimeControl(challenge.timeControl)}</span>
            <span className="invite-chip">{challenge.color === 'random' ? 'Random side' : `You: ${challenge.color === 'W' ? 'White' : 'Black'}`}</span>
            {challenge.ranked && <span className="invite-chip ranked"><Trophy size={12} aria-hidden="true" /> Ranked</span>}
          </div>
          <div className="invite-waiting">
            <DotMascot tint="sky" mood="idle" size={56} />
            <span className="searching">Waiting for your friend to join…</span>
          </div>
          <div className="buttons">
            <button className="secondary" onClick={() => online.cancelChallenge()}>
              Cancel invite
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- no open invite: the create form + join-by-code ----
  return (
    <div className="friend-panel">
      <fieldset className="controls">
        <legend>Create an invite</legend>
        <div className="invite-field">
          <span className="invite-field-label">Game</span>
          <div className="segment" role="group" aria-label="Variant">
            <button className={variant === 'laska' ? 'active' : ''} onClick={() => setVariant('laska')}>Laska</button>
            <button className={variant === 'bashni' ? 'active' : ''} onClick={() => setVariant('bashni')}>Bashni</button>
          </div>
        </div>
        <div className="invite-field">
          <span className="invite-field-label">Time</span>
          <div className="segment" role="group" aria-label="Time control">
            {TIME_PRESETS.map((p) => (
              <button key={p.id} className={presetId === p.id ? 'active' : ''} onClick={() => setPresetId(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="invite-field">
          <span className="invite-field-label">Your color</span>
          <ColorChoice value={color} onChange={setColor} />
        </div>
        <label className="invite-ranked">
          <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} />
          <span>Ranked — this game counts toward your rating.</span>
        </label>
        <div className="buttons">
          <button onClick={create} disabled={!connected}>
            <LinkIcon size={15} aria-hidden="true" /> Create invite
          </button>
        </div>
      </fieldset>

      <fieldset className="controls">
        <legend>Join by code</legend>
        <label>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Paste a code or invite link"
            aria-label="Invite code or link"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                online.joinChallenge(extractChallengeCode(joinInput));
              }
            }}
          />
        </label>
        <div className="buttons">
          <button onClick={() => online.joinChallenge(extractChallengeCode(joinInput))} disabled={!connected || !joinInput.trim()}>
            <UserPlus size={15} aria-hidden="true" /> Join game
          </button>
        </div>
      </fieldset>
    </div>
  );
}

/** One row in the spectate list: white vs black with rank/rating + variant chip. */
function SpectateRow({ game, onWatch, disabled }: { game: SpectatorGameDTO; onWatch: () => void; disabled: boolean }) {
  return (
    <button className="spectate-row" onClick={onWatch} disabled={disabled}>
      <span className="spectate-side">
        <RankBadge rank={game.white.rank} size="sm" showLabel={false} />
        <span className="spectate-name">{game.white.username}</span>
        <span className="spectate-rating">{game.white.rating}</span>
      </span>
      <span className="spectate-vs">vs</span>
      <span className="spectate-side">
        <RankBadge rank={game.black.rank} size="sm" showLabel={false} />
        <span className="spectate-name">{game.black.username}</span>
        <span className="spectate-rating">{game.black.rating}</span>
      </span>
      <span className="spectate-tags">
        <span className="invite-chip">{VARIANT_LABEL[game.variant]}</span>
        {game.ranked && <span className="invite-chip ranked"><Trophy size={12} aria-hidden="true" /></span>}
        <span className="spectate-moves">{game.moveCount} moves</span>
      </span>
    </button>
  );
}

/** "Watch live": the ongoing-games list with a Refresh; rows enter the read-only
 *  spectator board. Auto-lists on mount. */
function WatchPanel({ online }: { online: ReturnType<typeof useOnline> }) {
  const connected = online.status === 'connected';
  const { listSpectate } = online;
  // Refresh the list when this tab opens (and the socket is up).
  useEffect(() => {
    if (connected) listSpectate();
  }, [connected, listSpectate]);

  return (
    <div className="watch-panel">
      <div className="watch-head">
        <span className="watch-count">{online.spectateList.length} live {online.spectateList.length === 1 ? 'game' : 'games'}</span>
        <button className="watch-refresh" onClick={() => online.listSpectate()} disabled={!connected} aria-label="Refresh live games">
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </div>
      {online.spectateList.length === 0 ? (
        <p className="watch-empty">No live games right now. Check back, or start one yourself.</p>
      ) : (
        <div className="spectate-list">
          {online.spectateList.map((g) => (
            <SpectateRow key={g.matchId} game={g} disabled={!connected} onWatch={() => online.watchGame(g.matchId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Lobby({ online }: { online: ReturnType<typeof useOnline> }) {
  const u = online.user!;
  // Queuing forces the Quick-match tab so the search state is always visible.
  const [mode, setMode] = useState<LobbyMode>('quick');
  // An open invite belongs to the "Play a friend" tab — surface it.
  useEffect(() => {
    if (online.challenge) setMode('friend');
  }, [online.challenge]);
  const effectiveMode: LobbyMode = online.phase === 'queued' ? 'quick' : mode;

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

      {online.phase !== 'queued' && <LobbyModeBar mode={effectiveMode} setMode={setMode} />}

      {effectiveMode === 'quick' && <QuickMatchPanel online={online} />}
      {effectiveMode === 'computer' && <ComputerPanel online={online} />}
      {effectiveMode === 'friend' && <FriendPanel online={online} />}
      {effectiveMode === 'watch' && <WatchPanel online={online} />}

      <div className="buttons">
        <button className="secondary" onClick={() => online.logout()}>
          Sign out
        </button>
      </div>
      {online.error && <div className="status draw">{online.error}</div>}
    </div>
  );
}

/** Read-only spectator board: both clocks tick, a banner names the players, and
 *  Leave returns to the lobby. No move/chat controls. */
function SpectatePanel({ online }: { online: ReturnType<typeof useOnline> }) {
  const spec = online.spectating!;
  const gs = online.spectateState;
  const clock = online.spectateClock;
  const end = online.spectateEnd;
  const variant = VARIANTS[spec.variant] ?? LASKA;

  const toMove = gs?.toMove ?? 'W';
  let statusLine: string;
  if (end) {
    statusLine =
      end.winner == null
        ? `Draw — ${end.reason.replace(/-/g, ' ')}.`
        : `${end.winner === 'W' ? spec.white.username : spec.black.username} won — ${end.reason.replace(/-/g, ' ')}.`;
  } else {
    statusLine = `${toMove === 'W' ? spec.white.username : spec.black.username} (${COLOR_NAME[toMove]}) to move…`;
  }

  return (
    <div className="online-match">
      <BoardView
        board={gs ? gs.board : []}
        dim={variant.boardDim}
        rcToSquare={variant.rcToSquare}
        selected={null}
        movable={new Set()}
        destinations={new Set()}
        onSquareClick={() => {}}
        activeColor={gs?.toMove}
        interactive={false}
      />

      <aside className="panel">
        <div className="spectate-banner" role="status">
          <Eye size={16} aria-hidden="true" />
          <span>
            Spectating — <b>{spec.white.username}</b> vs <b>{spec.black.username}</b>
          </span>
        </div>

        <div className="clocks">
          <div className={`clock ${!end && clock?.running === 'B' ? 'active' : ''}`}>
            <span className="clock-name">
              <RankBadge rank={spec.black.rank} size="sm" showLabel={false} />
              {spec.black.username} ({COLOR_NAME.B}) · {spec.black.rating}
            </span>
            <span className="clock-time">{fmtClock(clock ? clock.blackMs : 0)}</span>
          </div>
          <div className={`clock ${!end && clock?.running === 'W' ? 'active' : ''}`}>
            <span className="clock-name">
              <RankBadge rank={spec.white.rank} size="sm" showLabel={false} />
              {spec.white.username} ({COLOR_NAME.W}) · {spec.white.rating}
            </span>
            <span className="clock-time">{fmtClock(clock ? clock.whiteMs : 0)}</span>
          </div>
        </div>

        <div className={`status ${end ? (end.winner == null ? 'draw' : 'win') : ''}`} role="status" aria-live="polite">
          {statusLine}
        </div>

        <div className="buttons">
          <button className="secondary" onClick={() => online.stopSpectate()}>
            <ArrowLeft size={15} aria-hidden="true" /> Leave
          </button>
        </div>

        <div className="conn-note">
          <span className={`dot ${online.status}`} /> {online.status}
        </div>
      </aside>
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

/** Unobtrusive "opponent is typing…" line at the foot of the chat feed. The
 *  three pulsing dots are pure CSS (no emoji, no icon) and respect
 *  prefers-reduced-motion via the keyframe in styles.css. */
function TypingIndicator({ name }: { name?: string }) {
  return (
    <div className="chat-typing" role="status" aria-live="polite">
      <span className="chat-typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="chat-typing-text">{name ?? 'Opponent'} is typing…</span>
    </div>
  );
}

/** In-match social panel: scrollable feed (auto-scrolls to latest) + composer.
 *  Shown both during and after a match (players want to say "gg"). Marks chat
 *  read on mount and whenever new lines land while it's on screen. */
function ChatPanel({ online, disabled }: { online: ReturnType<typeof useOnline> ; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const feedRef = useRef<HTMLDivElement | null>(null);
  const { chatLog, unreadChat, markChatRead, opponentTyping, sendTyping } = online;
  // Whether we've sent an un-cleared `typing:true` (so we know to send `false`).
  const typingActiveRef = useRef(false);
  // Throttles `typing:true` to ~once / 1.5s; stop-timer sends `false` ~2s idle.
  const lastTrueAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedOrOver = online.phase === 'ended' || !!online.end;

  // Auto-scroll to the latest line on every new message — and when the opponent
  // typing indicator appears (so it isn't hidden below the fold).
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatLog.length, opponentTyping]);

  // The panel is always visible while shown, so clear the unread badge whenever
  // it's non-zero (e.g. a line arrives while the player is looking at it).
  useEffect(() => {
    if (unreadChat > 0) markChatRead();
  }, [unreadChat, markChatRead]);

  // Immediately tell the opponent we've stopped typing, cancelling the idle timer.
  const stopTyping = () => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      lastTrueAtRef.current = 0;
      sendTyping(false);
    }
  };

  // Called on each keystroke: emits a throttled `typing:true` and (re)arms the
  // ~2s idle timer that fires `typing:false` once the player pauses.
  const noteTyping = () => {
    if (disabled || endedOrOver) return;
    const now = Date.now();
    if (!typingActiveRef.current || now - lastTrueAtRef.current >= 1500) {
      typingActiveRef.current = true;
      lastTrueAtRef.current = now;
      sendTyping(true);
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(stopTyping, 2000);
  };

  // Make sure we never leave a dangling `typing:true` when the panel unmounts.
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  const submit = () => {
    online.sendChat(draft);
    setDraft('');
    stopTyping();
  };

  const remaining = CHAT_MAX_LEN - draft.length;
  const nearLimit = remaining <= 20;

  return (
    <div className="chat-panel">
      <div className="chat-feed" ref={feedRef}>
        {chatLog.length === 0 && !opponentTyping ? (
          <p className="chat-empty">Say hello, or send an emote below.</p>
        ) : (
          chatLog.map((entry) => <ChatLine key={entry.id} entry={entry} />)
        )}
        {opponentTyping && !endedOrOver && <TypingIndicator name={online.match?.opponent.username} />}
      </div>
      <EmoteBar online={online} disabled={disabled} />
      <div className="chat-composer">
        <input
          className="chat-input"
          value={draft}
          maxLength={CHAT_MAX_LEN}
          placeholder="Message…"
          aria-label="Chat message"
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            // Emptying the input (or clearing it) is an explicit "stopped typing".
            if (next.trim()) noteTyping();
            else stopTyping();
          }}
          onBlur={stopTyping}
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

/** One in-flight floating reaction: a lucide icon rising + fading over the board.
 *  `lane` (0..1) scatters them horizontally; `delay` staggers a burst. */
interface Reaction {
  key: number;
  emote: EmoteId;
  mine: boolean;
  lane: number;
  delay: number;
}

/** Watches the chat feed for new emote lines and spawns a floating reaction for
 *  each. CSS-only motion (rise + fade), staggered when several land together.
 *  Returns the overlay node (rendered inside the board stage) + the most recent
 *  emote's sender color, so the caller can pulse that side's name/clock. */
function useReactions(chatLog: ChatEntry[]): { overlay: ReactNode; pulseColor: PlayerColor | null } {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [pulseColor, setPulseColor] = useState<PlayerColor | null>(null);
  // The last emote-entry id we've already turned into a reaction.
  const lastSeenRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const emotes = chatLog.filter((e) => e.kind === 'emote' && e.emote);
    if (emotes.length === 0) return;
    // Find emote entries newer than the last one we've animated.
    let startIdx = 0;
    if (lastSeenRef.current) {
      const i = emotes.findIndex((e) => e.id === lastSeenRef.current);
      startIdx = i >= 0 ? i + 1 : 0;
    }
    const fresh = emotes.slice(startIdx);
    if (fresh.length === 0) return;
    lastSeenRef.current = emotes[emotes.length - 1]!.id;

    const spawned: Reaction[] = fresh.map((e, i) => ({
      key: seqRef.current++,
      emote: e.emote!,
      mine: e.mine,
      lane: Math.random(),
      delay: i * 110,
    }));
    setReactions((cur) => [...cur, ...spawned]);
    // Pulse the most recent sender's side.
    setPulseColor(fresh[fresh.length - 1]!.fromColor);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulseColor(null), 900);

    // Reap each reaction after its animation completes (~1.8s + delay).
    const keys = spawned.map((r) => r.key);
    const reap = setTimeout(() => {
      setReactions((cur) => cur.filter((r) => !keys.includes(r.key)));
    }, 2200);
    return () => clearTimeout(reap);
  }, [chatLog]);

  useEffect(() => () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
  }, []);

  const overlay =
    reactions.length === 0 ? null : (
      <div className="reaction-layer" aria-hidden="true">
        {reactions.map((r) => {
          const Icon = EMOTE_ICON[r.emote];
          return (
            <span
              key={r.key}
              className={`reaction ${r.mine ? 'mine' : 'theirs'}`}
              style={{ ['--lane' as string]: r.lane, animationDelay: `${r.delay}ms` }}
            >
              <Icon size={26} aria-hidden="true" />
            </span>
          );
        })}
      </div>
    );

  return { overlay, pulseColor };
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

  // Floating emote reactions over the board + which side to pulse.
  const { overlay: reactionOverlay, pulseColor } = useReactions(online.chatLog);

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
  if (online.spectating) return <SpectatePanel online={online} />;
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
        overlay={reactionOverlay}
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

        {!online.opponentOnline && !end && (
          <div className="connection-banner opponent-offline" role="status" aria-live="polite">
            <WifiOff size={17} aria-hidden="true" />
            <div>
              <strong>{match.opponent.username} disconnected</strong>
              <span>Waiting for them to reconnect… the clock keeps running.</span>
            </div>
          </div>
        )}

        <div className="clocks">
          <div
            className={`clock ${clock?.running === oppColor ? 'active' : ''}${
              clock?.running === oppColor && oppClockMs < 10000 ? ' low' : ''
            }${pulseColor === oppColor ? ' emote-pulse' : ''}${!online.opponentOnline ? ' opponent-offline' : ''}`}
          >
            <span className="clock-name">
              <span
                className={`presence-dot ${online.opponentOnline ? 'online' : 'offline'}`}
                aria-hidden="true"
                title={online.opponentOnline ? 'Online' : 'Disconnected'}
              />
              <RankBadge rank={match.opponent.rank} size="sm" showLabel={false} />
              {match.opponent.username} ({COLOR_NAME[oppColor]}) · {match.opponent.rating}
            </span>
            <span className="clock-time">{fmtClock(oppClockMs)}</span>
          </div>
          <div
            className={`clock ${clock?.running === myColor ? 'active' : ''}${
              clock?.running === myColor && myClockMs < 10000 ? ' low' : ''
            }${pulseColor === myColor ? ' emote-pulse' : ''}`}
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
