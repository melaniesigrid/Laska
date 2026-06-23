/**
 * Training corpus — turn a player's saved games into supervised data for the AI.
 *
 * Each ply becomes one sample: the position *before* the move (as the engine's
 * canonical position string), the move that was actually played, and the eventual
 * game outcome labelled from the mover's point of view. That is exactly the
 * (state, action, return) shape an offline value/policy tuner — or an opening
 * book builder — consumes. We deliberately stop at *producing* the corpus: the
 * research notebook (EXP-002) found the negamax weights at a local optimum, so a
 * naive online learner would more likely regress strength than improve it. See
 * research/NOTEBOOK.md (EXP-004) for the documented consumption path.
 */
import { encodePosition, type Move } from '../../src/index.ts';
import { rebuildGame, moveToSan, type SavedGame } from './savedGames.ts';

export interface TrainingSample {
  gameId: string;
  ply: number; // 1-based
  /** Canonical position string before the move (engine repetition key). */
  position: string;
  by: 'W' | 'B';
  move: { from: number; to: number; captures: number[]; san: string };
  /** Outcome from the mover's perspective: 1 win, 0 loss, 0.5 draw, null if unfinished. */
  outcome: number | null;
}

function outcomeFor(by: 'W' | 'B', game: SavedGame): number | null {
  if (game.result === 'unfinished') return null;
  if (game.result === 'draw') return 0.5;
  return game.result === by ? 1 : 0;
}

/** Extract one sample per ply from a single saved game (skips unreplayable saves). */
export function gameToSamples(game: SavedGame): TrainingSample[] {
  let rebuilt;
  try {
    rebuilt = rebuildGame(game);
  } catch {
    return []; // corrupt/old-ruleset save — excluded rather than poisoning the corpus
  }
  return game.moves.map((sm, i) => {
    const stateBefore = rebuilt.states[i]!;
    const move: Move = rebuilt.resolved[i]!;
    return {
      gameId: game.id,
      ply: i + 1,
      position: encodePosition({ board: stateBefore.board, toMove: stateBefore.toMove }),
      by: sm.by,
      move: { from: sm.from, to: sm.to, captures: [...sm.captures], san: moveToSan(move) },
      outcome: outcomeFor(sm.by, game),
    };
  });
}

export function buildTrainingCorpus(games: SavedGame[]): TrainingSample[] {
  return games.flatMap(gameToSamples);
}

/** Newline-delimited JSON — one sample per line, the usual training-data format. */
export function corpusToJsonl(samples: TrainingSample[]): string {
  return samples.map((s) => JSON.stringify(s)).join('\n');
}

export interface CorpusStats {
  games: number;
  samples: number;
  labelled: number; // samples with a known outcome
  positions: number; // distinct positions
}

export function corpusStats(games: SavedGame[], samples: TrainingSample[]): CorpusStats {
  return {
    games: games.length,
    samples: samples.length,
    labelled: samples.filter((s) => s.outcome != null).length,
    positions: new Set(samples.map((s) => s.position)).size,
  };
}
