import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  chooseMove,
  RC_TO_SQUARE,
  BOARD_DIM,
  type GameState,
} from '../../src/index.ts';
import { BoardView } from './Board.tsx';

const EMPTY = new Set<number>();
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A board that plays itself — the real engine + AI driving an unattended game,
 * resetting when it ends. This is the hero: the column-capture mechanic shown
 * live rather than described. Purely decorative (non-interactive).
 */
function DemoBoard() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (prefersReducedMotion()) return; // hold a static position
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      if (cancelled) return;
      const prev = stateRef.current;
      const over = gameStatus(prev).state !== 'ongoing' || legalMoves(prev).length === 0;
      if (over) {
        setState(createInitialState()); // start a fresh game and keep playing
        timer = setTimeout(step, 1700);
        return;
      }
      // Shallow, slightly random play keeps it lively and cheap.
      const move = chooseMove(prev, { depth: 2, blunderRate: 0.18 });
      if (move) setState(applyMove(prev, move));
      timer = setTimeout(step, 1150);
    };

    timer = setTimeout(step, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="demo-screen" aria-hidden="true">
      <div className="demo-glass" />
      <BoardView
        board={state.board}
        dim={BOARD_DIM}
        rcToSquare={RC_TO_SQUARE}
        selected={null}
        movable={EMPTY}
        destinations={EMPTY}
        onSquareClick={() => {}}
        interactive={false}
      />
    </div>
  );
}

interface LandingProps {
  onEnter: (mode: 'local' | 'online') => void;
}

export function Landing({ onEnter }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing-ambient" aria-hidden="true" />
      <div className="landing-grain" aria-hidden="true" />
      <span className="float-disc fd-1" aria-hidden="true" />
      <span className="float-disc fd-2" aria-hidden="true" />
      <span className="float-disc fd-3" aria-hidden="true" />

      <header className="landing-top">
        <span className="brandmark">LASKA</span>
        <span className="brandtag">EST. 1911 · BERLIN</span>
      </header>

      <main className="landing-hero">
        <section className="hero-copy">
          <p className="eyebrow reveal" style={{ '--d': '0ms' } as CSSProperties}>
            Emanuel Lasker's column game
          </p>
          <h1 className="hero-title reveal" style={{ '--d': '80ms' } as CSSProperties}>
            Capture is not<br />removal.
          </h1>
          <p className="hero-lede reveal" style={{ '--d': '180ms' } as CSSProperties}>
            A draughts variant by the longest-reigning world chess champion. Jumped pieces
            aren't taken off the board — they're <em>trapped beneath</em> your piece, forming
            columns you command until the day they're freed.
          </p>

          <div className="hero-cta reveal" style={{ '--d': '300ms' } as CSSProperties}>
            <button className="neu-btn primary" onClick={() => onEnter('local')}>
              <span>Enter the studio</span>
              <span className="cta-sub">play the engine</span>
            </button>
            <button className="neu-btn" onClick={() => onEnter('online')}>
              <span>Play online</span>
              <span className="cta-sub">ranked · live</span>
            </button>
          </div>

          <ul className="hero-stats reveal" style={{ '--d': '420ms' } as CSSProperties}>
            <li><b>7×7</b><span>board</span></li>
            <li><b>11</b><span>soldiers each</span></li>
            <li><b>∞</b><span>pieces on board*</span></li>
          </ul>
        </section>

        <section className="hero-stage reveal" style={{ '--d': '240ms' } as CSSProperties}>
          <div className="neu-frame">
            <DemoBoard />
          </div>
          <p className="stage-caption">the engine, playing itself</p>
        </section>
      </main>

      <section className="landing-features">
        <article className="neu-card reveal" style={{ '--d': '500ms' } as CSSProperties}>
          <span className="card-glyph glyph-stack" aria-hidden="true" />
          <h3>Columns, not casualties</h3>
          <p>Every capture stacks. Lose the top and the prisoners below switch sides.</p>
        </article>
        <article className="neu-card reveal" style={{ '--d': '580ms' } as CSSProperties}>
          <span className="card-glyph glyph-ai" aria-hidden="true" />
          <h3>An engine that bites</h3>
          <p>Alpha-beta search over a column-aware evaluator, in four difficulties.</p>
        </article>
        <article className="neu-card reveal" style={{ '--d': '660ms' } as CSSProperties}>
          <span className="card-glyph glyph-rank" aria-hidden="true" />
          <h3>Ranked & real-time</h3>
          <p>Server-authoritative matches, Elo, and a clock — across the cluster.</p>
        </article>
      </section>

      <footer className="landing-foot">
        <span>*captured pieces are never removed — only buried.</span>
        <button className="text-enter" onClick={() => onEnter('local')}>
          Begin →
        </button>
      </footer>
    </div>
  );
}
