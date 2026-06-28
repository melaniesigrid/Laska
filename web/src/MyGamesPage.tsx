/**
 * My Games — the player's saved-match library. Lists every saved game with its
 * result and metadata, opens any of them in the annotating replay viewer, and
 * exports the whole library as an AI training corpus (see training.ts).
 */
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Trash2,
  Eye,
  Trophy,
  Minus,
  CircleDot,
  Download,
  Cpu,
  Users,
  Globe,
  Brain,
} from 'lucide-react';
import {
  loadSavedGames,
  deleteSavedGame,
  type SavedGame,
} from './savedGames.ts';
import { buildTrainingCorpus, corpusToJsonl, corpusStats } from './training.ts';
import { DotMascot } from './mascots.tsx';
import './landing.css';

const RESULT_LABEL: Record<SavedGame['result'], string> = {
  W: 'White won',
  B: 'Black won',
  draw: 'Draw',
  unfinished: 'Unfinished',
};

const MODE_ICON = { ai: Cpu, hotseat: Users, online: Globe } as const;
const MODE_LABEL = { ai: 'vs Computer', hotseat: 'Two players', online: 'Online' } as const;

function download(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MyGamesPage({
  onBack,
  onWatch,
  onPlay,
}: {
  onBack: () => void;
  onWatch: (id: string) => void;
  onPlay: () => void;
}) {
  // A bump counter forces a re-read after a delete (saves live in localStorage).
  const [rev, setRev] = useState(0);
  const games = useMemo(() => loadSavedGames(), [rev]);

  const stats = useMemo(() => {
    const corpus = buildTrainingCorpus(games);
    return { corpus, ...corpusStats(games, corpus) };
  }, [games]);

  const remove = (id: string) => {
    deleteSavedGame(id);
    setRev((r) => r + 1);
  };

  const exportCorpus = () => {
    download('laska-training-corpus.jsonl', corpusToJsonl(stats.corpus), 'application/x-ndjson');
  };

  return (
    <div className="landing-page">
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <button className="btn" onClick={onPlay}>
            <span className="dot" /> Play a game
          </button>
        </div>
      </header>

      <section className="hero" style={{ paddingTop: 'clamp(2.5rem,6vw,4.5rem)', paddingBottom: 'clamp(1.5rem,4vw,2.5rem)' }}>
        <div className="wrap">
          <p className="eyebrow">Your library</p>
          <h1 style={{ fontSize: 'clamp(2.2rem,5vw,3.6rem)', margin: '0.6rem 0 0' }}>My games</h1>
          <p className="lede" style={{ maxWidth: '52ch' }}>
            Every game you save lives here. Rewatch it move-by-move, add your own notes, and turn the whole
            library into training data for the engine.
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          {games.length === 0 ? (
            <div className="card note" style={{ textAlign: 'center', padding: 'clamp(2.5rem,6vw,4rem)' }}>
              <DotMascot tint="mint" mood="sleepy" size={88} />
              <h3>No saved games yet</h3>
              <p style={{ maxWidth: '40ch', margin: '0.6rem auto 1.4rem' }}>
                Finish (or pause) a game and press <b>Save game</b> — it’ll show up here, ready to rewatch and annotate.
              </p>
              <button className="btn btn-lg" onClick={onPlay}>
                <span className="dot" /> Play your first game
              </button>
            </div>
          ) : (
            <>
              <div className="corpus-bar">
                <div className="corpus-stat">
                  <Brain size={18} />
                  <div>
                    <b>Training corpus</b>
                    <span>
                      {stats.samples} positions from {stats.games} {stats.games === 1 ? 'game' : 'games'} ·{' '}
                      {stats.labelled} with a known result · {stats.positions} unique
                    </span>
                  </div>
                </div>
                <button className="btn" onClick={exportCorpus} disabled={stats.samples === 0}>
                  <Download size={16} /> Export .jsonl
                </button>
              </div>

              <div className="saved-grid">
                {games.map((g) => {
                  const ResultIcon = g.result === 'draw' ? Minus : g.result === 'unfinished' ? CircleDot : Trophy;
                  const ModeIcon = MODE_ICON[g.mode];
                  const annotated = (g.note ? 1 : 0) + g.moves.filter((m) => m.note).length;
                  return (
                    <article className="saved-card" key={g.id}>
                      <div className="saved-card-head">
                        <h3>{g.title}</h3>
                        <span className={`saved-result ${g.result}`}>
                          <ResultIcon size={13} /> {RESULT_LABEL[g.result]}
                        </span>
                      </div>
                      <p className="saved-meta">
                        <ModeIcon size={13} /> {MODE_LABEL[g.mode]} · {g.moves.length} plies
                        {annotated > 0 ? ` · ${annotated} ${annotated === 1 ? 'note' : 'notes'}` : ''}
                      </p>
                      <p className="saved-date">{new Date(g.createdAt).toLocaleString()}</p>
                      <div className="saved-actions">
                        <button className="btn" onClick={() => onWatch(g.id)}>
                          <Eye size={15} /> Watch
                        </button>
                        <button
                          className="btn icon-only"
                          onClick={() => remove(g.id)}
                          aria-label={`Delete ${g.title}`}
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">Saved locally in this browser — no account needed.</span>
        </div>
      </footer>
    </div>
  );
}
