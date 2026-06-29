/**
 * In-memory Repository. Good for development, tests, and a single-process demo.
 * NOT durable across restarts and NOT multi-node safe — replace with Postgres
 * for production (see TODO.md). Kept deliberately simple and synchronous under
 * the async interface.
 */
import type {
  LeaderboardEntry,
  MatchRecord,
  PlatformStats,
  Repository,
  User,
} from './types.ts';
import { rankFor } from '../rating/rank.ts';
import { utcDay, windows, signupDayWindow, fillSignupDays } from './stats.ts';
import { DEFAULT_RD, DEFAULT_VOLATILITY } from '../rating/glicko2.ts';

/** Backfill Glicko-2 / inactivity fields on a user that predates them. */
function withRatingDefaults(user: User): User {
  return {
    ...user,
    ratingDeviation: user.ratingDeviation ?? DEFAULT_RD,
    volatility: user.volatility ?? DEFAULT_VOLATILITY,
    lastRatedAt: user.lastRatedAt ?? null,
  };
}

export class InMemoryRepository implements Repository {
  private users = new Map<string, User>();
  private emailIndex = new Map<string, string>(); // email -> userId
  private usernameIndex = new Map<string, string>(); // lowercased username -> userId
  private matches = new Map<string, MatchRecord>();
  private userMatchIds = new Map<string, string[]>(); // userId -> matchIds (newest last)

  async createUser(user: User): Promise<void> {
    // Normalize email to lowercase so uniqueness/lookups are case-insensitive
    // (matches the SQL backends, which we keep in lockstep via the contract test).
    const email = user.email ? user.email.toLowerCase() : null;
    if (this.users.has(user.id)) throw new Error('User id already exists');
    if (email && this.emailIndex.has(email)) {
      throw new Error('Email already registered');
    }
    const unameKey = user.username.toLowerCase();
    if (this.usernameIndex.has(unameKey)) throw new Error('Username already taken');
    this.users.set(user.id, withRatingDefaults({ ...user, email }));
    if (email) this.emailIndex.set(email, user.id);
    this.usernameIndex.set(unameKey, user.id);
  }

  async getUserById(id: string): Promise<User | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const id = this.emailIndex.get(email.toLowerCase());
    return id ? this.getUserById(id) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const id = this.usernameIndex.get(username.toLowerCase());
    return id ? this.getUserById(id) : null;
  }

  async updateUser(id: string, patch: Partial<User>): Promise<void> {
    const existing = this.users.get(id);
    if (!existing) throw new Error('No such user');
    // Normalize a patched email to lowercase, consistent with createUser.
    const normalizedEmail =
      patch.email !== undefined ? (patch.email ? patch.email.toLowerCase() : null) : undefined;
    if (normalizedEmail !== undefined) patch = { ...patch, email: normalizedEmail };
    // Maintain indexes if email/username change.
    if (normalizedEmail !== undefined && normalizedEmail !== existing.email) {
      if (existing.email) this.emailIndex.delete(existing.email);
      if (normalizedEmail) {
        if (this.emailIndex.has(normalizedEmail)) throw new Error('Email already registered');
        this.emailIndex.set(normalizedEmail, id);
      }
    }
    if (patch.username !== undefined && patch.username !== existing.username) {
      const oldKey = existing.username.toLowerCase();
      const newKey = patch.username.toLowerCase();
      if (newKey !== oldKey && this.usernameIndex.has(newKey)) {
        throw new Error('Username already taken');
      }
      this.usernameIndex.delete(oldKey);
      this.usernameIndex.set(newKey, id);
    }
    this.users.set(id, { ...existing, ...patch });
  }

  async saveMatch(record: MatchRecord): Promise<void> {
    this.matches.set(record.id, { ...record });
    for (const uid of [record.whiteId, record.blackId]) {
      const list = this.userMatchIds.get(uid) ?? [];
      list.push(record.id);
      this.userMatchIds.set(uid, list);
    }
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const m = this.matches.get(id);
    return m ? { ...m } : null;
  }

  async getUserMatches(userId: string, limit: number): Promise<MatchRecord[]> {
    const ids = this.userMatchIds.get(userId) ?? [];
    const records: MatchRecord[] = [];
    for (const id of ids) {
      const m = this.matches.get(id);
      if (m) records.push({ ...m });
    }
    // Newest first by end time, matching the SQL backends' ORDER BY ended_at DESC.
    records.sort((a, b) => b.endedAt - a.endedAt);
    return records.slice(0, limit);
  }

  async topByRating(limit: number): Promise<LeaderboardEntry[]> {
    return [...this.users.values()]
      .filter((u) => !u.isGuest && u.ratedGames > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((u) => ({
        userId: u.id,
        username: u.username,
        rating: u.rating,
        ratingDeviation: u.ratingDeviation,
        ratedGames: u.ratedGames,
        rank: rankFor({
          rating: u.rating,
          ratingDeviation: u.ratingDeviation,
          ratedGames: u.ratedGames,
        }),
      }));
  }

  async platformStats(now: number): Promise<PlatformStats> {
    const { d1, d7, d30 } = windows(now);

    let total = 0;
    let registered = 0;
    let guests = 0;
    let verified = 0;
    let new24h = 0;
    let new7d = 0;
    let new30d = 0;
    // signupsByDay buckets (UTC calendar day -> count), filtered to the window.
    const { days, sinceMs } = signupDayWindow(now);
    const dayCounts = new Map<string, number>();

    for (const u of this.users.values()) {
      total++;
      if (u.isGuest) guests++;
      else registered++;
      if (u.emailVerified) verified++;
      if (u.createdAt >= d1) new24h++;
      if (u.createdAt >= d7) new7d++;
      if (u.createdAt >= d30) new30d++;
      if (u.createdAt >= sinceMs) {
        const day = utcDay(u.createdAt);
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
    }

    // Activity signal: distinct users (either color) who FINISHED a match
    // (endedAt) within each window. endedAt covers all completed play — ranked
    // and casual, both players — so it's a truer "active" signal than
    // User.lastRatedAt, which only reflects ranked games.
    const active1 = new Set<string>();
    const active7 = new Set<string>();
    const active30 = new Set<string>();
    let totalMatches = 0;
    let rankedMatches = 0;
    let matches24h = 0;
    let matches7d = 0;

    for (const m of this.matches.values()) {
      totalMatches++;
      if (m.ranked) rankedMatches++;
      if (m.endedAt >= d1) matches24h++;
      if (m.endedAt >= d7) matches7d++;
      if (m.endedAt >= d30) {
        active30.add(m.whiteId);
        active30.add(m.blackId);
        if (m.endedAt >= d7) {
          active7.add(m.whiteId);
          active7.add(m.blackId);
        }
        if (m.endedAt >= d1) {
          active1.add(m.whiteId);
          active1.add(m.blackId);
        }
      }
    }

    return {
      generatedAt: now,
      users: { total, registered, guests, verified },
      active: { d1: active1.size, d7: active7.size, d30: active30.size },
      newUsers: { last24h: new24h, last7d: new7d, last30d: new30d },
      signupsByDay: fillSignupDays(days, dayCounts),
      matches: {
        total: totalMatches,
        ranked: rankedMatches,
        last24h: matches24h,
        last7d: matches7d,
      },
    };
  }
}
