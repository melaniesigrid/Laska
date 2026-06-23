import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  Undo2,
  Cpu,
  Users,
  Gamepad2,
  Globe,
  Palette,
  ArrowLeft,
  CircleDot,
  Trophy,
  Minus,
  Star,
} from 'lucide-react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  RC_TO_SQUARE,
  BOARD_DIM,
  DIFFICULTY_DEPTH,
  DIFFICULTY_ORDER,
  type Board,
  type GameState,
  type Move,
  type PlayerColor,
  type Difficulty,
} from '../../src/index.ts';
import { getBestMove } from './ai/aiClient.ts';
import { BoardView, type MoveFx } from './Board.tsx';
import { OnlinePanel } from './Online.tsx';
import { useOnline } from './useOnline.ts';
import { Landing } from './Landing.tsx';
import { LaskerPage } from './LaskerPage.tsx';
import { ReplayPage } from './ReplayPage.tsx';
import { BrochurePage } from './BrochurePage.tsx';
import { AIPage } from './AIPage.tsx';
import { BuildStoryPage } from './BuildStoryPage.tsx';
import {
  PieceThemeContext,
  PIECE_THEMES,
  PIECE_THEME_LABEL,
  Insignia,
  usePieceTheme,
  type PieceTheme,
} from './pieceTheme.tsx';

type Mode = 'hotseat' | 'ai';

const COLOR_NAME: Record<PlayerColor, string> = { W: 'White', B: 'Black' };

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Beginner',
  easy: 'Easy',
  intermediate: 'Intermediate',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

/** Palettes — Stone is the site default (from laska.html); the rest from lasca-soft. */
const THEMES = ['stone', 'dark', 'light', 'chocolate', 'classic'] as const;
type ThemeName = (typeof THEMES)[number];
const THEME_LABEL: Record<ThemeName, string> = {
  stone: 'Stone',
  dark: 'Dark',
  light: 'Light',
  chocolate: 'Chocolate',
  classic: 'Classic',
};

function readStoredTheme(): ThemeName {
  try {
    const t = localStorage.getItem('laska-theme');
    if (THEMES.includes(t as ThemeName)) return t as ThemeName;
  } catch {
    /* ignore */
  }
  return 'stone';
}

function readStoredPieceTheme(): PieceTheme {
  try {
    const t = localStorage.getItem('laska-piece-theme');
    if (PIECE_THEMES.includes(t as PieceTheme)) return t as PieceTheme;
  } catch {
    /* ignore */
  }
  return 'heirloom';
}

function movesFrom(moves: Move[], square: number): Move[] {
  return moves.filter((m) => m.from === square);
}

/* ---- column identity (for the gliding-piece animation) -------------------
   Engine pieces carry no id, so the web layer assigns a stable id per occupied
   square and migrates it across each move. A monotonic counter guarantees ids
   are never reused, so a regenerated board shares no id with the old one and
   nothing tries to glide (used by undo / new game — those should snap). */
let columnIdSeq = 0;
const nextColumnId = () => `col-${columnIdSeq++}`;

/** Fresh ids for the current occupancy — every column gets a brand-new id. */
function freshColumnIds(board: Board): (string | null)[] {
  return board.map((col) => (col ? nextColumnId() : null));
}

/** Carry ids forward through `move`: the mover keeps its id at the destination;
 *  a jumped column that had a single piece is emptied; multi-piece victims keep
 *  their id in place. Intermediate path squares were vacant, so already null. */
function advanceColumnIds(ids: (string | null)[], prevBoard: Board, move: Move): (string | null)[] {
  const next = ids.slice();
  next[move.to] = ids[move.from] ?? nextColumnId();
  next[move.from] = null;
  for (const cap of move.captures) {
    const victim = prevBoard[cap];
    if (!victim || victim.length <= 1) next[cap] = null;
  }
  return next;
}

export function App() {
  const [view, setView] = useState<
    'landing' | 'game' | 'lasker' | 'replay' | 'brochure' | 'ai' | 'build'
  >('landing');
  const [replayGameId, setReplayGameId] = useState<string | undefined>(undefined);
  const [appMode, setAppMode] = useState<'local' | 'online'>('local');
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme);
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>(readStoredPieceTheme);
  const online = useOnline();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'stone') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('laska-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('laska-piece-theme', pieceTheme);
    } catch {
      /* ignore */
    }
  }, [pieceTheme]);

  const cycleTheme = () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!);
  const cyclePieceTheme = () =>
    setPieceTheme(PIECE_THEMES[(PIECE_THEMES.indexOf(pieceTheme) + 1) % PIECE_THEMES.length]!);

  const goReplay = (id?: string) => {
    setReplayGameId(id);
    setView('replay');
  };

  if (view === 'landing') {
    return (
      <Landing
        onPlay={() => setView('game')}
        onLasker={() => setView('lasker')}
        onReplay={() => goReplay()}
        onBrochure={() => setView('brochure')}
        onAI={() => setView('ai')}
        onBuild={() => setView('build')}
      />
    );
  }
  if (view === 'ai') {
    return <AIPage onBack={() => setView('landing')} onPlay={() => setView('game')} />;
  }
  if (view === 'build') {
    return (
      <BuildStoryPage
        onBack={() => setView('landing')}
        onPlay={() => setView('game')}
        onAI={() => setView('ai')}
      />
    );
  }
  if (view === 'lasker') {
    return (
      <LaskerPage
        onBack={() => setView('landing')}
        onPlay={() => setView('game')}
        onReplay={() => goReplay()}
      />
    );
  }
  if (view === 'replay') {
    return (
      <ReplayPage
        onBack={() => setView('landing')}
        onPlay={() => setView('game')}
        pieceTheme={pieceTheme}
        gameId={replayGameId}
      />
    );
  }
  if (view === 'brochure') {
    return (
      <BrochurePage
        onBack={() => setView('landing')}
        onPlay={() => setView('game')}
        onReplay={(id) => goReplay(id)}
      />
    );
  }

  return (
    <PieceThemeContext.Provider value={pieceTheme}>
    <div className="app">
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <button className="btn icon-only" onClick={() => setView('landing')} aria-label="Back to the home page" title="Home">
          <ArrowLeft size={16} />
        </button>
        <div className="topbar-actions">
          <div className="segment" role="tablist" aria-label="Play mode">
            <button
              className={appMode === 'local' ? 'active' : ''}
              role="tab"
              aria-selected={appMode === 'local'}
              onClick={() => setAppMode('local')}
            >
              <Gamepad2 size={15} /> Local
            </button>
            <button
              className={appMode === 'online' ? 'active' : ''}
              role="tab"
              aria-selected={appMode === 'online'}
              onClick={() => setAppMode('online')}
            >
              <Globe size={15} /> Online
            </button>
          </div>
          <button className="btn" onClick={cycleTheme} aria-label={`Color theme: ${THEME_LABEL[theme]}. Click to change.`}>
            <Palette size={16} /> {THEME_LABEL[theme]}
          </button>
          <button
            className="btn"
            onClick={cyclePieceTheme}
            aria-label={`Piece style: ${PIECE_THEME_LABEL[pieceTheme]}. Click to change.`}
          >
            <Star size={16} /> {PIECE_THEME_LABEL[pieceTheme]}
          </button>
        </div>
      </header>

      <div className="head">
        <div className="eyebrow">Emanuel Lasker · 1911</div>
        <div className="title">Laska</div>
        <div className="sub">The stacking draughts</div>
      </div>

      {appMode === 'local' ? <LocalGame onLearnAI={() => setView('ai')} /> : <OnlinePanel online={online} />}

      <footer className="foot">
        {appMode === 'local'
          ? 'Rules engine and AI run entirely in your browser. No account needed.'
          : 'The server validates every move; your move shows instantly and reconciles to the authoritative state.'}
      </footer>
    </div>
    </PieceThemeContext.Provider>
  );
}

function LocalGame({ onLearnAI }: { onLearnAI: () => void }) {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [mode, setMode] = useState<Mode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [aiColor, setAiColor] = useState<PlayerColor>('B');
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [thinking, setThinking] = useState(false);
  const [colIds, setColIds] = useState<(string | null)[]>(() => freshColumnIds(state.board));
  const [moveFx, setMoveFx] = useState<MoveFx | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = useMemo(() => gameStatus(state), [state]);
  const legal = useMemo(() => legalMoves(state), [state]);
  const gameOver = status.state !== 'ongoing';

  const movableSquares = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const mustCapture = legal.length > 0 && legal.every((m) => m.isCapture);

  const destinations = useMemo(() => {
    if (selected == null) return new Map<number, Move>();
    const map = new Map<number, Move>();
    for (const m of movesFrom(legal, selected)) {
      const existing = map.get(m.to);
      if (!existing || m.captures.length > existing.captures.length) map.set(m.to, m);
    }
    return map;
  }, [legal, selected]);

  const captureTargets = useMemo(
    () => new Set([...destinations].filter(([, m]) => m.isCapture).map(([sq]) => sq)),
    [destinations],
  );

  /** Apply `move` from `prev`, recording history and migrating column ids so the
   *  moved column glides to its destination. The one path both human and AI use. */
  const playMove = useCallback((prev: GameState, move: Move) => {
    setHistory((h) => [...h, prev]);
    setColIds((ids) => advanceColumnIds(ids, prev.board, move));
    // One-shot reward feedback on the landing square: tuck prisoners under the
    // cap and pop a fresh promotion. Cleared (null) on quiet, non-promoting moves.
    setMoveFx(
      move.isCapture || move.promotion
        ? { square: move.to, tuckCount: move.isCapture ? move.captures.length : 0, promoted: move.promotion }
        : null,
    );
    setState(applyMove(prev, move));
    setSelected(null);
  }, []);

  const isAiTurn = mode === 'ai' && !gameOver && state.toMove === aiColor;

  useEffect(() => {
    if (!isAiTurn) return;
    setThinking(true);
    let cancelled = false;
    const snapshot = state;
    const started = Date.now();
    // Search runs in a Web Worker so the UI thread never blocks. Keep a minimum
    // visible "thinking" beat so the move doesn't snap in jarringly.
    getBestMove(snapshot, { difficulty }).then((move) => {
      if (cancelled) return;
      const wait = Math.max(0, 350 - (Date.now() - started));
      aiTimer.current = setTimeout(() => {
        if (cancelled) return;
        setThinking(false);
        if (move) playMove(snapshot, move);
      }, wait);
    });
    return () => {
      cancelled = true;
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [isAiTurn, state, difficulty, playMove]);

  const handleSquareClick = useCallback(
    (square: number) => {
      if (gameOver || isAiTurn || thinking) return;
      const move = destinations.get(square);
      if (selected != null && move) {
        playMove(state, move);
        return;
      }
      if (movableSquares.has(square)) {
        setSelected((cur) => (cur === square ? null : square));
        return;
      }
      setSelected(null);
    },
    [gameOver, isAiTurn, thinking, destinations, selected, state, playMove, movableSquares],
  );

  const newGame = useCallback(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    const fresh = createInitialState();
    setState(fresh);
    setColIds(freshColumnIds(fresh.board));
    setMoveFx(null);
    setHistory([]);
    setSelected(null);
    setThinking(false);
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      let target = h.length - 1;
      let restored = h[target]!;
      setSelected(null);
      if (mode === 'ai' && restored.toMove === aiColor && target > 0) {
        target -= 1;
        restored = h[target]!;
      }
      setState(restored);
      // fresh ids → the restored position snaps into place rather than gliding
      // backwards, which would read as a strange reverse-capture.
      setColIds(freshColumnIds(restored.board));
      setMoveFx(null);
      return h.slice(0, target);
    });
  }, [mode, aiColor]);

  const statusLine = useMemo(() => {
    if (status.state === 'win') return `${COLOR_NAME[status.winner]} wins — ${status.reason.replace('-', ' ')}.`;
    if (status.state === 'draw') return `Draw — ${status.reason.replace('-', ' ')}.`;
    const who = COLOR_NAME[state.toMove];
    if (isAiTurn || thinking) return `${who} (computer) is thinking…`;
    return `${who} to move${mustCapture ? ' — you must capture' : ''}.`;
  }, [status, state.toMove, isAiTurn, thinking, mustCapture]);

  const StatusIcon = status.state === 'win' ? Trophy : status.state === 'draw' ? Minus : CircleDot;

  return (
    <>
      <div
        className={`status ${status.state === 'win' ? 'win' : status.state === 'draw' ? 'draw' : ''}${
          (isAiTurn || thinking) ? ' thinking' : ''
        }`}
        role="status"
        aria-live="polite"
      >
        <StatusIcon className="ico" size={18} />
        {statusLine}
      </div>

      <BoardView
        board={state.board}
        dim={BOARD_DIM}
        rcToSquare={RC_TO_SQUARE}
        selected={selected}
        movable={movableSquares}
        destinations={new Set(destinations.keys())}
        onSquareClick={handleSquareClick}
        interactive={!gameOver && !isAiTurn && !thinking}
        activeColor={state.toMove}
        mustCapture={mustCapture}
        captureTargets={captureTargets}
        colIds={colIds}
        moveFx={moveFx}
      />

      <div className="controls">
        <button className="btn" onClick={newGame}>
          <RotateCcw size={16} /> New game
        </button>
        <button className="btn" onClick={undo} disabled={history.length === 0 || isAiTurn || thinking}>
          <Undo2 size={16} /> Undo
        </button>
        <div className="segment" role="group" aria-label="Opponent">
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>
            <Cpu size={15} /> Computer
          </button>
          <button className={mode === 'hotseat' ? 'active' : ''} onClick={() => setMode('hotseat')}>
            <Users size={15} /> Two players
          </button>
        </div>
      </div>

      {mode === 'ai' && (
        <>
          <div className="controls">
            <label className="field-label">
              <span>Difficulty</span>
              <select
                className="neu-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                {DIFFICULTY_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d]} · {DIFFICULTY_DEPTH[d]} ahead
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              <span>Computer plays</span>
              <select className="neu-select" value={aiColor} onChange={(e) => setAiColor(e.target.value as PlayerColor)}>
                <option value="B">Black (you first)</option>
                <option value="W">White (computer first)</option>
              </select>
            </label>
          </div>
          <details className="ai-note">
            <summary>
              <Cpu size={14} /> About the computer opponent
            </summary>
            <p>
              The engine searches the game tree with <b>negamax + alpha-beta pruning</b> over a
              Laska-specific evaluator — it scores <em>column control</em> (not raw piece count, since
              Laska never removes a piece), officer rank, held prisoners, promotion progress and
              mobility. Difficulty sets how many half-moves it looks ahead and how often it plays a
              deliberate slip, from <b>Beginner</b> (1 ahead, often blunders) to <b>Expert</b> (8
              ahead, never slips). <b>{DIFFICULTY_LABEL[difficulty]}</b> looks{' '}
              <b>{DIFFICULTY_DEPTH[difficulty]} half-moves</b> deep.
            </p>
            <button className="btn" onClick={onLearnAI} style={{ marginTop: '0.4rem' }}>
              <Cpu size={15} /> How the computer plays
            </button>
          </details>
        </>
      )}

      <Legend />
    </>
  );
}

/** Soldier vs general, drawn with the live insignia theme so the swatch always
 *  matches the board. "General" reads faster than "officer" for a first-timer. */
function Legend() {
  const pieceTheme = usePieceTheme();
  return (
    <div className="legend">
      <span className="lg">
        <span className="disc cream legend-coin">
          <Insignia theme={pieceTheme} rank="soldier" />
        </span>
        Soldier
      </span>
      <span className="lg">
        <span className="disc cream legend-coin">
          <Insignia theme={pieceTheme} rank="officer" />
        </span>
        General
      </span>
      <span className="muted">Reach the far row to promote.</span>
    </div>
  );
}
