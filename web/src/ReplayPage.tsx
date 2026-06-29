import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Sparkles,
} from 'lucide-react';
import { LASKA } from '../../src/index.ts';
import { BoardView } from './Board.tsx';
import { HISTORIC_GAMES, type HistoricGame } from './games.ts';
import { moveToSan } from './savedGames.ts';
import {
  useGameAnalysis,
  EvalBar,
  AnalysisSummary,
  ReviewBadge,
  BestLine,
  QualityMark,
} from './gameAnalysis.tsx';
import { PieceThemeContext, type PieceTheme } from './pieceTheme.tsx';
import { ShareButton } from './ShareButton.tsx';
import './landing.css';

const EMPTY = new Set<number>();
const AUTOPLAY_MS = 1500;

/** A finished historic game's eval comes from its recorded result, since the
 *  final position usually isn't a no-legal-moves terminal (games end by
 *  resignation). White-positive; falls back to 0 (even) when unclear. */
function terminalWhiteEval(result: string): number {
  const r = result.toLowerCase();
  if (r.startsWith('white') || r.startsWith('1-0')) return 1200;
  if (r.startsWith('black') || r.startsWith('0-1')) return -1200;
  return 0;
}

/**
 * Replay a recorded historic game on the real board, one ply at a time. The
 * positions come straight from the engine (see games.ts), so what you step
 * through is the engine replaying the actual 1996 score.
 */
export function ReplayPage({
  onBack,
  onPlay,
  pieceTheme,
  gameId,
  featured,
  eyebrow,
  fine,
}: {
  onBack: () => void;
  onPlay: () => void;
  pieceTheme: PieceTheme;
  gameId?: string;
  /** A pre-built game to show instead of the historic library (no tabs) — used
   *  for the landing-page self-play demo and for shared replays. */
  featured?: HistoricGame;
  /** Override the section eyebrow / footer line (e.g. for a shared replay). */
  eyebrow?: string;
  fine?: string;
}) {
  // The historic library has a game switcher; a featured game stands alone.
  const games = featured ? [featured] : HISTORIC_GAMES;
  const initialIdx = featured ? 0 : Math.max(0, HISTORIC_GAMES.findIndex((g) => g.id === gameId));
  const [gameIdx, setGameIdx] = useState(initialIdx);
  const game = games[gameIdx]!;
  const lastPly = game.plies.length;
  const [ply, setPly] = useState(0); // 0 = opening position
  const [playing, setPlaying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const selectGame = (idx: number) => {
    setPlaying(false);
    setPly(0);
    setGameIdx(idx);
  };

  useEffect(() => window.scrollTo(0, 0), []);

  // autoplay: advance until the end, then stop
  useEffect(() => {
    if (!playing) return;
    if (ply >= lastPly) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setPly((p) => Math.min(p + 1, lastPly)), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, ply, lastPly]);

  const state = game.states[ply]!;
  const variant = game.variant ?? LASKA;
  const current = ply > 0 ? game.plies[ply - 1] : undefined;

  // Engine review of every position, on demand and off-thread (shared with the
  // saved-game viewer). Keyed on the game id so switching games drops the old run.
  const moves = useMemo(() => game.plies.map((p) => p.move), [game]);
  // Origin/destination of each ply — all a shareable link carries (share.ts).
  const shareMoves = useMemo(() => moves.map((m) => ({ from: m.from, to: m.to })), [moves]);
  const review = useGameAnalysis(game.states, moves, {
    resetKey: game.id,
    terminalEval: terminalWhiteEval(game.result),
  });
  const currentReview = ply > 0 ? review.reviews[ply - 1] ?? null : null;
  const currentWhiteEval = review.analysis ? review.analysis[ply]?.whiteEval ?? null : null;
  const bestNext = review.analysis?.[ply]?.scored[0]?.move ?? null;

  // ring the square the last move landed on
  const landing = useMemo(() => (current ? new Set([current.move.to]) : EMPTY), [current]);
  const captureLanding = useMemo(
    () => (current?.move.isCapture ? new Set([current.move.to]) : EMPTY),
    [current],
  );

  const go = (p: number) => {
    setPlaying(false);
    setPly(Math.max(0, Math.min(lastPly, p)));
  };

  // keep the active move scrolled into view in the list — only inside the
  // move-list, never the window (plain scrollIntoView scrolls every scrollable
  // ancestor, which would yank the board off-screen on each move).
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('.move-cell.active');
    if (!list || !el) return;
    const elRect = el.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (elRect.top < listRect.top) list.scrollTop -= listRect.top - elRect.top;
    else if (elRect.bottom > listRect.bottom) list.scrollTop += elRect.bottom - listRect.bottom;
  }, [ply]);

  const noteText =
    current?.note ??
    (ply === 0 ? 'The opening position — 11 soldiers a side, the centre row empty. Press play, or step through move by move.' : '');

  return (
    <div className="landing-page">
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="topbar-actions">
            <ShareButton moves={shareMoves} variant={variant.id} />
            <button className="btn" onClick={onPlay}>
              <span className="dot" />
              Play the game
            </button>
          </div>
        </div>
      </header>

      <section className="hero" style={{ paddingTop: 'clamp(2rem,5vw,4rem)', paddingBottom: 'clamp(1.5rem,4vw,2.5rem)' }}>
        <div className="wrap">
          <p className="eyebrow">{eyebrow ?? (featured ? 'The featured game' : 'A game from history')}</p>
          {!featured && HISTORIC_GAMES.length > 1 && (
            <div className="replay-tabs">
              {HISTORIC_GAMES.map((g, i) => (
                <button
                  key={g.id}
                  className={`replay-tab${i === gameIdx ? ' active' : ''}`}
                  onClick={() => selectGame(i)}
                >
                  {g.title}
                </button>
              ))}
            </div>
          )}
          <h1 style={{ fontSize: 'clamp(2.2rem,5vw,3.6rem)', margin: '0.6rem 0 0' }}>
            {game.white} <span className="light">vs</span> {game.black}
          </h1>
          <p className="lede" style={{ maxWidth: '52ch' }}>{game.intro}</p>
          <p className="since" style={{ marginTop: '1rem' }}>
            {game.event} · {game.result} · {game.sourceNote}
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 0, paddingBottom: 'var(--section-y)' }}>
        <div className="wrap replay-grid">
          <PieceThemeContext.Provider value={pieceTheme}>
            <div className="replay-board">
              <BoardView
                board={state.board}
                dim={variant.boardDim}
                rcToSquare={variant.rcToSquare}
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
                  {review.analyzing ? `Analysing… ${review.progress}/${review.total}` : 'Analyse this game'}
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
                {ply === 0 ? 'Opening' : `${current!.moveNo}. ${current!.side === 'W' ? 'White' : 'Black'} — ${current!.san}`}
                <ReviewBadge review={currentReview} />
              </span>
              {noteText && <p>{noteText}</p>}
              <BestLine review={currentReview} sanOf={moveToSan} />
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
                const w = game.plies[r * 2];
                const b = game.plies[r * 2 + 1];
                return (
                  <div className="move-row" key={r}>
                    <span className="move-no">{r + 1}.</span>
                    <button
                      className={`move-cell${ply === r * 2 + 1 ? ' active' : ''}`}
                      onClick={() => go(r * 2 + 1)}
                    >
                      {w?.san}
                      <QualityMark review={review.reviews[r * 2]} />
                    </button>
                    <button
                      className={`move-cell${b ? '' : ' empty'}${ply === r * 2 + 2 ? ' active' : ''}`}
                      onClick={() => b && go(r * 2 + 2)}
                      disabled={!b}
                    >
                      {b?.san ?? ''}
                      <QualityMark review={review.reviews[r * 2 + 1]} />
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
          <span className="fine">
            {fine ??
              (featured
                ? 'The engine’s own game, replayed move-by-move on the live engine.'
                : 'Historic game replayed move-by-move on the live engine.')}
          </span>
        </div>
      </footer>
    </div>
  );
}
