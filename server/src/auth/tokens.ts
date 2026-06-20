/**
 * Compact signed tokens (a minimal JWT-like format) using HMAC-SHA256 from
 * node:crypto. Used for short-lived access tokens and longer refresh tokens.
 *
 * Format:  base64url(header).base64url(payload).base64url(hmac)
 *
 * This is intentionally small and dependency-free. For production you may swap
 * in a managed auth provider (Clerk/Auth0/Supabase/Firebase) — the rest of the
 * server only depends on `verifyToken` returning a `TokenPayload`. See TODO.md.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TokenPayload {
  /** Subject: the user id. */
  sub: string;
  /** Token kind, so an access token can't be used where a refresh token is required. */
  kind: 'access' | 'refresh';
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
  /** True for anonymous guest sessions. */
  guest?: boolean;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj)));
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const HEADER = b64urlJson({ alg: 'HS256', typ: 'JWT' });

export function signToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: TokenPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const body = b64urlJson(full);
  const signingInput = `${HEADER}.${body}`;
  const sig = b64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

/** Returns the payload if the token is well-formed, correctly signed, and unexpired; else null. */
export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  if (header !== HEADER) return null;

  const expectedSig = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const givenSig = fromB64url(sig);
  if (givenSig.length !== expectedSig.length || !timingSafeEqual(givenSig, expectedSig)) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8')) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null; // expired
  }
  return payload;
}
