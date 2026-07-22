import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, CheckCircle2, RotateCcw, Trophy, ArrowRight } from 'lucide-react';
import {
  beginCaptureChain,
  nextHopTargets,
  advanceCaptureChain,
  moveStepBoards,
  type Board,
  type CaptureChain,
  type GameState,
  type Move,
} from '../../src/index.ts';
import { BoardView } from './Board.tsx';
import type { Lesson, LessonStep } from './lessons.ts';

const EMPTY = new Set<number>();

/** How long an auto-played opponent reply waits before it lands (ms). */
const OPPONENT_DELAY_MS = 850;
/** Per-leap delay while animating an opponent's multi-jump chain (ms). */
const OPPONENT_HOP_MS = 300;

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
  onNext,
  nextTitle,
}: {
  lesson: Lesson;
  onComplete: () => void;
  /** Advance to the next lesson in the track. Omitted on the last lesson. */
  onNext?: () => void;
  /** Title of the next lesson, shown on the completion CTA. */
  nextTitle?: string;
}) {
  // Step cursor. `done` once the cursor passes the last step.
  const [stepIdx, setStepIdx] = useState(0);
  // Live board state, advanced as steps resolve (starts at the lesson opening).
  const [state, setState] = useState<GameState>(() => lesson.states[0]!);
  // Player's selected origin square (two-tap: select, then tap destination).
  const [selected, setSelected] = useState<number | null>(null);
  // An in-progress, hand-played capture chain (learner plays each leap). Null
  // unless the learner is mid-way through a multi-jump.
  const [chain, setChain] = useState<CaptureChain | null>(null);
  // An intermediate board to show mid-chain or mid opponent-animation. When set,
  // BoardView renders this instead of `state.board`. Null between moves.
  const [stepBoard, setStepBoard] = useState<Board | null>(null);
  // Transient coach feedback below the prompt.
  const [feedback, setFeedback] = useState<{ kind: 'hint' | 'success'; text: string } | null>(null);
  const reportedDone = useRef(false);

  // Reset everything when the lesson changes (picking a different lesson).
  useEffect(() => {
    setStepIdx(0);
    setState(lesson.states[0]!);
    setSelected(null);
    setChain(null);
    setStepBoard(null);
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
    setChain(null);
    setStepBoard(null);
  }, [lesson]);

  // Auto-play opponent (forced-reply) steps after a short, readable beat. A
  // multi-jump reply is animated one leap at a time (each board snapshot from the
  // engine), then resolves like a single move on the final leap.
  useEffect(() => {
    if (!step || !isOpponentStep) return;
    setSelected(null);

    const reply = step.expectedMoves[0];
    const isMultiJump = !!reply && reply.path.length >= 2;

    // Single-step (or missing) reply: keep the original land-after-a-beat behaviour.
    if (!reply || !isMultiJump) {
      const t = setTimeout(() => {
        setFeedback({ kind: 'success', text: step.successText });
        advance();
      }, OPPONENT_DELAY_MS);
      return () => clearTimeout(t);
    }

    // Multi-jump: after the initial readable beat, walk the engine's per-leap
    // boards, ~300ms apart. On the last leap, show successText and advance.
    const boards = moveStepBoards(step.state, reply);
    const timers: ReturnType<typeof setTimeout>[] = [];
    boards.forEach((board, i) => {
      const last = i === boards.length - 1;
      const at = OPPONENT_DELAY_MS + i * OPPONENT_HOP_MS;
      timers.push(
        setTimeout(() => {
          if (last) {
            setStepBoard(null);
            setFeedback({ kind: 'success', text: step.successText });
            advance();
          } else {
            setStepBoard(board);
          }
        }, at),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [step, isOpponentStep, advance]);

  // --- input gating for learner steps ---------------------------------------

  // The capture chain in effect for the current learner tap context: either an
  // in-progress chain, or one freshly begun from the selected origin (when that
  // origin has a capture in the expected move-list). Null for quiet/single moves.
  const activeChain = useMemo<CaptureChain | null>(() => {
    if (!step || isOpponentStep) return null;
    if (chain) return chain;
    if (selected == null) return null;
    return beginCaptureChain(step.expectedMoves, selected);
  }, [step, isOpponentStep, chain, selected]);

  // The square that is "moving" right now: the chain's last landing if mid-chain,
  // else the plain selected origin. Drives BoardView's `selected` glow.
  const movingSquare = chain ? chain.steps[chain.steps.length - 1]! : selected;

  // Squares the player may pick up. While a chain is active, only its current
  // landing is live (the next leap must continue from there); otherwise the
  // expected move origins.
  const movable = useMemo(() => {
    if (!step || isOpponentStep) return EMPTY;
    if (chain) return new Set([chain.steps[chain.steps.length - 1]!]);
    return new Set(step.expectedMoves.map((m) => m.from));
  }, [step, isOpponentStep, chain]);

  // Next-leap landing squares mapped to a representative Move (for capture styling).
  const nextHops = useMemo<Map<number, Move>>(() => {
    if (!activeChain) return new Map();
    return nextHopTargets(activeChain);
  }, [activeChain]);

  // Destinations to light once an origin/chain is active: the next legal leaps for
  // a chain, else the expected landings for the selected origin (quiet/single).
  const destinations = useMemo(() => {
    if (!step || isOpponentStep) return EMPTY;
    if (activeChain) return new Set(nextHops.keys());
    if (selected == null) return EMPTY;
    return new Set(
      step.expectedMoves.filter((m) => m.from === selected).map((m) => m.to),
    );
  }, [step, isOpponentStep, activeChain, nextHops, selected]);

  const captureTargets = useMemo(() => {
    if (!step || isOpponentStep) return EMPTY;
    if (activeChain) {
      const caps = new Set<number>();
      for (const [sq, m] of nextHops) if (m.isCapture) caps.add(sq);
      return caps;
    }
    if (selected == null) return EMPTY;
    return new Set(
      step.expectedMoves.filter((m) => m.from === selected && m.isCapture).map((m) => m.to),
    );
  }, [step, isOpponentStep, activeChain, nextHops, selected]);

  // The teaching glow: the step's authored highlight squares.
  const highlight = useMemo(() => {
    if (!step || isOpponentStep) return EMPTY;
    return new Set(step.highlight);
  }, [step, isOpponentStep]);

  const handleSquareClick = useCallback(
    (square: number) => {
      if (!step || isOpponentStep) return;

      // A capture chain is in effect (mid-chain, or the selected origin captures):
      // try to play the NEXT leap first. This takes priority over re-selecting,
      // because a chain can legally land back on its own origin square (e.g.
      // a1xc3xa1) — tapping there must finish the leap, not reset the chain.
      if (activeChain) {
        const res = advanceCaptureChain(activeChain, square);
        if (res) {
          const rep = res.kind === 'commit' ? res.move : res.chain.candidates[0]!;
          const steps = moveStepBoards(step.state, rep);
          const depth = activeChain.steps.length;
          if (res.kind === 'continue') {
            setStepBoard(steps[depth]!);
            setChain(res.chain);
            setSelected(square);
            setFeedback(null);
          } else {
            // 'commit' — the full expected Move is done.
            setFeedback({ kind: 'success', text: step.successText });
            advance();
          }
          return;
        }
        // Not a legal next leap. Mid-chain (a real leap already taken): only a
        // re-tap of the current square resets; another expected origin restarts;
        // anything else nudges without breaking the chain.
        if (chain) {
          if (square === movingSquare) {
            setChain(null);
            setStepBoard(null);
            setSelected(null);
            setFeedback(null);
            return;
          }
          const restartsHere = step.expectedMoves.some((m) => m.from === square);
          if (restartsHere) {
            setChain(null);
            setStepBoard(null);
            setSelected(square);
            setFeedback(null);
            return;
          }
          if (step.hint) setFeedback({ kind: 'hint', text: step.hint });
          return;
        }
        // No leap taken yet (chain came from the selected origin). Fall through so
        // a tap on the origin toggles it off and other origins re-select.
      }

      // Re-selecting an expected origin (no leap taken yet) toggles it.
      const isExpectedOrigin = step.expectedMoves.some((m) => m.from === square);
      if (isExpectedOrigin) {
        setChain(null);
        setStepBoard(null);
        setSelected((cur) => (cur === square ? null : square));
        setFeedback(null);
        return;
      }

      // No chain: a quiet/single-jump destination of the selected origin.
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

      // First tap: pick up an expected origin (toggle).
      if (movable.has(square)) {
        setSelected((cur) => (cur === square ? null : square));
        setFeedback(null);
        return;
      }

      // Anything else is off-script — nudge with the hint (never apply the move).
      setSelected(null);
      if (step.hint) setFeedback({ kind: 'hint', text: step.hint });
    },
    [step, isOpponentStep, selected, chain, movable, movingSquare, activeChain, advance],
  );

  const restart = useCallback(() => {
    setStepIdx(0);
    setState(lesson.states[0]!);
    setSelected(null);
    setChain(null);
    setStepBoard(null);
    setFeedback(null);
    // Keep reportedDone true — completion already persisted; replaying is free.
  }, [lesson]);

  // --- render ---------------------------------------------------------------

  const promptText = done ? lesson.outro : step?.prompt ?? '';

  return (
    <div className="tutorial-runner">
      <div className="tutorial-board">
        <BoardView
          board={stepBoard ?? state.board}
          dim={lesson.variant.boardDim}
          rcToSquare={lesson.variant.rcToSquare}
          selected={movingSquare}
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
          <div className="tutorial-done-actions">
            {onNext && (
              <button className="btn btn-primary" onClick={onNext}>
                Next lesson{nextTitle ? `: ${nextTitle}` : ''} <ArrowRight size={16} />
              </button>
            )}
            <button className="btn" onClick={restart}>
              <RotateCcw size={16} /> Replay this lesson
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
