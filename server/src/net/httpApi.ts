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
 *   GET  /leaderboard?limit=
 *   GET  /matches/mine?limit=   (Bearer access)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthService, AuthError, toPublicUser } from '../auth/service.ts';
import type { Repository } from '../storage/types.ts';

interface Deps {
  auth: AuthService;
  repo: Repository;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
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

export function createHttpHandler(deps: Deps) {
  const { auth, repo } = deps;

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (method === 'OPTIONS') return json(res, 204, {});

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
