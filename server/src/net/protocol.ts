/**
 * WebSocket wire protocol for live play. One JSON object per message, tagged by
 * `type`. These types are the contract between the server and any client (the
 * web app today, React Native later).
 */
import type { PlayerColor, VariantId } from '../../../src/index.ts';
import type { MatchResult } from '../storage/types.ts';

// ---- Social: canned emotes -----------------------------------------------

/**
 * The fixed set of in-match emotes. We ship a closed list rather than free
 * emoji so the social layer is spam- and abuse-resistant by construction, and
 * so it stays on-brand (the design system bans emoji — clients pair each id with
 * a lucide icon of their choosing). The server validates every emote against
 * this map before relaying it.
 */
export const EMOTES = {
  gg: 'Good game',
  gl: 'Good luck',
  hello: 'Hello!',
  nice: 'Nice move!',
  wow: 'Wow!',
  close: 'So close!',
  oops: 'Oops',
  thinking: 'Thinking…',
} as const;
export type EmoteId = keyof typeof EMOTES;
export function isEmoteId(x: unknown): x is EmoteId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(EMOTES, x);
}

/** Hard cap on a chat line, enforced server-side (clients should mirror it). */
export const CHAT_MAX_LEN = 280;

// ---- Client -> Server ----------------------------------------------------

export type ClientMessage =
  | { type: 'auth'; token: string }
  | {
      type: 'queue.join';
      timeControl?: { initialMs: number; incrementMs: number };
      /** Rule variant to queue for; absent means Laska. Players are only paired
       *  with others queuing for the same variant. */
      variant?: VariantId;
    }
  | { type: 'queue.leave' }
  | { type: 'match.move'; matchId: string; from: number; to: number; captures?: number[] }
  | { type: 'match.resign'; matchId: string }
  | { type: 'match.offerDraw'; matchId: string }
  | { type: 'match.acceptDraw'; matchId: string }
  | { type: 'match.declineDraw'; matchId: string }
  | { type: 'match.sync'; matchId: string }
  // ---- social ----
  | { type: 'match.chat'; matchId: string; text: string }
  | { type: 'match.emote'; matchId: string; emote: EmoteId }
  /** Offer a rematch (or accept the opponent's standing offer — idempotent: it
   *  records this player's willingness). When both sides have offered, the server
   *  starts a fresh match via a normal `match.start`. */
  | { type: 'match.rematchOffer'; matchId: string }
  /** Withdraw your rematch offer or decline the opponent's. */
  | { type: 'match.rematchDecline'; matchId: string }
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
  /** The rule variant this match is played under, so the client sizes the board. */
  variant: VariantId;
}

export interface RatingChangeDTO {
  white: { before: number; after: number; delta: number };
  black: { before: number; after: number; delta: number };
}

/** A chat line or emote relayed to both players. `from` is the sender's userId;
 *  `fromColor`/`fromName` let a client render and attribute it without a lookup,
 *  and `ts` is the authoritative server timestamp used for ordering/display. */
export interface ChatDTO {
  matchId: string;
  from: string;
  fromColor: PlayerColor;
  fromName: string;
  ts: number;
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
  // ---- social ----
  | ({ type: 'chat'; text: string } & ChatDTO)
  | ({ type: 'emote'; emote: EmoteId } & ChatDTO)
  /** The opponent offered a rematch; `by` is the offerer's color. */
  | { type: 'rematch.offered'; matchId: string; by: PlayerColor }
  /** A standing rematch offer was withdrawn/declined (or the offerer left). */
  | { type: 'rematch.declined'; matchId: string }
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
