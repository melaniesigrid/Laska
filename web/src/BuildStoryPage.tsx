import { useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Bot,
  Cpu,
  Server,
  Database,
  Network,
  ScrollText,
  GraduationCap,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import './landing.css';
import './buildStory.css';

/**
 * "Built with AI" — the process page. A visitor-facing, curated view of how
 * Laska itself was built by a team of specialised AI agents, in build order.
 *
 * This is the in-app surface of BUILD_LOG.md (the repo source of truth). Keep
 * the two in sync: every milestone, number, and honest-edge here mirrors the
 * log, and the log mirrors the measured repo state (test counts are real).
 * Presentation only — this page runs no engine and mutates no state.
 */

type Milestone = {
  id: string;
  icon: LucideIcon;
  agent: string;
  title: string;
  shipped: string;
  verified: string;
  edge: string;
};

const MILESTONES: Milestone[] = [
  {
    id: 'M1',
    icon: Cpu,
    agent: 'engine-engineer',
    title: 'The rules engine — the sacred core',
    shipped:
      'One pure, dependency-free engine in src/ — legal moves, captures, win detection, position notation. Web and server both import it directly; game logic is never forked.',
    verified:
      '20 engine tests, and reconciled with Lasker’s 1911 Rules of Lasca.',
    edge:
      'The one interpretive rule — must you take the longest capture? — stayed open until the heritage replay settled it (M9).',
  },
  {
    id: 'M2',
    icon: Bot,
    agent: 'game-ai-engineer',
    title: 'The opponent — search, not a neural net',
    shipped:
      'A negamax + alpha-beta search with a Laska-specific evaluation (material is column control, not piece count) and six honest difficulty tiers. No cloud, no model — a few hundred transparent lines.',
    verified:
      'A parity test pins it bit-for-bit to a frozen reference; the evaluation is proven exactly antisymmetric, which the search depends on.',
    edge:
      'Weights are reasonable, not yet match-tuned — and there’s deliberately no position cache, because Laska’s draw rules are path-dependent.',
  },
  {
    id: 'M3',
    icon: Cpu,
    agent: 'frontend-board-engineer',
    title: 'A board you can actually play',
    shipped:
      'The React + Vite app — hot-seat two-player and vs-AI on one device, with legible column stacks and the neumorphic, soft-clay board.',
    verified:
      'Typecheck clean and QA’d in a real browser (the web layer is verified by running it, not unit tests).',
    edge:
      'Capture chains that share a landing square auto-pick the longest locally — fine offline, revisited for online play.',
  },
  {
    id: 'M4',
    icon: Server,
    agent: 'backend-realtime-engineer',
    title: 'Server-authoritative online play',
    shipped:
      'Real-time matches over WebSocket with per-move clocks, draw offers, resignation, and reconnection. Every move is re-validated on the server against the same engine — the client is never trusted.',
    verified:
      'A two-client end-to-end integration test plays a full match against the live server.',
    edge:
      'A live match’s state lives in one node’s memory — failover comes later (M7).',
  },
  {
    id: 'M5',
    icon: ShieldCheck,
    agent: 'backend-realtime-engineer',
    title: 'Accounts & ranking',
    shipped:
      'Scrypt-hashed accounts with signed tokens (guests can play first and link later), Elo rating, and matchmaking by rating.',
    verified:
      'Dedicated auth, Elo, and matchmaking test suites on the server.',
    edge:
      'Email verification and password-reset delivery aren’t wired yet — the hooks exist, no provider sends mail.',
  },
  {
    id: 'M6',
    icon: Database,
    agent: 'infra-platform-engineer',
    title: 'Durable storage behind one interface',
    shipped:
      'One Repository interface, three backends — in-memory, SQLite (default), and Postgres — chosen by an env var.',
    verified:
      'A shared contract test runs the same suite against every backend to guarantee they behave identically, plus a write-reopen-reread durability test.',
    edge:
      'Production Postgres still needs versioned migrations, a seed script, and pool tuning.',
  },
  {
    id: 'M7',
    icon: Network,
    agent: 'infra-platform-engineer',
    title: 'Multi-node cluster fabric',
    shipped:
      'A cluster layer for presence, a shared queue, match ownership, and cross-node routing — single-node by default, Redis-backed for scale. A move on one node is routed to the node owning the match and broadcast back.',
    verified:
      'Two-node integration tests and a live test against a real Redis — which surfaced and fixed a genuine shutdown-ordering bug.',
    edge:
      'No in-progress match failover yet: if the owning node dies, that match is lost.',
  },
  {
    id: 'M8',
    icon: Bot,
    agent: 'game-ai-engineer + frontend',
    title: 'The opponent explains itself',
    shipped:
      'The “How the computer thinks” page — a layered explainer with a Search Lab that runs the real engine in your browser and reports measured node counts. Nothing on it is hand-typed, so it can’t drift from the code.',
    verified:
      'Every figure is read live from the engine’s own instrumentation.',
    edge:
      'The first piece of the AI explaining itself — this build story extends that idea to the whole app.',
  },
  {
    id: 'M9',
    icon: ScrollText,
    agent: 'heritage-archivist-engineer',
    title: 'Heritage content & the rules verdict',
    shipped:
      'A move-by-move replay viewer and the canonical rules brochure. Lasker’s own 1911 games replay move-for-move on the live engine — which is what settled the longest-capture question: free choice is correct.',
    verified:
      'The replay is the verification — every historic game is validated through the engine as it loads.',
    edge:
      'A few faded-scan scores don’t fully replay yet and are shown as text, pending re-transcription.',
  },
  {
    id: 'M10',
    icon: GraduationCap,
    agent: 'the next agent',
    title: 'This very page',
    shipped:
      'The milestone log (BUILD_LOG.md) and this curated, in-app build story surfacing it.',
    verified:
      'The page typechecks, is reachable from the landing page, and is kept in sync with the measured repo.',
    edge:
      'The one milestone that’s never finished — it’s appended to as the build continues.',
  },
  {
    id: 'M11',
    icon: GraduationCap,
    agent: 'tutorial-content-engineer + frontend',
    title: 'Engine-driven strategy lessons',
    shipped:
      'Four interactive lessons teach column safety, guarding, the one-handed attack, and attacking over defending. Every expected move is checked by the real engine before the lesson can load, and progress persists locally.',
    verified:
      'The production build passes; the picker, guided move, completion persistence, and six-theme cycle were exercised in a real browser.',
    edge:
      'This is the first strategy set, not yet the flagship first-run “learn Laska in five minutes” capture tutorial. Account-backed progress and course packaging remain open.',
  },
];

export function BuildStoryPage({ onBack, onPlay, onAI }: { onBack: () => void; onPlay: () => void; onAI: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Scroll-reveal, mirroring AIPage/LaskerPage/ReplayPage.
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
    <div className="landing-page build-page" ref={rootRef}>
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
              <Bot size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              The process
            </p>
            <h1 style={{ fontSize: 'clamp(2.6rem,6vw,4.4rem)', margin: '0.7rem 0 0' }}>
              Built by a team of <em className="serif">AI agents</em>.
            </h1>
            <p className="lede" style={{ maxWidth: '54ch' }}>
              Laska wasn’t generated in one shot. It was built the way a studio builds — in order,
              one specialised hand at a time: an engine engineer, a game-AI engineer, a realtime
              backend engineer, an archivist. Each agent worked to the same guide and passed the same
              gate before its work counted: typecheck, tests, and the proof that Lasker’s own 1911
              games still replay move-for-move.
            </p>
          </div>
        </div>
      </section>

      {/* ---- The spine ------------------------------------------------ */}
      <section style={{ paddingBlock: 'clamp(1.5rem,4vw,3rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '62ch' }}>
            <p className="eyebrow">What makes it trustworthy</p>
            <h2 className="lead-h2">One engine, replayed against the man who invented the game.</h2>
            <p className="section-intro">
              The whole project hangs on a single invariant: there is exactly one rules engine, and
              everything imports it. So when an agent touches the rules, a century-old game either
              still replays — or it breaks, loudly, on the first illegal move. That’s the difference
              between “the AI wrote some code” and code you can actually trust.
            </p>
          </div>
          <div className="rules-grid reveal">
            <article className="card">
              <span className="idx">1</span>
              <h3>One source of truth</h3>
              <p>The engine lives in one place. Web and server import it directly — game logic can never drift between where you play and where it’s enforced.</p>
            </article>
            <article className="card">
              <span className="idx">2</span>
              <h3>Replayed against history</h3>
              <p>Lasker’s own 1911 published games are replayed move-for-move at load time. Break a rule and a real game stops replaying — an instant failure signal.</p>
            </article>
            <article className="card note">
              <span className="idx">100</span>
              <h3>Measured, not claimed</h3>
              <p>55 engine, AI &amp; arena tests plus 68 server tests — 123 automated tests, all green on Node 22. Reproducible with <code>npm test</code>.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ---- The milestones ------------------------------------------- */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '62ch' }}>
            <p className="eyebrow">
              <ScrollText size={13} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
              The milestones · in build order
            </p>
            <h2 className="lead-h2">Engine → AI → play → online → heritage.</h2>
            <p className="section-intro">
              Each milestone names the agent that drove it, what shipped, how we know it works, and —
              just as important — what it honestly does <em className="serif">not</em> do yet.
            </p>
          </div>

          <ol className="ms-rail reveal">
            {MILESTONES.map((m) => {
              const Icon = m.icon;
              return (
                <li className="ms-item" key={m.id}>
                  <div className="ms-marker" aria-hidden="true">
                    <Icon size={18} />
                  </div>
                  <div className="ms-body">
                    <div className="ms-head">
                      <span className="ms-id">{m.id}</span>
                      <h3 className="ms-title">{m.title}</h3>
                      <span className="ms-agent">{m.agent}</span>
                    </div>
                    <p className="ms-line"><span className="ms-key">Shipped</span>{m.shipped}</p>
                    <p className="ms-line"><span className="ms-key">Verified</span>{m.verified}</p>
                    <p className="ms-line ms-edge"><span className="ms-key">Honest edge</span>{m.edge}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="muted-note reveal">
            The full engineering log lives in <code>BUILD_LOG.md</code> in the repo, with the deep
            technical write-ups it points to (<code>AI.md</code>, <code>AI_RESEARCH.md</code>). This
            page is the curated view; the log is the source of truth.
          </p>
        </div>
      </section>

      {/* ---- The honest frontier -------------------------------------- */}
      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: '62ch' }}>
            <p className="eyebrow">Still ahead · the honest frontier</p>
            <h2 className="lead-h2">A build in progress, told straight.</h2>
          </div>
          <div className="terms reveal">
            <div className="term">
              <span className="term-name">The flagship tutorial</span>
              <p>Four engine-driven strategy lessons now ship. The first-run “learn Laska in five minutes” capture walkthrough is still the larger activation milestone ahead.</p>
            </div>
            <div className="term">
              <span className="term-name">Benchmarking the opponent</span>
              <p>The AI’s relative strength is measured in a reproducible arena, but a comparison against an external reference engine is still open.</p>
            </div>
            <div className="term">
              <span className="term-name">Production hardening</span>
              <p>Redis now runs in CI. Postgres migrations and live-match failover remain before the online stack is truly production-grade.</p>
            </div>
            <div className="term">
              <span className="term-name">One hard line</span>
              <p>Real-money tournaments are deliberately not built — they’re gated on legal review first. The architecture keeps money flows out of the core so a compliant layer can be added later without reworking the game.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Closing -------------------------------------------------- */}
      <section className="closing">
        <div className="wrap">
          <div className="panel reveal">
            <p className="eyebrow" style={{ marginBottom: '1.2rem' }}>
              See it for yourself
            </p>
            <h2>
              Watch the opponent <em className="serif">think.</em>
            </h2>
            <p>
              The same honesty runs through the AI itself: an explainer that runs the real engine in
              your browser and shows you the actual numbers — no recording, no hand-waving.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-lg" onClick={onAI}>
                <Cpu size={16} />
                How the computer plays
              </button>
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
            Built with AI ·{' '}
            <a href="https://github.com/melaniesigrid" target="_blank" rel="noopener noreferrer">
              © Melanie Baratto
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
