import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  GraduationCap,
  CheckCircle2,
  Lock,
  ChevronRight,
  Gamepad2,
  Layers,
  BookOpen,
} from 'lucide-react';
import { PieceThemeContext, type PieceTheme } from './pieceTheme.tsx';
import { STRATEGY_LESSONS, BASHNI_LESSONS, type Lesson } from './lessons.ts';
import { OPENING_LESSONS } from './openingLessons.ts';
import { TutorialBoard } from './TutorialBoard.tsx';
import {
  readCompletedLessons,
  markLessonComplete,
  type CompletedLessons,
} from './lessonProgress.ts';
import './landing.css';

const DIFFICULTY_WORD: Record<number, string> = {
  1: 'Gentle',
  2: 'Easy',
  3: 'Tactic',
  4: 'Advanced',
};

/** The lesson tracks (courses) the page can show. */
type Track = 'openings' | 'laska' | 'bashni';

const TRACKS: Record<
  Track,
  { lessons: Lesson[]; eyebrow: string; title: string; lede: string }
> = {
  openings: {
    lessons: OPENING_LESSONS,
    eyebrow: 'Learn the openings',
    title: 'Lasker’s openings',
    lede:
      'Play the three openings Emanuel Lasker named — the Hague, the Berlin defence and the Wing gambit — move by move on the real board, with the idea behind each one. Every line is the engine replaying Lasker’s own theory.',
  },
  laska: {
    lessons: STRATEGY_LESSONS,
    eyebrow: 'Learn the strategy',
    title: 'Column strategy & tactics',
    lede:
      'Four hands-on lessons played on the real board — from why a tall column is safe on the edge to the one-handed attack. Every move is checked by the live rules engine.',
  },
  bashni: {
    lessons: BASHNI_LESSONS,
    eyebrow: 'Learn the towers game',
    title: 'Bashni — the towers game',
    lede:
      'Four hands-on lessons on the 8×8 board Laska grew from: men that capture backward, the flying king, and crowning mid-jump. Every move runs on the live Bashni rules.',
  },
};

/**
 * The strategy-lessons surface: a picker over the engine-validated lessons in
 * `lessons.ts`, each run through `TutorialBoard`. A variant toggle switches
 * between the Laska track (column strategy & tactics) and the Bashni track (what
 * makes the towers game distinct). Progress (which lessons are completed) is
 * keyed by lesson id and persists to `localStorage` (see lessonProgress.ts), so
 * the two tracks share one progress store without collision. Styling reuses the
 * `.landing-page` scope, matching ReplayPage.
 */
export function LessonsPage({
  onBack,
  onPlay,
  onStudyOpenings,
  pieceTheme,
}: {
  onBack: () => void;
  onPlay: () => void;
  /** Open the read-only openings repertoire/study view. */
  onStudyOpenings: () => void;
  pieceTheme: PieceTheme;
}) {
  const [completed, setCompleted] = useState<CompletedLessons>(() => readCompletedLessons());
  const [track, setTrack] = useState<Track>('openings');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => window.scrollTo(0, 0), [activeId]);

  const { lessons, eyebrow, title, lede } = TRACKS[track];

  // An active lesson is looked up across ALL tracks so a lesson stays open even
  // though the toggle nominally points at one track at a time.
  const active: Lesson | undefined = activeId
    ? OPENING_LESSONS.find((l) => l.id === activeId) ??
      STRATEGY_LESSONS.find((l) => l.id === activeId) ??
      BASHNI_LESSONS.find((l) => l.id === activeId)
    : undefined;

  const handleComplete = (id: string) => {
    const next = markLessonComplete(id);
    setCompleted(next);
  };

  const selectTrack = (t: Track) => {
    if (t === track) return;
    setActiveId(null);
    setTrack(t);
  };

  const doneCount = lessons.filter((l) => completed[l.id]).length;

  return (
    <div className="landing-page">
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={active ? () => setActiveId(null) : onBack}>
            <ArrowLeft size={16} /> {active ? 'All lessons' : 'Back'}
          </button>
          <button className="btn" onClick={onPlay}>
            <span className="dot" />
            Play the game
          </button>
        </div>
      </header>

      <section
        className="hero"
        style={{ paddingTop: 'clamp(2rem,5vw,4rem)', paddingBottom: 'clamp(1.25rem,3vw,2rem)' }}
      >
        <div className="wrap">
          <p className="eyebrow">
            <GraduationCap size={14} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />
            {active ? eyebrow : 'Learn by playing'}
          </p>
          <h1 style={{ fontSize: 'clamp(2.2rem,5vw,3.6rem)', margin: '0.4rem 0 0' }}>
            {active ? active.title : title}
          </h1>
          <p className="lede" style={{ maxWidth: '54ch' }}>
            {active ? active.intro : lede}
          </p>
          {!active && (
            <>
              <div
                className="segment lesson-track-toggle"
                role="group"
                aria-label="Lesson track"
                style={{ marginTop: '1.1rem' }}
              >
                <button
                  className={track === 'openings' ? 'active' : ''}
                  onClick={() => selectTrack('openings')}
                  title="Openings — Lasker’s named Laska openings, played move by move"
                >
                  <BookOpen size={15} /> Openings
                </button>
                <button
                  className={track === 'laska' ? 'active' : ''}
                  onClick={() => selectTrack('laska')}
                  title="Laska — column strategy & tactics on the 7×7 board"
                >
                  <Gamepad2 size={15} /> Strategy
                </button>
                <button
                  className={track === 'bashni' ? 'active' : ''}
                  onClick={() => selectTrack('bashni')}
                  title="Bashni — the Russian towers game: 8×8, backward captures, flying kings"
                >
                  <Layers size={15} /> Bashni
                </button>
              </div>
              <div className="lesson-meta-row">
                <p className="since" style={{ margin: 0 }}>
                  {doneCount} of {lessons.length} complete
                </p>
                {track === 'openings' && (
                  <button className="btn btn-small" onClick={onStudyOpenings}>
                    <BookOpen size={14} /> Study the repertoire
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section style={{ paddingTop: 0, paddingBottom: 'var(--section-y)' }}>
        <div className="wrap">
          {active ? (
            <PieceThemeContext.Provider value={pieceTheme}>
              <TutorialBoard lesson={active} onComplete={() => handleComplete(active.id)} />
            </PieceThemeContext.Provider>
          ) : (
            <div className="lesson-grid">
              {lessons.map((lesson) => {
                const isDone = !!completed[lesson.id];
                return (
                  <button
                    key={lesson.id}
                    className={`lesson-card${isDone ? ' done' : ''}`}
                    onClick={() => setActiveId(lesson.id)}
                  >
                    <div className="lesson-card-head">
                      <span className="lesson-ref">{lesson.strategyRef}</span>
                      <span className={`lesson-status${isDone ? ' done' : ''}`}>
                        {isDone ? (
                          <>
                            <CheckCircle2 size={14} /> Done
                          </>
                        ) : (
                          <>
                            <Lock size={13} /> {DIFFICULTY_WORD[lesson.difficulty] ?? 'Lesson'}
                          </>
                        )}
                      </span>
                    </div>
                    <h3>{lesson.title}</h3>
                    <p>{lesson.intro}</p>
                    <span className="lesson-go">
                      {isDone ? 'Replay' : 'Start'} <ChevronRight size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">Lessons run on the live engine — no move it would reject is ever taught.</span>
        </div>
      </footer>
    </div>
  );
}
