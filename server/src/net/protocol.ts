/**
 * WebSocket wire protocol for live play. One JSON object per message, tagged by
 * `type`. These types are the contract between the server and any client (the
 * web app today, React Native later).
 */
import type { Difficulty, PlayerColor, VariantId } from '../../../src/index.ts';
import type { MatchResult } from '../storage/types.ts';
import type { Rank } from '../rating/rank.ts';

// ---- Ranking -------------------------------------------------------------

/**
 * Displayed rank, structurally identical to the server's internal `Rank`
 * (rating/rank.ts). Re-exported here so the web client gets the rank contract
 * from the single protocol module it already imports. See rating/rank.ts for the
 * ladder table and the provisional/calibration rules.
 */
export type RankDTO = Rank;

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

// ---- Social: private "play a friend" challenges --------------------------

/** A challenge host's color preference; 'random' is resolved by a server coin flip. */
export type ChallengeColor = 'W' | 'B' | 'random';

// ---- Ranked vs-computer matches ------------------------------------------

/**
 * Difficulty tier for a ranked vs-computer match, re-exported from the engine so
 * the web client gets it from the single protocol module it already imports. The
 * server seeds one bot account per tier, each pinned to a fixed rating (see
 * game/bots.ts). One of: beginner | easy | intermediate | medium | hard | expert.
 */
export type BotDifficulty = Difficulty;

/** The human's color preference when starting a bot match; 'random' is a server coin flip. */
export type BotColorPreference = 'W' | 'B' | 'random';

/** Options a host picks when opening a private invite game. */
export interface ChallengeOptions {
  variant?: VariantId;
  timeControl?: { initialMs: number; incrementMs: number };
  /** Which color the HOST takes; 'random' (default) is decided server-side. */
  color?: ChallengeColor;
  /** Whether the resulting game is rated. Default false (a friendly). */
  ranked?: boolean;
}

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
  /**
   * Start a RANKED match against the server's built-in computer opponent for the
   * given difficulty tier. The bot runs entirely on the server (its moves are
   * computed by the same engine that validates human moves); the result feeds the
   * SAME Glicko-2 rating/leaderboard as human play, with the tier's fixed rating
   * as the opponent input. On success the server replies with the normal
   * `match.start` (opponent = the tier's "Computer (…)" account), so the client
   * renders and finishes a bot match exactly like a human one.
   *   - `difficulty`: which tier to play (and thus which rating to face).
   *   - `color`: the HUMAN's color preference; 'random' (default) is a coin flip.
   *   - `variant`: rule variant; absent means Laska.
   */
  | {
      type: 'match.startBot';
      difficulty: BotDifficulty;
      color?: BotColorPreference;
      variant?: VariantId;
    }
  | { type: 'match.move'; matchId: string; from: number; to: number; captures?: number[] }
  | { type: 'match.resign'; matchId: string }
  | { type: 'match.offerDraw'; matchId: string }
  | { type: 'match.acceptDraw'; matchId: string }
  | { type: 'match.declineDraw'; matchId: string }
  | { type: 'match.sync'; matchId: string }
  // ---- social ----
  | { type: 'match.chat'; matchId: string; text: string }
  | { type: 'match.emote'; matchId: string; emote: EmoteId }
  /** Ephemeral "I'm typing a chat message" signal, relayed to the opponent.
   *  Clients debounce this; the server never persists it. */
  | { type: 'match.typing'; matchId: string; typing: boolean }
  /** Offer a rematch (or accept the opponent's standing offer — idempotent: it
   *  records this player's willingness). When both sides have offered, the server
   *  starts a fresh match via a normal `match.start`. */
  | { type: 'match.rematchOffer'; matchId: string }
  /** Withdraw your rematch offer or decline the opponent's. */
  | { type: 'match.rematchDecline'; matchId: string }
  // ---- private challenges ("play a friend" via invite link) ----
  /** Open a private invite game; the server replies `challenge.created` with a
   *  short code the host shares as a link. Replaces any existing open challenge. */
  | { type: 'challenge.create'; options?: ChallengeOptions }
  /** Withdraw your own open challenge. */
  | { type: 'challenge.cancel' }
  /** Accept a friend's challenge by its code; on success both get `match.start`. */
  | { type: 'challenge.join'; code: string }
  // ---- spectating (watch ongoing games) ----
  /** Ask for the current list of watchable live games. */
  | { type: 'spectate.list' }
  /** Begin watching a live match (read-only; spectators cannot act). */
  | { type: 'spectate.watch'; matchId: string }
  /** Stop watching a match. */
  | { type: 'spectate.stop'; matchId: string }
  | { type: 'ping' };

// ---- Server -> Client ----------------------------------------------------

export interface PublicOpponent {
  userId: string;
  username: string;
  rating: number;
  /** Displayed rank derived from the opponent's rating + confidence. */
  rank: RankDTO;
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

/** Per-side rating + rank movement from a finished ranked game. */
export interface RatingChangeSideDTO {
  before: number;
  after: number;
  delta: number;
  /** Displayed rank before/after — lets the client celebrate a rank-up. */
  rank: { before: RankDTO; after: RankDTO };
}

export interface RatingChangeDTO {
  white: RatingChangeSideDTO;
  black: RatingChangeSideDTO;
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

/** One watchable live game in the spectate list. Both seats reuse PublicOpponent
 *  (so the rank/rating badge renders the same as in a match). */
export interface SpectatorGameDTO {
  matchId: string;
  white: PublicOpponent;
  black: PublicOpponent;
  variant: VariantId;
  moveCount: number;
  ranked: boolean;
}

export type ServerMessage =
  | { type: 'auth.ok'; userId: string; username: string; rating: number; ratingDeviation: number; rank: RankDTO }
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
  /** The opponent started/stopped typing a chat message (`by` is their color). */
  | { type: 'typing'; matchId: string; by: PlayerColor; typing: boolean }
  /** A player's live connection state in this match changed — drives the
   *  "opponent disconnected / reconnected" UX. `color` is whose presence changed. */
  | { type: 'presence'; matchId: string; color: PlayerColor; online: boolean }
  /** The opponent offered a rematch; `by` is the offerer's color. */
  | { type: 'rematch.offered'; matchId: string; by: PlayerColor }
  /** A standing rematch offer was withdrawn/declined (or the offerer left). */
  | { type: 'rematch.declined'; matchId: string }
  // ---- private challenges ----
  /** Confirms an open challenge; `code` is what the host puts in the invite link.
   *  `color` echoes the host's stored preference ('random' until a join resolves it). */
  | {
      type: 'challenge.created';
      code: string;
      color: ChallengeColor;
      ranked: boolean;
      variant: VariantId;
      timeControl: { initialMs: number; incrementMs: number };
    }
  /** The host's open challenge was withdrawn (by them, or on disconnect). */
  | { type: 'challenge.cancelled' }
  // ---- spectating ----
  | { type: 'spectate.games'; games: SpectatorGameDTO[] }
  /** Initial snapshot when you start watching a match. */
  | {
      type: 'spectate.started';
      matchId: string;
      white: PublicOpponent;
      black: PublicOpponent;
      variant: VariantId;
      timeControl: { initialMs: number; incrementMs: number };
      state: MatchStateDTO;
    }
  /** A live position update for a match you're spectating. */
  | { type: 'spectate.update'; matchId: string; state: MatchStateDTO; lastMove: MoveDTO | null }
  /** A spectated match ended. */
  | { type: 'spectate.ended'; matchId: string; result: MatchResult; reason: string; winner: PlayerColor | null }
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
