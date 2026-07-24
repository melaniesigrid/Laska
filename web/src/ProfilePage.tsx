/**
 * Profile — the player's identity hub and the home of the cosmetics picker.
 *
 * This is a flagship "make Laska delightful" surface: a neumorphic hero card with
 * the player's chosen mascot, their stats, and a set of selectable cosmetics —
 * mascot tint, piece insignia, and board palette — each applying instantly
 * (optimistic local apply + localStorage) and persisting to the server when the
 * player is signed in. The mascot picker is the headline dopamine moment: picking
 * a colour presses the card in, rings it in the accent, and the live preview
 * cheers.
 *
 * Streak + achievements are OPTIONAL props so later PRs can slot real data in
 * without a refactor; when absent those regions simply don't render.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  LogIn,
  Swords,
  Trophy,
  Minus,
  CircleDot,
  Cpu,
  Users,
  Globe,
  Sparkles,
  Palette,
  Star,
  Flame,
  Award,
} from 'lucide-react';
import { DotMascot } from './mascots.tsx';
import { Insignia, PIECE_THEMES, PIECE_THEME_LABEL, PIECE_THEME_BLURB, type PieceTheme } from './pieceTheme.tsx';
import { MASCOT_TINTS, MASCOT_TINT_LABEL, MASCOT_TINT_HEX } from './cosmetics.ts';
import { loadSavedGames, type SavedGame } from './savedGames.ts';
import type { MascotTint } from './mascots.tsx';
import './landing.css';

/** A board palette the player can choose, mirroring App's THEME list + labels. */
export interface BoardThemeOption {
  id: string;
  label: string;
}

/** A single ribbon on the trophy shelf. Shape kept minimal so the achievements
 *  PR can pass real data; `earned` greys-out a locked slot. */
export interface ProfileAchievement {
  id: string;
  label: string;
  hint?: string;
  earned?: boolean;
}

/** The player as the profile needs them — a subset of PublicUser plus a guest flag. */
export interface ProfilePlayer {
  username: string;
  rating: number;
  ratedGames: number;
  isGuest: boolean;
  /** True when there is no account at all (offline / never signed in). */
  signedIn: boolean;
}

export interface ProfilePageProps {
  player: ProfilePlayer;
  onBack: () => void;
  onSignIn: () => void;

  /** Cosmetics — current values + setters that apply optimistically and persist. */
  mascotTint: MascotTint;
  onMascotTint: (tint: MascotTint) => void;
  pieceTheme: PieceTheme;
  onPieceTheme: (theme: PieceTheme) => void;
  boardTheme: string;
  boardThemeOptions: BoardThemeOption[];
  onBoardTheme: (theme: string) => void;

  /** OPTIONAL slots for later PRs — omitted regions don't render. */
  streak?: { current: number; best: number };
  achievements?: ProfileAchievement[];
}

/* ---- match-history helpers ------------------------------------------------ */

const RESULT_ICON = { W: Trophy, B: Trophy, draw: Minus, unfinished: CircleDot } as const;
const MODE_ICON = { ai: Cpu, hotseat: Users, online: Globe } as const;

/** Did the local "You" win this saved game? Returns 'win' | 'loss' | 'draw' | null
 *  (null = unfinished / no clear human seat, e.g. hotseat where both are players). */
function outcomeForYou(g: SavedGame): 'win' | 'loss' | 'draw' | null {
  if (g.result === 'unfinished') return null;
  if (g.result === 'draw') return 'draw';
  // The human is the side NOT labelled "Computer"; in hotseat there is no single
  // "you", so a win/loss isn't attributable — count it toward games, not the rate.
  const youAre = g.white === 'You' ? 'W' : g.black === 'You' ? 'B' : null;
  if (!youAre) return null;
  return g.result === youAre ? 'win' : 'loss';
}

function opponentLabel(g: SavedGame): string {
  if (g.mode === 'ai') return 'Computer';
  if (g.mode === 'hotseat') return 'A friend';
  return g.white === 'You' ? g.black : g.white;
}

/* ---- the page ------------------------------------------------------------- */

export function ProfilePage(props: ProfilePageProps) {
  const {
    player,
    onBack,
    onSignIn,
    mascotTint,
    onMascotTint,
    pieceTheme,
    onPieceTheme,
    boardTheme,
    boardThemeOptions,
    onBoardTheme,
    streak,
    achievements,
  } = props;

  const games = useMemo(() => loadSavedGames(), []);

  const stats = useMemo(() => {
    let wins = 0;
    let decided = 0;
    for (const g of games) {
      const o = outcomeForYou(g);
      if (o === 'win') wins++;
      if (o === 'win' || o === 'loss') decided++;
    }
    const winRate = decided > 0 ? Math.round((wins / decided) * 100) : null;
    return { played: games.length, wins, winRate };
  }, [games]);

  const recent = games.slice(0, 6);

  return (
    <div className="landing-page profile-page">
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          {!player.signedIn && (
            <button className="btn" onClick={onSignIn}>
              <LogIn size={16} /> Sign in
            </button>
          )}
        </div>
      </header>

      <section className="profile-shell">
        <div className="wrap">
          {/* ---- hero / identity --------------------------------------- */}
          <article className="profile-hero">
            <div className="ph-glow" aria-hidden="true" />
            <div className="ph-mascot">
              <DotMascot tint={mascotTint} mood="cheer" size={148} label={`${player.username}'s mascot`} />
            </div>
            <div className="ph-id">
              <p className="eyebrow">{player.signedIn ? (player.isGuest ? 'Guest profile' : 'Your profile') : 'Profile'}</p>
              <h1 className="ph-name">{player.username}</h1>
              {!player.signedIn ? (
                <p className="ph-note">
                  <Sparkles size={14} /> Sign in to save your profile across devices — your mascot stays right here meanwhile.
                </p>
              ) : player.isGuest ? (
                <p className="ph-note">
                  <Sparkles size={14} /> Playing as a guest. Link an account to keep this profile for good.
                </p>
              ) : null}

              <div className="ph-stats">
                <Stat label="Rating" value={player.signedIn && player.ratedGames > 0 ? String(player.rating) : '—'} icon={<Star size={15} />} />
                <Stat label="Games" value={String(stats.played)} icon={<Swords size={15} />} />
                <Stat label="Win rate" value={stats.winRate == null ? '—' : `${stats.winRate}%`} icon={<Trophy size={15} />} />
              </div>
            </div>
          </article>

          {/* ---- optional streak slot ---------------------------------- */}
          {streak && (
            <article className="profile-card streak-card">
              <header className="pc-head">
                <Flame size={17} /> <h2>Daily streak</h2>
              </header>
              <div className="streak-row">
                <div className="streak-big">
                  <span className="streak-num">{streak.current}</span>
                  <span className="streak-unit">day{streak.current === 1 ? '' : 's'}</span>
                </div>
                <span className="streak-best">Best · {streak.best}</span>
              </div>
            </article>
          )}

          {/* ---- mascot picker (the dopamine moment) ------------------- */}
          <article className="profile-card">
            <header className="pc-head">
              <Sparkles size={17} /> <h2>Choose your mascot</h2>
              <span className="pc-sub">Tap a colour — it’s yours instantly.</span>
            </header>
            <div className="mascot-picker" role="radiogroup" aria-label="Mascot colour">
              {MASCOT_TINTS.map((tint) => (
                <MascotCard
                  key={tint}
                  tint={tint}
                  selected={tint === mascotTint}
                  onPick={() => onMascotTint(tint)}
                />
              ))}
            </div>
          </article>

          {/* ---- piece + board cosmetics ------------------------------- */}
          <div className="cosmetics-row">
            <article className="profile-card">
              <header className="pc-head">
                <Star size={17} /> <h2>Piece style</h2>
              </header>
              <div className="chip-grid">
                {PIECE_THEMES.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    role="radio"
                    aria-checked={theme === pieceTheme}
                    className={`pick-chip${theme === pieceTheme ? ' selected' : ''}`}
                    onClick={() => onPieceTheme(theme)}
                  >
                    <span className="chip-preview">
                      <span className="disc cream legend-coin">
                        <Insignia theme={theme} rank="officer" />
                      </span>
                    </span>
                    <span className="chip-label">{PIECE_THEME_LABEL[theme]}</span>
                    <span className="chip-blurb">{PIECE_THEME_BLURB[theme]}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="profile-card">
              <header className="pc-head">
                <Palette size={17} /> <h2>Board palette</h2>
              </header>
              <div className="swatch-grid">
                {boardThemeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={opt.id === boardTheme}
                    className={`board-swatch${opt.id === boardTheme ? ' selected' : ''}`}
                    onClick={() => onBoardTheme(opt.id)}
                    title={opt.label}
                  >
                    <span className={`bs-chip bs-${opt.id}`} aria-hidden="true" />
                    <span className="bs-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </article>
          </div>

          {/* ---- optional achievements slot ---------------------------- */}
          {achievements && achievements.length > 0 && (
            <article className="profile-card">
              <header className="pc-head">
                <Award size={17} /> <h2>Trophy shelf</h2>
              </header>
              <div className="trophy-shelf">
                {achievements.map((a) => (
                  <div key={a.id} className={`trophy${a.earned ? ' earned' : ''}`} title={a.hint}>
                    <Award size={20} />
                    <span>{a.label}</span>
                  </div>
                ))}
              </div>
            </article>
          )}

          {/* ---- match history ----------------------------------------- */}
          <article className="profile-card">
            <header className="pc-head">
              <Swords size={17} /> <h2>Recent games</h2>
            </header>
            {recent.length === 0 ? (
              <div className="profile-empty">
                <DotMascot tint={mascotTint} mood="sleepy" size={84} />
                <p>No games yet. Play one and it’ll show up here.</p>
              </div>
            ) : (
              <ul className="history-list">
                {recent.map((g) => {
                  const o = outcomeForYou(g);
                  const ResultIcon = RESULT_ICON[g.result];
                  const ModeIcon = MODE_ICON[g.mode];
                  return (
                    <li key={g.id} className="history-row">
                      <span className={`hr-result ${o ?? 'open'}`}>
                        <ResultIcon size={15} />
                      </span>
                      <span className="hr-main">
                        <span className="hr-opp">
                          <ModeIcon size={13} /> vs {opponentLabel(g)}
                        </span>
                        <span className="hr-meta">
                          {g.moves.length} plies · {new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </span>
                      <span className={`hr-tag ${o ?? 'open'}`}>
                        {o === 'win' ? 'Won' : o === 'loss' ? 'Lost' : o === 'draw' ? 'Draw' : 'Open'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">
            {player.signedIn && !player.isGuest
              ? 'Your cosmetics follow your account.'
              : 'Cosmetics saved in this browser.'}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="ph-stat">
      <span className="ph-stat-ico">{icon}</span>
      <span className="ph-stat-val">{value}</span>
      <span className="ph-stat-lbl">{label}</span>
    </div>
  );
}

/** One mascot colour card. Re-mounts its preview on selection (via a key bump)
 *  so the cheer animation replays every time it's picked — the dopamine beat. */
function MascotCard({ tint, selected, onPick }: { tint: MascotTint; selected: boolean; onPick: () => void }) {
  const [cheerSeq, setCheerSeq] = useState(0);
  const pick = () => {
    setCheerSeq((n) => n + 1);
    onPick();
  };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={MASCOT_TINT_LABEL[tint]}
      className={`mascot-card${selected ? ' selected' : ''}`}
      style={{ ['--swatch' as string]: MASCOT_TINT_HEX[tint] }}
      onClick={pick}
    >
      <span className="mc-preview">
        <DotMascot key={`${tint}-${cheerSeq}`} tint={tint} mood={selected ? 'cheer' : 'idle'} size={64} />
      </span>
      <span className="mc-label">{MASCOT_TINT_LABEL[tint]}</span>
    </button>
  );
}
