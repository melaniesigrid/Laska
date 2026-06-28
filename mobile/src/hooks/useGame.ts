/**
 * Local game state machine (hot-seat + vs-AI), reusing the SHARED engine. This
 * is the native analogue of the LocalGame logic in web/src/App.tsx, trimmed to
 * the v1 slice.
 *
 * The engine is the source of truth: legalMoves/applyMove/gameStatus are never
 * re-implemented. The hook only manages selection + turn flow + AI scheduling.
 *
 * Multi-jumps are played out ONE LEAP AT A TIME (matching the web LocalGame):
 *  - the HUMAN jumps each enemy themselves (tap each landing in sequence) — the
 *    route is unambiguous, so there is no capture route-picker;
 *  - the AI's chain is animated leap by leap on a timer instead of teleporting.
 * Both are driven by the pure engine helpers (beginCaptureChain etc.), and each
 * leap sets `lastMove` so the Board glides a single step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  moveStepBoards,
  beginCaptureChain,
  nextHopTargets,
  advanceCaptureChain,
  type Board,
  type CaptureChain,
  type GameState,
  type Move,
  type GameOutcome,
  type Difficulty,
  type PlayerColor,
} from '../engine/index.ts';
import { getBestMove } from '../engine/ai.ts';

/** ms between leaps while animating the AI's multi-jump. */
const HOP_MS = 300;

export type GameMode =
  | { kind: 'hotseat' }
  | { kind: 'ai'; aiColor: PlayerColor; difficulty: Difficulty };

export interface UseGame {
  /** The board to render: a mid-chain/mid-animation override, else the engine board. */
  board: Board;
  state: GameState;
  outcome: GameOutcome;
  selected: number | null;
  /** Destination squares reachable from the selected column (next leap only mid-chain). */
  targets: number[];
  /** True while the AI is computing its move. */
  thinking: boolean;
  /** The from/to of the most recent leap, for the board's glide animation. */
  lastMove: { from: number; to: number } | null;
  /** Tap a square: select own column, play a (leap of a) move, or deselect. */
  tap: (square: number) => void;
  reset: () => void;
  /** Resign the side to move (used by the Flag control). */
  resign: () => void;
}

export function useGame(mode: GameMode): UseGame {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [selected, setSelected] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState<PlayerColor | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  // A multi-jump in progress, shown one leap at a time. `stepBoard` overrides the
  // committed `state.board` while a chain plays out (engine state only flips on the
  // final landing). `capture` tracks a HUMAN chain mid-flight.
  const [stepBoard, setStepBoard] = useState<Board | null>(null);
  const [capture, setCapture] = useState<CaptureChain | null>(null);

  const moves = useMemo(() => legalMoves(state), [state]);
  const outcome: GameOutcome = useMemo(() => {
    if (resigned) {
      const winner: PlayerColor = resigned === 'W' ? 'B' : 'W';
      return { state: 'win', winner, reason: 'resignation' };
    }
    return gameStatus(state);
  }, [state, resigned]);

  // The capture chain in play: the one mid-flight, or — for a freshly selected
  // capturing column — a fresh chain so the FIRST leap is offered. Null when the
  // selection has only quiet moves (then the quiet landings light up instead).
  const activeChain = useMemo<CaptureChain | null>(() => {
    if (capture) return capture;
    if (selected != null) return beginCaptureChain(moves, selected);
    return null;
  }, [capture, selected, moves]);

  // Targets reachable from the selected column. Mid-capture these are the NEXT
  // leap's landing squares; otherwise the quiet landings of the selected column.
  const targets = useMemo(() => {
    if (activeChain) return [...nextHopTargets(activeChain).keys()];
    if (selected == null) return [];
    const set = new Set<number>();
    for (const m of moves) if (m.from === selected) set.add(m.to);
    return [...set];
  }, [activeChain, moves, selected]);

  const isAITurn =
    mode.kind === 'ai' && outcome.state === 'ongoing' && state.toMove === mode.aiColor;

  // Commit the engine state for a fully-played move and clear all chain staging.
  const commitMove = useCallback((prev: GameState, m: Move) => {
    setState(applyMove(prev, m));
    setSelected(null);
    setCapture(null);
    setStepBoard(null);
  }, []);

  /** Advance a human-played capture by one leap to `sq` (a legal next landing).
   *  Glides the column one step; commits when the leap finishes the chain,
   *  otherwise parks the deeper chain and waits for the next tap. */
  const advanceCapture = useCallback(
    (sq: number) => {
      if (!activeChain) return;
      const res = advanceCaptureChain(activeChain, sq);
      if (!res) return; // not a legal next leap
      const depth = activeChain.steps.length;
      const from = depth === 0 ? activeChain.origin : activeChain.steps[depth - 1]!;
      setLastMove({ from, to: sq });
      if (res.kind === 'commit') {
        commitMove(state, res.move);
      } else {
        // More jumps are forced — show this leap and await the next tap. Any
        // surviving candidate shares the board up to this leap.
        const rep = res.chain.candidates[0]!;
        setStepBoard(moveStepBoards(state, rep)[depth]!);
        setSelected(sq);
        setCapture(res.chain);
      }
    },
    [activeChain, state, commitMove],
  );

  const tap = useCallback(
    (square: number) => {
      if (outcome.state !== 'ongoing' || thinking || isAITurn) return;

      // Mid-capture: the only meaningful taps are the next legal leap. Any other
      // square is ignored — the chain is forced and must be played out.
      if (capture) {
        if (targets.includes(square)) advanceCapture(square);
        return;
      }

      // Tapping a highlighted target of the selected column. Captures play one
      // leap at a time; quiet moves glide straight to their square.
      if (selected != null && targets.includes(square)) {
        if (activeChain) {
          advanceCapture(square);
        } else {
          const m = moves.find((mv) => mv.from === selected && mv.to === square);
          if (m) {
            setLastMove({ from: m.from, to: m.to });
            commitMove(state, m);
          }
        }
        return;
      }

      // Otherwise (re)select if the square holds a movable column of our side.
      const hasMove = moves.some((m) => m.from === square);
      setSelected(hasMove ? square : null);
    },
    [outcome.state, thinking, isAITurn, capture, selected, targets, activeChain, moves, state, advanceCapture, commitMove],
  );

  const aiRunId = useRef(0);
  const aiHopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    aiRunId.current++;
    if (aiHopTimer.current) clearTimeout(aiHopTimer.current);
    setState(createInitialState());
    setSelected(null);
    setResigned(null);
    setThinking(false);
    setLastMove(null);
    setStepBoard(null);
    setCapture(null);
  }, []);

  const resign = useCallback(() => {
    if (outcome.state === 'ongoing') setResigned(state.toMove);
  }, [outcome.state, state.toMove]);

  /** Play the AI's move out one leap at a time: each jump glides the column a
   *  single step and buries that jump's prisoner, with a beat between hops, so the
   *  computer's chain reads as a sequence of leaps rather than a teleport. Quiet
   *  or single-jump moves fall through to one glide + commit. */
  const animateMove = useCallback(
    (prev: GameState, move: Move, runId: number) => {
      const steps = moveStepBoards(prev, move);
      if (steps.length <= 1) {
        setLastMove({ from: move.from, to: move.to });
        commitMove(prev, move);
        return;
      }
      let i = 0;
      const runHop = () => {
        if (runId !== aiRunId.current) return;
        const last = i === move.path.length - 1;
        const from = i === 0 ? move.from : move.path[i - 1]!;
        const landing = move.path[i]!;
        setLastMove({ from, to: landing });
        if (last) {
          commitMove(prev, move); // engine flips here; stepBoard clears to the final board
        } else {
          setStepBoard(steps[i]!);
          i += 1;
          aiHopTimer.current = setTimeout(runHop, HOP_MS);
        }
      };
      runHop();
    },
    [commitMove],
  );

  // Drive the AI when it is its turn.
  useEffect(() => {
    if (mode.kind !== 'ai' || !isAITurn) return;
    const runId = ++aiRunId.current;
    setThinking(true);
    const snapshot = state;
    getBestMove(snapshot, { difficulty: mode.difficulty })
      .then((m) => {
        if (runId !== aiRunId.current) return;
        setThinking(false);
        if (m) animateMove(snapshot, m, runId);
      })
      .catch(() => {
        if (runId === aiRunId.current) setThinking(false);
      });
    return () => {
      // Invalidate this run; the hop timer checks aiRunId and stops itself.
      if (aiHopTimer.current) clearTimeout(aiHopTimer.current);
    };
  }, [mode, isAITurn, state, animateMove]);

  return {
    board: stepBoard ?? state.board,
    state,
    outcome,
    selected,
    targets,
    thinking,
    lastMove,
    tap,
    reset,
    resign,
  };
}
