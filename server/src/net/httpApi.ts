/**
 * Minimal REST API over node:http (no Express dependency). Handles account
 * endpoints plus read-only leaderboard and match-history queries. Live play
 * happens over WebSocket (see gameServer.ts).
 *
 * Endpoints:
 *   POST /auth/register   {email, password, username}
 *   POST /auth/login      {email, password}
 *   POST /auth/guest      {}
 *   POST /auth/refresh    {refreshToken}
 *   POST /auth/link       (Bearer guest access) {email, password, username}
 *   GET  /me              (Bearer access)
 *   PATCH /me/cosmetics   (Bearer access) {selectedMascotTint?, selectedPieceTheme?, selectedBoardTheme?}
 *   GET  /leaderboard?limit=
 *   GET  /matches/mine?limit=   (Bearer access)
 *   GET  /admin/stats           (admin: Bearer <LASKA_ADMIN_TOKEN> or x-admin-token)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { AuthService, AuthError, toPublicUser } from '../auth/service.ts';
import type { Repository } from '../storage/types.ts';
import { RateLimiter } from './rateLimiter.ts';

interface Deps {
  auth: AuthService;
  repo: Repository;
  /**
   * Optional pre-built limiter (tests inject one with a fake clock). When
   * omitted, callers should pass `authRateLimit` so a default limiter is built.
   */
  authLimiter?: RateLimiter;
  authRateLimit?: { max: number; windowMs: number };
  /**
   * Static shared secret for the internal `GET /admin/stats` endpoint. When
   * undefined/empty the endpoint is DISABLED (responds 404, undiscoverable).
   * Intentionally separate from user JWT auth — admin is not a user account.
   */
  adminToken?: string;
}

/** Best-effort client IP for rate-limit keying. */
function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-admin-token',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage, limitBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > limitBytes) throw new Error('Body too large');
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers['authorization'];
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

/**
 * Pull the admin secret from either `Authorization: Bearer <token>` or the
 * `x-admin-token: <token>` header. Returns null when neither is present.
 */
function adminTokenFromReq(req: IncomingMessage): string | null {
  const fromBearer = bearer(req);
  if (fromBearer) return fromBearer;
  const x = req.headers['x-admin-token'];
  if (typeof x === 'string' && x.length > 0) return x.trim();
  if (Array.isArray(x) && x.length > 0) return x[0]!.trim();
  return null;
}

/** Constant-time string equality; unequal lengths reject without throwing. */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function authCode(e: AuthError): number {
  switch (e.code) {
    case 'invalid-credentials':
    case 'invalid-token':
      return 401;
    case 'email-taken':
    case 'username-taken':
      return 409;
    case 'not-found':
      return 404;
    default:
      return 400;
  }
}

/** Auth endpoints that are throttled (all are POST). */
const RATE_LIMITED_AUTH_PATHS = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/guest',
  '/auth/refresh',
  '/auth/link',
]);

export function createHttpHandler(deps: Deps) {
  const { auth, repo } = deps;
  const adminToken = deps.adminToken && deps.adminToken.length > 0 ? deps.adminToken : undefined;
  const authLimiter =
    deps.authLimiter ?? new RateLimiter(deps.authRateLimit ?? { max: 20, windowMs: 60_000 });

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (method === 'OPTIONS') return json(res, 204, {});

      // Throttle abuse of the auth endpoints, keyed by client IP + endpoint.
      // Gameplay/WebSocket traffic is never rate-limited here.
      if (method === 'POST' && RATE_LIMITED_AUTH_PATHS.has(path)) {
        const result = authLimiter.check(`${clientIp(req)} ${path}`);
        if (!result.allowed) {
          const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
          res.setHeader('retry-after', String(retryAfterSec));
          return json(res, 429, {
            error: 'rate-limited',
            message: 'Too many requests. Please slow down and try again later.',
            retryAfterMs: result.retryAfterMs,
          });
        }
      }

      // ---- Auth ----
      if (method === 'POST' && path === '/auth/register') {
        const b = (await readJson(req)) as { email?: string; password?: string; username?: string };
        const out = await auth.registerWithEmail(b.email ?? '', b.password ?? '', b.username ?? '');
        return json(res, 201, out);
      }
      if (method === 'POST' && path === '/auth/login') {
        const b = (await readJson(req)) as { email?: string; password?: string };
        const out = await auth.login(b.email ?? '', b.password ?? '');
        return json(res, 200, out);
      }
      if (method === 'POST' && path === '/auth/guest') {
        return json(res, 201, await auth.createGuest());
      }
      if (method === 'POST' && path === '/auth/refresh') {
        const b = (await readJson(req)) as { refreshToken?: string };
        return json(res, 200, { tokens: await auth.refresh(b.refreshToken ?? '') });
      }
      if (method === 'POST' && path === '/auth/link') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'missing-token' });
        const { user } = await auth.authenticate(token);
        const b = (await readJson(req)) as { email?: string; password?: string; username?: string };
        const out = await auth.linkGuestToEmail(
          user.id,
          b.email ?? '',
          b.password ?? '',
          b.username ?? user.username,
        );
        return json(res, 200, out);
      }

      // ---- Authenticated reads ----
      if (method === 'GET' && path === '/me') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'missing-token' });
        const { user } = await auth.authenticate(token);
        return json(res, 200, { user: toPublicUser(user) });
      }
      if (method === 'PATCH' && path === '/me/cosmetics') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'missing-token' });
        const { user } = await auth.authenticate(token);
        const b = (await readJson(req)) as {
          selectedMascotTint?: unknown;
          selectedPieceTheme?: unknown;
          selectedBoardTheme?: unknown;
        };
        const updated = await auth.setCosmetics(user.id, b);
        return json(res, 200, { user: updated });
      }
      if (method === 'GET' && path === '/matches/mine') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'missing-token' });
        const { user } = await auth.authenticate(token);
        const limit = clampLimit(url.searchParams.get('limit'), 20, 100);
        return json(res, 200, { matches: await repo.getUserMatches(user.id, limit) });
      }

      // ---- Public reads ----
      if (method === 'GET' && path === '/leaderboard') {
        const limit = clampLimit(url.searchParams.get('limit'), 50, 200);
        return json(res, 200, { leaderboard: await repo.topByRating(limit) });
      }
      if (method === 'GET' && path === '/health') {
        return json(res, 200, { ok: true });
      }

      // ---- Admin-gated read (internal dashboard) ----
      // Guarded by a static shared secret (LASKA_ADMIN_TOKEN), NOT user JWT auth.
      // When no token is configured the endpoint is invisible: it 404s exactly
      // like an unknown route so its existence can't be probed.
      if (method === 'GET' && path === '/admin/stats') {
        if (!adminToken) return json(res, 404, { error: 'not-found' });
        const presented = adminTokenFromReq(req);
        if (!presented || !constantTimeEqual(presented, adminToken)) {
          return json(res, 401, { error: 'unauthorized' });
        }
        const stats = await repo.platformStats(Date.now());
        return json(res, 200, { stats });
      }

      return json(res, 404, { error: 'not-found' });
    } catch (e) {
      if (e instanceof AuthError) {
        return json(res, authCode(e), { error: e.code, message: e.message });
      }
      return json(res, 400, { error: 'bad-request', message: (e as Error).message });
    }
  };
}

function clampLimit(raw: string | null, def: number, max: number): number {
  const n = raw ? Number(raw) : def;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}
