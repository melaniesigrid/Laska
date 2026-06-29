/**
 * A single server-authoritative match.
 *
 * The server owns the GameState. A client sends only an intended move
 * (from/to, optionally the captured-square path); the server matches it against
 * `legalMoves` and applies the engine's own Move object. A move the engine does
 * not consider legal is rejected. The client is never trusted to compute board
 * state, captures, or results.
 */
import {
  createInitialState,
  legalMoves,
  applyMove,
  gameStatus,
  encodePosition,
  VARIANTS,
  DEFAULT_VARIANT,
  type GameState,
  type Move,
  type PlayerColor,
  type VariantId,
} from '../../../src/index.ts';
import type { MatchResult, SerializedMove } from '../storage/types.ts';

export interface TimeControl {
  /** Starting time bank per side, milliseconds. */
  initialMs: number;
  /** Fischer increment added to a player's clock after each of their moves. */
  incrementMs: number;
}

export const DEFAULT_TIME_CONTROL: TimeControl = {
  initialMs: 5 * 60 * 1000,
  incrementMs: 3 * 1000,
};

export interface MoveIntent {
  from: number;
  to: number;
  /** Optional captured-square path to disambiguate multiple chains sharing a landing. */
  captures?: number[];
}

export type MatchPhase = 'active' | 'finished';

export interface MatchEndInfo {
  result: MatchResult;
  reason:
    | 'no-pieces'
    | 'no-moves'
    | 'resignation'
    | 'timeout'
    | 'threefold-repetition'
    | 'no-progress'
    | 'agreement';
  /** Winner color, or null for a draw. */
  winner: PlayerColor | null;
}

export class MatchError extends Error {
  constructor(
    public code: 'not-active' | 'not-your-turn' | 'illegal-move' | 'ambiguous-move' | 'not-a-player',
    message: string,
  ) {
    super(message);
    this.name = 'MatchError';
  }
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
  /** Whose clock is running, or null once finished. */
  running: PlayerColor | null;
}

export class Match {
  readonly id: string;
  readonly whiteId: string;
  readonly blackId: string;
  readonly ranked: boolean;
  readonly timeControl: TimeControl;
  readonly startedAt: number;
  /** The rule variant this match is played under (Laska by default). */
  readonly variantId: VariantId;

  private state: GameState;
  private moves: SerializedMove[] = [];
  private clock: { whiteMs: number; blackMs: number };
  private turnStartedAt: number;
  private phase: MatchPhase = 'active';
  private end: MatchEndInfo | null = null;
  private endedAt = 0;
  private drawOfferBy: PlayerColor | null = null;

  constructor(params: {
    id: string;
    whiteId: string;
    blackId: string;
    ranked: boolean;
    timeControl?: TimeControl;
    variant?: VariantId;
    now?: number;
  }) {
    this.id = params.id;
    this.whiteId = params.whiteId;
    this.blackId = params.blackId;
    this.ranked = params.ranked;
    this.timeControl = params.timeControl ?? DEFAULT_TIME_CONTROL;
    const variant = (params.variant && VARIANTS[params.variant]) || DEFAULT_VARIANT;
    this.variantId = variant.id;
    const now = params.now ?? Date.now();
    this.startedAt = now;
    this.turnStartedAt = now;
    this.state = createInitialState(variant);
    this.clock = { whiteMs: this.timeControl.initialMs, blackMs: this.timeControl.initialMs };
  }

  get toMove(): PlayerColor {
    return this.state.toMove;
  }
  get isOver(): boolean {
    return this.phase === 'finished';
  }
  get endInfo(): MatchEndInfo | null {
    return this.end;
  }
  get moveCount(): number {
    return this.moves.length;
  }

  colorOf(userId: string): PlayerColor | null {
    if (userId === this.whiteId) return 'W';
    if (userId === this.blackId) return 'B';
    return null;
  }
  userIdOf(color: PlayerColor): string {
    return color === 'W' ? this.whiteId : this.blackId;
  }

  /** Remaining time, decrementing the running side by elapsed wall-clock. */
  clockState(now = Date.now()): ClockState {
    if (this.phase === 'finished') {
      return { whiteMs: this.clock.whiteMs, blackMs: this.clock.blackMs, running: null };
    }
    const elapsed = Math.max(0, now - this.turnStartedAt);
    const running = this.state.toMove;
    return {
      whiteMs: running === 'W' ? this.clock.whiteMs - elapsed : this.clock.whiteMs,
      blackMs: running === 'B' ? this.clock.blackMs - elapsed : this.clock.blackMs,
      running,
    };
  }

  /** Encoded position for transmitting state to clients (board + side to move). */
  encoded(): string {
    return encodePosition({ board: this.state.board, toMove: this.state.toMove });
  }

  legalMovesForCurrent(): Move[] {
    return this.phase === 'active' ? legalMoves(this.state) : [];
  }

  /**
   * Detect a flag-fall for the side to move. Call from a timer in the net layer.
   * Returns the end info if time ran out, else null.
   */
  checkTimeout(now = Date.now()): MatchEndInfo | null {
    if (this.phase !== 'active') return null;
    const cs = this.clockState(now);
    const flagged =
      (this.state.toMove === 'W' && cs.whiteMs <= 0) ||
      (this.state.toMove === 'B' && cs.blackMs <= 0);
    if (!flagged) return null;
    const winner = this.state.toMove === 'W' ? 'B' : 'W';
    return this.finish({
      result: winner === 'W' ? '1-0' : '0-1',
      reason: 'timeout',
      winner,
    }, now);
  }

  /**
   * Validate and apply a player's intended move. Throws MatchError on any
   * illegal/out-of-turn attempt. Returns the applied Move and (if the game
   * ended) the end info.
   */
  submitMove(
    userId: string,
    intent: MoveIntent,
    now = Date.now(),
  ): { move: Move; ended: MatchEndInfo | null } {
    if (this.phase !== 'active') throw new MatchError('not-active', 'Match is not active');
    const color = this.colorOf(userId);
    if (!color) throw new MatchError('not-a-player', 'You are not a player in this match');
    if (color !== this.state.toMove) throw new MatchError('not-your-turn', 'It is not your turn');

    // Flag-fall takes priority over a move that arrives after time expired.
    const timedOut = this.checkTimeout(now);
    if (timedOut) throw new MatchError('not-active', 'Your time expired');

    const legal = legalMoves(this.state);
    const candidates = legal.filter((m) => m.from === intent.from && m.to === intent.to);
    if (candidates.length === 0) {
      throw new MatchError('illegal-move', `No legal move ${intent.from} -> ${intent.to}`);
    }
    let chosen: Move;
    if (candidates.length === 1) {
      chosen = candidates[0]!;
    } else {
      // Ambiguous landing: require the client to specify the captured path.
      if (!intent.captures) {
        throw new MatchError(
          'ambiguous-move',
          'Multiple capture sequences land here; specify the captures path',
        );
      }
      const key = intent.captures.join(',');
      const match = candidates.find((m) => m.captures.join(',') === key);
      if (!match) throw new MatchError('illegal-move', 'No capture sequence matches that path');
      chosen = match;
    }

    // Charge the clock: elapsed since this turn began, then add increment.
    const elapsed = Math.max(0, now - this.turnStartedAt);
    if (color === 'W') this.clock.whiteMs -= elapsed;
    else this.clock.blackMs -= elapsed;
    if (color === 'W') this.clock.whiteMs += this.timeControl.incrementMs;
    else this.clock.blackMs += this.timeControl.incrementMs;

    this.state = applyMove(this.state, chosen);
    this.moves.push({ from: chosen.from, to: chosen.to, captures: chosen.captures, by: color });
    this.turnStartedAt = now;
    this.drawOfferBy = null; // any move withdraws a pending draw offer

    // Engine decides terminal status (win by no-pieces/no-moves, or draw).
    const status = gameStatus(this.state);
    let ended: MatchEndInfo | null = null;
    if (status.state === 'win') {
      ended = this.finish(
        {
          result: status.winner === 'W' ? '1-0' : '0-1',
          reason: status.reason === 'resignation' ? 'resignation' : status.reason,
          winner: status.winner,
        },
        now,
      );
    } else if (status.state === 'draw') {
      ended = this.finish({ result: '1/2-1/2', reason: status.reason, winner: null }, now);
    }
    return { move: chosen, ended };
  }

  resign(userId: string, now = Date.now()): MatchEndInfo {
    if (this.phase !== 'active') throw new MatchError('not-active', 'Match is not active');
    const color = this.colorOf(userId);
    if (!color) throw new MatchError('not-a-player', 'You are not a player in this match');
    const winner = color === 'W' ? 'B' : 'W';
    return this.finish(
      { result: winner === 'W' ? '1-0' : '0-1', reason: 'resignation', winner },
      now,
    );
  }

  offerDraw(userId: string): void {
    if (this.phase !== 'active') throw new MatchError('not-active', 'Match is not active');
    const color = this.colorOf(userId);
    if (!color) throw new MatchError('not-a-player', 'You are not a player in this match');
    this.drawOfferBy = color;
  }

  /** Accept a standing draw offer made by the opponent. */
  acceptDraw(userId: string, now = Date.now()): MatchEndInfo {
    if (this.phase !== 'active') throw new MatchError('not-active', 'Match is not active');
    const color = this.colorOf(userId);
    if (!color) throw new MatchError('not-a-player', 'You are not a player in this match');
    if (!this.drawOfferBy || this.drawOfferBy === color) {
      throw new MatchError('illegal-move', 'No draw offer from your opponent to accept');
    }
    return this.finish({ result: '1/2-1/2', reason: 'agreement', winner: null }, now);
  }

  get pendingDrawOfferBy(): PlayerColor | null {
    return this.drawOfferBy;
  }

  serializedMoves(): SerializedMove[] {
    return this.moves.map((m) => ({ ...m, captures: [...m.captures] }));
  }

  endedAtMs(): number {
    return this.endedAt;
  }

  private finish(info: MatchEndInfo, now: number): MatchEndInfo {
    // Freeze the running clock value.
    const cs = this.clockState(now);
    this.clock = { whiteMs: Math.max(0, cs.whiteMs), blackMs: Math.max(0, cs.blackMs) };
    this.phase = 'finished';
    this.end = info;
    this.endedAt = now;
    return info;
  }
}
