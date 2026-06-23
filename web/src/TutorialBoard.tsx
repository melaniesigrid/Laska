import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, CheckCircle2, RotateCcw, Trophy } from 'lucide-react';
import { RC_TO_SQUARE, BOARD_DIM, type GameState, type Move } from '../../src/index.ts';
import { BoardView } from './Board.tsx';
import type { Lesson, LessonStep } from './lessons.ts';

const EMPTY = new Set<number>();

/** How long an auto-played opponent reply waits before it lands (ms). */
const OPPONENT_DELAY_MS = 850;

/**
 * TutorialBoard — runs a scripted, engine-validated `Lesson` over the real
 * `BoardView`.
 *
 * For the current step it:
 *  - glows `step.highlight` (plus the move's own from/to) via BoardView's
 *    `highlight` prop, and lights legal destinations only for the EXPECTED move(s);
 *  - GATES player input: only a move in `step.expectedMoves` advances the lesson.
 *    Any other (still-legal) move is rejected with the step's `hint` — the player
 *    cannot wander off the script;
 *  - AUTO-PLAYS `actor: 'opponent'` steps (the forced replies) after a short beat;
 *  - on a correct learner move, shows `step.successText`, then advances.
 *
 * It never forks board rendering or re-implements rules — gating is done purely by
 * matching the player's chosen square against the pre-validated `expectedMoves`
 * that `lessons.ts` already resolved through the engine. When all steps are done it
 * calls `onComplete()` (used to persist progress) and shows the lesson `outro`.
 */
export function TutorialBoard({
  lesson,
  onComplete,
}: {
  lesson: Lesson;
  onComplete: () => void;
}) {
  // Step cursor. `done` once the cursor passes the last step.
  const [stepIdx, setStepIdx] = useState(0);
  // Live board state, advanced as steps resolve (starts at the lesson opening).
  const [state, setState] = useState<GameState>(() => lesson.states[0]!);
  // Player's selected origin square (two-tap: select, then tap destination).
  const [selected, setSelected] = useState<number | null>(null);
  // Transient coach feedback below the prompt.
  const [feedback, setFeedback] = useState<{ kind: 'hint' | 'success'; text: string } | null>(null);
  const reportedDone = useRef(false);

  // Reset everything when the lesson changes (picking a different lesson).
  useEffect(() => {
    setStepIdx(0);
    setState(lesson.states[0]!);
    setSelected(null);
    setFeedback(null);
    reportedDone.current = false;
  }, [lesson]);

  const done = stepIdx >= lesson.steps.length;
  const step: LessonStep | undefined = done ? undefined : lesson.steps[stepIdx];
  const isOpponentStep = step?.actor === 'opponent';

  // Fire onComplete exactly once when we reach the end.
  useEffect(() => {
    if (done && !reportedDone.current) {
      reportedDone.current = true;
      onComplete();
    }
  }, [done, onComplete]);

  /** Advance past the current step. `lessons.ts` already applied the canonical
   *  move into `lesson.states`, so the next board is just `states[stepIdx + 1]`
   *  — no re-applying rules here. */
  const advance = useCallback(() => {
    setStepIdx((i) => {
      const next = i + 1;
      setState(lesson.states[Math.min(next, lesson.states.length - 1)]!);
      return next;
    });
    setSelected(null);
  }, [lesson]);

  // Auto-play opponent (forced-reply) steps after a short, readable beat.
  useEffect(() => {
    if (!step || !isOpponentStep) return;
    setSelected(null);
    const t = setTimeout(() => {
      setFeedback({ kind: 'success', text: step.successText });
      advance();
    }, OPPONENT_DELAY_MS);
    return () => clearTimeout(t);
  }, [step, isOpponentStep, advance]);

  // --- input gating for learner steps ---------------------------------------

  // Squares the player may pick up: just the origin(s) of the expected move(s).
  const movable = useMemo(() => {
    if (!step || isOpponentStep) return EMPTY;
    return new Set(step.expectedMoves.map((m) => m.from));
  }, [step, isOpponentStep]);

  // Destinations to light once an origin is selected: only the expected landings.
  const destinations = useMemo(() => {
    if (!step || isOpponentStep || selected == null) return EMPTY;
    return new Set(
      step.expectedMoves.filter((m) => m.from === selected).map((m) => m.to),
    );
  }, [step, isOpponentStep, selected]);

  const captureTargets = useMemo(() => {
    if (!step || isOpponentStep || selected == null) return EMPTY;
    return new Set(
      step.expectedMoves.filter((m) => m.from === selected && m.isCapture).map((m) => m.to),
    );
  }, [step, isOpponentStep, selected]);

  // The teaching glow: the step's authored highlight squares.
  const highlight = useMemo(() => {
    if (!step || isOpponentStep) return EMPTY;
    return new Set(step.highlight);
  }, [step, isOpponentStep]);

  const handleSquareClick = useCallback(
    (square: number) => {
      if (!step || isOpponentStep) return;

      // Second tap: a destination of the currently-selected origin?
      if (selected != null) {
        const match = step.expectedMoves.find(
          (m: Move) => m.from === selected && m.to === square,
        );
        if (match) {
          setFeedback({ kind: 'success', text: step.successText });
          advance();
          return;
        }
      }

      // First tap: pick up an expected origin.
      if (movable.has(square)) {
        setSelected((cur) => (cur === square ? null : square));
        setFeedback(null);
        return;
      }

      // Anything else is off-script — nudge with the hint (never apply the move).
      setSelected(null);
      if (step.hint) setFeedback({ kind: 'hint', text: step.hint });
    },
    [step, isOpponentStep, selected, movable, advance],
  );

  const restart = useCallback(() => {
    setStepIdx(0);
    setState(lesson.states[0]!);
    setSelected(null);
    setFeedback(null);
    // Keep reportedDone true — completion already persisted; replaying is free.
  }, [lesson]);

  // --- render ---------------------------------------------------------------

  const promptText = done ? lesson.outro : step?.prompt ?? '';

  return (
    <div className="tutorial-runner">
      <div className="tutorial-board">
        <BoardView
          board={state.board}
          dim={BOARD_DIM}
          rcToSquare={RC_TO_SQUARE}
          selected={selected}
          movable={movable}
          destinations={destinations}
          captureTargets={captureTargets}
          highlight={highlight}
          onSquareClick={handleSquareClick}
          interactive={!done && !isOpponentStep}
          activeColor={state.toMove}
        />
      </div>

      <div className="tutorial-coach">
        <div className={`tutorial-prompt${done ? ' done' : ''}`} role="status" aria-live="polite">
          {done ? (
            <span className="coach-icon win" aria-hidden="true">
              <Trophy size={18} />
            </span>
          ) : (
            <span className="coach-step" aria-hidden="true">
              {stepIdx + 1}/{lesson.steps.length}
            </span>
          )}
          <p>{promptText}</p>
        </div>

        {feedback && !done && (
          <div className={`tutorial-feedback ${feedback.kind}`} role="alert">
            {feedback.kind === 'hint' ? (
              <Lightbulb size={15} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={15} aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {done && (
          <button className="btn" onClick={restart}>
            <RotateCcw size={16} /> Replay this lesson
          </button>
        )}
      </div>
    </div>
  );
}
