/**
 * Account service: register, login, guest play, and guest->account linking.
 *
 * Design choices that match the brief:
 *  - Guest play with later account linking, to lower the signup barrier.
 *  - Short-lived access tokens + longer refresh tokens.
 *  - Passwords hashed with scrypt; never stored or logged in plaintext.
 *  - Email verification is modeled (a flag + token issuance hook) but actual
 *    email delivery is a TODO (needs an email provider).
 */
import { randomUUID } from 'node:crypto';
import type { CosmeticsPatch, Repository, User } from '../storage/types.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import { signToken, verifyToken, type TokenPayload } from './tokens.ts';
import { DEFAULT_RD, DEFAULT_VOLATILITY } from '../rating/glicko2.ts';
import { rankFor, type Rank } from '../rating/rank.ts';

export const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  startingRating: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  rating: number;
  ratingDeviation: number;
  ratedGames: number;
  rank: Rank;
  /**
   * Cosmetic preferences. `null` = unset (client uses its local default). The
   * Profile page reads these to hydrate mascot/piece/board selectors.
   */
  selectedMascotTint: string | null;
  selectedPieceTheme: string | null;
  selectedBoardTheme: string | null;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    isGuest: u.isGuest,
    emailVerified: u.emailVerified,
    rating: u.rating,
    ratingDeviation: u.ratingDeviation,
    ratedGames: u.ratedGames,
    rank: rankFor({ rating: u.rating, ratingDeviation: u.ratingDeviation, ratedGames: u.ratedGames }),
    selectedMascotTint: u.selectedMascotTint,
    selectedPieceTheme: u.selectedPieceTheme,
    selectedBoardTheme: u.selectedBoardTheme,
  };
}

// ---- Cosmetics allow-lists (server-authoritative validation) -------------
// Mirror of the client option sets (web/src/mascots.tsx, web/src/pieceTheme.tsx,
// and the [data-theme] palette keys). Kept here so the server never trusts the
// client: any value outside these lists is rejected.

export const MASCOT_TINTS = ['coral', 'sun', 'mint', 'sky', 'grape'] as const;
// MUST stay in lockstep with web/src/pieceTheme.tsx PIECE_THEMES — a theme the
// client offers but the server rejects saves locally and then silently fails to
// persist (the 'crown' regression). server/test/cosmeticsParity.test.ts pins this.
export const PIECE_THEMES = ['heirloom', 'lineage', 'crown', 'dots'] as const;
/** Board palette keys (the [data-theme] values). Plain validated strings. */
export const BOARD_THEMES = [
  'stone',
  'dark',
  'navy',
  'light',
  'chocolate',
  'twilight',
  'confetti',
] as const;

export type MascotTint = (typeof MASCOT_TINTS)[number];
export type PieceTheme = (typeof PIECE_THEMES)[number];
export type BoardTheme = (typeof BOARD_THEMES)[number];

/**
 * Validate a cosmetics patch against the allow-lists. Returns a sanitized patch
 * carrying only the provided fields (omitted = leave unchanged; `null` = clear).
 * Throws AuthError('invalid-cosmetic') on any out-of-range value. The caller is
 * the trust boundary — this is the only place client cosmetic input is accepted.
 */
export function validateCosmetics(input: {
  selectedMascotTint?: unknown;
  selectedPieceTheme?: unknown;
  selectedBoardTheme?: unknown;
}): CosmeticsPatch {
  const patch: CosmeticsPatch = {};
  const check = (
    field: 'selectedMascotTint' | 'selectedPieceTheme' | 'selectedBoardTheme',
    value: unknown,
    allowed: readonly string[],
  ): void => {
    if (value === undefined) return; // not being changed
    if (value === null) {
      patch[field] = null; // explicit clear back to default
      return;
    }
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new AuthError('invalid-cosmetic', `Invalid ${field}`);
    }
    patch[field] = value;
  };
  check('selectedMascotTint', input.selectedMascotTint, MASCOT_TINTS);
  check('selectedPieceTheme', input.selectedPieceTheme, PIECE_THEMES);
  check('selectedBoardTheme', input.selectedBoardTheme, BOARD_THEMES);
  return patch;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthError extends Error {
  constructor(
    public code:
      | 'invalid-email'
      | 'weak-password'
      | 'email-taken'
      | 'username-taken'
      | 'invalid-credentials'
      | 'not-found'
      | 'not-a-guest'
      | 'invalid-token'
      | 'invalid-cosmetic',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class AuthService {
  constructor(
    private repo: Repository,
    private config: AuthConfig,
  ) {}

  private issueTokens(user: User): AuthTokens {
    const base = { sub: user.id, guest: user.isGuest } as const;
    return {
      accessToken: signToken({ ...base, kind: 'access' }, this.config.accessSecret, ACCESS_TTL_SECONDS),
      refreshToken: signToken(
        { ...base, kind: 'refresh' },
        this.config.refreshSecret,
        REFRESH_TTL_SECONDS,
      ),
    };
  }

  async registerWithEmail(
    email: string,
    password: string,
    username: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const normEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normEmail)) throw new AuthError('invalid-email', 'Invalid email address');
    if (password.length < 8) {
      throw new AuthError('weak-password', 'Password must be at least 8 characters');
    }
    if (await this.repo.getUserByEmail(normEmail)) {
      throw new AuthError('email-taken', 'Email already registered');
    }
    if (await this.repo.getUserByUsername(username)) {
      throw new AuthError('username-taken', 'Username already taken');
    }
    const user: User = {
      id: randomUUID(),
      username,
      email: normEmail,
      passwordHash: await hashPassword(password),
      isGuest: false,
      isBot: false,
      emailVerified: false,
      rating: this.config.startingRating,
      ratingDeviation: DEFAULT_RD,
      volatility: DEFAULT_VOLATILITY,
      ratedGames: 0,
      lastRatedAt: null,
      createdAt: Date.now(),
      selectedMascotTint: null,
      selectedPieceTheme: null,
      selectedBoardTheme: null,
    };
    await this.repo.createUser(user);
    return { user: toPublicUser(user), tokens: this.issueTokens(user) };
  }

  async login(email: string, password: string): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await this.repo.getUserByEmail(email.trim().toLowerCase());
    // Always run a verify to reduce account-enumeration timing differences.
    const ok = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) {
      throw new AuthError('invalid-credentials', 'Invalid email or password');
    }
    return { user: toPublicUser(user), tokens: this.issueTokens(user) };
  }

  async createGuest(): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const id = randomUUID();
    const user: User = {
      id,
      username: `guest-${id.slice(0, 8)}`,
      email: null,
      passwordHash: null,
      isGuest: true,
      isBot: false,
      emailVerified: false,
      rating: this.config.startingRating,
      ratingDeviation: DEFAULT_RD,
      volatility: DEFAULT_VOLATILITY,
      ratedGames: 0,
      lastRatedAt: null,
      createdAt: Date.now(),
      selectedMascotTint: null,
      selectedPieceTheme: null,
      selectedBoardTheme: null,
    };
    await this.repo.createUser(user);
    return { user: toPublicUser(user), tokens: this.issueTokens(user) };
  }

  /** Upgrade an existing guest account in place to a full email/password account. */
  async linkGuestToEmail(
    guestId: string,
    email: string,
    password: string,
    username: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const guest = await this.repo.getUserById(guestId);
    if (!guest) throw new AuthError('not-found', 'No such user');
    if (!guest.isGuest) throw new AuthError('not-a-guest', 'Account is already registered');

    const normEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normEmail)) throw new AuthError('invalid-email', 'Invalid email address');
    if (password.length < 8) throw new AuthError('weak-password', 'Password must be at least 8 characters');
    if (await this.repo.getUserByEmail(normEmail)) {
      throw new AuthError('email-taken', 'Email already registered');
    }
    if (username !== guest.username && (await this.repo.getUserByUsername(username))) {
      throw new AuthError('username-taken', 'Username already taken');
    }

    await this.repo.updateUser(guestId, {
      username,
      email: normEmail,
      passwordHash: await hashPassword(password),
      isGuest: false,
    });
    const updated = (await this.repo.getUserById(guestId))!;
    return { user: toPublicUser(updated), tokens: this.issueTokens(updated) };
  }

  /** Verify an access token and return the live user, or throw. */
  async authenticate(accessToken: string): Promise<{ user: User; payload: TokenPayload }> {
    const payload = verifyToken(accessToken, this.config.accessSecret);
    if (!payload || payload.kind !== 'access') {
      throw new AuthError('invalid-token', 'Invalid or expired access token');
    }
    const user = await this.repo.getUserById(payload.sub);
    if (!user) throw new AuthError('not-found', 'User no longer exists');
    return { user, payload };
  }

  /**
   * Validate and persist a user's cosmetic preferences, returning the updated
   * public user. Server-authoritative: every value is checked against the
   * allow-lists; invalid input throws AuthError('invalid-cosmetic') and nothing
   * is persisted.
   */
  async setCosmetics(
    userId: string,
    input: { selectedMascotTint?: unknown; selectedPieceTheme?: unknown; selectedBoardTheme?: unknown },
  ): Promise<PublicUser> {
    const patch = validateCosmetics(input); // throws before any write on bad input
    const user = await this.repo.getUserById(userId);
    if (!user) throw new AuthError('not-found', 'User no longer exists');
    await this.repo.updateUserCosmetics(userId, patch);
    return toPublicUser({ ...user, ...patch });
  }

  /** Exchange a valid refresh token for a new access/refresh pair. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyToken(refreshToken, this.config.refreshSecret);
    if (!payload || payload.kind !== 'refresh') {
      throw new AuthError('invalid-token', 'Invalid or expired refresh token');
    }
    const user = await this.repo.getUserById(payload.sub);
    if (!user) throw new AuthError('not-found', 'User no longer exists');
    return this.issueTokens(user);
  }
}

// A fixed dummy scrypt hash so `login` does equal work whether or not the email
// exists (mitigates user-enumeration via response timing). Value is "x".
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'Jdj1Y0n1Qk0aVxr0m0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0w==';
