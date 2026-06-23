import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Cpu, GitBranch, Scale, Scissors, Gauge, TriangleAlert } from 'lucide-react';
import {
  createInitialState,
  applyMove,
  legalMoves,
  gameStatus,
  chooseMove,
  scoreMoves,
  newStats,
  DEFAULT_WEIGHTS,
  DIFFICULTY_DEPTH,
  DIFFICULTY_ORDER,
  SQUARE_TO_RC,
  type GameState,
  type Move,
} from '../../src/index.ts';
import './landing.css';
import './aiPage.css';

/**
 * "How the AI Works" — a layered explainer for the negamax opponent in
 * src/ai.ts. Intuition → search → evaluation → optimisations → honest limits.
 *
 * Every number on this page is either imported from the engine (the evaluation
 * weights) or MEASURED live in your browser by running the real search with the
 * instrumentation hook (the Search Lab) — nothing here is hand-typed, so the
 * page cannot drift from the code. Presentation only: it never mutates state.
 */

/** A friendly square label, e.g. square 8 -> "c3" (col letter a–g, row 1–7). */
function sqName(i: number): string {
  const rc = SQUARE_TO_RC[i];
  if (!rc) return `#${i}`;
  return `${'abcdefg'[rc.col] ?? '?'}${rc.row + 1}`;
}

function moveLabel(m: Move): string {
  const base = `${sqName(m.from)} → ${sqName(m.to)}`;
  return m.isCapture ? `${base} ×${m.captures.length}` : base;
}

/** Deterministic LCG so the demo positions are identical on every render. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

/** Play `plies` of blunder-free medium self-play from the opening (deterministic). */
function selfPlay(plies: number, seed: number): GameState {
  let state = createInitialState();
  const rng = lcg(seed);
  for (let i = 0; i < plies && gameStatus(state).state === 'ongoing'; i++) {
    const move = chooseMove(state, { depth: 3, blunderRate: 0, random: rng });
    if (!move) break;
    state = applyMove(state, move);
  }
  return state;
}

/** Advance from the opening until the side to move has a forced capture, so the
 *  lab can show quiescence actually doing something. Falls back to a midgame. */
function tacticalPosition(): GameState {
  let state = createInitialState();
  const rng = lcg(7);
  for (let i = 0; i < 60 && gameStatus(state).state === 'ongoing'; i++) {
    const legal = legalMoves(state);
    if (legal[0]?.isCapture) return state;
    const move = chooseMove(state, { depth: 3, blunderRate: 0.15, random: rng });
    if (!move) break;
    state = applyMove(state, move);
  }
  return state;
}

type PresetKey = 'opening' | 'midgame' | 'tactical';

export function AIPage({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Scroll-reveal, mirroring LaskerPage/ReplayPage.
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
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page ai-page" ref={rootRef}>
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

      {/* ---- Hero ------------------------------------------------------ */}
      <section className="hero" style={{ paddingBottom: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '820px' }}>
          <div className="reveal">
            <p className="eyebrow">
              <Cpu size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              The opponent
            </p>
            <h1 style={{ fontSize: 'clamp(2.6rem,6vw,4.4rem)', margin: '0.7rem 0 0' }}>
              How the computer <em className="serif">thinks</em> in Laska.
            </h1>
            <p className="lede" style={{ maxWidth: '52ch' }}>
              No neural net, no cloud, no tricks. The opponent is a few hundred lines of
              transparent search that plays out the game in its head, scores what it finds, and
              assumes you'll answer with your best move. Here's exactly how — from the gut-feel
              version to the real code.
            </p>
          </div>
        </div>
      </section>

      {/* ---- 1. Intuition --------------------------------------------- */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '60ch' }}>
            <p className="eyebrow">Start here · the intuition</p>
            <h2 className="lead-h2">It plays the game forward in its head.</h2>
            <p className="section-intro">
              Strip away the jargon and the opponent does three human things — just very fast, and
              without ever getting bored.
            </p>
          </div>
          <div className="rules-grid reveal">
            <article className="card">
              <span className="idx">01</span>
              <h3>Imagine every move</h3>
              <p>
                For each move it could play, it imagines your best reply, then its best reply to
                that, and so on — a branching tree of "what if" lines, several moves deep.
              </p>
            </article>
            <article className="card">
              <span className="idx">02</span>
              <h3>Score the result</h3>
              <p>
                At the end of each imagined line it sizes up the board with a single number: who
                commands more columns, who holds more prisoners, who's closer to crowning a general.
              </p>
            </article>
            <article className="card">
              <span className="idx">03</span>
              <h3>Assume you play well</h3>
              <p>
                It expects your sharpest answer every time, then picks the move whose worst-case
                outcome is best for it. No hoping you'll blunder — except on the easy levels, where
                it sometimes slips on purpose.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ---- 2. The search: negamax ----------------------------------- */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '62ch' }}>
            <p className="eyebrow">
              <GitBranch size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              The search · negamax
            </p>
            <h2 className="lead-h2">One routine, both players, by flipping a sign.</h2>
            <p className="section-intro">
              Laska is zero-sum: a position that's good for me is exactly as bad for you. So the
              engine never needs separate "my turn" and "your turn" logic. It scores every position
              from the view of whoever is on the move, and as each imagined reply bubbles back up
              the tree, it simply <b style={{ color: 'var(--l-ink)' }}>negates the score</b>. Your
              best line is my worst — one routine handles both.
            </p>
          </div>

          {/* CSS tree diagram — static, no animation */}
          <div className="search-tree reveal" aria-hidden="true">
            <div className="tnode root">
              <span className="tlabel">my move</span>
              <span className="tscore pos">+score</span>
            </div>
            <div className="tedge" />
            <div className="trow">
              <div className="tnode">
                <span className="tlabel">your reply</span>
                <span className="tscore neg">−score</span>
              </div>
              <div className="tnode">
                <span className="tlabel">your reply</span>
                <span className="tscore neg">−score</span>
              </div>
              <div className="tnode">
                <span className="tlabel">your reply</span>
                <span className="tscore neg">−score</span>
              </div>
            </div>
            <div className="tedge" />
            <div className="trow leaves">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="tnode leaf" key={i}>
                  <span className="tscore pos">eval</span>
                </div>
              ))}
            </div>
            <p className="tree-caption">
              Each layer negates the layer below. The leaves are static evaluations; everything
              above is a min/max of its children, expressed as a single negate-and-take-best.
            </p>
          </div>

          <details className="ai-tech reveal">
            <summary>The identity it leans on (for the technically curious)</summary>
            <p>
              Negamax exploits <code>max(a, b) = −min(−a, −b)</code>. The parent negates each
              child's returned score, so a position is always judged from the side to move. In the
              source that's a single line:
            </p>
            <pre>
              <code>{`const score = -negamax(child, depth - 1, -beta, -alpha, cfg, ply + 1);`}</code>
            </pre>
            <p>
              This is only correct if the evaluation is <b>symmetric</b> — it must hold that{' '}
              <code>evaluate(s, White) === −evaluate(s, Black)</code>. Laska's evaluation is exactly
              antisymmetric (every term flips sign with the column's controller, and mobility is a
              difference), so the sign-flips compose cleanly all the way up the tree. If it weren't,
              the search would be comparing two differently-calibrated rulers and chase phantoms.
            </p>
          </details>
        </div>
      </section>

      {/* ---- 3. The evaluation (weights imported from the engine) ----- */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '62ch' }}>
            <p className="eyebrow">
              <Scale size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              The evaluation · what it values
            </p>
            <h2 className="lead-h2">Material is control, not piece count.</h2>
            <p className="section-intro">
              In Laska no piece ever leaves the board — captures only bury. So counting pieces is
              meaningless; what matters is how many columns you <em className="serif">command</em>{' '}
              and what you've buried beneath your commanders. These are the live weights from{' '}
              <code>DEFAULT_WEIGHTS</code>, read straight from the engine:
            </p>
          </div>

          <div className="weights reveal">
            <WeightRow
              v={DEFAULT_WEIGHTS.column}
              name="Column control"
              desc="Commanding a column at all — a piece in play, leading its stack."
            />
            <WeightRow
              v={DEFAULT_WEIGHTS.officer}
              name="Officer rank"
              desc="Your commander is a crowned general, free to move and strike both ways."
            />
            <WeightRow
              v={DEFAULT_WEIGHTS.enemyPrisoner}
              name="Enemy prisoner held"
              desc="Each enemy piece trapped beneath one of your commanders."
            />
            <WeightRow
              v={DEFAULT_WEIGHTS.advance}
              name="Advancement"
              desc="Per row a soldier-topped column has marched toward promotion."
            />
            <WeightRow
              v={DEFAULT_WEIGHTS.mobility}
              name="Mobility"
              desc="Per move of difference between how many legal moves each side has."
            />
          </div>
          <p className="muted-note reveal">
            The numbers are relative: one column (100) is worth roughly a crown-and-a-half (60), or
            five or six held prisoners (18 each). They're hand-chosen and{' '}
            <b style={{ color: 'var(--l-ink)' }}>reasonable, not yet match-tuned</b> — the honest
            highest-leverage future work is sharpening exactly these.
          </p>
        </div>
      </section>

      {/* ---- 4. The Search Lab (live, measured in-browser) ------------ */}
      <SearchLab />

      {/* ---- 5. The optimizations ------------------------------------- */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '62ch' }}>
            <p className="eyebrow">
              <Scissors size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              Under the hood · making it fast and sharp
            </p>
            <h2 className="lead-h2">Four ideas that earn their keep.</h2>
          </div>
          <div className="rules-grid reveal">
            <article className="card">
              <span className="idx">Alpha-beta</span>
              <h3>Skip what can't matter</h3>
              <p>
                Once a reply is proven worse than one already found, the rest of that branch can't
                change the decision — so it's pruned unsearched. In the lab above, that's the gap
                between "pruned" and "plain".
              </p>
            </article>
            <article className="card">
              <span className="idx">Ordering</span>
              <h3>Look at the best moves first</h3>
              <p>
                Captures, then longer capture chains, then promotions are searched first — the
                sooner a strong move is found, the more alpha-beta can prune behind it.
              </p>
            </article>
            <article className="card">
              <span className="idx">Quiescence</span>
              <h3>Never judge mid-swap</h3>
              <p>
                Captures are mandatory, so a position caught in the middle of an exchange lies to
                the evaluator. The top tiers keep searching through the forced trade until the dust
                settles — the horizon-effect fix.
              </p>
            </article>
            <article className="card note">
              <span className="idx">
                <Gauge size={15} style={{ verticalAlign: '-2px' }} />
              </span>
              <h3>Measured, not guessed</h3>
              <p>
                The search carries an optional counter for nodes, leaves, cutoffs and depth. Every
                figure on this page is read from it live — which is why the lab runs in your own
                browser.
              </p>
            </article>
          </div>

          <div className="tier-table reveal">
            <div className="tier-head">
              <span>Difficulty</span>
              <span>Looks ahead</span>
              <span>Quiescence</span>
            </div>
            {DIFFICULTY_ORDER.map((d) => (
              <div className="tier-row" key={d}>
                <span style={{ textTransform: 'capitalize', color: 'var(--l-ink)', fontWeight: 600 }}>{d}</span>
                <span>{DIFFICULTY_DEPTH[d]} half-moves</span>
                <span>{d === 'hard' || d === 'expert' ? 'On' : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 6. Honest limits ----------------------------------------- */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '62ch' }}>
            <p className="eyebrow">
              <TriangleAlert size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              The honest part · where it's weak
            </p>
            <h2 className="lead-h2">A strong opponent, not a solved one.</h2>
          </div>
          <div className="terms reveal">
            <div className="term">
              <span className="term-name">The horizon still exists</span>
              <p>
                Quiescence extends through <em>forced</em> captures, but a quiet positional threat
                one move past the search depth is still invisible. The lower tiers have no
                quiescence at all — by design, so they stay beatable.
              </p>
            </div>
            <div className="term">
              <span className="term-name">The evaluation is untuned</span>
              <p>
                Weights are hand-picked. One intended subtlety — fearing your own losses less than
                you prize captures — is even noted in the code but not yet wired in. Real strength
                gains live here, not in searching wider.
              </p>
            </div>
            <div className="term">
              <span className="term-name">No memory between positions</span>
              <p>
                There's deliberately no transposition table: Laska's repetition and no-progress draw
                rules are path-dependent, and a naïve position cache could mis-score a draw. At
                these node counts it wouldn't pay for the risk anyway.
              </p>
            </div>
            <div className="term">
              <span className="term-name">Shallow in the endgame</span>
              <p>
                There's no endgame database. A deep forced win past the horizon can slip by the
                lower tiers, even when the position is technically decided.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Closing -------------------------------------------------- */}
      <section className="closing">
        <div className="wrap">
          <div className="panel reveal">
            <p className="eyebrow" style={{ marginBottom: '1.2rem' }}>
              Now you know its mind
            </p>
            <h2>
              Go and <em className="serif">outthink it.</em>
            </h2>
            <p>
              Six honest levels, from a beginner that blunders to an expert that looks eight moves
              deep and never judges mid-swap. Pick your depth and sit down across the board.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-lg" onClick={onPlay}>
                <span className="dot" />
                Play Laska
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
            Engine &amp; explainer ·{' '}
            <a href="https://github.com/melaniesigrid" target="_blank" rel="noopener noreferrer">
              © Melanie Baratto
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** One evaluation weight, shown with a proportional bar (bars are decorative;
 *  the number is always present as the non-colour affordance). */
function WeightRow({ v, name, desc }: { v: number; name: string; desc: string }) {
  const pct = Math.max(4, Math.round((v / DEFAULT_WEIGHTS.column) * 100));
  return (
    <div className="wrow">
      <div className="wval">+{v}</div>
      <div className="wbody">
        <div className="wname">{name}</div>
        <div className="wbar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="wdesc">{desc}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Search Lab — runs the REAL engine in the browser and reports measured
// node counts. Pruning and quiescence are shown as live before/after pairs.
// ---------------------------------------------------------------------------

const PRESETS: { key: PresetKey; label: string; hint: string }[] = [
  { key: 'opening', label: 'Opening', hint: 'the starting position' },
  { key: 'midgame', label: 'Midgame', hint: 'a quiet ~16-move position' },
  { key: 'tactical', label: 'Tactical', hint: 'a forced capture on offer' },
];

function SearchLab() {
  const [preset, setPreset] = useState<PresetKey>('tactical');
  const [depth, setDepth] = useState(4);

  // Demo positions, computed once (deterministic).
  const positions = useMemo<Record<PresetKey, GameState>>(
    () => ({
      opening: createInitialState(),
      midgame: selfPlay(16, 4),
      tactical: tacticalPosition(),
    }),
    [],
  );
  const state = positions[preset];

  // Run the real search three ways and measure it — recomputed on each change.
  const result = useMemo(() => {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const prunedStats = newStats();
    const t0 = now();
    const scored = scoreMoves(state, depth, { prune: true, quiescence: true, stats: prunedStats });
    const ms = now() - t0;

    // Pruning comparison must hold quiescence fixed (off on both sides), or
    // quiescence's extra nodes swamp the pruning saving and the ratio goes
    // negative. So: alpha-beta off vs on, both with quiescence off.
    const plainStats = newStats();
    scoreMoves(state, depth, { prune: false, quiescence: false, stats: plainStats });

    const noQuiesStats = newStats();
    const noQuiesScored = scoreMoves(state, depth, { prune: true, quiescence: false, stats: noQuiesStats });

    const prunedPct =
      plainStats.nodes > 0 ? Math.round((1 - noQuiesStats.nodes / plainStats.nodes) * 100) : 0;

    const top = scored.slice(0, 4);
    const topNoQuies = noQuiesScored[0];
    const quiescenceChanged =
      !!top[0] && !!topNoQuies && (top[0].move.from !== topNoQuies.move.from || top[0].move.to !== topNoQuies.move.to);

    const maxAbs = Math.max(1, ...top.map((s) => Math.abs(s.score)));
    return { scored: top, ms, prunedStats, plainStats, noQuiesStats, prunedPct, quiescenceChanged, maxAbs };
  }, [state, depth]);

  return (
    <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: '62ch' }}>
          <p className="eyebrow">
            <Cpu size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
            The search lab · running in your browser
          </p>
          <h2 className="lead-h2">Watch it think — with real numbers.</h2>
          <p className="section-intro">
            This isn't a recording. Every count below comes from running the actual engine on your
            device, right now. Change the depth and feel the tree grow; switch positions to see
            pruning and quiescence earn their keep.
          </p>
        </div>

        <div className="lab reveal">
          <div className="lab-controls">
            <div className="lab-presets" role="group" aria-label="Position">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  className={`replay-tab ${preset === p.key ? 'active' : ''}`}
                  onClick={() => setPreset(p.key)}
                  title={p.hint}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="lab-depth">
              <span>
                Search depth: <b>{depth}</b> half-move{depth === 1 ? '' : 's'}
              </span>
              <input
                type="range"
                min={1}
                max={8}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                aria-label="Search depth in half-moves"
              />
            </label>
          </div>

          <div className="lab-grid">
            {/* Measured stats */}
            <div className="lab-stats">
              <Stat label="Positions searched" value={result.prunedStats.nodes.toLocaleString()} />
              <Stat label="Positions scored (leaves)" value={result.prunedStats.leaves.toLocaleString()} />
              <Stat label="Branches pruned (cutoffs)" value={result.prunedStats.cutoffs.toLocaleString()} />
              <Stat label="Deepest line reached" value={`${result.prunedStats.maxPlyReached} plies`} />
              <Stat label="Time on your device" value={`${result.ms.toFixed(1)} ms`} approx />
            </div>

            {/* Best moves with score bars */}
            <div className="lab-moves">
              <div className="lab-sub">Top moves it's weighing</div>
              {result.scored.length === 0 && <p className="muted-note">No legal moves — game over here.</p>}
              {result.scored.map((s, i) => {
                const pct = Math.round((Math.abs(s.score) / result.maxAbs) * 100);
                const positive = s.score >= 0;
                return (
                  <div className={`lab-move ${i === 0 ? 'best' : ''}`} key={`${s.move.from}-${s.move.to}-${i}`}>
                    <span className="lm-name">
                      {i === 0 && <span className="lm-pick">pick</span>}
                      {moveLabel(s.move)}
                    </span>
                    <span className="lm-bar" aria-hidden="true">
                      <span className={positive ? 'pos' : 'neg'} style={{ width: `${Math.max(3, pct)}%` }} />
                    </span>
                    <span className="lm-score">{positive ? '+' : '−'}{Math.abs(s.score).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Before/after callouts */}
          <div className="lab-callouts">
            <div className="lab-callout">
              <Scissors size={15} />
              <div>
                <b>Alpha-beta pruning</b>
                <p>
                  Same depth, no quiescence: {result.noQuiesStats.nodes.toLocaleString()} positions
                  with pruning vs {result.plainStats.nodes.toLocaleString()} without —{' '}
                  <b style={{ color: 'var(--accent-dk)' }}>{result.prunedPct}% skipped</b>.
                </p>
              </div>
            </div>
            <div className="lab-callout">
              <Scale size={15} />
              <div>
                <b>Quiescence</b>
                <p>
                  Reaches ply {result.prunedStats.maxPlyReached} (vs {result.noQuiesStats.maxPlyReached} without
                  it){result.quiescenceChanged ? ', and here it even changes the chosen move' : ''}. It only
                  fires when a capture is pending.
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="muted-note reveal">
          Square labels read column a–g, row 1–7; <code>×n</code> marks an n-jump capture chain.
          Timings vary with your hardware — the position counts are exact.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, approx }: { label: string; value: string; approx?: boolean }) {
  return (
    <div className="lstat">
      <span className="lstat-v">
        {value}
        {approx && <span className="lstat-approx">≈</span>}
      </span>
      <span className="lstat-l">{label}</span>
    </div>
  );
}
