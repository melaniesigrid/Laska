/**
 * Rewatch one of your own saved games, move by move, on the live engine — and
 * annotate it. Mirrors ReplayPage's stepping, but positions are reconstructed
 * from the saved move list (savedGames.ts) and every ply (plus the game itself)
 * carries an editable note that persists straight back to localStorage.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Library,
  Trophy,
  Minus,
  CircleDot,
  Sparkles,
} from 'lucide-react';
import { RC_TO_SQUARE, BOARD_DIM } from '../../src/index.ts';
import { BoardView } from './Board.tsx';
import { PieceThemeContext, type PieceTheme } from './pieceTheme.tsx';
import {
  useGameAnalysis,
  EvalBar,
  AnalysisSummary,
  ReviewBadge,
  BestLine,
  QualityMark,
} from './gameAnalysis.tsx';
import {
  getSavedGame,
  rebuildGame,
  moveToSan,
  upsertSavedGame,
  type SavedGame,
} from './savedGames.ts';
import './landing.css';

const EMPTY = new Set<number>();
const AUTOPLAY_MS = 1500;

/** A finished game's eval is its result, not a search (a terminal position has no
 *  legal moves to score). White-positive, in evaluation units. */
function terminalWhiteEval(result: SavedGame['result']): number {
  if (result === 'W') return 1200;
  if (result === 'B') return -1200;
  return 0; // draw (unfinished games never reach here — they still have moves)
}

const RESULT_LABEL: Record<SavedGame['result'], string> = {
  W: 'White wins',
  B: 'Black wins',
  draw: 'Draw',
  unfinished: 'Unfinished',
};

export function SavedGameReplay({
  id,
  onBack,
  onMyGames,
  pieceTheme,
}: {
  id: string;
  onBack: () => void;
  onMyGames: () => void;
  pieceTheme: PieceTheme;
}) {
  const [game, setGame] = useState<SavedGame | undefined>(() => getSavedGame(id));
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => window.scrollTo(0, 0), []);

  // Reconstruct positions from the saved moves. A failure here means a corrupt or
  // older-ruleset save; we render an explanatory state instead of crashing.
  const rebuilt = useMemo(() => {
    if (!game) return null;
    try {
      return { ...rebuildGame(game), error: null as string | null };
    } catch (e) {
      return { states: [], resolved: [], error: (e as Error).message };
    }
  }, [game]);

  const plies = useMemo(() => {
    if (!game || !rebuilt || rebuilt.error) return [];
    return game.moves.map((sm, i) => ({
      san: moveToSan(rebuilt.resolved[i]!),
      side: sm.by,
      moveNo: Math.floor(i / 2) + 1,
      note: sm.note,
      move: rebuilt.resolved[i]!,
    }));
  }, [game, rebuilt]);

  const lastPly = plies.length;

  // A signature of the actual moves — note/title edits don't change it, so an
  // existing analysis survives annotating, but a re-recorded game invalidates it.
  const moveSig = useMemo(
    () => (game ? game.moves.map((m) => `${m.from}-${m.to}-${m.captures.length}`).join('|') : ''),
    [game],
  );
  // Engine review of every position, on demand and off-thread (shared with the
  // historic-games viewer). `moveSig` as the reset key keeps an existing analysis
  // alive across note/title edits but discards it when the move list changes.
  const review = useGameAnalysis(
    rebuilt && !rebuilt.error ? rebuilt.states : [],
    rebuilt && !rebuilt.error ? rebuilt.resolved : [],
    { resetKey: moveSig, terminalEval: game ? terminalWhiteEval(game.result) : 0 },
  );

  useEffect(() => {
    if (!playing) return;
    if (ply >= lastPly) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setPly((p) => Math.min(p + 1, lastPly)), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, ply, lastPly]);

  useEffect(() => {
    const el = listRef.current?.querySelector('.move-cell.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const go = (p: number) => {
    setPlaying(false);
    setPly(Math.max(0, Math.min(lastPly, p)));
  };

  const persist = (next: SavedGame) => {
    next.updatedAt = Date.now();
    setGame(next);
    upsertSavedGame(next);
  };

  const setTitle = (title: string) => game && persist({ ...game, title });
  const setGameNote = (note: string) => game && persist({ ...game, note });
  const setPlyNote = (note: string) => {
    if (!game || ply === 0) return;
    const moves = game.moves.map((m, i) => (i === ply - 1 ? { ...m, note: note || undefined } : m));
    persist({ ...game, moves });
  };

  if (!game) {
    return (
      <div className="landing-page">
        <ReplayHeader onBack={onBack} onMyGames={onMyGames} />
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">Saved game</p>
            <h1 style={{ marginTop: '0.6rem' }}>That game isn’t here</h1>
            <p className="lede">It may have been deleted, or saved in a different browser.</p>
          </div>
        </section>
      </div>
    );
  }

  if (rebuilt?.error) {
    return (
      <div className="landing-page">
        <ReplayHeader onBack={onBack} onMyGames={onMyGames} />
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">Saved game</p>
            <h1 style={{ marginTop: '0.6rem' }}>{game.title}</h1>
            <p className="lede">This game couldn’t be replayed: {rebuilt.error}</p>
          </div>
        </section>
      </div>
    );
  }

  const state = rebuilt!.states[ply]!;
  const current = ply > 0 ? plies[ply - 1] : undefined;
  const landing = current ? new Set([current.move.to]) : EMPTY;
  const captureLanding = current?.move.isCapture ? new Set([current.move.to]) : EMPTY;

  const ResultIcon = game.result === 'draw' ? Minus : game.result === 'unfinished' ? CircleDot : Trophy;

  // Review of the move that produced the CURRENT position, and the engine eval of
  // that position — both null until the game has been analysed.
  const currentReview = ply > 0 ? review.reviews[ply - 1] ?? null : null;
  const currentWhiteEval = review.analysis ? review.analysis[ply]?.whiteEval ?? null : null;
  // The engine's preferred move at the current position, shown as a hint.
  const bestNext = review.analysis?.[ply]?.scored[0]?.move ?? null;

  return (
    <div className="landing-page">
      <ReplayHeader onBack={onBack} onMyGames={onMyGames} />

      <section className="hero" style={{ paddingTop: 'clamp(2rem,5vw,4rem)', paddingBottom: 'clamp(1.5rem,4vw,2.5rem)' }}>
        <div className="wrap">
          <p className="eyebrow">Your saved game</p>
          <input
            className="saved-title-input"
            value={game.title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Game title"
          />
          <p className="since" style={{ marginTop: '0.8rem' }}>
            <ResultIcon size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
            {RESULT_LABEL[game.result]}
            {game.resultReason ? ` · ${game.resultReason.replace(/-/g, ' ')}` : ''} · {lastPly} plies ·{' '}
            {new Date(game.createdAt).toLocaleDateString()}
          </p>
          <label className="saved-note-field">
            <span className="saved-note-label">Notes on this game</span>
            <textarea
              className="saved-note"
              placeholder="What did you learn? What would you play differently?"
              value={game.note ?? ''}
              onChange={(e) => setGameNote(e.target.value)}
              rows={2}
            />
          </label>
        </div>
      </section>

      <section style={{ paddingTop: 0, paddingBottom: 'var(--section-y)' }}>
        <div className="wrap replay-grid">
          <PieceThemeContext.Provider value={pieceTheme}>
            <div className="replay-board">
              <BoardView
                board={state.board}
                dim={BOARD_DIM}
                rcToSquare={RC_TO_SQUARE}
                selected={null}
                movable={EMPTY}
                destinations={landing}
                captureTargets={captureLanding}
                onSquareClick={() => {}}
                interactive={false}
                activeColor={state.toMove}
              />
            </div>
          </PieceThemeContext.Provider>

          <div className="replay-panel">
            <div className="analysis-block reveal in">
              {!review.analysis ? (
                <button
                  className="btn analyse-btn"
                  onClick={review.run}
                  disabled={review.analyzing || lastPly === 0}
                >
                  <Sparkles size={16} />
                  {review.analyzing
                    ? `Analysing… ${review.progress}/${review.total}`
                    : 'Analyse this game'}
                </button>
              ) : (
                <>
                  <EvalBar white={currentWhiteEval ?? 0} />
                  <AnalysisSummary summary={review.summary!} />
                  {bestNext && ply < lastPly && (
                    <p className="best-from-here">
                      Engine likes <b>{moveToSan(bestNext)}</b> here.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="replay-note reveal in">
              <span className="replay-ply-label">
                {ply === 0
                  ? 'Opening position'
                  : `${current!.moveNo}. ${current!.side === 'W' ? 'White' : 'Black'} — ${current!.san}`}
                <ReviewBadge review={currentReview} />
              </span>
              <BestLine review={currentReview} sanOf={moveToSan} />
              {ply === 0 ? (
                <p>Step through your game, or press play. Add a note to any move below.</p>
              ) : (
                <textarea
                  className="saved-note ply-note"
                  placeholder="Add a note to this move…"
                  value={current?.note ?? ''}
                  onChange={(e) => setPlyNote(e.target.value)}
                  rows={3}
                />
              )}
            </div>

            <div className="replay-controls">
              <button className="btn icon-only" onClick={() => go(0)} disabled={ply === 0} aria-label="First move">
                <ChevronFirst size={18} />
              </button>
              <button className="btn icon-only" onClick={() => go(ply - 1)} disabled={ply === 0} aria-label="Previous move">
                <ChevronLeft size={18} />
              </button>
              <button
                className="btn"
                onClick={() => (ply >= lastPly ? (go(0), setPlaying(true)) : setPlaying((p) => !p))}
                aria-label={playing ? 'Pause' : 'Play'}
                style={{ minWidth: '110px', justifyContent: 'center' }}
                disabled={lastPly === 0}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : ply >= lastPly ? 'Replay' : 'Play'}
              </button>
              <button className="btn icon-only" onClick={() => go(ply + 1)} disabled={ply >= lastPly} aria-label="Next move">
                <ChevronRight size={18} />
              </button>
              <button className="btn icon-only" onClick={() => go(lastPly)} disabled={ply >= lastPly} aria-label="Last move">
                <ChevronLast size={18} />
              </button>
            </div>
            <p className="replay-counter">
              Move {ply} <span>of {lastPly}</span>
            </p>

            <div className="move-list" ref={listRef}>
              {Array.from({ length: Math.ceil(lastPly / 2) }, (_, r) => {
                const w = plies[r * 2];
                const b = plies[r * 2 + 1];
                return (
                  <div className="move-row" key={r}>
                    <span className="move-no">{r + 1}.</span>
                    <button className={`move-cell${ply === r * 2 + 1 ? ' active' : ''}`} onClick={() => go(r * 2 + 1)}>
                      {w?.san}
                      <QualityMark review={review.reviews[r * 2]} />
                      {w?.note ? <span className="note-dot" aria-label="has a note" /> : null}
                    </button>
                    <button
                      className={`move-cell${b ? '' : ' empty'}${ply === r * 2 + 2 ? ' active' : ''}`}
                      onClick={() => b && go(r * 2 + 2)}
                      disabled={!b}
                    >
                      {b?.san ?? ''}
                      <QualityMark review={review.reviews[r * 2 + 1]} />
                      {b?.note ? <span className="note-dot" aria-label="has a note" /> : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">Your game, replayed move-by-move on the live engine.</span>
        </div>
      </footer>
    </div>
  );
}

function ReplayHeader({ onBack, onMyGames }: { onBack: () => void; onMyGames: () => void }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <button className="btn" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn" onClick={onMyGames}>
          <Library size={16} /> My games
        </button>
      </div>
    </header>
  );
}
