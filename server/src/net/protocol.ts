/**
 * WebSocket wire protocol for live play. One JSON object per message, tagged by
 * `type`. These types are the contract between the server and any client (the
 * web app today, React Native later).
 */
import type { PlayerColor, RuleVariant } from '../../../src/index.ts';
import type { MatchResult } from '../storage/types.ts';

// Re-export so a single import of this protocol module gives clients the variant
// type too (web imports these types directly).
export type { RuleVariant };

// ---- Client -> Server ----------------------------------------------------

export type ClientMessage =
  | { type: 'auth'; token: string }
  | {
      type: 'queue.join';
      timeControl?: { initialMs: number; incrementMs: number };
      /** Requested rule variant. Omitted => 'lasker-classic' (today's behavior). */
      variant?: RuleVariant;
    }
  | { type: 'queue.leave' }
  | { type: 'match.move'; matchId: string; from: number; to: number; captures?: number[] }
  | { type: 'match.resign'; matchId: string }
  | { type: 'match.offerDraw'; matchId: string }
  | { type: 'match.acceptDraw'; matchId: string }
  | { type: 'match.sync'; matchId: string }
  | { type: 'ping' };

// ---- Server -> Client ----------------------------------------------------

export interface PublicOpponent {
  userId: string;
  username: string;
  rating: number;
}

export interface ClockDTO {
  whiteMs: number;
  blackMs: number;
  running: PlayerColor | null;
}

export interface MoveDTO {
  from: number;
  to: number;
  captures: number[];
  by: PlayerColor;
}

export interface MatchStateDTO {
  matchId: string;
  /** FEN-like encoded position (board + side to move). */
  position: string;
  toMove: PlayerColor;
  clock: ClockDTO;
  drawOfferBy: PlayerColor | null;
  moveCount: number;
  /** Rule variant in force for this match, so the client can display it. */
  variant: RuleVariant;
}

export interface RatingChangeDTO {
  white: { before: number; after: number; delta: number };
  black: { before: number; after: number; delta: number };
}

export type ServerMessage =
  | { type: 'auth.ok'; userId: string; username: string; rating: number }
  | { type: 'queue.joined' }
  | { type: 'queue.left' }
  | {
      type: 'match.start';
      matchId: string;
      color: PlayerColor;
      opponent: PublicOpponent;
      timeControl: { initialMs: number; incrementMs: number };
      /** Rule variant in force for this match. */
      variant: RuleVariant;
      state: MatchStateDTO;
    }
  | { type: 'match.update'; state: MatchStateDTO; lastMove: MoveDTO | null }
  | {
      type: 'match.end';
      matchId: string;
      result: MatchResult;
      reason: string;
      winner: PlayerColor | null;
      ratingChange: RatingChangeDTO | null;
    }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

export function parseClientMessage(raw: string): ClientMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || typeof (obj as { type?: unknown }).type !== 'string') {
    return null;
  }
  return obj as ClientMessage;
}
