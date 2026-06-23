/**
 * Local game state machine (hot-seat + vs-AI), reusing the SHARED engine. This
 * is the native analogue of the LocalGame logic in web/src/App.tsx, trimmed to
 * the v1 slice.
 *
 * The engine is the source of truth: legalMoves/applyMove/gameStatus are never
 * re-implemented. The hook only manages selection + turn flow + AI scheduling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  type GameState,
  type Move,
  type GameOutcome,
  type Difficulty,
  type PlayerColor,
} from '../engine/index.ts';
import { getBestMove } from '../engine/ai.ts';

export type GameMode =
  | { kind: 'hotseat' }
  | { kind: 'ai'; aiColor: PlayerColor; difficulty: Difficulty };

export interface UseGame {
  state: GameState;
  outcome: GameOutcome;
  selected: number | null;
  /** Destination squares reachable from the selected column. */
  targets: number[];
  /** True while the AI is computing its move. */
  thinking: boolean;
  /** Tap a square: select own column, move to a target, or deselect. */
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

  const moves = useMemo(() => legalMoves(state), [state]);
  const outcome: GameOutcome = useMemo(() => {
    if (resigned) {
      const winner: PlayerColor = resigned === 'W' ? 'B' : 'W';
      return { state: 'win', winner, reason: 'resignation' };
    }
    return gameStatus(state);
  }, [state, resigned]);

  // Targets reachable from the selected column.
  const targets = useMemo(() => {
    if (selected == null) return [];
    const set = new Set<number>();
    for (const m of moves) if (m.from === selected) set.add(m.to);
    return [...set];
  }, [moves, selected]);

  const isAITurn =
    mode.kind === 'ai' && outcome.state === 'ongoing' && state.toMove === mode.aiColor;

  const apply = useCallback((m: Move) => {
    setState((s) => applyMove(s, m));
    setSelected(null);
  }, []);

  const tap = useCallback(
    (square: number) => {
      if (outcome.state !== 'ongoing' || thinking || isAITurn) return;

      // Tapping a highlighted target applies the move.
      if (selected != null) {
        // NOTE: if several capture sequences land on the same square, we take
        // the first. Capture-path disambiguation UI is a known v1 polish item
        // (see ../../MOBILE.md / web Online.tsx capture disambiguation).
        const move = moves.find((m) => m.from === selected && m.to === square);
        if (move) {
          apply(move);
          return;
        }
      }

      // Otherwise (re)select if the square holds a movable column of our side.
      const hasMove = moves.some((m) => m.from === square);
      setSelected(hasMove ? square : null);
    },
    [outcome.state, thinking, isAITurn, selected, moves, apply],
  );

  const reset = useCallback(() => {
    setState(createInitialState());
    setSelected(null);
    setResigned(null);
    setThinking(false);
  }, []);

  const resign = useCallback(() => {
    if (outcome.state === 'ongoing') setResigned(state.toMove);
  }, [outcome.state, state.toMove]);

  // Drive the AI when it is its turn.
  const aiRunId = useRef(0);
  useEffect(() => {
    if (mode.kind !== 'ai' || !isAITurn) return;
    const runId = ++aiRunId.current;
    setThinking(true);
    let cancelled = false;
    getBestMove(state, { difficulty: mode.difficulty })
      .then((m) => {
        if (cancelled || runId !== aiRunId.current) return;
        if (m) setState((s) => applyMove(s, m));
      })
      .finally(() => {
        if (!cancelled && runId === aiRunId.current) setThinking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, isAITurn, state]);

  return { state, outcome, selected, targets, thinking, tap, reset, resign };
}
