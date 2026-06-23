import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { RateLimiter } from '../src/net/rateLimiter.ts';
import { createHttpHandler } from '../src/net/httpApi.ts';
import { AuthService } from '../src/auth/service.ts';
import { InMemoryRepository } from '../src/storage/memory.ts';

const AUTH_CONFIG = { accessSecret: 'access-secret', refreshSecret: 'refresh-secret', startingRating: 1200 };

// ---- Unit: the limiter itself, with an injected clock ----

test('RateLimiter allows up to max, then blocks the next request', () => {
  let now = 1000;
  const rl = new RateLimiter({ max: 3, windowMs: 1000, now: () => now });
  assert.equal(rl.check('k').allowed, true);
  assert.equal(rl.check('k').allowed, true);
  const third = rl.check('k');
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  const fourth = rl.check('k');
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.retryAfterMs, 1000);
});

test('RateLimiter window slides: requests free up after the window elapses', () => {
  let now = 0;
  const rl = new RateLimiter({ max: 2, windowMs: 1000, now: () => now });
  assert.equal(rl.check('k').allowed, true); // t=0
  now = 500;
  assert.equal(rl.check('k').allowed, true); // t=500
  assert.equal(rl.check('k').allowed, false); // t=500, over limit
  now = 1001; // first hit (t=0) has aged out
  assert.equal(rl.check('k').allowed, true);
});

test('RateLimiter keys are independent', () => {
  let now = 0;
  const rl = new RateLimiter({ max: 1, windowMs: 1000, now: () => now });
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, false);
  assert.equal(rl.check('b').allowed, true);
});

test('RateLimiter blocked requests do not extend the window', () => {
  let now = 0;
  const rl = new RateLimiter({ max: 1, windowMs: 1000, now: () => now });
  assert.equal(rl.check('k').allowed, true); // t=0
  now = 500;
  assert.equal(rl.check('k').allowed, false); // rejected, NOT counted
  now = 1001; // original hit aged out; rejection at t=500 must not keep us blocked
  assert.equal(rl.check('k').allowed, true);
});

// ---- HTTP integration: auth endpoint returns 429 past the limit ----

function startApi(limiter: RateLimiter, trustedProxyHops = 0) {
  const repo = new InMemoryRepository();
  const auth = new AuthService(repo, AUTH_CONFIG);
  const handler = createHttpHandler({ auth, repo, authLimiter: limiter, trustedProxyHops });
  const http = createServer((req, res) => void handler(req, res));
  return { http, repo };
}

async function post(
  port: number,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test('auth endpoint: requests under the limit pass, the one over gets 429, then the window resets', async () => {
  let now = 10_000;
  const limiter = new RateLimiter({ max: 3, windowMs: 1000, now: () => now });
  const { http } = startApi(limiter);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as AddressInfo).port;

  try {
    // /auth/guest needs no body and always succeeds, isolating the limiter.
    for (let i = 0; i < 3; i++) {
      const r = await post(port, '/auth/guest', {});
      assert.equal(r.status, 201, `request ${i + 1} should be allowed`);
    }

    // 4th request within the same window is rejected.
    const blocked = await post(port, '/auth/guest', {});
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.error, 'rate-limited');
    assert.equal(typeof blocked.json.retryAfterMs, 'number');

    // Advance past the window: the limit resets and requests succeed again.
    now += 1001;
    const after = await post(port, '/auth/guest', {});
    assert.equal(after.status, 201, 'request after the window resets is allowed again');
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('rate limit is per-endpoint: exhausting one path does not block another', async () => {
  let now = 0;
  const limiter = new RateLimiter({ max: 1, windowMs: 60_000, now: () => now });
  const { http } = startApi(limiter);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as AddressInfo).port;

  try {
    assert.equal((await post(port, '/auth/guest', {})).status, 201);
    assert.equal((await post(port, '/auth/guest', {})).status, 429);
    // A different auth endpoint has its own bucket and is still available.
    const login = await post(port, '/auth/login', { email: 'x@y.com', password: 'whatever1' });
    assert.notEqual(login.status, 429);
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

// ---- SECURITY-001: client IP derivation from the trusted proxy hop ----

test('trustedHops=0: X-Forwarded-For is ignored; one socket shares a bucket and trips 429', async () => {
  let now = 0;
  const limiter = new RateLimiter({ max: 20, windowMs: 60_000, now: () => now });
  const { http } = startApi(limiter, 0);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as AddressInfo).port;

  try {
    // Rotate the (untrusted) XFF every request; with trustedHops=0 it must be
    // ignored so every request hits the same socket-keyed bucket.
    for (let i = 0; i < 20; i++) {
      const r = await post(port, '/auth/guest', {}, { 'x-forwarded-for': `203.0.113.${i}` });
      assert.equal(r.status, 201, `request ${i + 1} should be allowed`);
    }
    const blocked = await post(port, '/auth/guest', {}, { 'x-forwarded-for': '203.0.113.99' });
    assert.equal(blocked.status, 429);
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('trustedHops=1: regression — spoofed leftmost XFF cannot escape the bucket (same real client IP)', async () => {
  // This is the SECURITY-001 regression. The real client IP is the RIGHTMOST
  // entry (appended by our one trusted proxy). An attacker rotates the leftmost
  // value; on the old `split(',')[0]` code each request got a fresh bucket and
  // never tripped. With the fix they all share the rightmost-keyed bucket.
  let now = 0;
  const limiter = new RateLimiter({ max: 5, windowMs: 60_000, now: () => now });
  const { http } = startApi(limiter, 1);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as AddressInfo).port;

  try {
    const realClient = '198.51.100.7';
    for (let i = 0; i < 5; i++) {
      const spoofed = `10.0.0.${i}`; // attacker-controlled leftmost, rotated
      const r = await post(port, '/auth/guest', {}, { 'x-forwarded-for': `${spoofed}, ${realClient}` });
      assert.equal(r.status, 201, `request ${i + 1} should be allowed`);
    }
    const blocked = await post(
      port,
      '/auth/guest',
      {},
      { 'x-forwarded-for': `10.0.0.99, ${realClient}` },
    );
    assert.equal(blocked.status, 429, 'rotating the spoofed leftmost XFF must not bypass the limit');
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('trustedHops=1: genuinely different upstream IPs get independent buckets', async () => {
  let now = 0;
  const limiter = new RateLimiter({ max: 1, windowMs: 60_000, now: () => now });
  const { http } = startApi(limiter, 1);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as AddressInfo).port;

  try {
    // Same trusted proxy appends, but the genuine client IP (rightmost) differs.
    const a1 = await post(port, '/auth/guest', {}, { 'x-forwarded-for': 'proxyA, 198.51.100.1' });
    assert.equal(a1.status, 201);
    const a2 = await post(port, '/auth/guest', {}, { 'x-forwarded-for': 'proxyA, 198.51.100.1' });
    assert.equal(a2.status, 429, 'second request from the same real client is throttled');

    // A different real client must not be throttled by the first client's usage.
    const b1 = await post(port, '/auth/guest', {}, { 'x-forwarded-for': 'proxyA, 198.51.100.2' });
    assert.equal(b1.status, 201, 'a distinct upstream client has its own bucket');
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('trustedHops=1: malformed/short X-Forwarded-For falls back to socket without throwing', async () => {
  let now = 0;
  // max=1 so each distinct key allows exactly one request before 429.
  const limiter = new RateLimiter({ max: 1, windowMs: 60_000, now: () => now });
  const { http } = startApi(limiter, 1);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const port = (http.address() as AddressInfo).port;

  try {
    // Header of only commas/whitespace -> empty list -> fall back to socket.
    const m1 = await post(port, '/auth/guest', {}, { 'x-forwarded-for': ' , ' });
    assert.equal(m1.status, 201, 'malformed XFF must not throw');
    // No XFF at all -> socket fallback, SAME bucket as the malformed request.
    const m2 = await post(port, '/auth/guest', {});
    assert.equal(m2.status, 429, 'both fall back to the same socket-keyed bucket');
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});
