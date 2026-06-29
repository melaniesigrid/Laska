import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  GitBranch,
  BookOpen,
} from 'lucide-react';
import { BoardView } from './Board.tsx';
import {
  OPENINGS,
  BASHNI_OPENINGS,
  openingGeometry,
  OPENING_SOURCES,
  type Opening,
} from './openings.ts';
import { PieceThemeContext, type PieceTheme } from './pieceTheme.tsx';
import './landing.css';

const EMPTY = new Set<number>();

/** The two repertoires the study view can show. */
type Variant = 'laska' | 'bashni';

const REPERTOIRES: Record<Variant, { openings: Opening[]; label: string; lede: string }> = {
  laska: {
    openings: OPENINGS,
    label: 'Laska',
    lede:
      'The three openings Emanuel Lasker named in “Brettspiele der Völker” (1931). Step through each main line on the live engine, then branch into its variations.',
  },
  bashni: {
    openings: BASHNI_OPENINGS,
    label: 'Bashni',
    lede:
      'Principled developing lines for the 8×8 towers game Laska grew from — not a named historical canon, but sound first principles, each validated move-for-move through the engine.',
  },
};

/**
 * OpeningsPage — a read-only study/repertoire browser for the engine-validated
 * opening lines in `openings.ts`. Pick a repertoire (Laska / Bashni), choose an
 * opening, and step its main line move-by-move on the real `BoardView` (positions
 * come straight from the engine replaying Lasker's score, exactly like the replay
 * viewer). Listed variations and the source citations are shown alongside.
 *
 * This is the reference counterpart to the interactive Openings *course*
 * (`openingLessons.ts` → LessonsPage): the course teaches you to play the lines;
 * this page lets you browse and revise them. It renders nothing it can't validate
 * — every position and move here was resolved through `src/index.ts` at import.
 */
export function OpeningsPage({
  onBack,
  onPlay,
  onLearn,
  pieceTheme,
}: {
  onBack: () => void;
  onPlay: () => void;
  /** Jump to the interactive Openings course. */
  onLearn: () => void;
  pieceTheme: PieceTheme;
}) {
  const [variant, setVariant] = useState<Variant>('laska');
  const { openings, lede } = REPERTOIRES[variant];

  const [openingIdx, setOpeningIdx] = useState(0);
  const opening = openings[openingIdx]!;
  const lastPly = opening.mainLine.length;
  const [ply, setPly] = useState(0); // 0 = start position

  useEffect(() => window.scrollTo(0, 0), []);

  const selectVariant = (v: Variant) => {
    if (v === variant) return;
    setVariant(v);
    setOpeningIdx(0);
    setPly(0);
  };
  const selectOpening = (idx: number) => {
    setOpeningIdx(idx);
    setPly(0);
  };
  const go = (p: number) => setPly(Math.max(0, Math.min(lastPly, p)));

  const geom = useMemo(() => openingGeometry(opening), [opening]);
  const state = opening.states[ply]!;
  const current = ply > 0 ? opening.mainLine[ply - 1] : undefined;

  // Ring the square the last shown move landed on.
  const landing = useMemo(
    () => (current ? new Set([current.move.to]) : EMPTY),
    [current],
  );
  const captureLanding = useMemo(
    () => (current?.move.isCapture ? new Set([current.move.to]) : EMPTY),
    [current],
  );

  const plyLabel =
    ply === 0
      ? 'Start position'
      : `${current!.moveNo}. ${current!.side === 'W' ? 'White' : 'Black'} — ${current!.san}`;
  const noteText =
    ply === 0
      ? opening.description
      : ply === lastPly
        ? 'End of the main line. Browse the variations below, or step back through the moves.'
        : `Move ${ply} of ${lastPly}. Step on to see how the line develops.`;

  return (
    <div className="landing-page">
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="topbar-actions">
            <button className="btn" onClick={onLearn}>
              <GraduationCap size={16} /> Learn these
            </button>
            <button className="btn" onClick={onPlay}>
              <span className="dot" />
              Play the game
            </button>
          </div>
        </div>
      </header>

      <section
        className="hero"
        style={{ paddingTop: 'clamp(2rem,5vw,4rem)', paddingBottom: 'clamp(1.25rem,3vw,2rem)' }}
      >
        <div className="wrap">
          <p className="eyebrow">
            <BookOpen size={14} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
            The opening repertoire
          </p>
          <h1 style={{ fontSize: 'clamp(2.2rem,5vw,3.6rem)', margin: '0.4rem 0 0' }}>Openings</h1>
          <p className="lede" style={{ maxWidth: '56ch' }}>{lede}</p>

          <div
            className="segment lesson-track-toggle"
            role="group"
            aria-label="Repertoire"
            style={{ marginTop: '1.1rem' }}
          >
            <button
              className={variant === 'laska' ? 'active' : ''}
              onClick={() => selectVariant('laska')}
            >
              Laska
            </button>
            <button
              className={variant === 'bashni' ? 'active' : ''}
              onClick={() => selectVariant('bashni')}
            >
              Bashni
            </button>
          </div>

          <div className="replay-tabs" style={{ marginTop: '0.9rem' }}>
            {openings.map((o, i) => (
              <button
                key={o.id}
                className={`replay-tab${i === openingIdx ? ' active' : ''}`}
                onClick={() => selectOpening(i)}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 0, paddingBottom: 'var(--section-y)' }}>
        <div className="wrap replay-grid">
          <PieceThemeContext.Provider value={pieceTheme}>
            <div className="replay-board">
              <BoardView
                board={state.board}
                dim={geom.boardDim}
                rcToSquare={geom.rcToSquare}
                selected={null}
                movable={EMPTY}
                destinations={landing}
                captureTargets={captureLanding}
                highlight={EMPTY}
                onSquareClick={() => {}}
                interactive={false}
                activeColor={state.toMove}
              />
            </div>
          </PieceThemeContext.Provider>

          <div className="replay-panel">
            <div className="opening-head reveal in">
              <span className="lesson-ref">{opening.firstMove}</span>
              <h2 style={{ margin: '0.4rem 0 0', fontSize: 'clamp(1.3rem,3vw,1.7rem)' }}>
                {opening.name}
              </h2>
            </div>

            <div className="replay-note reveal in">
              <span className="replay-ply-label">{plyLabel}</span>
              {noteText && <p>{noteText}</p>}
            </div>

            <div className="replay-controls">
              <button className="btn icon-only" onClick={() => go(0)} disabled={ply === 0} aria-label="Start">
                <ChevronFirst size={18} />
              </button>
              <button className="btn icon-only" onClick={() => go(ply - 1)} disabled={ply === 0} aria-label="Previous move">
                <ChevronLeft size={18} />
              </button>
              <button className="btn icon-only" onClick={() => go(ply + 1)} disabled={ply >= lastPly} aria-label="Next move">
                <ChevronRight size={18} />
              </button>
              <button className="btn icon-only" onClick={() => go(lastPly)} disabled={ply >= lastPly} aria-label="End of line">
                <ChevronLast size={18} />
              </button>
            </div>
            <p className="replay-counter">
              Move {ply} <span>of {lastPly}</span>
            </p>

            <div className="move-list">
              {Array.from({ length: Math.ceil(lastPly / 2) }, (_, r) => {
                const w = opening.mainLine[r * 2];
                const b = opening.mainLine[r * 2 + 1];
                return (
                  <div className="move-row" key={r}>
                    <span className="move-no">{r + 1}.</span>
                    <button
                      className={`move-cell${ply === r * 2 + 1 ? ' active' : ''}`}
                      onClick={() => go(r * 2 + 1)}
                    >
                      {w?.san}
                    </button>
                    <button
                      className={`move-cell${b ? '' : ' empty'}${ply === r * 2 + 2 ? ' active' : ''}`}
                      onClick={() => b && go(r * 2 + 2)}
                      disabled={!b}
                    >
                      {b?.san ?? ''}
                    </button>
                  </div>
                );
              })}
            </div>

            {opening.variations.length > 0 && (
              <div className="opening-variations reveal in">
                <h3>
                  <GitBranch size={15} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
                  Variations
                </h3>
                <ul>
                  {opening.variations.map((vr, i) => (
                    <li key={i} className={vr.move ? '' : 'unresolved'}>
                      <span className="var-san">{vr.san}</span>
                      <span className="var-note">{vr.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="opening-source">{opening.sourceNote}</p>
          </div>
        </div>

        <div className="wrap">
          <div className="opening-sources reveal in">
            <h3>Sources</h3>
            <ul>
              {OPENING_SOURCES.map((s, i) => (
                <li key={i}>
                  {s.href ? (
                    <a href={s.href} target="_blank" rel="noreferrer noopener">
                      {s.label}
                    </a>
                  ) : (
                    s.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">
            Every opening line is the live engine replaying Lasker’s own theory — no move it would reject is shown.
          </span>
        </div>
      </footer>
    </div>
  );
}
