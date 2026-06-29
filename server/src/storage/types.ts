/**
 * Persistence contracts. The server depends only on `Repository`, so the
 * in-memory implementation here can be swapped for PostgreSQL (users, ratings,
 * match history) + Redis (presence/matchmaking) without touching game logic.
 * See TODO.md for the production storage migration.
 */
import type { PlayerColor, VariantId } from '../../../src/index.ts';
import type { Rank } from '../rating/rank.ts';

export interface User {
  id: string;
  /** Display name, unique-ish; for guests this is auto-generated. */
  username: string;
  /** Lowercased email, or null for guests. Unique when present. */
  email: string | null;
  /** scrypt hash, or null for guests / social-only accounts. */
  passwordHash: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  /** Glicko-2 rating (Elo-scale display value). See rating/glicko2.ts. */
  rating: number;
  /** Glicko-2 rating deviation (uncertainty). New players start at DEFAULT_RD (350). */
  ratingDeviation: number;
  /** Glicko-2 volatility (result erraticness). New players start at DEFAULT_VOLATILITY (0.06). */
  volatility: number;
  /** Ranked games played; used for the rank ladder's provisional gate. */
  ratedGames: number;
  /** Epoch ms of the last ranked game, or null if never; drives RD inactivity inflation. */
  lastRatedAt: number | null;
  createdAt: number;
}

export type MatchResult = '1-0' | '0-1' | '1/2-1/2';

export interface MatchRecord {
  id: string;
  whiteId: string;
  blackId: string;
  /** Rule variant the match was played under (Laska by default). */
  variant: VariantId;
  /** Compact move list for replay (each move's from/to/captures path). */
  moves: SerializedMove[];
  result: MatchResult;
  /** How the game ended, for dispute resolution / display. */
  endReason: string;
  ranked: boolean;
  whiteRatingBefore: number;
  blackRatingBefore: number;
  whiteRatingAfter: number;
  blackRatingAfter: number;
  startedAt: number;
  endedAt: number;
}

export interface SerializedMove {
  from: number;
  to: number;
  captures: number[];
  by: PlayerColor;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  rating: number;
  /** Glicko-2 rating deviation, so clients can flag provisional standings. */
  ratingDeviation: number;
  ratedGames: number;
  /** Displayed rank derived from rating + confidence (see rating/rank.ts). */
  rank: Rank;
}

export interface Repository {
  createUser(user: User): Promise<void>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  updateUser(id: string, patch: Partial<User>): Promise<void>;

  saveMatch(record: MatchRecord): Promise<void>;
  getMatch(id: string): Promise<MatchRecord | null>;
  getUserMatches(userId: string, limit: number): Promise<MatchRecord[]>;

  topByRating(limit: number): Promise<LeaderboardEntry[]>;

  /** Release any underlying resources (DB connections). Optional. */
  close?(): Promise<void>;
}
