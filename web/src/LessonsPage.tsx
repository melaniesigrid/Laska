import { useEffect, useState } from 'react';
import { ArrowLeft, GraduationCap, CheckCircle2, Lock, ChevronRight } from 'lucide-react';
import { PieceThemeContext, type PieceTheme } from './pieceTheme.tsx';
import { STRATEGY_LESSONS, type Lesson } from './lessons.ts';
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

/**
 * The strategy-lessons surface: a picker over the four engine-validated lessons
 * in `lessons.ts`, each run through `TutorialBoard`. Progress (which lessons are
 * completed) persists to `localStorage` (see lessonProgress.ts) and is shown in
 * the list. Styling reuses the `.landing-page` scope, matching ReplayPage.
 */
export function LessonsPage({
  onBack,
  onPlay,
  pieceTheme,
}: {
  onBack: () => void;
  onPlay: () => void;
  pieceTheme: PieceTheme;
}) {
  const [completed, setCompleted] = useState<CompletedLessons>(() => readCompletedLessons());
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => window.scrollTo(0, 0), [activeId]);

  const active: Lesson | undefined = activeId
    ? STRATEGY_LESSONS.find((l) => l.id === activeId)
    : undefined;

  const handleComplete = (id: string) => {
    const next = markLessonComplete(id);
    setCompleted(next);
  };

  const doneCount = STRATEGY_LESSONS.filter((l) => completed[l.id]).length;

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
            Learn the strategy
          </p>
          <h1 style={{ fontSize: 'clamp(2.2rem,5vw,3.6rem)', margin: '0.4rem 0 0' }}>
            {active ? active.title : 'Column strategy & tactics'}
          </h1>
          <p className="lede" style={{ maxWidth: '54ch' }}>
            {active
              ? active.intro
              : 'Four hands-on lessons played on the real board — from why a tall column is safe on the edge to the one-handed attack. Every move is checked by the live rules engine.'}
          </p>
          {!active && (
            <p className="since" style={{ marginTop: '0.9rem' }}>
              {doneCount} of {STRATEGY_LESSONS.length} complete
            </p>
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
              {STRATEGY_LESSONS.map((lesson) => {
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
