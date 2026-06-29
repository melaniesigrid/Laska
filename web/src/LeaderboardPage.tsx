import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Trophy, Loader2, Users } from 'lucide-react';
import { LaskaClient, type LeaderboardRow } from './net/client.ts';
import { RankBadge } from './RankBadge.tsx';
import './landing.css';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080';
const WS_URL = API_BASE.replace(/^http/, 'ws') + '/ws';

/** A throwaway client just for the public REST leaderboard read (no auth, no
 *  socket). The shared online hook owns the live client; this page only needs the
 *  one REST call, so a local instance keeps it decoupled from match state. */
function useLeaderboard(limit: number) {
  const clientRef = useRef<LaskaClient | null>(null);
  if (!clientRef.current) clientRef.current = new LaskaClient(API_BASE, WS_URL);

  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    clientRef.current!
      .leaderboard(limit)
      .then((res) => {
        if (!cancelled) setRows(res.leaderboard);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the leaderboard.');
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { rows, error };
}

/** The global ranked leaderboard. Top players by Glicko-2 rating, each with their
 *  displayed military rank. The signed-in player's row (if present) is highlighted;
 *  the top three get a subtle podium treatment. Uses the landing's scoped palette. */
export function LeaderboardPage({
  onBack,
  onPlay,
  currentUserId,
}: {
  onBack: () => void;
  onPlay: () => void;
  currentUserId?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { rows, error } = useLeaderboard(50);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page leaderboard-page" ref={rootRef}>
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

      <section className="hero" style={{ paddingBottom: 'clamp(1.5rem,4vw,2.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '860px' }}>
          <p className="eyebrow">
            <Trophy size={14} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
            Ranked standings
          </p>
          <h1 style={{ fontSize: 'clamp(2.4rem,5vw,3.8rem)', margin: '0.6rem 0 0' }}>
            The <em className="serif">leaderboard.</em>
          </h1>
          <p className="lede" style={{ maxWidth: '52ch' }}>
            Every ranked game moves the needle. Climb from Recruit to Colonel, then earn your
            first General star — and keep collecting them.
          </p>
        </div>
      </section>

      <section style={{ paddingBottom: 'clamp(3rem,7vw,5rem)' }}>
        <div className="wrap" style={{ maxWidth: '860px' }}>
          {error ? (
            <div className="lb-empty">
              <p>{error}</p>
              <p className="muted">The ranking server may be offline. Try again shortly.</p>
            </div>
          ) : rows === null ? (
            <div className="lb-empty">
              <Loader2 className="lb-spin" size={26} aria-hidden="true" />
              <p>Loading the standings…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="lb-empty">
              <Users size={26} aria-hidden="true" />
              <p>No ranked players yet.</p>
              <p className="muted">Be the first — play a ranked game online.</p>
              <button className="btn" onClick={onPlay} style={{ marginTop: '0.8rem' }}>
                <span className="dot" />
                Play online
              </button>
            </div>
          ) : (
            <ol className="lb-table" aria-label="Ranked leaderboard">
              <li className="lb-row lb-head" aria-hidden="true">
                <span className="lb-pos">#</span>
                <span className="lb-rank">Rank</span>
                <span className="lb-name">Player</span>
                <span className="lb-rating">Rating</span>
                <span className="lb-games">Games</span>
              </li>
              {rows.map((row, i) => {
                const pos = i + 1;
                const me = currentUserId && row.userId === currentUserId;
                const podium = pos <= 3 ? ` lb-podium lb-p${pos}` : '';
                return (
                  <li key={row.userId} className={`lb-row${me ? ' lb-me' : ''}${podium}`}>
                    <span className="lb-pos">
                      {pos <= 3 ? <Trophy size={16} aria-hidden="true" /> : null}
                      <span>{pos}</span>
                    </span>
                    <span className="lb-rank">
                      <RankBadge rank={row.rank} size="sm" />
                    </span>
                    <span className="lb-name">
                      {row.username}
                      {me && <span className="lb-you">You</span>}
                    </span>
                    <span className="lb-rating">{row.rating}</span>
                    <span className="lb-games">{row.ratedGames}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">Ranked standings · Glicko-2 rating · one rank = 100 points</span>
        </div>
      </footer>
    </div>
  );
}
