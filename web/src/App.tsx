import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  Undo2,
  Flag,
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
  Save,
  Check,
  Library,
  Lightbulb,
} from 'lucide-react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  opponent,
  RC_TO_SQUARE,
  BOARD_DIM,
  DIFFICULTY_DEPTH,
  DIFFICULTY_ORDER,
  type Board,
  type GameState,
  type GameOutcome,
  type Move,
  type PlayerColor,
  type Difficulty,
} from '../../src/index.ts';
import { getBestMove, analyzePosition } from './ai/aiClient.ts';
import { BoardView, type MoveFx } from './Board.tsx';
import { OnlinePanel } from './Online.tsx';
import { useOnline } from './useOnline.ts';
import { Landing } from './Landing.tsx';
import { LaskerPage } from './LaskerPage.tsx';
import { ReplayPage } from './ReplayPage.tsx';
import { buildLiveGame, type HistoricGame } from './games.ts';
import { BrochurePage } from './BrochurePage.tsx';
import { AIPage } from './AIPage.tsx';
import { BuildStoryPage } from './BuildStoryPage.tsx';
import { MyGamesPage } from './MyGamesPage.tsx';
import { SavedGameReplay } from './SavedGameReplay.tsx';
import {
  buildSavedGame,
  mergeIntoSave,
  getSavedGame,
  upsertSavedGame,
  moveToSan,
  type SavedResult,
  type NewGameInput,
} from './savedGames.ts';
import { LessonsPage } from './LessonsPage.tsx';
import {
  PieceThemeContext,
  PIECE_THEMES,
  PIECE_THEME_LABEL,
  Insignia,
  usePieceTheme,
  type PieceTheme,
} from './pieceTheme.tsx';
import { track, trackAppOpen, type MatchMode } from './analytics/index.ts';

type Mode = 'hotseat' | 'ai';

const COLOR_NAME: Record<PlayerColor, string> = { W: 'White', B: 'Black' };

/** Plies the Hint button looks ahead. Fixed and strong (quiescence on) so a hint
 *  is always the engine's genuine best move, independent of the chosen tier — the
 *  point of a hint is the right answer, not a level-appropriate one. */
const HINT_DEPTH = 5;

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Beginner',
  easy: 'Easy',
  intermediate: 'Intermediate',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

/** Palettes — Stone is the site default (from laska.html); the rest from lasca-soft. */
const THEMES = ['stone', 'dark', 'navy', 'light', 'chocolate', 'classic'] as const;
type ThemeName = (typeof THEMES)[number];
/** Demo (engine-vs-engine) outcome → the result string the replay viewer shows
 *  and parses for the terminal eval (see ReplayPage.terminalWhiteEval). */
const FEATURED_RESULT_TEXT: Record<'W' | 'B' | 'draw' | 'unfinished', string> = {
  W: 'White wins',
  B: 'Black wins',
  draw: 'Draw',
  unfinished: 'Unfinished',
};

const THEME_LABEL: Record<ThemeName, string> = {
  stone: 'Stone',
  dark: 'Dark',
  navy: 'Navy',
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
    | 'landing'
    | 'game'
    | 'lasker'
    | 'replay'
    | 'brochure'
    | 'ai'
    | 'build'
    | 'lessons'
    | 'mygames'
    | 'watch'
    | 'featured'
  >('landing');
  const [replayGameId, setReplayGameId] = useState<string | undefined>(undefined);
  const [watchId, setWatchId] = useState<string | undefined>(undefined);
  const [featuredGame, setFeaturedGame] = useState<HistoricGame | undefined>(undefined);
  const [appMode, setAppMode] = useState<'local' | 'online'>('local');
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme);
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>(readStoredPieceTheme);
  const online = useOnline();

  // Funnel: fire the app-open event(s) exactly once per page load (acquisition /
  // D1-D7 retention signal). Empty deps + StrictMode double-invokes in dev only;
  // resolveFirstSeen is per-session idempotent so the firstEver flag stays stable.
  useEffect(() => {
    trackAppOpen();
  }, []);

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

  const goWatch = (id: string) => {
    setWatchId(id);
    setView('watch');
  };

  // The landing-page demo (engine vs engine) hands us its move list; assemble a
  // game and open it in the same replay/analysis viewer as the historic scores.
  const analyzeFeatured = (moves: Move[], result: 'W' | 'B' | 'draw' | 'unfinished') => {
    // A signature so re-analysing a *different* demo game resets the engine review.
    const sig = moves.map((m) => `${m.from}-${m.to}-${m.captures.length}`).join('|');
    setFeaturedGame(
      buildLiveGame(moves, {
        id: `featured-${sig}`,
        title: 'The engine plays itself',
        white: 'Light army',
        black: 'Dark army',
        event: 'The engine vs itself',
        result: FEATURED_RESULT_TEXT[result],
        sourceNote: 'Played live in your browser, on the real engine.',
        intro:
          'This game was just played by the engine against itself — every move chosen by the same AI you play against. Step through it, or let the engine review each move and grade the play.',
      }),
    );
    setView('featured');
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
        onLessons={() => setView('lessons')}
        themeLabel={THEME_LABEL[theme]}
        onCycleTheme={cycleTheme}
        onAnalyzeFeatured={analyzeFeatured}
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
  if (view === 'lessons') {
    return (
      <LessonsPage
        onBack={() => setView('landing')}
        onPlay={() => setView('game')}
        pieceTheme={pieceTheme}
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
  if (view === 'featured' && featuredGame) {
    return (
      <ReplayPage
        onBack={() => setView('landing')}
        onPlay={() => setView('game')}
        pieceTheme={pieceTheme}
        featured={featuredGame}
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
  if (view === 'mygames') {
    return (
      <MyGamesPage onBack={() => setView('landing')} onWatch={goWatch} onPlay={() => setView('game')} />
    );
  }
  if (view === 'watch' && watchId) {
    return (
      <SavedGameReplay
        id={watchId}
        onBack={() => setView('mygames')}
        onMyGames={() => setView('mygames')}
        pieceTheme={pieceTheme}
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
          <button className="btn" onClick={() => setView('mygames')} aria-label="Your saved games">
            <Library size={16} /> My games
          </button>
        </div>
      </header>

      <div className="head">
        <div className="eyebrow">Emanuel Lasker · 1911</div>
        <div className="title">Laska</div>
        <div className="sub">The stacking draughts</div>
      </div>

      {appMode === 'local' ? (
        <LocalGame onLearnAI={() => setView('ai')} onOpenMyGames={() => setView('mygames')} />
      ) : (
        <OnlinePanel online={online} />
      )}

      <footer className="foot">
        {appMode === 'local'
          ? 'Rules engine and AI run entirely in your browser. No account needed.'
          : 'The server validates every move; your move shows instantly and reconciles to the authoritative state.'}
      </footer>
    </div>
    </PieceThemeContext.Provider>
  );
}

function LocalGame({ onLearnAI, onOpenMyGames }: { onLearnAI: () => void; onOpenMyGames: () => void }) {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [mode, setMode] = useState<Mode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [aiColor, setAiColor] = useState<PlayerColor>('B');
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  // The committed moves of the current game, kept in lockstep with `history` so a
  // game can be saved and rewatched. Each committed move appends one entry; undo
  // and new-game trim/clear it exactly as they do `history`.
  const [moves, setMoves] = useState<Move[]>([]);
  // The id of the save this game is backed by, once saved — so a second Save
  // updates that record (carrying its notes) instead of duplicating it.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [colIds, setColIds] = useState<(string | null)[]>(() => freshColumnIds(state.board));
  const [moveFx, setMoveFx] = useState<MoveFx | null>(null);
  const [resignedWinner, setResignedWinner] = useState<PlayerColor | null>(null);
  // Hint: the engine's best move for the side to move, surfaced on demand and
  // highlighted on the board. Cleared on any board change so it can never point
  // at a stale position. `hintLoading` covers the off-thread search.
  const [hint, setHint] = useState<Move | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current state, so an async hint can verify the board didn't move on
  // under it before it shows (object identity changes on every committed move).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Resignation isn't a board position the engine can derive, so it's tracked
  // here and folded into the outcome the rest of the UI already renders.
  const status: GameOutcome = useMemo(
    () => (resignedWinner ? { state: 'win', winner: resignedWinner, reason: 'resignation' } : gameStatus(state)),
    [state, resignedWinner],
  );
  const legal = useMemo(() => legalMoves(state), [state]);
  const gameOver = status.state !== 'ongoing';

  const movableSquares = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const mustCapture = legal.length > 0 && legal.every((m) => m.isCapture);

  // Funnel: report a finished match exactly once. Keyed on move-count so a New
  // Game (which clears `moves`) re-arms it for the next game. Skips empty boards.
  const finishedReportedAt = useRef<number | null>(null);
  useEffect(() => {
    if (gameOver && moves.length > 0 && finishedReportedAt.current !== moves.length) {
      finishedReportedAt.current = moves.length;
      const matchMode: MatchMode = mode === 'ai' ? 'ai' : 'hotseat';
      // Outcome from the local human's seat: in AI games the human is the non-AI
      // colour; in hotseat there's no single "me", so report the winner's result
      // as a win and a draw as a draw (loss only applies when the AI beats you).
      let outcome: 'win' | 'loss' | 'draw' = 'draw';
      if (status.state === 'win') {
        outcome = mode === 'ai' ? (status.winner === aiColor ? 'loss' : 'win') : 'win';
      }
      track('match.finished', {
        mode: matchMode,
        outcome,
        // Inside the gameOver guard `status.state` is 'win' | 'draw', both of
        // which carry a `reason`; the ongoing variant (no reason) can't reach here.
        reason: (status as { reason: string }).reason,
        plies: moves.length,
      });
    }
    if (!gameOver) finishedReportedAt.current = null;
  }, [gameOver, status, moves.length, mode, aiColor]);

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
    setMoves((m) => [...m, move]);
    setHint(null); // a hint is about the position before this move; drop it
    setJustSaved(false); // the saved snapshot is now stale until re-saved
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

  /** Ask the engine for the best move and highlight it. Off-thread, so the UI
   *  never blocks; the result is discarded if the board moved on meanwhile. */
  const requestHint = useCallback(() => {
    if (gameOver || isAiTurn || thinking || hintLoading) return;
    const snapshot = state;
    setSelected(null);
    setHint(null);
    setHintLoading(true);
    analyzePosition(snapshot, { depth: HINT_DEPTH }).then((scored) => {
      setHintLoading(false);
      if (stateRef.current !== snapshot) return; // a move landed; hint is stale
      const best = scored[0]?.move ?? null;
      setHint(best);
      if (best) {
        track('hint.used', {
          mode: mode === 'ai' ? 'ai' : 'hotseat',
          ...(mode === 'ai' ? { difficulty } : {}),
        });
      }
    });
  }, [gameOver, isAiTurn, thinking, hintLoading, state, mode, difficulty]);

  const hintSquares = useMemo(
    () => (hint ? new Set([hint.from, hint.to]) : undefined),
    [hint],
  );

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
      setHint(null); // any interaction dismisses the hint highlight
      const move = destinations.get(square);
      if (selected != null && move) {
        // Funnel: the human's FIRST committed move of a fresh board is the true
        // activation moment. `moves.length === 0` means nothing has been played
        // yet (the AI never moves first into an empty list — White always opens,
        // and a human-vs-AI game where AI is White still lands here on the human's
        // first reply, which is fine: it's the user's first action either way).
        if (moves.length === 0) {
          const matchMode: MatchMode = mode === 'ai' ? 'ai' : 'hotseat';
          track('match.started', {
            mode: matchMode,
            ...(mode === 'ai' ? { difficulty, color: aiColor === 'W' ? 'B' : 'W' } : {}),
          });
          track('match.first_move', { mode: matchMode });
        }
        playMove(state, move);
        return;
      }
      if (movableSquares.has(square)) {
        setSelected((cur) => (cur === square ? null : square));
        return;
      }
      setSelected(null);
    },
    [
      gameOver,
      isAiTurn,
      thinking,
      destinations,
      selected,
      state,
      playMove,
      movableSquares,
      moves.length,
      mode,
      difficulty,
      aiColor,
    ],
  );

  const newGame = useCallback(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    const fresh = createInitialState();
    setState(fresh);
    setColIds(freshColumnIds(fresh.board));
    setMoveFx(null);
    setHistory([]);
    setMoves([]);
    setSavedId(null);
    setJustSaved(false);
    setSelected(null);
    setThinking(false);
    setResignedWinner(null);
    setHint(null);
  }, []);

  const resign = useCallback(() => {
    if (gameOver || isAiTurn || thinking) return;
    if (!window.confirm(`Resign this game? ${COLOR_NAME[opponent(state.toMove)]} will win.`)) return;
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setSelected(null);
    setResignedWinner(opponent(state.toMove));
  }, [gameOver, isAiTurn, thinking, state.toMove]);

  const undo = useCallback(() => {
    setResignedWinner(null);
    setHint(null);
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
      // keep the move list in lockstep with the trimmed history
      setMoves((m) => m.slice(0, target));
      setJustSaved(false);
      return h.slice(0, target);
    });
  }, [mode, aiColor]);

  /** Persist the current game to the local library. Re-saving an already-saved
   *  game updates that record (and keeps any notes added to it) rather than
   *  creating a duplicate. */
  const saveGame = useCallback(() => {
    if (moves.length === 0) return;
    let result: SavedResult = 'unfinished';
    let resultReason: string | undefined;
    if (status.state === 'win') {
      result = status.winner;
      resultReason = status.reason;
    } else if (status.state === 'draw') {
      result = 'draw';
      resultReason = status.reason;
    }
    const input: NewGameInput = {
      moves,
      mode,
      result,
      ...(resultReason ? { resultReason } : {}),
      ...(mode === 'ai' ? { difficulty, aiColor } : {}),
    };
    const existing = savedId ? getSavedGame(savedId) : undefined;
    const saved = existing ? mergeIntoSave(existing, input) : buildSavedGame(input);
    upsertSavedGame(saved);
    setSavedId(saved.id);
    setJustSaved(true);
  }, [moves, mode, status, difficulty, aiColor, savedId]);

  const statusLine = useMemo(() => {
    if (status.state === 'win') return `${COLOR_NAME[status.winner]} wins — ${status.reason.replace('-', ' ')}.`;
    if (status.state === 'draw') return `Draw — ${status.reason.replace('-', ' ')}.`;
    const who = COLOR_NAME[state.toMove];
    if (isAiTurn || thinking) return `${who} (computer) is thinking…`;
    return `${who} to move${mustCapture ? ' — you must capture' : ''}.`;
  }, [status, state.toMove, isAiTurn, thinking, mustCapture]);

  const StatusIcon = status.state === 'win' ? Trophy : status.state === 'draw' ? Minus : CircleDot;

  return (
    <div className="game-layout">
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
        highlight={hintSquares}
      />

      <div className="control-deck">
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

        {hint && (
          <div className="hint-banner" role="status" aria-live="polite">
            <Lightbulb size={16} className="ico" />
            <span>
              Try <b>{moveToSan(hint)}</b>
              {hint.isCapture ? ` — captures ${hint.captures.length}` : ''}.
            </span>
            <button className="hint-dismiss" onClick={() => setHint(null)} aria-label="Dismiss hint">
              Got it
            </button>
          </div>
        )}

        <div className="controls">
          <button className="btn" onClick={newGame}>
            <RotateCcw size={16} /> New game
          </button>
          <button className="btn" onClick={undo} disabled={history.length === 0 || isAiTurn || thinking}>
            <Undo2 size={16} /> Undo
          </button>
          <button
            className="btn"
            onClick={requestHint}
            disabled={gameOver || isAiTurn || thinking || hintLoading || legal.length === 0}
          >
            <Lightbulb size={16} /> {hintLoading ? 'Thinking…' : 'Hint'}
          </button>
          <button className="btn" onClick={resign} disabled={gameOver || isAiTurn || thinking}>
            <Flag size={16} /> Resign
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

        <div className="controls">
          <button className="btn" onClick={saveGame} disabled={moves.length === 0}>
            {justSaved ? <Check size={16} /> : <Save size={16} />}{' '}
            {justSaved ? 'Saved' : savedId ? 'Update save' : 'Save game'}
          </button>
          {justSaved && (
            <button className="btn" onClick={onOpenMyGames}>
              <Library size={16} /> Watch &amp; annotate
            </button>
          )}
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
      </div>
    </div>
  );
}

/** The rules that apply to each rank, surfaced on hover/focus over its legend
 *  swatch. Kept short and concrete — a first-timer's reminder, not the brochure.
 *  Wording tracks the engine: soldiers are forward-only, generals move both ways,
 *  a captured top piece is tucked under the capturing column. */
const RANK_RULES: Record<'soldier' | 'officer', { name: string; lines: string[] }> = {
  soldier: {
    name: 'Soldier',
    lines: [
      'Steps one square diagonally — forward only.',
      'Captures by jumping an adjacent enemy column to the empty square beyond; only its top piece is taken and tucked under yours.',
      'Reach the far row and it is crowned a General.',
    ],
  },
  officer: {
    name: 'General',
    lines: [
      'Steps one square diagonally in any direction — forward or back.',
      'Captures the same way and may chain jumps forward or backward.',
      'Outranks a soldier; promotion ends the move that crowns it.',
    ],
  },
};

/** One legend swatch that doubles as a rules tip. The label is a real button so
 *  the explanation is reachable by keyboard (focus) as well as hover, and the
 *  tip is associated via `aria-describedby` for screen readers. */
function LegendItem({ rank }: { rank: 'soldier' | 'officer' }) {
  const pieceTheme = usePieceTheme();
  const rules = RANK_RULES[rank];
  const tipId = `rank-rules-${rank}`;
  return (
    <span className="lg lg-rule">
      <button type="button" className="lg-trigger" aria-describedby={tipId}>
        <span className="disc cream legend-coin">
          <Insignia theme={pieceTheme} rank={rank} />
        </span>
        {rules.name}
      </button>
      <span className="lg-tip" role="tooltip" id={tipId}>
        <strong>{rules.name}</strong>
        {rules.lines.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </span>
    </span>
  );
}

/** Soldier vs general, drawn with the live insignia theme so the swatch always
 *  matches the board. "General" reads faster than "officer" for a first-timer.
 *  Hover or focus either to read the rules that govern that rank. */
function Legend() {
  return (
    <div className="legend">
      <LegendItem rank="soldier" />
      <LegendItem rank="officer" />
      <span className="muted">Reach the far row to promote.</span>
    </div>
  );
}
