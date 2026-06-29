/**
 * Durable SQLite-backed Repository using Node's built-in `node:sqlite`
 * (`DatabaseSync`). No native compile, no external server — a single file on
 * disk that survives restarts. Schema mirrors the PostgreSQL one in
 * `postgres.ts`, so moving to Postgres for multi-node production is a config
 * change, not a logic change.
 *
 * `node:sqlite` is synchronous; we satisfy the async `Repository` contract by
 * wrapping results in resolved promises.
 */
import { DatabaseSync } from 'node:sqlite';
import type {
  LeaderboardEntry,
  MatchRecord,
  Repository,
  SerializedMove,
  User,
} from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  username_lower  TEXT NOT NULL UNIQUE,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  is_guest        INTEGER NOT NULL,
  email_verified  INTEGER NOT NULL,
  rating          INTEGER NOT NULL,
  rated_games     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id                   TEXT PRIMARY KEY,
  white_id             TEXT NOT NULL,
  black_id             TEXT NOT NULL,
  variant              TEXT NOT NULL DEFAULT 'laska',
  moves                TEXT NOT NULL,
  result               TEXT NOT NULL,
  end_reason           TEXT NOT NULL,
  ranked               INTEGER NOT NULL,
  white_rating_before  INTEGER NOT NULL,
  black_rating_before  INTEGER NOT NULL,
  white_rating_after   INTEGER NOT NULL,
  black_rating_after   INTEGER NOT NULL,
  started_at           INTEGER NOT NULL,
  ended_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_white ON matches(white_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_black ON matches(black_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);
`;

interface UserRow {
  id: string;
  username: string;
  username_lower: string;
  email: string | null;
  password_hash: string | null;
  is_guest: number;
  email_verified: number;
  rating: number;
  rated_games: number;
  created_at: number;
}

interface MatchRow {
  id: string;
  white_id: string;
  black_id: string;
  variant: string;
  moves: string;
  result: string;
  end_reason: string;
  ranked: number;
  white_rating_before: number;
  black_rating_before: number;
  white_rating_after: number;
  black_rating_after: number;
  started_at: number;
  ended_at: number;
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    passwordHash: r.password_hash,
    isGuest: r.is_guest === 1,
    emailVerified: r.email_verified === 1,
    rating: r.rating,
    ratedGames: r.rated_games,
    createdAt: r.created_at,
  };
}

function rowToMatch(r: MatchRow): MatchRecord {
  return {
    id: r.id,
    whiteId: r.white_id,
    blackId: r.black_id,
    variant: (r.variant as MatchRecord['variant']) ?? 'laska',
    moves: JSON.parse(r.moves) as SerializedMove[],
    result: r.result as MatchRecord['result'],
    endReason: r.end_reason,
    ranked: r.ranked === 1,
    whiteRatingBefore: r.white_rating_before,
    blackRatingBefore: r.black_rating_before,
    whiteRatingAfter: r.white_rating_after,
    blackRatingAfter: r.black_rating_after,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  };
}

/** Map a SQLite UNIQUE-constraint failure to the same errors InMemory throws. */
function mapConstraint(e: unknown): never {
  const msg = (e as Error).message ?? '';
  if (msg.includes('users.email')) throw new Error('Email already registered');
  if (msg.includes('users.username_lower')) throw new Error('Username already taken');
  if (msg.includes('users.id')) throw new Error('User id already exists');
  throw e as Error;
}

const USER_COLUMNS: Record<keyof User, string> = {
  id: 'id',
  username: 'username',
  email: 'email',
  passwordHash: 'password_hash',
  isGuest: 'is_guest',
  emailVerified: 'email_verified',
  rating: 'rating',
  ratedGames: 'rated_games',
  createdAt: 'created_at',
};

function toDbValue(key: keyof User, value: unknown): string | number | null {
  if (key === 'isGuest' || key === 'emailVerified') return value ? 1 : 0;
  if (key === 'email') return value ? String(value).toLowerCase() : null;
  return value as string | number | null;
}

export class SqliteRepository implements Repository {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async createUser(user: User): Promise<void> {
    try {
      this.db
        .prepare(
          `INSERT INTO users
            (id, username, username_lower, email, password_hash, is_guest, email_verified, rating, rated_games, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          user.username,
          user.username.toLowerCase(),
          user.email ? user.email.toLowerCase() : null,
          user.passwordHash,
          user.isGuest ? 1 : 0,
          user.emailVerified ? 1 : 0,
          user.rating,
          user.ratedGames,
          user.createdAt,
        );
    } catch (e) {
      mapConstraint(e);
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase()) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const row = this.db
      .prepare('SELECT * FROM users WHERE username_lower = ?')
      .get(username.toLowerCase()) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  async updateUser(id: string, patch: Partial<User>): Promise<void> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const key of Object.keys(patch) as (keyof User)[]) {
      if (key === 'id') continue; // never reassign the primary key
      const col = USER_COLUMNS[key];
      if (!col) continue;
      sets.push(`${col} = ?`);
      values.push(toDbValue(key, patch[key]));
      // Keep the case-insensitive index column in sync with username.
      if (key === 'username') {
        sets.push('username_lower = ?');
        values.push(String(patch.username).toLowerCase());
      }
    }
    if (sets.length === 0) return;
    values.push(id);
    try {
      const res = this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      if (res.changes === 0) throw new Error('No such user');
    } catch (e) {
      if ((e as Error).message === 'No such user') throw e;
      mapConstraint(e);
    }
  }

  async saveMatch(record: MatchRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO matches
          (id, white_id, black_id, variant, moves, result, end_reason, ranked,
           white_rating_before, black_rating_before, white_rating_after, black_rating_after,
           started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.whiteId,
        record.blackId,
        record.variant,
        JSON.stringify(record.moves),
        record.result,
        record.endReason,
        record.ranked ? 1 : 0,
        record.whiteRatingBefore,
        record.blackRatingBefore,
        record.whiteRatingAfter,
        record.blackRatingAfter,
        record.startedAt,
        record.endedAt,
      );
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const row = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
    return row ? rowToMatch(row) : null;
  }

  async getUserMatches(userId: string, limit: number): Promise<MatchRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM matches
         WHERE white_id = ? OR black_id = ?
         ORDER BY ended_at DESC
         LIMIT ?`,
      )
      .all(userId, userId, limit) as unknown as MatchRow[];
    return rows.map(rowToMatch);
  }

  async topByRating(limit: number): Promise<LeaderboardEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT id, username, rating, rated_games
         FROM users
         WHERE is_guest = 0 AND rated_games > 0
         ORDER BY rating DESC
         LIMIT ?`,
      )
      .all(limit) as unknown as { id: string; username: string; rating: number; rated_games: number }[];
    return rows.map((r) => ({
      userId: r.id,
      username: r.username,
      rating: r.rating,
      ratedGames: r.rated_games,
    }));
  }
}
