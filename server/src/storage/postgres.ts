/**
 * PostgreSQL-backed Repository for production (durable + multi-node). Same
 * contract and schema shape as `sqlite.ts`; switching is a config change.
 *
 * Requires a running Postgres and the `pg` driver. It is only constructed when
 * `LASKA_DB=postgres` (see factory.ts), so local dev / tests that use SQLite or
 * memory never need Postgres installed.
 */
import { Pool, type PoolConfig } from 'pg';
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
  is_guest        BOOLEAN NOT NULL,
  email_verified  BOOLEAN NOT NULL,
  rating          INTEGER NOT NULL,
  rated_games     INTEGER NOT NULL,
  created_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id                   TEXT PRIMARY KEY,
  white_id             TEXT NOT NULL,
  black_id             TEXT NOT NULL,
  variant              TEXT NOT NULL DEFAULT 'laska',
  moves                JSONB NOT NULL,
  result               TEXT NOT NULL,
  end_reason           TEXT NOT NULL,
  ranked               BOOLEAN NOT NULL,
  white_rating_before  INTEGER NOT NULL,
  black_rating_before  INTEGER NOT NULL,
  white_rating_after   INTEGER NOT NULL,
  black_rating_after   INTEGER NOT NULL,
  started_at           BIGINT NOT NULL,
  ended_at             BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_white ON matches(white_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_black ON matches(black_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC) WHERE is_guest = false;
`;

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  is_guest: boolean;
  email_verified: boolean;
  rating: number;
  rated_games: number;
  created_at: string; // BIGINT comes back as a string from pg
}

interface MatchRow {
  id: string;
  white_id: string;
  black_id: string;
  variant: string;
  moves: SerializedMove[]; // JSONB parsed by pg
  result: string;
  end_reason: string;
  ranked: boolean;
  white_rating_before: number;
  black_rating_before: number;
  white_rating_after: number;
  black_rating_after: number;
  started_at: string;
  ended_at: string;
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    passwordHash: r.password_hash,
    isGuest: r.is_guest,
    emailVerified: r.email_verified,
    rating: r.rating,
    ratedGames: r.rated_games,
    createdAt: Number(r.created_at),
  };
}

function rowToMatch(r: MatchRow): MatchRecord {
  return {
    id: r.id,
    whiteId: r.white_id,
    blackId: r.black_id,
    variant: (r.variant as MatchRecord['variant']) ?? 'laska',
    moves: r.moves,
    result: r.result as MatchRecord['result'],
    endReason: r.end_reason,
    ranked: r.ranked,
    whiteRatingBefore: r.white_rating_before,
    blackRatingBefore: r.black_rating_before,
    whiteRatingAfter: r.white_rating_after,
    blackRatingAfter: r.black_rating_after,
    startedAt: Number(r.started_at),
    endedAt: Number(r.ended_at),
  };
}

function mapConstraint(e: unknown): never {
  const err = e as { code?: string; detail?: string; constraint?: string };
  if (err.code === '23505') {
    const d = err.detail ?? '';
    if (d.includes('(email)')) throw new Error('Email already registered');
    if (d.includes('(username_lower)') || err.constraint?.includes('username_lower')) {
      throw new Error('Username already taken');
    }
    if (d.includes('(id)') || err.constraint === 'users_pkey') throw new Error('User id already exists');
  }
  throw e as Error;
}

const USER_COLUMNS: Partial<Record<keyof User, string>> = {
  username: 'username',
  email: 'email',
  passwordHash: 'password_hash',
  isGuest: 'is_guest',
  emailVerified: 'email_verified',
  rating: 'rating',
  ratedGames: 'rated_games',
  createdAt: 'created_at',
};

export class PostgresRepository implements Repository {
  private pool: Pool;

  constructor(config: PoolConfig | string) {
    this.pool = typeof config === 'string' ? new Pool({ connectionString: config }) : new Pool(config);
  }

  /** Create tables/indexes if missing. Call once on startup. */
  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createUser(user: User): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO users
          (id, username, username_lower, email, password_hash, is_guest, email_verified, rating, rated_games, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          user.id,
          user.username,
          user.username.toLowerCase(),
          user.email ? user.email.toLowerCase() : null,
          user.passwordHash,
          user.isGuest,
          user.emailVerified,
          user.rating,
          user.ratedGames,
          user.createdAt,
        ],
      );
    } catch (e) {
      mapConstraint(e);
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>('SELECT * FROM users WHERE username_lower = $1', [username.toLowerCase()]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async updateUser(id: string, patch: Partial<User>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const key of Object.keys(patch) as (keyof User)[]) {
      const col = USER_COLUMNS[key];
      if (!col) continue;
      sets.push(`${col} = $${i++}`);
      values.push(key === 'email' && patch.email ? patch.email.toLowerCase() : patch[key]);
      if (key === 'username') {
        sets.push(`username_lower = $${i++}`);
        values.push(String(patch.username).toLowerCase());
      }
    }
    if (sets.length === 0) return;
    values.push(id);
    try {
      const res = await this.pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, values);
      if (res.rowCount === 0) throw new Error('No such user');
    } catch (e) {
      if ((e as Error).message === 'No such user') throw e;
      mapConstraint(e);
    }
  }

  async saveMatch(record: MatchRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO matches
        (id, white_id, black_id, variant, moves, result, end_reason, ranked,
         white_rating_before, black_rating_before, white_rating_after, black_rating_after,
         started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.whiteId,
        record.blackId,
        record.variant,
        JSON.stringify(record.moves),
        record.result,
        record.endReason,
        record.ranked,
        record.whiteRatingBefore,
        record.blackRatingBefore,
        record.whiteRatingAfter,
        record.blackRatingAfter,
        record.startedAt,
        record.endedAt,
      ],
    );
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const { rows } = await this.pool.query<MatchRow>('SELECT * FROM matches WHERE id = $1', [id]);
    return rows[0] ? rowToMatch(rows[0]) : null;
  }

  async getUserMatches(userId: string, limit: number): Promise<MatchRecord[]> {
    const { rows } = await this.pool.query<MatchRow>(
      `SELECT * FROM matches
       WHERE white_id = $1 OR black_id = $1
       ORDER BY ended_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.map(rowToMatch);
  }

  async topByRating(limit: number): Promise<LeaderboardEntry[]> {
    const { rows } = await this.pool.query<{ id: string; username: string; rating: number; rated_games: number }>(
      `SELECT id, username, rating, rated_games
       FROM users
       WHERE is_guest = false AND rated_games > 0
       ORDER BY rating DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ userId: r.id, username: r.username, rating: r.rating, ratedGames: r.rated_games }));
  }
}
