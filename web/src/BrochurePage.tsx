import { useEffect, useRef } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import { RC_TO_SQUARE, BOARD_DIM } from '../../src/index.ts';
import { OPENINGS, FIRST_MOVES, OPENING_SOURCES } from './openings.ts';
import './landing.css';

/**
 * The Laska brochure — a single canonical reference for the rules, drawn from
 * Dr. Emanuel Lasker's original 1911 booklet "Rules of Lasca, the Great Military
 * Game," reconciled with the live engine. This is the source of truth for what
 * the rules *are* in this app; keep it consistent with `src/rules.ts`.
 */

/** The board with Lasker's 1–25 square numbering (square N ↔ engine index N−1),
 *  drawn White-at-the-bottom exactly as the game board displays it. */
function NumberedBoard() {
  const cells = [];
  for (let displayRow = 0; displayRow < BOARD_DIM; displayRow++) {
    const boardRow = BOARD_DIM - 1 - displayRow;
    for (let col = 0; col < BOARD_DIM; col++) {
      const sq = RC_TO_SQUARE[boardRow * BOARD_DIM + col]!;
      if (sq === -1) {
        cells.push(<div key={`${displayRow}-${col}`} className="bd-cell light" />);
        continue;
      }
      const n = sq + 1; // Lasker's numbering
      const zone = n <= 11 ? 'white' : n >= 15 ? 'black' : 'mid';
      cells.push(
        <div key={`${displayRow}-${col}`} className={`bd-cell play ${zone}`}>
          <span>{n}</span>
        </div>,
      );
    }
  }
  return <div className="numbered-board" role="img" aria-label="Laska board, squares numbered 1 to 25; White starts on 1–11, Black on 15–25, the centre 12–14 empty.">{cells}</div>;
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="term">
      <span className="term-name">{term}</span>
      <p>{children}</p>
    </div>
  );
}

export function BrochurePage({
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
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
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
          <p className="eyebrow">The Rules · est. 1911</p>
          <h1 style={{ fontSize: 'clamp(2.4rem,6vw,4.4rem)', margin: '0.6rem 0 0' }}>
            Rules of <em className="serif">Lasca.</em>
          </h1>
          <p className="lede" style={{ maxWidth: '46ch' }}>
            The Great Military Game, invented by Dr. Emanuel Lasker. This is the complete ruleset —
            taken from his original 1911 booklet and reconciled with the engine you play here, so the
            rules stay consistent everywhere.
          </p>
          <p className="since" style={{ marginTop: '1rem' }}>
            “The game to teach cautiousness and tactics, and a great builder up of ideas.” — E. Lasker
          </p>
        </div>
      </section>

      {/* the pieces */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">The forces</p>
            <h2 className="lead-h2" style={{ maxWidth: '20ch' }}>Privates, columns, officers.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Lasca is played with draughts pieces on the dark squares of a board, but nothing is ever
              removed. A captured man is taken <em className="serif">prisoner</em> beneath his captor,
              and the two travel together as a column. There are always 22 men on the board.
            </p>
          </div>
          <div className="terms reveal">
            <Term term="Privates">
              The plain men, White and Black. A private may move only <b>forward</b>, one square
              diagonally. (In this app: a <b>soldier</b>.)
            </Term>
            <Term term="Columns">
              A stack made when men are captured. It stays on one square and is governed entirely by
              its top man — the <b>Leader</b>. (In this app: a <b>column</b>, led by its <b>commander</b>.)
            </Term>
            <Term term="Officers">
              A man or column reaching the opponent’s last line is crowned. The top man is exchanged
              for an Officer — Green for White, Red for Black — which may move <b>forwards or
              backwards</b>. (In this app: a <b>general</b>, marked with a star.)
            </Term>
            <Term term="Bombs">
              A column whose upper men are all of one party — a concentrated, powerful stack. Push them
              toward the enemy; attack them with care.
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
              <h2 className="lead-h2" style={{ maxWidth: '18ch' }}>Set the men as in draughts.</h2>
              <p className="section-intro" style={{ maxWidth: '40ch' }}>
                Play on the 25 numbered squares. At the start, squares <b>12, 13 and 14</b> are open;
                <b> White</b> occupies <b>1–11</b>, <b>Black</b> occupies <b>15–25</b>, and White leads
                off. Lasker’s numbering is shown here — it is the same board you play on.
              </p>
              <p className="section-intro" style={{ maxWidth: '40ch', marginTop: '1rem' }}>
                Moves are made alternately and only <b>obliquely</b> — along the diagonals.
              </p>
            </div>
            <div className="reveal" style={{ display: 'flex', justifyContent: 'center' }}>
              <NumberedBoard />
            </div>
          </div>
        </div>
      </section>

      {/* movement & capture */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">Taking prisoners</p>
            <h2 className="lead-h2" style={{ maxWidth: '22ch' }}>Capture builds the column.</h2>
          </div>
          <div className="rules-grid reveal" style={{ marginTop: 'clamp(2rem,4vw,2.6rem)' }}>
            <article className="card">
              <span className="idx">01</span>
              <h3>The jump</h3>
              <p>
                To take a prisoner, an enemy must sit diagonally in front of you with a vacant square
                beyond. Place your man on his and move both to that square — the prisoner rides at the
                <b> base</b> of your column.
              </p>
            </article>
            <article className="card">
              <span className="idx">02</span>
              <h3>Capture is forced</h3>
              <p>
                You are <b>compelled</b> to take prisoners when the chance occurs. If a further enemy
                stands ahead with space behind, you must continue the run, growing your column. If your
                opponent omits a capture, compel him to make it.
              </p>
            </article>
            <article className="card">
              <span className="idx">03</span>
              <h3>Only the leader</h3>
              <p>
                Though your whole column moves together, you take only <b>one</b> prisoner from each
                square — so when you jump an enemy column you capture only its top man. The men below
                are freed under whoever now leads them.
              </p>
            </article>
            <article className="card">
              <span className="idx">04</span>
              <h3>The longest run</h3>
              <p>
                If two or more captures are open, Lasker advised taking the one giving the{' '}
                <b>longest run or best advantage</b>. This app lets you choose freely among them — the
                common modern reading — so the decision is yours.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* promotion, run, winning */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">Promotion, the run &amp; the end</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>When a run ends, and how a game is won.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              A <b>run</b> finishes for the move the instant a column <b>led by a private</b> reaches
              the opponent’s last line — it is crowned and the move ends there, even mid-chain. A column
              led by an <b>officer</b> keeps going: an officer is already crowned, so it captures on
              through.
            </p>
            <p className="section-intro" style={{ maxWidth: 'none', marginTop: '1.2rem' }}>
              The <b>loser</b> is the player who cannot move, or who has all his men taken prisoner. There
              is no capturing pieces off the board — you win by burying or immobilising the enemy.
            </p>
          </div>
        </div>
      </section>

      {/* Lasker's strategy notes */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">Lasker’s special notes</p>
            <h2 className="lead-h2" style={{ maxWidth: '20ch' }}>How the inventor said to play.</h2>
          </div>
          <div className="terms reveal">
            <Term term="Hold the centre">
              Move your men toward the centre of the board.
            </Term>
            <Term term="Guard the triangle">
              The three strongest White markers are <b>2, 3, 6</b>; the Black ones <b>20, 23, 24</b>.
              Don’t move them without a clear gain — and try to tempt your opponent into moving his.
            </Term>
            <Term term="Place weak men safely">
              Move weak men — those with no prisoners — to safe squares, and attack the enemy’s weak men.
            </Term>
            <Term term="Drive the bombs">
              Push bombs toward the enemy. When attacking a bomb, play so your opponent is left with
              little or no liberty to move.
            </Term>
          </div>
        </div>
      </section>

      {/* strategy */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">How to think about it</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>Strategy: a game of attack.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              The rules are quickly learned; the art is in the columns. Lasker held that Lasca is
              <em className="serif"> “a game of attack rather than of defence”</em> — the five ideas
              below all follow from that. They are about <b>position</b>, not just the count of men:
              a column’s worth depends on where it stands and who leads it.
            </p>
          </div>
          <div className="rules-grid reveal" style={{ marginTop: 'clamp(2rem,4vw,2.6rem)' }}>
            <article className="card">
              <span className="idx">01</span>
              <h3>Strength is positional</h3>
              <p>
                Two columns of equal height are not equally strong. A <b>tall</b> column has more
                lives — each capture only peels its commander, so it can be attacked several times
                before it falls. It is <b>safer near the edge</b>, approached from fewer diagonals,
                and far more dangerous when its commander is an <b>officer</b>, free to move both ways.
              </p>
            </article>
            <article className="card">
              <span className="idx">02</span>
              <h3>Spread your captures</h3>
              <p>
                When you have a <b>choice</b> of captures, prefer to spread the prisoners across
                several columns rather than pile them under one commander. One over-stuffed column is
                a liability: lure or fell its leader and the whole stack is lost. (It can still be
                worth sacrificing men to <b>recapture them later as one deep column</b> — just never
                build a fragile tower by accident.)
              </p>
            </article>
            <article className="card">
              <span className="idx">03</span>
              <h3>Guard a weak column</h3>
              <p>
                A short, isolated column is prey to a <b>sacrifice lure</b> — the enemy throws a man
                in front of it to force a capture and drag it off the edge into the open. Post an
                <b> officer as a guard</b> beside it, so the bait is simply recaptured. Better still,
                avoid forming weak columns in the first place.
              </p>
            </article>
            <article className="card">
              <span className="idx">04</span>
              <h3>The one-handed attack</h3>
              <p>
                A strong column can march straight through a weaker one, burying its men as prisoners.
                It works only when the <b>attacking column has more men</b>, when every attacker can
                move in the direction of the attack (officers, if it runs “backwards”), and when
                <b> no stray piece</b> blocks the path. The attacker stands intact afterward; the
                defender’s men are buried.
              </p>
            </article>
            <article className="card">
              <span className="idx">05</span>
              <h3>Attack over defence</h3>
              <p>
                The governing principle. A passive retreat “achieves very little”; a counter-attack
                that poses a bigger threat is usually stronger. Risk <b>short-term material</b> for
                <b> long-term initiative</b> — tempo and the threat of a one-handed attack are often
                worth more than the men they cost.
              </p>
            </article>
          </div>
          <div className="reveal card note refs" style={{ marginTop: 'clamp(1.6rem,3vw,2.2rem)', padding: 'clamp(1.4rem,3vw,2rem)' }}>
            <p className="eyebrow">Sources &amp; credit</p>
            <ul>
              <li>
                <a href="http://www.johnson-davies.com/lasca/" target="_blank" rel="noopener noreferrer">
                  David Johnson-Davies, “Lasca” strategy notes
                </a>{' '}
                (johnson-davies.com, © 2011–2018)
              </li>
              <li>Dr. Emanuel Lasker — Lasca as “a game of attack rather than of defence.”</li>
            </ul>
          </div>
        </div>
      </section>

      {/* the explanatory games */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">The explanatory games</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>Five games Lasker printed to teach the game.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Lasker included five worked games in the booklet. We checked all five against the engine:
              <b> Games 2 and 3 validate perfectly</b> and you can replay them here, move by move, on the
              real board. (Games 1, 4 and 5 stop mid-way — the brochure scan’s faded digits don’t fully
              reconcile, so we hold those back rather than show an unverifiable line.)
            </p>
          </div>
          <div className="rules-grid reveal" style={{ marginTop: 'clamp(2rem,4vw,2.6rem)' }}>
            <article className="card">
              <span className="idx">Game 2 · 1911</span>
              <h3>Breakthrough</h3>
              <p>A symmetric opening, then White breaks through and freezes Black. 39 half-moves, engine-verified.</p>
              <button className="btn" style={{ marginTop: '1rem' }} onClick={() => onReplay('lasker-1911-g2')}>
                <Play size={15} /> Replay Game 2
              </button>
            </article>
            <article className="card">
              <span className="idx">Game 3 · 1911</span>
              <h3>The long manoeuvre</h3>
              <p>A patient column-building battle of 78 half-moves, ending with White’s last men blocked in.</p>
              <button className="btn" style={{ marginTop: '1rem' }} onClick={() => onReplay('lasker-1911-g3')}>
                <Play size={15} /> Replay Game 3
              </button>
            </article>
            <article className="card">
              <span className="idx">Moscow · 1996</span>
              <h3>A modern miniature</h3>
              <p>Tatarinow–Roschtschin: a crisp win built on a soldier crowned at the back rank.</p>
              <button className="btn" style={{ marginTop: '1rem' }} onClick={() => onReplay('moscow-1996')}>
                <Play size={15} /> Replay 1996
              </button>
            </article>
          </div>
        </div>
      </section>

      {/* the named openings */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">The openings</p>
            <h2 className="lead-h2" style={{ maxWidth: '22ch' }}>The three openings Lasker named.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              The starting position is symmetrical, so there are only{' '}
              <b>three distinct first moves</b>: {FIRST_MOVES.map((m, i) => (
                <span key={m}>
                  <code className="san">{m}</code>
                  {i < FIRST_MOVES.length - 1 ? ', ' : '. '}
                </span>
              ))}
              In <em className="serif">Brettspiele der Völker</em> (1931) Lasker named the openings that
              branch from them. Every line below is replayed move-for-move on the live engine.
            </p>
          </div>
          <div className="rules-grid reveal" style={{ marginTop: 'clamp(2rem,4vw,2.6rem)' }}>
            {OPENINGS.map((o) => (
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
                        {v.move ? null : <span className="flag"> · as printed; unverified</span>}
                        <span className="san-note">{v.note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
          <div className="reveal card note refs" style={{ marginTop: 'clamp(1.6rem,3vw,2.2rem)', padding: 'clamp(1.4rem,3vw,2rem)' }}>
            <p className="eyebrow">Sources &amp; credit</p>
            <ul>
              {OPENING_SOURCES.map((s) => (
                <li key={s.label}>
                  {s.href ? (
                    <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
                  ) : (
                    s.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* the proposition */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal card note" style={{ padding: 'clamp(1.8rem,4vw,2.6rem)' }}>
            <p className="eyebrow">Lasker’s proposition</p>
            <h3 style={{ fontSize: '1.4rem', margin: '0.5rem 0 0.8rem' }}>Two leaders against seven — and White wins.</h3>
            <p>
              Lasker closed the booklet with a study: White has only two leaders on the board against
              Black’s seven, yet, having the move, White wins by force. It is the clearest possible
              statement of the game’s whole idea — that a buried, well-led column is worth far more than
              loose men. The full solution runs ten moves to a winning block.
            </p>
          </div>
        </div>
      </section>

      {/* closing */}
      <section className="closing">
        <div className="wrap">
          <div className="panel reveal">
            <p className="eyebrow" style={{ marginBottom: '1.2rem' }}>Now play it</p>
            <h2>
              The rules in <em className="serif">five minutes,</em> the depth for years.
            </h2>
            <p>You know enough to start. The columns will teach you the rest.</p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-lg" onClick={onPlay}>
                <span className="dot" />
                Play Laska
              </button>
              <button className="btn" onClick={() => onReplay('lasker-1911-g2')}>
                <Play size={15} /> Replay a Lasker game
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
          <span className="fine">After “Rules of Lasca, the Great Military Game” · Dr. Emanuel Lasker, 1911</span>
        </div>
      </footer>
    </div>
  );
}
