import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  chooseMove,
  RC_TO_SQUARE,
  type GameState,
  type Column,
  type Move,
  type PlayerColor,
} from '../../src/index.ts';
import { Palette, Sparkles } from 'lucide-react';
import { Insignia, usePieceTheme } from './pieceTheme.tsx';
import { DotMascot } from './mascots.tsx';
import './landing.css';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** square index -> its grid-cell index (r*7+c), so we can locate cells in the DOM. */
const SQ_TO_IDX: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (let i = 0; i < RC_TO_SQUARE.length; i++) {
    const sq = RC_TO_SQUARE[i]!;
    if (sq !== -1) m[sq] = i;
  }
  return m;
})();

/** A column drawn as a real stack of coins — the same model the game board uses:
 *  every captured piece is a full disc tucked beneath the next, lifted by `--lpeek`
 *  so the column rises into a tower. The commander on top carries the rank insignia
 *  (and an accent ring when promoted); a small badge counts the stack. */
function DemoColumn({ col }: { col: Column }) {
  const pieceTheme = usePieceTheme();
  const n = col.length;
  const top = n - 1;
  return (
    <span
      className="lcolumn"
      style={{ height: `calc(var(--lcoin) + var(--lpeek) * ${n - 1})` }}
    >
      {col.map((piece, i) => {
        const isTop = i === top;
        const isOfficer = piece.rank === 'officer';
        return (
          <span
            key={i}
            className={`piece ${piece.color === 'W' ? 'light' : 'dark'}${isTop ? ' top' : ''}${isTop && isOfficer ? ' officer' : ''}`}
            style={{ bottom: `calc(var(--lpeek) * ${i})`, zIndex: i + 1 }}
          >
            {isTop && <Insignia theme={pieceTheme} rank={piece.rank} />}
          </span>
        );
      })}
      {n > 1 && <span className="count">{n}</span>}
    </span>
  );
}

/**
 * The hero board, playing itself — the real engine + AI driving an unattended
 * game that resets when it ends. Shows the column-stacking live. Non-interactive.
 */
type DemoResult = { winner: PlayerColor | null };

/** What the engine just played, handed to the analysis viewer. `result` is the
 *  recorded outcome ('unfinished' when the player opens it mid-game). */
export type DemoSnapshot = (moves: Move[], result: 'W' | 'B' | 'draw' | 'unfinished') => void;

function DemoBoard({ onAnalyze }: { onAnalyze: DemoSnapshot }) {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [result, setResult] = useState<DemoResult | null>(null);
  const [round, setRound] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const boardRef = useRef<HTMLDivElement>(null);
  // every move the engine has played this round, in order — replayed/analysed on demand
  const movesRef = useRef<Move[]>([]);
  // the last move's from/to grid indices, so we can slide the landed column in
  const lastMoveRef = useRef<{ fromIdx: number; toIdx: number } | null>(null);

  // One self-played game per round. When it ends we STOP and show the result;
  // "Watch another" bumps `round` to start a fresh game.
  useEffect(() => {
    lastMoveRef.current = null;
    movesRef.current = [];
    setResult(null);
    setState(createInitialState());
    if (prefersReducedMotion()) return; // hold a static opening
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (cancelled) return;
      const prev = stateRef.current;
      const status = gameStatus(prev);
      if (status.state !== 'ongoing') {
        setResult({ winner: status.state === 'win' ? status.winner : null });
        return; // stop — show who won
      }
      if (legalMoves(prev).length === 0) {
        setResult({ winner: prev.toMove === 'W' ? 'B' : 'W' }); // side to move is stuck
        return;
      }
      const move = chooseMove(prev, { depth: 2, blunderRate: 0.18 });
      if (move) {
        movesRef.current.push(move);
        lastMoveRef.current = { fromIdx: SQ_TO_IDX[move.from]!, toIdx: SQ_TO_IDX[move.to]! };
        setState(applyMove(prev, move));
      }
      timer = setTimeout(step, 1250);
    };
    timer = setTimeout(step, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [round]);

  // Hand the recorded game to the analysis viewer. `finished` carries the result;
  // opening it while the engine is still playing analyses the game so far.
  const analyze = (finished: boolean) => {
    const moves = movesRef.current;
    if (moves.length === 0) return;
    const outcome = !finished
      ? 'unfinished'
      : result?.winner === 'W'
        ? 'W'
        : result?.winner === 'B'
          ? 'B'
          : 'draw';
    onAnalyze(moves.slice(), outcome);
  };

  // After each move, slide the landed column from its source square to the
  // destination — so a capture reads as motion, not a snap.
  useLayoutEffect(() => {
    const lm = lastMoveRef.current;
    const board = boardRef.current;
    if (!lm || !board) return;
    lastMoveRef.current = null;
    const fromEl = board.children[lm.fromIdx] as HTMLElement | undefined;
    const toEl = board.children[lm.toIdx] as HTMLElement | undefined;
    const column = toEl?.querySelector<HTMLElement>('.lcolumn');
    if (!fromEl || !toEl || !column) return;
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const dx = fr.left - tr.left;
    const dy = fr.top - tr.top;
    if (!dx && !dy) return;
    column.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)`, offset: 0 },
        { transform: 'translate(0, 0)', offset: 1 },
      ],
      { duration: 520, easing: 'cubic-bezier(.34,.8,.3,1)' },
    );
  }, [state]);

  const cells = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const sq = RC_TO_SQUARE[r * 7 + c]!;
      if (sq === -1) {
        cells.push(<div key={`${r}-${c}`} className="cell" />);
        continue;
      }
      const col = state.board[sq] ?? null;
      cells.push(
        <div key={`${r}-${c}`} className="cell play">
          {col && col.length > 0 && <DemoColumn col={col} />}
        </div>,
      );
    }
  }

  return (
    <>
      <div className="board-frame">
        <div className="board" ref={boardRef} role="img" aria-label="The Laska engine playing a game against itself.">
          {cells}
        </div>
      </div>
      {result ? (
        <p className="demo-note demo-result">
          <strong>
            {result.winner === null
              ? 'A draw.'
              : `The ${result.winner === 'W' ? 'light' : 'dark'} army wins.`}
          </strong>
          <button className="demo-again" onClick={() => analyze(true)}>
            <Sparkles size={14} /> Analyze this game
          </button>
          <button className="demo-again" onClick={() => setRound((r) => r + 1)}>
            Watch another
          </button>
        </p>
      ) : (
        <p className="demo-note">
          <span className="pulse" aria-hidden="true" />
          Live demo — the engine is playing itself. Watch a captured piece slip beneath its captor and
          the columns rise.
          {movesRef.current.length >= 4 && (
            <button className="demo-analyze" onClick={() => analyze(false)}>
              <Sparkles size={13} /> Analyze this game
            </button>
          )}
        </p>
      )}
    </>
  );
}

/**
 * The marketing landing page (ported from laska.html). Stone + eucalyptus
 * palette — the site default. Every "Play" CTA enters the game board.
 */
export function Landing({
  onPlay,
  onLasker,
  onReplay,
  onBrochure,
  onAI,
  onBuild,
  onLessons,
  themeLabel,
  onCycleTheme,
  onAnalyzeFeatured,
}: {
  onPlay: () => void;
  onLasker: () => void;
  onReplay: () => void;
  onBrochure: () => void;
  onAI: () => void;
  onBuild: () => void;
  onLessons: () => void;
  themeLabel: string;
  onCycleTheme: () => void;
  onAnalyzeFeatured: DemoSnapshot;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // gentle scroll reveal, matching the original
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing-page" ref={rootRef}>
      <header className="topbar">
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <div className="topbar-actions">
            <button
              className="btn"
              onClick={onCycleTheme}
              aria-label={`Color theme: ${themeLabel}. Click to change.`}
              title="Change color theme"
            >
              <Palette size={16} /> {themeLabel}
            </button>
            <button className="btn" onClick={onPlay}>
              <span className="dot" />
              Play the game
            </button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-grid">
          <div className="reveal">
            <p className="eyebrow">The Great Military Game · 1911</p>
            <h1>
              Capture builds.
              <br />
              <span className="light">Nothing is</span> <em className="serif">erased.</em>
            </h1>
            <p className="lede">
              Laska is draughts reimagined by a world chess champion — where every piece you take is
              carried beneath your own, and the board grows into towers.
            </p>
            <div className="hero-actions">
              <button className="btn btn-lg" onClick={onPlay}>
                Start playing
              </button>
              <span className="since">Invented by Emanuel Lasker</span>
            </div>
          </div>

          <div className="reveal order-art">
            <DemoBoard onAnalyze={onAnalyzeFeatured} />
            <div className="legend">
              <span className="swatch">
                <i className="dark" /> One army, 11 pieces
              </span>
              <span className="swatch">
                <i className="light" /> The other, 11 pieces
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mechanic">
        <div className="wrap">
          <div className="reveal">
            <p className="eyebrow">Why Laska is different</p>
            <h2 className="lead-h2">Pieces are taken prisoner, not taken off.</h2>
            <p className="section-intro">
              In ordinary draughts, a jumped piece leaves the board for good. Lasker changed the
              single rule that mattered: the piece you capture slides <em className="serif">underneath</em>{' '}
              yours, and the two move together as a column. The board never empties — it stacks.
            </p>
          </div>

          <div className="panel reveal">
            <div>
              <div className="mech-step">
                <div className="mech-num">1</div>
                <div>
                  <b>You jump an enemy.</b> Just like checkers — you leap an adjacent opponent and land
                  on the empty square beyond.
                </div>
              </div>
              <div className="mech-step">
                <div className="mech-num">2</div>
                <div>
                  <b>It tucks beneath you.</b> The captured piece isn't removed. It becomes a prisoner at
                  the base of your column.
                </div>
              </div>
              <div className="mech-step">
                <div className="mech-num">3</div>
                <div>
                  <b>The top piece rules.</b> A column moves, jumps and belongs to whoever sits on top —
                  its <em className="serif">commander</em>.
                </div>
              </div>
              <div className="mech-step">
                <div className="mech-num">4</div>
                <div>
                  <b>Capture frees the rest.</b> Jump an enemy column and you take only its commander.
                  Everything below is released and rejoins play under a new top piece.
                </div>
              </div>
            </div>

            <div className="capture-demo" aria-hidden="true">
              <span className="cap-label">A capture, in motion</span>
              <div className="demo-stage">
                <div className="demo-board">
                  {Array.from({ length: 9 }, (_, k) => {
                    const dr = Math.floor(k / 3);
                    const dc = k % 3;
                    return <span key={k} className={`well${(dr + dc) % 2 === 0 ? ' play' : ''}`} />;
                  })}
                </div>
                <div className="demo-grp">
                  <span className="demo-piece victim" />
                  <span className="demo-piece commander" />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <span className="tag">
                  <span className="marker cmd" /> Commander — controls the stack
                </span>
                <span className="tag">
                  <span className="marker pri" /> Prisoner — held beneath, can be freed
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="rules">
        <div className="wrap">
          <div className="reveal">
            <p className="eyebrow">How to play</p>
            <h2 className="lead-h2">Five rules and you're playing.</h2>
            <p className="section-intro">
              The motion is checkers. The depth comes from the columns. Learn these in order and the
              rest follows naturally.
            </p>
            <div className="hero-actions" style={{ marginTop: '1.6rem' }}>
              <button className="btn" onClick={onBrochure}>
                Read the full rules
              </button>
              <button className="btn" onClick={onAI}>
                How the computer plays
              </button>
              <button className="btn" onClick={onBuild}>
                How this was built
              </button>
              <button className="btn" onClick={onLessons}>
                Interactive lessons
              </button>
            </div>
          </div>

          <div className="rules-grid reveal">
            <article className="card">
              <span className="idx">01</span>
              <h3>The board</h3>
              <p>
                Play on a 7×7 board, using only the 25 dark squares. Each side opens with 11 soldiers
                spread across the three nearest rows.
              </p>
            </article>
            <article className="card">
              <span className="idx">02</span>
              <h3>Movement</h3>
              <p>
                A soldier steps one square diagonally forward. Reach the far row and it becomes an
                officer — free to move and capture in either direction.
              </p>
            </article>
            <article className="card">
              <span className="idx">03</span>
              <h3>The capture</h3>
              <p>
                Jumping is compulsory. You leap an adjacent enemy and the captured piece tucks beneath
                yours. A turn can chain several jumps in a row.
              </p>
            </article>
            <article className="card">
              <span className="idx">04</span>
              <h3>Columns</h3>
              <p>
                A stack answers only to its commander on top. Capture a column and you take that
                commander alone — the prisoners below are freed.
              </p>
            </article>
            <article className="card">
              <span className="idx">05</span>
              <h3>Winning</h3>
              <p>
                Leave your opponent with no piece able to move, or no legal move to make. The towers
                decide who runs out of room first.
              </p>
            </article>
            <article className="card note">
              <h3>Why 7×7?</h3>
              <p>
                Lasker shrank the usual 8×8 board on purpose — removing the double corner that makes
                standard draughts so prone to draws.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="lasker">
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '60ch' }}>
            <p className="eyebrow">The man who made it</p>
            <h2 className="lead-h2">Emanuel Lasker.</h2>
            <p className="section-intro">
              A world champion who treated games as serious thought — and built one of his own.
            </p>
          </div>

          <div className="lasker-grid" style={{ marginTop: 'clamp(2.5rem,5vw,3.5rem)' }}>
            <div className="portrait reveal">
              <img
                className="portrait-photo"
                src="/young-emanuel-lasker.png"
                alt="Portrait of a young Emanuel Lasker, inventor of Laska."
                width={180}
                height={180}
                loading="lazy"
              />
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <span className="name">Emanuel Lasker</span>
                <span className="years">1868 — 1941</span>
              </div>
            </div>

            <div className="reveal">
              <p style={{ fontSize: '1.12rem', marginBottom: '1.5rem' }}>
                Lasker held the world chess championship for{' '}
                <b style={{ color: 'var(--l-ink)' }}>twenty-seven years</b> — from 1894 to 1921 — the
                longest reign the title has ever known. He was also a doctor of mathematics, a published
                philosopher, a friend of Albert Einstein, and, in 1911, the inventor of this game.
              </p>

              <div className="timeline">
                <div className="tl-item">
                  <span className="tl-year">1868</span>
                  <p>Born in Berlinchen, Prussia — today <b>Barlinek, Poland</b>.</p>
                </div>
                <div className="tl-item">
                  <span className="tl-year">1894</span>
                  <p>Defeats Wilhelm Steinitz to become the <b>second World Chess Champion</b>.</p>
                </div>
                <div className="tl-item">
                  <span className="tl-year">1902</span>
                  <p>Awarded a <b>doctorate in mathematics</b> at Erlangen.</p>
                </div>
                <div className="tl-item">
                  <span className="tl-year">1905</span>
                  <p>Introduces the primary decomposition of ideals — later the <b>Lasker–Noether theorem</b>.</p>
                </div>
                <div className="tl-item">
                  <span className="tl-year">1911</span>
                  <p>Publishes <b>The Rules of Lasca, the Great Military Game</b>.</p>
                </div>
                <div className="tl-item">
                  <span className="tl-year">1921</span>
                  <p>Cedes the title to José Raúl Capablanca after 27 years on top.</p>
                </div>
                <div className="tl-item">
                  <span className="tl-year">1941</span>
                  <p>Dies in New York at the age of 72.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="facts reveal">
            <div className="fact">
              <span className="big">27 yrs</span>
              <small>The longest reign of any World Chess Champion.</small>
            </div>
            <div className="fact">
              <span className="big">Algebra</span>
              <small>His work on ideals became foundational to modern ring theory.</small>
            </div>
            <div className="fact">
              <span className="big">Einstein</span>
              <small>A close friend, who wrote the foreword to Lasker's biography.</small>
            </div>
            <div className="fact">
              <span className="big">One game</span>
              <small>Among bridge, Go and chess, Laska was Lasker's own invention.</small>
            </div>
          </div>

          <div className="reveal" style={{ marginTop: 'clamp(3rem,6vw,4rem)', maxWidth: '64ch' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.9rem' }}>
              Havana, 1921 — <em className="serif">the end of the reign</em>
            </h3>
            <p style={{ fontSize: '1.08rem' }}>
              By 1921 Lasker had worn the crown for twenty-seven years. José Raúl Capablanca — the
              "Human Chess Machine" — and his backers finally drew him to a title match in Havana, in
              the full weight of the Cuban heat. The conditions broke him: for the first time in his
              championship life Lasker began <b style={{ color: 'var(--l-ink)' }}>losing games</b>, and
              he conceded the match without a single win — 0–4 with ten draws.
            </p>
            <p style={{ fontSize: '1.08rem', marginTop: '1rem' }}>
              The story passed down in the family is that the heat overwhelmed him completely — that at
              the close he was carried off by ambulance, a twenty-seven-year reign ending not at the
              board but in the Havana sun.
            </p>
            <div className="hero-actions" style={{ marginTop: '1.8rem' }}>
              <button className="btn" onClick={onLasker}>
                Read his full story
              </button>
              <button className="btn" onClick={onReplay}>
                <span className="dot" />
                Watch a historic game
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="play" className="closing">
        <div className="wrap">
          <div className="panel reveal">
            <DotMascot color="var(--l-accent)" mood="idle" size={92} label="Laska mascot" />
            <p className="eyebrow" style={{ marginTop: '0.4rem', marginBottom: '1.2rem' }}>
              Your move
            </p>
            <h2>
              A century-old game,
              <br />
              <em className="serif">built for now.</em>
            </h2>
            <p>
              Learn it in a minute, spend years on the depth beneath. Step onto the board and start
              stacking.
            </p>
            <button className="btn btn-lg" onClick={onPlay}>
              <span className="dot" />
              Play Laska
            </button>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">
            The Great Military Game · after Emanuel Lasker, 1911 ·{' '}
            <a href="https://github.com/melaniesigrid" target="_blank" rel="noopener noreferrer">
              © Melanie Baratto
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
