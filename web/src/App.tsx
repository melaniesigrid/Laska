import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  chooseMove,
  RC_TO_SQUARE,
  BOARD_DIM,
  type GameState,
  type Move,
  type PlayerColor,
  type Difficulty,
} from '../../src/index.ts';
import { BoardView } from './Board.tsx';
import { OnlinePanel } from './Online.tsx';
import { useOnline } from './useOnline.ts';
import { Landing } from './Landing.tsx';

type Mode = 'hotseat' | 'ai';

const COLOR_NAME: Record<PlayerColor, string> = { W: 'White', B: 'Black' };

/** All legal moves grouped so the UI can answer "what can this square do?". */
function movesFrom(moves: Move[], square: number): Move[] {
  return moves.filter((m) => m.from === square);
}

export function App() {
  const [appMode, setAppMode] = useState<'local' | 'online'>('local');
  const [entered, setEntered] = useState(false);
  const online = useOnline();

  if (!entered) {
    return (
      <Landing
        onEnter={(mode) => {
          setAppMode(mode);
          setEntered(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-row">
          <div>
            <h1>Laska</h1>
            <p className="tagline">Emanuel Lasker's column-capturing draughts</p>
          </div>
          <nav className="modes" role="tablist">
            <button
              role="tab"
              aria-selected={appMode === 'local'}
              className={appMode === 'local' ? 'active' : ''}
              onClick={() => setAppMode('local')}
            >
              Local
            </button>
            <button
              role="tab"
              aria-selected={appMode === 'online'}
              className={appMode === 'online' ? 'active' : ''}
              onClick={() => setAppMode('online')}
            >
              Online
            </button>
          </nav>
        </div>
      </header>

      {appMode === 'local' ? <LocalGame /> : <OnlinePanel online={online} />}

      <footer className="foot">
        {appMode === 'local'
          ? 'Local play · rules engine + AI run entirely in your browser. No account needed.'
          : 'Online play · the server validates every move; your move shows instantly and reconciles to the authoritative state.'}
      </footer>
    </div>
  );
}

function LocalGame() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [mode, setMode] = useState<Mode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [aiColor, setAiColor] = useState<PlayerColor>('B');
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [thinking, setThinking] = useState(false);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = useMemo(() => gameStatus(state), [state]);
  const legal = useMemo(() => legalMoves(state), [state]);
  const gameOver = status.state !== 'ongoing';

  // Squares the current player can move from (under forced capture, only the
  // capturing pieces will appear here — that's how we teach the rule).
  const movableSquares = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const mustCapture = legal.length > 0 && legal.every((m) => m.isCapture);

  // Destination squares for the selected piece.
  const destinations = useMemo(() => {
    if (selected == null) return new Map<number, Move>();
    const map = new Map<number, Move>();
    for (const m of movesFrom(legal, selected)) {
      // If two capture chains share a landing square, prefer the one that
      // captures more (a reasonable default for the slice).
      const existing = map.get(m.to);
      if (!existing || m.captures.length > existing.captures.length) map.set(m.to, m);
    }
    return map;
  }, [legal, selected]);

  // Destination squares that are captures (for the stronger forced-capture ring).
  const captureTargets = useMemo(
    () => new Set([...destinations].filter(([, m]) => m.isCapture).map(([sq]) => sq)),
    [destinations],
  );

  const commit = useCallback((next: GameState, prev: GameState) => {
    setHistory((h) => [...h, prev]);
    setState(next);
    setSelected(null);
  }, []);

  const isAiTurn = mode === 'ai' && !gameOver && state.toMove === aiColor;

  // Drive the AI on its turn.
  useEffect(() => {
    if (!isAiTurn) return;
    setThinking(true);
    // Defer so the UI paints the human's move before the AI replies.
    aiTimer.current = setTimeout(() => {
      const move = chooseMove(state, { difficulty });
      setThinking(false);
      if (move) {
        setHistory((h) => [...h, state]);
        setState((s) => applyMove(s, move));
        setSelected(null);
      }
    }, 350);
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [isAiTurn, state, difficulty]);

  const handleSquareClick = useCallback(
    (square: number) => {
      if (gameOver || isAiTurn || thinking) return;

      // Click a legal destination of the currently selected piece -> move.
      const move = destinations.get(square);
      if (selected != null && move) {
        commit(applyMove(state, move), state);
        return;
      }

      // Click one of your own movable pieces -> select it.
      if (movableSquares.has(square)) {
        setSelected((cur) => (cur === square ? null : square));
        return;
      }

      // Otherwise clear selection.
      setSelected(null);
    },
    [gameOver, isAiTurn, thinking, destinations, selected, state, commit, movableSquares],
  );

  const newGame = useCallback(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setState(createInitialState());
    setHistory([]);
    setSelected(null);
    setThinking(false);
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      // In AI mode, undo back to the human's previous turn (pop two if needed).
      let target = h.length - 1;
      const popped = h[target]!;
      setState(popped);
      setSelected(null);
      if (mode === 'ai' && popped.toMove === aiColor && target > 0) {
        target -= 1;
        setState(h[target]!);
        return h.slice(0, target);
      }
      return h.slice(0, target);
    });
  }, [mode, aiColor]);

  const statusLine = useMemo(() => {
    if (status.state === 'win') {
      return `${COLOR_NAME[status.winner]} wins — ${status.reason.replace('-', ' ')}.`;
    }
    if (status.state === 'draw') {
      return `Draw — ${status.reason.replace('-', ' ')}.`;
    }
    const who = COLOR_NAME[state.toMove];
    if (isAiTurn || thinking) return `${who} (AI) is thinking…`;
    return `${who} to move${mustCapture ? ' — you must capture' : ''}.`;
  }, [status, state.toMove, isAiTurn, thinking, mustCapture]);

  return (
      <div className="layout">
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
        />

        <aside className="panel">
          <div className={`status ${status.state}`} role="status" aria-live="polite">
            {statusLine}
          </div>

          <fieldset className="controls">
            <legend>Opponent</legend>
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === 'ai'}
                onChange={() => setMode('ai')}
              />
              vs Computer
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === 'hotseat'}
                onChange={() => setMode('hotseat')}
              />
              Two players (hot-seat)
            </label>
          </fieldset>

          {mode === 'ai' && (
            <fieldset className="controls">
              <legend>Computer</legend>
              <label>
                Difficulty{' '}
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="beginner">Beginner</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                Computer plays{' '}
                <select value={aiColor} onChange={(e) => setAiColor(e.target.value as PlayerColor)}>
                  <option value="B">Black (you go first)</option>
                  <option value="W">White (computer goes first)</option>
                </select>
              </label>
            </fieldset>
          )}

          <div className="buttons">
            <button onClick={newGame}>New game</button>
            <button onClick={undo} disabled={history.length === 0 || isAiTurn || thinking}>
              Undo
            </button>
          </div>

          <details className="legend-help" open>
            <summary>How to read the board</summary>
            <ul>
              <li>
                A square may hold a <strong>column</strong> (a stack). Only the{' '}
                <strong>top piece</strong> — the commander — controls it.
              </li>
              <li>
                <span className="chip-demo tiffany" /> White and{' '}
                <span className="chip-demo purple" /> Black. The{' '}
                <strong>center dot</strong> (opposite color) marks the commander on top; a{' '}
                ringed dot marks a promoted <strong>officer</strong> (moves both ways).
              </li>
              <li>Trapped pieces peek out as colored rims beneath the commander; the badge shows the column's height.</li>
              <li>Capturing is mandatory — only pieces that can capture are selectable then.</li>
            </ul>
          </details>
        </aside>
      </div>
  );
}
