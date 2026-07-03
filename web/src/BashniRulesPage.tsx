import { useEffect, useRef } from 'react';
import { ArrowLeft, Play, Crown, Layers } from 'lucide-react';
import { BASHNI } from '../../src/index.ts';
import { BASHNI_OPENINGS } from './openings.ts';
import { useCoords } from './coordsPref.ts';
import './landing.css';

/**
 * The Bashni rules page — the Russian "towers" draughts that Emanuel Lasker
 * adapted into Lasca/Laska. Mirrors the structure and voice of BrochurePage
 * (the canonical Laska ruleset), reconciled with the live engine's BASHNI
 * variant in `src/variant.ts` / `src/rules.ts`. Source of truth for what the
 * Bashni rules ARE in-app; keep it consistent with the engine.
 */

/** The 8×8 Bashni board with its dark playing squares numbered 1..32 (square N ↔
 *  engine index N−1), drawn White-at-the-bottom exactly as the game board shows
 *  it. White starts on 1–12, Black on 21–32, the two centre rows empty. */
function BashniBoard() {
  // a–h / 1–8 edge gutter, following the same global toggle as the play boards;
  // it complements the in-cell 1–32 numbering rather than replacing it.
  const showCoords = useCoords();
  const dim = BASHNI.boardDim;
  const cells = [];
  for (let displayRow = 0; displayRow < dim; displayRow++) {
    const boardRow = dim - 1 - displayRow;
    if (showCoords) {
      cells.push(<div key={`rank-${displayRow}`} className="bd-coord bd-rank" aria-hidden="true">{boardRow + 1}</div>);
    }
    for (let col = 0; col < dim; col++) {
      const sq = BASHNI.rcToSquare[boardRow * dim + col]!;
      if (sq === -1) {
        cells.push(<div key={`${displayRow}-${col}`} className="bd-cell light" />);
        continue;
      }
      const n = sq + 1; // 1..32
      const zone = n <= 12 ? 'white' : n >= 21 ? 'black' : 'mid';
      cells.push(
        <div key={`${displayRow}-${col}`} className={`bd-cell play ${zone}`}>
          <span>{n}</span>
        </div>,
      );
    }
  }
  if (showCoords) {
    // Bottom file row: an empty corner under the rank column, then a–h.
    cells.push(<div key="corner" className="bd-coord" aria-hidden="true" />);
    for (let col = 0; col < dim; col++) {
      cells.push(
        <div key={`file-${col}`} className="bd-coord bd-file" aria-hidden="true">
          {String.fromCharCode(97 + col)}
        </div>,
      );
    }
  }
  return (
    <div
      className={`numbered-board dim8${showCoords ? ' with-coords' : ''}`}
      role="img"
      aria-label="Bashni board, 8 by 8, dark squares numbered 1 to 32; White starts on 1–12, Black on 21–32, the two centre rows empty."
    >
      {cells}
    </div>
  );
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="term">
      <span className="term-name">{term}</span>
      <p>{children}</p>
    </div>
  );
}

export function BashniRulesPage({
  onBack,
  onPlay,
  onReplay,
}: {
  onBack: () => void;
  onPlay: () => void;
  onReplay: (gameId?: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => window.scrollTo(0, 0), []);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing-page" ref={rootRef}>
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <button className="btn" onClick={onPlay}>
            <span className="dot" />
            Play the game
          </button>
        </div>
      </header>

      {/* hero */}
      <section className="hero" style={{ paddingTop: 'clamp(2.5rem,6vw,5rem)', paddingBottom: 'clamp(1.5rem,4vw,2.5rem)' }}>
        <div className="wrap">
          <p className="eyebrow">The Rules · Russian towers draughts</p>
          <h1 style={{ fontSize: 'clamp(2.4rem,6vw,4.4rem)', margin: '0.6rem 0 0' }}>
            Rules of <em className="serif">Bashni.</em>
          </h1>
          <p
            lang="ru"
            className="serif"
            style={{
              fontSize: 'clamp(1.6rem,4vw,2.6rem)',
              margin: '0.5rem 0 0',
              color: 'var(--l-accent)',
              letterSpacing: '0.02em',
            }}
          >
            Башни{' '}
            <span
              style={{
                fontSize: '0.5em',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                opacity: 0.65,
                fontFamily: 'inherit',
                fontStyle: 'normal',
                whiteSpace: 'nowrap',
              }}
            >
              · báshni · “towers”
            </span>
          </p>
          <p className="lede" style={{ maxWidth: '48ch' }}>
            <em className="serif">Bashni</em> (<span lang="ru" className="serif">Башни</span>) — Russian
            for <em className="serif">“towers”</em> — is the stacking draughts game Emanuel Lasker
            reshaped into Lasca. Same idea: you never remove a man, you bury him. But it is played on the
            full 8×8 draughts board, captures run in every direction, and a crowned man becomes a
            long-range flying king.
          </p>
          <p className="since" style={{ marginTop: '1rem' }}>
            The ancestor of Lasca — the game Lasker started from.
          </p>
        </div>
      </section>

      {/* lineage */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">The lineage</p>
            <h2 className="lead-h2" style={{ maxWidth: '20ch' }}>
              Bashni → Lasca → Laska.
            </h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Russian draughts players had long played <em className="serif">bashni</em>, a “towers”
              variant in which a captured man is not lifted off the board but trapped beneath his captor —
              the two then move as a single column. Around 1911 Dr. Emanuel Lasker — the world chess
              champion — took that stacking idea and refined it into <em className="serif">Lasca</em>: a
              tighter, faster game on a smaller 7×7 board, with simpler officers, designed to teach
              tactics and the building of ideas. <em className="serif">Laska</em> is how that game is
              known today. Bashni is the root; the rules here are its faithful form, so you can feel
              exactly what Lasker started from.
            </p>
          </div>
        </div>
      </section>

      {/* documented history */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">The Russian record</p>
            <h2 className="lead-h2" style={{ maxWidth: '22ch' }}>
              A game with a paper trail.
            </h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              The towers game has been written about in Russia since the 1870s. Its first known
              description is <em className="serif">“Башни или туры”</em> — “Towers, or tours” — an article
              in Valerian Viskovatov’s <em className="serif">Collection of Games for Family and School</em>
              {' '}(St Petersburg, 1875), which already treats it as an established pastime. Its great
              champion was the games historian <b>Davyd Sargin</b>, who wrote on it from 1885 — in the
              journal <em className="serif">Радуга</em> (“Rainbow”) — through his 1915 study{' '}
              <em className="serif">The Antiquity of Games of Draughts and Chess</em>. Sargin called it{' '}
              <em className="serif">“the most fortunate modification of the game of draughts,”</em> and
              warned that its positions can be extraordinarily hard to calculate exactly — the buried
              prisoners make every column a small puzzle. It has even been described as the one board game
              the Russian people themselves invented.
            </p>
            <p className="section-intro" style={{ maxWidth: 'none', marginTop: '1.2rem' }}>
              Emanuel Lasker met the game on his chess tournament visits to Moscow and St Petersburg in the
              late nineteenth century — by some accounts staying in Sargin’s own house — and in 1911
              reshaped it into <em className="serif">Lasca</em>.
            </p>
          </div>
          <div className="terms reveal" style={{ marginTop: 'clamp(1.6rem,3vw,2.2rem)' }}>
            <Term term="1875">
              Viskovatov prints <em className="serif">“Башни или туры”</em> — the first written description
              of the towers game.
            </Term>
            <Term term="1885 – 1915">
              Sargin documents and defends it, from the journal <em className="serif">Радуга</em> to his
              1915 history of draughts and chess.
            </Term>
            <Term term="1911">
              Lasker publishes <em className="serif">Lasca</em>, his 7×7 refinement of the Russian towers
              game.
            </Term>
            <Term term="1995">
              A St Petersburg column-draughts club is founded and runs annual championships, keeping the
              живая (living) tradition going.
            </Term>
          </div>
        </div>
      </section>

      {/* say it in Russian */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">Say it in Russian</p>
            <h2 className="lead-h2" style={{ maxWidth: '22ch' }}>
              The towers vocabulary.
            </h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              The terms come straight from the Russian literature — useful if you ever read the old
              manuals, and a window into how the game thinks of itself.
            </p>
          </div>
          <div className="terms reveal">
            <Term term="Башни · bashni">
              <b>“Towers.”</b> The everyday name of the game, and of the stacks themselves. The formal name
              is <em className="serif">столбовые шашки</em> (<span lang="ru">stolbovýe sháshki</span>) —{' '}
              <b>column draughts</b>.
            </Term>
            <Term term="Простая · prostáya">
              A <b>plain man</b> — the un-promoted soldier. It moves a step forward but takes prisoners in
              any direction.
            </Term>
            <Term term="Дамка · dámka">
              The <b>king</b> (literally “the lady,” as in cards). A crowned column that flies the full
              diagonal and strikes at range.
            </Term>
            <Term term="Бой · boy">
              The <b>capture</b> — the “fight.” It is compulsory: if you can take, you must.
            </Term>
            <Term term="Плен · plen">
              <b>Captivity.</b> The men buried beneath a column are <em className="serif">prisoners</em> —
              freed, and switched to their captor’s side, only when the man above them is itself taken.
            </Term>
            <Term term="Турецкий удар · the Turkish strike">
              A classic draughts rule of the family: in a multi-jump you may never leap the same enemy
              twice. (In this app, prisoners are buried the instant they are jumped.)
            </Term>
          </div>
        </div>
      </section>

      {/* the pieces */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">The forces</p>
            <h2 className="lead-h2" style={{ maxWidth: '20ch' }}>
              Men, towers, kings.
            </h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Bashni is played with draughts men on the dark squares, and — as in Lasca — nothing is ever
              removed from the board. A captured man is taken prisoner at the base of the column that took
              him, and the column travels as one, commanded by whoever sits on top. There are always 24
              men in play.
            </p>
          </div>
          <div className="terms reveal">
            <Term term="Men">
              The plain soldiers, twelve a side. A man moves only <b>forward</b>, one square diagonally —
              but he <b>captures in any of the four diagonal directions</b>, forward or backward. (In this
              app: a <b>soldier</b>.)
            </Term>
            <Term term="Towers (columns)">
              The stack made by capturing. It stands on one square and is governed entirely by its top
              man — the commander. Jump it and you take only that top man; the prisoners beneath him pass
              to whoever now leads the tower. (In this app: a <b>column</b>.)
            </Term>
            <Term term="Kings">
              A man — or a man-led tower — that reaches the far rank is crowned a <b>king</b>. A Bashni
              king is a <b>flying king</b>: it slides any distance along a diagonal, and captures at range.
              (In this app: a <b>general</b>, marked with a star.)
            </Term>
          </div>
        </div>
      </section>

      {/* board & setup */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="brochure-split">
            <div className="reveal">
              <p className="eyebrow">The board</p>
              <h2 className="lead-h2" style={{ maxWidth: '18ch' }}>
                The full 8×8 board.
              </h2>
              <p className="section-intro" style={{ maxWidth: '40ch' }}>
                Play on the 32 dark squares of a standard draughts board. At the start, <b>White</b>{' '}
                occupies squares <b>1–12</b> (the three rows nearest White), <b>Black</b> occupies{' '}
                <b>21–32</b>, and the two centre rows are open. White leads off.
              </p>
              <p className="section-intro" style={{ maxWidth: '40ch', marginTop: '1rem' }}>
                Moves are made alternately and only <b>obliquely</b> — along the diagonals. The square
                numbering shown here is the same board you play on (square N ↔ engine index N−1).
              </p>
            </div>
            <div className="reveal" style={{ display: 'flex', justifyContent: 'center' }}>
              <BashniBoard />
            </div>
          </div>
        </div>
      </section>

      {/* movement & capture */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">Taking prisoners</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>
              Capture builds the tower — in every direction.
            </h2>
          </div>
          <div className="rules-grid reveal" style={{ marginTop: 'clamp(2rem,4vw,2.6rem)' }}>
            <article className="card">
              <span className="idx">01</span>
              <h3>Men move forward</h3>
              <p>
                A quiet step is <b>forward only</b>, one square diagonally — exactly as in Lasca. The two
                back rows of your army stay home until a capture pulls them into play.
              </p>
            </article>
            <article className="card">
              <span className="idx">02</span>
              <h3>But capture both ways</h3>
              <p>
                When a man jumps, he may jump in <b>any of the four diagonals</b> — including{' '}
                <b>backward</b>. To take, an enemy must sit diagonally adjacent with a vacant square
                beyond; place your man on his and land on that square. The prisoner rides at the{' '}
                <b>base</b> of your tower.
              </p>
            </article>
            <article className="card">
              <span className="idx">03</span>
              <h3>Capture is forced</h3>
              <p>
                You are <b>compelled</b> to take prisoners when the chance occurs, and to keep jumping
                while further captures remain — a single move can sweep several enemies, growing your
                tower with each. As in Lasca, you take only the <b>top man</b> of any column you jump.
              </p>
            </article>
            <article className="card">
              <span className="idx">04</span>
              <h3>Flying kings</h3>
              <p>
                A crowned king slides <b>any distance</b> along an empty diagonal, and captures at{' '}
                <b>range</b>: it leaps a lone enemy somewhere down the diagonal and may land on{' '}
                <b>any empty square beyond</b> it, then turn and continue. Long reach, both directions —
                the defining Bashni weapon.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* promotion-continues, winning */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">Promotion &amp; the end</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>
              The king is crowned mid-capture — and keeps going.
            </h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              This is the sharpest difference from Lasca. In Lasca, a private that reaches the last line
              is crowned and the move <b>ends there</b>, even mid-chain. In Bashni, a man who lands on the
              back rank during a capture <b>promotes immediately and continues capturing as a king</b> —
              now with the king’s long range and four-way reach. A run that crowns can keep sweeping the
              board on the same turn.
            </p>
            <p className="section-intro" style={{ maxWidth: 'none', marginTop: '1.2rem' }}>
              The <b>loser</b> is the player who cannot move, or who has all his men taken prisoner. As in
              Lasca, there is no taking pieces off the board — you win by burying or immobilising the
              enemy.
            </p>
          </div>
        </div>
      </section>

      {/* Lasca vs Bashni at a glance */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">At a glance</p>
            <h2 className="lead-h2" style={{ maxWidth: '22ch' }}>
              What Lasker changed.
            </h2>
          </div>
          <div className="terms reveal">
            <Term term="Board">
              Bashni uses the full <b>8×8</b> board (32 dark squares, 12 men a side). Lasca shrinks it to{' '}
              <b>7×7</b> (25 squares, 11 men a side) for a faster, tighter game.
            </Term>
            <Term term="Captures">
              Bashni men capture <b>in all four directions</b>. Lasca privates capture <b>forward only</b>;
              only a crowned officer takes backward.
            </Term>
            <Term term="The crown">
              Bashni crowns a <b>flying king</b> (any distance, captures at range). Lasca’s officer is a{' '}
              <b>single-step</b> piece — it simply gains the right to move and take both ways.
            </Term>
            <Term term="Promotion mid-run">
              In Bashni, reaching the back rank mid-capture crowns the man and the run <b>continues</b>.
              In Lasca, crowning <b>ends the move</b> on the spot.
            </Term>
          </div>
        </div>
      </section>

      {/* principled openings */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">The openings</p>
            <h2 className="lead-h2" style={{ maxWidth: '22ch' }}>
              A few sound ways to start.
            </h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Named Bashni opening theory is sparse, so these are <b>principled lines</b> rather than
              historical canon — sensible development on the 8×8 board. Every line below is replayed
              move-for-move on the live engine.
            </p>
          </div>
          <div className="rules-grid reveal" style={{ marginTop: 'clamp(2rem,4vw,2.6rem)' }}>
            {BASHNI_OPENINGS.map((o) => (
              <article className="card" key={o.id}>
                <span className="idx">{o.firstMove}</span>
                <h3>{o.name}</h3>
                <p className="san-line">
                  {o.mainLine.map((p, i) => (
                    <span key={i}>
                      {p.side === 'W' ? <b className="san-no">{p.moveNo}.</b> : null}
                      <code className="san">{p.san}</code>{' '}
                    </span>
                  ))}
                </p>
                <p>{o.description}</p>
                {o.variations.length > 0 && (
                  <ul className="san-vars">
                    {o.variations.map((v) => (
                      <li key={v.san} className={v.move ? '' : 'unresolved'}>
                        <code className="san">{v.san}</code>
                        <span className="san-note">{v.note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* the demonstration game */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">See it in motion</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>
              Watch the engine play Bashni.
            </h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              We don’t have a verifiable historic Bashni score to publish — and we won’t invent one. So
              instead the engine played a full game against <em className="serif">itself</em> under the
              Bashni rules, and we recorded it move-for-move. It replays on the live engine, the same way
              the historic Lasca games do, and ends with a flying-king sweep that turns three corners in a
              single move.
            </p>
          </div>
          <div className="rules-grid reveal" style={{ marginTop: 'clamp(2rem,4vw,2.6rem)' }}>
            <article className="card">
              <span className="idx">
                <Layers size={16} /> Bashni
              </span>
              <h3>Engine self-play</h3>
              <p>
                An engine-vs-engine demonstration — <b>not a historic score</b> — recorded so you can see
                four-way captures and flying kings on the 8×8 board. 44 half-moves; Black wins by
                freezing White.
              </p>
              <button className="btn" style={{ marginTop: '1rem' }} onClick={() => onReplay('bashni-engine-demo')}>
                <Play size={15} /> Replay the Bashni game
              </button>
            </article>
            <article className="card">
              <span className="idx">
                <Crown size={16} /> The finale
              </span>
              <h3>A three-corner sweep</h3>
              <p>
                The last move is a single flying-king capture that turns three corners across the board,
                burying enemies in every diagonal direction — the clearest possible picture of what a
                Bashni king can do.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* closing */}
      <section className="closing">
        <div className="wrap">
          <div className="panel reveal">
            <p className="eyebrow" style={{ marginBottom: '1.2rem' }}>
              Now play it
            </p>
            <h2>
              The towers game, <em className="serif">where Lasca began.</em>
            </h2>
            <p>Switch the variant to Bashni on the board and feel the larger game for yourself.</p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-lg" onClick={onPlay}>
                <span className="dot" />
                Play Bashni
              </button>
              <button className="btn" onClick={() => onReplay('bashni-engine-demo')}>
                <Play size={15} /> Replay the demonstration
              </button>
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
            Bashni — the Russian “towers” draughts Emanuel Lasker adapted into Lasca, 1911.
          </span>
        </div>
      </footer>
    </div>
  );
}
