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
  Scale,
  Lightbulb,
  Save,
  Check,
  Library,
} from 'lucide-react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  rulesForVariant,
  RC_TO_SQUARE,
  BOARD_DIM,
  DIFFICULTY_DEPTH,
  DIFFICULTY_ORDER,
  type Board,
  type GameState,
  type Move,
  type PlayerColor,
  type Difficulty,
  type RuleVariant,
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
import { MyGamesPage } from './MyGamesPage.tsx';
import { SavedGameReplay } from './SavedGameReplay.tsx';
import {
  buildSavedGame,
  mergeIntoSave,
  getSavedGame,
  upsertSavedGame,
  type SavedResult,
  type NewGameInput,
} from './savedGames.ts';
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

/** One-line, plain-English read on how each tier behaves (UI copy only — the
 *  real depth/slip numbers live in the engine's DIFFICULTY_* tables). */
const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  beginner: 'Blunders often on purpose — a gentle first game.',
  easy: 'Slips now and then; a relaxed sparring partner.',
  intermediate: 'A steady, club-level test.',
  medium: 'Plays solidly and only rarely slips.',
  hard: 'Reads through exchanges and punishes loose play.',
  expert: 'Never slips — the full strength of the engine.',
};

const RULE_VARIANTS = ['lasker-classic', 'nestor-strict'] as const;
const RULE_VARIANT_LABEL: Record<RuleVariant, string> = {
  'lasker-classic': 'Classic (Lasker)',
  'nestor-strict': 'Strict (nestorgames)',
};
const RULE_VARIANT_BLURB: Record<RuleVariant, string> = {
  'lasker-classic': 'Lasker’s 1911 rules — an officer may re-jump the same square within one multi-capture.',
  'nestor-strict': 'nestorgames 2018 rules — the same square may not be jumped twice in a single turn.',
};

function readStoredRuleVariant(): RuleVariant {
  try {
    const v = localStorage.getItem('laska-rule-variant');
    if (RULE_VARIANTS.includes(v as RuleVariant)) return v as RuleVariant;
  } catch {
    /* ignore */
  }
  return 'lasker-classic';
}

/** Palettes — Stone is the site default (from laska.html); the rest from lasca-soft. */
const THEMES = ['stone', 'dark', 'light', 'chocolate', 'classic', 'colors'] as const;
type ThemeName = (typeof THEMES)[number];
const THEME_LABEL: Record<ThemeName, string> = {
  stone: 'Stone',
  dark: 'Dark',
  light: 'Light',
  chocolate: 'Chocolate',
  classic: 'Classic',
  colors: 'Colors',
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

/* ---- step-by-step forced captures ----------------------------------------
   The engine returns each multi-jump as ONE atomic Move whose `path` lists the
   landing square after every jump. To make the player work the chain out and
   play it one jump at a time, the web layer walks that path: it offers only the
   immediate next landing, and re-derives the mid-chain board by replaying a
   PREFIX of the same Move through the engine's own applyMove (so no rules logic
   is duplicated here — `src/` stays the single source of truth). */

/** An in-progress multi-capture being played jump-by-jump by a human. */
interface Chain {
  start: number; // square the chain began from (the Move's `from`)
  step: number; // jumps already taken (≥ 1 while a chain is live)
  pos: number; // square the moving column occupies now (= path[step-1])
  moves: Move[]; // full Moves still consistent with the jumps taken so far
}

/** The sub-move covering the first `len` jumps of `rep`, departing from `start`. */
function prefixMove(rep: Move, len: number, start: number): Move {
  return {
    from: start,
    to: rep.path[len - 1]!,
    path: rep.path.slice(0, len),
    captures: rep.captures.slice(0, len),
    isCapture: true,
    promotion: rep.promotion && len === rep.path.length,
  };
}

/** Just jump `i` of `rep` as a one-step move (for migrating column ids). */
function singleJump(rep: Move, i: number, start: number): Move {
  return {
    from: i === 0 ? start : rep.path[i - 1]!,
    to: rep.path[i]!,
    path: [rep.path[i]!],
    captures: [rep.captures[i]!],
    isCapture: true,
    promotion: false,
  };
}

/** Group candidate moves by their next landing square at `step`, so the board
 *  can offer the immediate jumps (and only those) as drop-targets. */
function nextStepTargets(moves: Move[], step: number): Map<number, Move[]> {
  const map = new Map<number, Move[]>();
  for (const m of moves) {
    const nxt = m.path[step];
    if (nxt == null) continue; // this Move already ended before `step`
    const bucket = map.get(nxt);
    if (bucket) bucket.push(m);
    else map.set(nxt, [m]);
  }
  return map;
}

/** The longest (most-capturing) move in a non-empty pool — the chain a hint reveals. */
function longestMove(pool: Move[]): Move {
  return pool.reduce((a, b) => (b.path.length > a.path.length ? b : a));
}

/** Beat between hops when the computer plays a multi-jump capture — long enough
 *  for each glide-and-tuck to land before the next leap (the glide spring settles
 *  in ~0.3s), short enough that a long chain doesn't drag. */
const AI_HOP_MS = 380;

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
    'landing' | 'game' | 'lasker' | 'replay' | 'brochure' | 'ai' | 'build' | 'mygames' | 'watch'
  >('landing');
  const [replayGameId, setReplayGameId] = useState<string | undefined>(undefined);
  const [watchId, setWatchId] = useState<string | undefined>(undefined);
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

  const goWatch = (id: string) => {
    setWatchId(id);
    setView('watch');
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
  // The committed moves of the current game, kept in lockstep with `history` so a
  // game can be saved and rewatched. Each committed move appends one entry; undo
  // and new-game trim/clear it exactly as they do `history`.
  const [moves, setMoves] = useState<Move[]>([]);
  // The id of the save this game is backed by, once saved — so a second Save
  // updates that record (carrying its notes) instead of duplicating it.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [mode, setMode] = useState<Mode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [aiColor, setAiColor] = useState<PlayerColor>('B');
  const [ruleVariant, setRuleVariant] = useState<RuleVariant>(readStoredRuleVariant);
  const [selected, setSelected] = useState<number | null>(null);
  // A forced multi-capture the human is playing one jump at a time. While set,
  // the board renders the mid-chain position and offers only the next jump.
  const [chain, setChain] = useState<Chain | null>(null);
  // Squares of the hint-revealed forced chain (from + every landing). Cleared on
  // the next interaction so it never lingers past the move it described.
  const [hint, setHint] = useState<Set<number> | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [thinking, setThinking] = useState(false);
  const [colIds, setColIds] = useState<(string | null)[]>(() => freshColumnIds(state.board));
  const [moveFx, setMoveFx] = useState<MoveFx | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('laska-rule-variant', ruleVariant);
    } catch {
      /* ignore */
    }
  }, [ruleVariant]);

  // Resolved rule options for the active variant; threaded into every engine
  // call so changing the variant recomputes legality immediately.
  const rules = useMemo(() => rulesForVariant(ruleVariant), [ruleVariant]);

  const status = useMemo(() => gameStatus(state, undefined, rules), [state, rules]);
  const legal = useMemo(() => legalMoves(state, rules), [state, rules]);
  const gameOver = status.state !== 'ongoing';

  const movableSquares = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const mustCapture = legal.length > 0 && legal.every((m) => m.isCapture);

  // The drop-targets are the IMMEDIATE next jumps, never the chain's final
  // landing: mid-chain it's the candidates' next step; otherwise the selected
  // piece's first step. Quiet moves are length-1 chains, so this is unchanged
  // for them. Each target maps to the moves still consistent with reaching it.
  const stepTargets = useMemo<Map<number, Move[]>>(() => {
    if (chain) return nextStepTargets(chain.moves, chain.step);
    if (selected != null) return nextStepTargets(movesFrom(legal, selected), 0);
    return new Map();
  }, [chain, selected, legal]);

  const destinations = useMemo(() => new Set(stepTargets.keys()), [stepTargets]);
  const captureTargets = useMemo(
    () => new Set([...stepTargets].filter(([, ms]) => ms[0]!.isCapture).map(([sq]) => sq)),
    [stepTargets],
  );

  // Mid-chain, render the position after the jumps taken so far. We replay a
  // prefix of the chain's representative Move through the engine (applyMove
  // re-simulates from `from` + `path`), and migrate column ids jump-by-jump so
  // the capturing column glides across each hop and tucks one prisoner per jump.
  const chainView = useMemo(() => {
    if (!chain) return null;
    const rep = chain.moves[0]!;
    let ids = colIds;
    let prevBoard = state.board;
    for (let i = 0; i < chain.step; i++) {
      ids = advanceColumnIds(ids, prevBoard, singleJump(rep, i, chain.start));
      prevBoard = applyMove(state, prefixMove(rep, i + 1, chain.start), rules).board;
    }
    return { board: prevBoard, ids };
  }, [chain, state, colIds, rules]);

  const displayBoard = chainView ? chainView.board : state.board;
  const displayColIds = chainView ? chainView.ids : colIds;
  const displaySelected = chain ? chain.pos : selected;
  const displayMovable = chain ? new Set([chain.pos]) : movableSquares;
  const displayFx: MoveFx | null = chain
    ? { square: chain.pos, tuckCount: 1, promoted: false }
    : moveFx;

  /** Apply `move` from `prev`, recording history and migrating column ids so the
   *  moved column glides to its destination. The one path both human and AI use.
   *  `tuck` overrides how many prisoners animate on the landing square — a human
   *  playing a chain jump-by-jump has already tucked the earlier prisoners, so
   *  the final commit pops only the last one (the AI commits all at once). */
  const playMove = useCallback((prev: GameState, move: Move, tuck?: number) => {
    setHistory((h) => [...h, prev]);
    setMoves((m) => [...m, move]);
    setJustSaved(false); // the saved snapshot is now stale until re-saved
    setColIds((ids) => advanceColumnIds(ids, prev.board, move));
    // One-shot reward feedback on the landing square: tuck prisoners under the
    // cap and pop a fresh promotion. Cleared (null) on quiet, non-promoting moves.
    setMoveFx(
      move.isCapture || move.promotion
        ? {
            square: move.to,
            tuckCount: move.isCapture ? (tuck ?? move.captures.length) : 0,
            promoted: move.promotion,
          }
        : null,
    );
    setState(applyMove(prev, move, rules));
    setSelected(null);
    setChain(null);
    setHint(null);
  }, [rules]);

  const isAiTurn = mode === 'ai' && !gameOver && state.toMove === aiColor;

  useEffect(() => {
    if (!isAiTurn) return;
    setThinking(true);
    let cancelled = false;
    const snapshot = state;
    const started = Date.now();
    // Search runs in a Web Worker so the UI thread never blocks. Keep a minimum
    // visible "thinking" beat so the move doesn't snap in jarringly.
    getBestMove(snapshot, { difficulty, rules }).then((move) => {
      if (cancelled) return;
      const wait = Math.max(0, 350 - (Date.now() - started));
      aiTimer.current = setTimeout(() => {
        if (cancelled) return;
        setThinking(false);
        if (!move) return;
        // Single-step moves (quiet or one jump) just play. A multi-jump capture
        // is walked hop-by-hop — same mid-chain rendering the human uses — so the
        // computer's column visibly leaps from prey to prey, tucking one prisoner
        // per jump, before the turn passes.
        if (move.path.length <= 1) {
          playMove(snapshot, move);
          return;
        }
        const total = move.path.length;
        const advance = (step: number) => {
          if (cancelled) return;
          if (step >= total) {
            // Final hop commits the whole Move; earlier prisoners already tucked,
            // so only the last one pops (tuck = 1), matching the human chain.
            playMove(snapshot, move, 1);
            return;
          }
          setChain({ start: move.from, step, pos: move.path[step - 1]!, moves: [move] });
          aiTimer.current = setTimeout(() => advance(step + 1), AI_HOP_MS);
        };
        advance(1);
      }, wait);
    });
    return () => {
      cancelled = true;
      if (aiTimer.current) clearTimeout(aiTimer.current);
      // Abandon any half-shown AI chain so a cancelled animation can't strand the
      // board mid-capture (e.g. difficulty changed while the computer was moving).
      setChain(null);
    };
  }, [isAiTurn, state, difficulty, rules, playMove]);

  const handleSquareClick = useCallback(
    (square: number) => {
      if (gameOver || isAiTurn || thinking) return;
      setHint(null); // any interaction dismisses a shown hint

      // Did the player click an offered next-jump square? Advance the chain.
      const candidates = stepTargets.get(square);
      if (candidates && (chain || selected != null)) {
        const start = chain ? chain.start : selected!;
        const nextStep = (chain ? chain.step : 0) + 1;
        // A landing ends the move iff no candidate keeps capturing past it. The
        // engine never mixes a stopping and a continuing sequence at the same
        // square (a capture is forced to continue if it can), so this is uniform.
        const done = candidates.every((m) => m.path.length === nextStep);
        if (done) {
          // Commit the full Move atomically. Per-jump chains have already tucked
          // earlier prisoners, so only the final one pops now (tuck = 1).
          playMove(state, candidates[0]!, nextStep > 1 ? 1 : undefined);
        } else {
          setChain({ start, step: nextStep, pos: square, moves: candidates });
        }
        return;
      }

      if (chain) return; // mid-chain: clicking off the path does nothing (capture is forced)
      if (movableSquares.has(square)) {
        setSelected((cur) => (cur === square ? null : square));
        return;
      }
      setSelected(null);
    },
    [gameOver, isAiTurn, thinking, stepTargets, chain, selected, state, playMove, movableSquares],
  );

  /** Reveal the full forced chain (every square on the route) without playing it
   *  — the player still clicks through it jump-by-jump. Prefers the longest
   *  capture; falls back to a quiet move's destination when nothing captures. */
  const showHint = useCallback(() => {
    if (chain) {
      const rep = longestMove(chain.moves);
      setHint(new Set([chain.pos, ...rep.path.slice(chain.step)]));
      return;
    }
    const pool = selected != null ? movesFrom(legal, selected) : legal;
    if (pool.length === 0) return;
    const caps = pool.filter((m) => m.isCapture);
    const rep = longestMove(caps.length ? caps : pool);
    if (selected == null) setSelected(rep.from);
    setHint(new Set([rep.from, ...rep.path]));
  }, [chain, selected, legal]);

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
    setChain(null);
    setHint(null);
    setThinking(false);
  }, []);

  const undo = useCallback(() => {
    setHint(null);
    // Mid-chain nothing is committed yet, so Undo just abandons the in-progress
    // capture (back to before the piece was picked up) rather than popping a move.
    if (chain) {
      setChain(null);
      setSelected(null);
      return;
    }
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
  }, [mode, aiColor, chain]);

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
      variant: ruleVariant,
      result,
      ...(resultReason ? { resultReason } : {}),
      ...(mode === 'ai' ? { difficulty, aiColor } : {}),
    };
    const existing = savedId ? getSavedGame(savedId) : undefined;
    const saved = existing ? mergeIntoSave(existing, input) : buildSavedGame(input);
    upsertSavedGame(saved);
    setSavedId(saved.id);
    setJustSaved(true);
  }, [moves, mode, ruleVariant, status, difficulty, aiColor, savedId]);

  const statusLine = useMemo(() => {
    if (status.state === 'win') return `${COLOR_NAME[status.winner]} wins — ${status.reason.replace('-', ' ')}.`;
    if (status.state === 'draw') return `Draw — ${status.reason.replace('-', ' ')}.`;
    const who = COLOR_NAME[state.toMove];
    if (isAiTurn || thinking) return `${who} (computer) is thinking…`;
    return `${who} to move${mustCapture ? ' — you must capture' : ''}.`;
  }, [status, state.toMove, isAiTurn, thinking, mustCapture]);

  const StatusIcon = status.state === 'win' ? Trophy : status.state === 'draw' ? Minus : CircleDot;

  return (
    <div className="game">
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

      <div className="board-wrap">
        <BoardView
          board={displayBoard}
          dim={BOARD_DIM}
          rcToSquare={RC_TO_SQUARE}
          selected={displaySelected}
          movable={displayMovable}
          destinations={destinations}
          onSquareClick={handleSquareClick}
          interactive={!gameOver && !isAiTurn && !thinking}
          activeColor={state.toMove}
          mustCapture={mustCapture}
          captureTargets={captureTargets}
          hint={hint ?? undefined}
          colIds={displayColIds}
          moveFx={displayFx}
        />
      </div>

      <aside className="game-side" aria-label="Game controls">
        <div className="controls primary-controls">
          <button className="btn" onClick={newGame}>
            <RotateCcw size={16} /> New game
          </button>
          <button className="btn" onClick={undo} disabled={history.length === 0 || isAiTurn || thinking}>
            <Undo2 size={16} /> Undo
          </button>
          <button
            className={`btn${hint ? ' active' : ''}`}
            onClick={showHint}
            disabled={gameOver || isAiTurn || thinking || legal.length === 0}
            aria-label="Reveal the full forced capture chain"
            title="Reveal the full forced capture chain — you still play it jump by jump"
          >
            <Lightbulb size={16} /> Hint
          </button>
        </div>

        <div className="side-card save-card">
          <button className="btn block" onClick={saveGame} disabled={moves.length === 0}>
            {justSaved ? <Check size={16} /> : <Save size={16} />}{' '}
            {justSaved ? 'Saved' : savedId ? 'Update save' : 'Save game'}
          </button>
          {justSaved ? (
            <button className="btn block ghost" onClick={onOpenMyGames}>
              <Library size={16} /> Watch &amp; annotate
            </button>
          ) : (
            <p className="diff-blurb">
              {moves.length === 0
                ? 'Make a move, then save this game to rewatch and annotate it later.'
                : 'Save this game to your library — rewatch it move-by-move and add notes.'}
            </p>
          )}
        </div>

        <div className="segment opponent-segment" role="group" aria-label="Opponent">
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>
            <Cpu size={15} /> Computer
          </button>
          <button className={mode === 'hotseat' ? 'active' : ''} onClick={() => setMode('hotseat')}>
            <Users size={15} /> Two players
          </button>
        </div>

        {mode === 'ai' && (
          <div className="side-card">
            <div className="card-row">
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
                <span>Plays</span>
                <select className="neu-select" value={aiColor} onChange={(e) => setAiColor(e.target.value as PlayerColor)}>
                  <option value="B">Black (you 1st)</option>
                  <option value="W">White (PC 1st)</option>
                </select>
              </label>
            </div>
            <p className="diff-blurb">
              Looks <b>{DIFFICULTY_DEPTH[difficulty]} half-moves</b> ahead. {DIFFICULTY_BLURB[difficulty]}
            </p>
            <button className="btn block subtle" onClick={onLearnAI}>
              <Cpu size={15} /> How the computer plays
            </button>
          </div>
        )}

        <div className="side-card">
          <label className="field-label">
            <span className="label-ico"><Scale size={12} /> Rules</span>
            <select
              className="neu-select"
              value={ruleVariant}
              onChange={(e) => setRuleVariant(e.target.value as RuleVariant)}
            >
              {RULE_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {RULE_VARIANT_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
          <p className="diff-blurb">{RULE_VARIANT_BLURB[ruleVariant]}</p>
        </div>
      </aside>

      <Legend />
    </div>
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
