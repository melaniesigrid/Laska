import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  Users,
  UserCheck,
  UserPlus,
  Activity,
  Swords,
  BarChart3,
  RefreshCw,
  LogOut,
  ShieldAlert,
  KeyRound,
} from 'lucide-react';
import './landing.css';

/**
 * Internal admin analytics dashboard. NOT linked from any user-facing nav —
 * reachable only by URL hash (`#/admin`, see App.tsx). Reads the admin token
 * from localStorage; the server gates `GET /admin/stats` behind a Bearer token.
 *
 * The server base URL is derived the same way the online play does it
 * (`VITE_API_BASE`, falling back to the local dev server) — see useOnline.ts /
 * LeaderboardPage.tsx, which use this exact expression.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080';

/** localStorage key for the admin bearer token. */
const TOKEN_KEY = 'laska.adminToken';

/** The fixed `GET /admin/stats` payload (server contract). `{ stats: PlatformStats }`. */
interface PlatformStats {
  generatedAt: number;
  users: { total: number; registered: number; guests: number; verified: number };
  active: { d1: number; d7: number; d30: number };
  newUsers: { last24h: number; last7d: number; last30d: number };
  signupsByDay: { day: string; count: number }[];
  matches: { total: number; ranked: number; last24h: number; last7d: number };
}

/** Discriminated fetch state so the three failure modes render distinct copy. */
type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; stats: PlatformStats }
  | { kind: 'error'; reason: 'auth' | 'disabled' | 'network'; message: string };

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

const nf = new Intl.NumberFormat();
const fmt = (n: number) => nf.format(n);

/** "MMM D" for a 'YYYY-MM-DD' day key (local, label only — no TZ math needed). */
function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function snapshotLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AdminStatsPage({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [draft, setDraft] = useState('');
  // Guards against a stale fetch (older token / unmount) writing state.
  const reqSeq = useRef(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const fetchStats = useCallback(async (tok: string) => {
    const seq = ++reqSeq.current;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (reqSeq.current !== seq) return;
      if (res.status === 401) {
        setState({ kind: 'error', reason: 'auth', message: 'Invalid admin token — re-enter it.' });
        return;
      }
      if (res.status === 404) {
        setState({
          kind: 'error',
          reason: 'disabled',
          message: 'Admin stats are not enabled on the server.',
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: 'error',
          reason: 'network',
          message: `The server returned ${res.status}. Try again shortly.`,
        });
        return;
      }
      const body = (await res.json()) as { stats: PlatformStats };
      if (reqSeq.current !== seq) return;
      setState({ kind: 'ok', stats: body.stats });
    } catch {
      if (reqSeq.current !== seq) return;
      setState({
        kind: 'error',
        reason: 'network',
        message: 'Could not reach the server. Check the connection and retry.',
      });
    }
  }, []);

  // Fetch whenever we hold a token (initial mount with a saved token, or after
  // the operator submits one).
  useEffect(() => {
    if (token) void fetchStats(token);
  }, [token, fetchStats]);

  const submitToken = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const tok = draft.trim();
      if (!tok) return;
      try {
        localStorage.setItem(TOKEN_KEY, tok);
      } catch {
        /* storage unavailable — token simply isn't persisted */
      }
      setDraft('');
      setToken(tok);
    },
    [draft],
  );

  const forgetToken = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    reqSeq.current++; // invalidate any in-flight fetch
    setToken(null);
    setState({ kind: 'idle' });
  }, []);

  const refresh = useCallback(() => {
    if (token) void fetchStats(token);
  }, [token, fetchStats]);

  return (
    <div className="landing-page admin-page">
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          {token && (
            <button className="btn" onClick={forgetToken} title="Forget the admin token on this device">
              <LogOut size={16} /> Forget token
            </button>
          )}
        </div>
      </header>

      <section className="hero" style={{ paddingBottom: 'clamp(1.5rem,4vw,2.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '960px' }}>
          <p className="eyebrow">
            <ShieldAlert size={14} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
            Internal · admin only
          </p>
          <h1 style={{ fontSize: 'clamp(2.2rem,5vw,3.4rem)', margin: '0.6rem 0 0' }}>
            Platform <em className="serif">analytics.</em>
          </h1>
          <p className="lede" style={{ maxWidth: '54ch' }}>
            Who's here, who's coming back, and how much they're playing — read straight from the
            game server.
          </p>
        </div>
      </section>

      <section style={{ paddingBottom: 'clamp(3rem,7vw,5rem)' }}>
        <div className="wrap" style={{ maxWidth: '960px' }}>
          {!token ? (
            <TokenForm draft={draft} setDraft={setDraft} onSubmit={submitToken} />
          ) : state.kind === 'loading' || state.kind === 'idle' ? (
            <div className="admin-empty">
              <Loader2 className="lb-spin" size={26} aria-hidden="true" />
              <p>Loading platform stats…</p>
            </div>
          ) : state.kind === 'error' ? (
            <div className="admin-empty">
              <ShieldAlert size={26} aria-hidden="true" />
              <p>{state.message}</p>
              {state.reason === 'auth' ? (
                <button className="btn" onClick={forgetToken} style={{ marginTop: '0.6rem' }}>
                  <KeyRound size={16} /> Re-enter token
                </button>
              ) : (
                <button className="btn" onClick={refresh} style={{ marginTop: '0.6rem' }}>
                  <RefreshCw size={16} /> Retry
                </button>
              )}
            </div>
          ) : (
            <StatsDashboard stats={state.stats} onRefresh={refresh} />
          )}
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">Internal analytics · {API_BASE}</span>
        </div>
      </footer>
    </div>
  );
}

function TokenForm({
  draft,
  setDraft,
  onSubmit,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form className="admin-token-card" onSubmit={onSubmit}>
      <div className="admin-token-icon" aria-hidden="true">
        <KeyRound size={24} />
      </div>
      <h2 className="admin-token-title">Admin token required</h2>
      <p className="admin-token-sub">
        Paste the admin token to load the dashboard. It's stored only in this browser.
      </p>
      <label className="admin-field">
        <span className="admin-field-label">Admin token</span>
        <input
          type="password"
          className="admin-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Bearer token"
          autoComplete="off"
          autoFocus
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
        <span className="dot" /> Load stats
      </button>
    </form>
  );
}

function StatsDashboard({ stats, onRefresh }: { stats: PlatformStats; onRefresh: () => void }) {
  const { users, active, newUsers, matches, signupsByDay } = stats;
  const registeredPct = users.total > 0 ? Math.round((users.registered / users.total) * 100) : 0;
  const guestPct = users.total > 0 ? 100 - registeredPct : 0;

  return (
    <div className="admin-dash">
      <div className="admin-snapshot">
        <span>
          Snapshot taken {snapshotLabel(stats.generatedAt)}
        </span>
        <button className="btn admin-refresh" onClick={onRefresh} title="Refresh now">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="admin-grid">
        {/* Users — headline + registered/guest split */}
        <section className="admin-card admin-card-wide">
          <header className="admin-card-head">
            <Users size={16} /> Users
          </header>
          <div className="admin-headline">
            <span className="admin-big">{fmt(users.total)}</span>
            <span className="admin-big-label">total accounts</span>
          </div>
          <div className="admin-split" role="img" aria-label={`${registeredPct}% registered, ${guestPct}% guests`}>
            <span className="admin-split-bar admin-split-registered" style={{ flexBasis: `${registeredPct}%` }} />
            <span className="admin-split-bar admin-split-guest" style={{ flexBasis: `${guestPct}%` }} />
          </div>
          <div className="admin-mini-row">
            <div className="admin-mini">
              <span className="admin-mini-dot dot-registered" />
              <span className="admin-mini-val">{fmt(users.registered)}</span>
              <span className="admin-mini-label">Registered</span>
            </div>
            <div className="admin-mini">
              <span className="admin-mini-dot dot-guest" />
              <span className="admin-mini-val">{fmt(users.guests)}</span>
              <span className="admin-mini-label">Guests</span>
            </div>
            <div className="admin-mini">
              <UserCheck size={14} className="admin-mini-ico" />
              <span className="admin-mini-val">{fmt(users.verified)}</span>
              <span className="admin-mini-label">Verified</span>
            </div>
          </div>
        </section>

        {/* Active users */}
        <section className="admin-card">
          <header className="admin-card-head">
            <Activity size={16} /> Active users
          </header>
          <div className="admin-trio">
            <Stat label="D1" value={active.d1} />
            <Stat label="D7" value={active.d7} />
            <Stat label="D30" value={active.d30} />
          </div>
        </section>

        {/* New users */}
        <section className="admin-card">
          <header className="admin-card-head">
            <UserPlus size={16} /> New users
          </header>
          <div className="admin-trio">
            <Stat label="24h" value={newUsers.last24h} />
            <Stat label="7d" value={newUsers.last7d} />
            <Stat label="30d" value={newUsers.last30d} />
          </div>
        </section>

        {/* Matches */}
        <section className="admin-card admin-card-wide">
          <header className="admin-card-head">
            <Swords size={16} /> Matches
          </header>
          <div className="admin-quad">
            <Stat label="Total" value={matches.total} />
            <Stat label="Ranked" value={matches.ranked} />
            <Stat label="Last 24h" value={matches.last24h} />
            <Stat label="Last 7d" value={matches.last7d} />
          </div>
        </section>

        {/* Signups sparkline */}
        <section className="admin-card admin-card-wide">
          <header className="admin-card-head">
            <BarChart3 size={16} /> Signups · last 30 days
          </header>
          <SignupsChart days={signupsByDay} />
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-val">{fmt(value)}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
  );
}

function SignupsChart({ days }: { days: { day: string; count: number }[] }) {
  if (days.length === 0) {
    return <p className="admin-chart-empty">No signup data yet.</p>;
  }
  const peak = days.reduce((m, d) => Math.max(m, d.count), 0);
  const peakDay = days.reduce((a, b) => (b.count > a.count ? b : a), days[0]!);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return (
    <div className="admin-chart">
      <div className="admin-bars" role="img" aria-label={`Signups per day over ${days.length} days, peak ${peak}`}>
        {days.map((d) => {
          const h = peak > 0 ? Math.max(2, Math.round((d.count / peak) * 100)) : 2;
          const isPeak = d.count === peak && peak > 0;
          return (
            <span
              key={d.day}
              className={`admin-bar${isPeak ? ' admin-bar-peak' : ''}`}
              style={{ height: `${h}%` }}
              title={`${shortDay(d.day)}: ${d.count} signup${d.count === 1 ? '' : 's'}`}
            />
          );
        })}
      </div>
      <div className="admin-chart-axis">
        <span>{shortDay(first.day)}</span>
        <span className="admin-chart-peak">
          peak {fmt(peak)} · {shortDay(peakDay.day)}
        </span>
        <span>{shortDay(last.day)}</span>
      </div>
    </div>
  );
}
