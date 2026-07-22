import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { createHttpHandler } from '../src/net/httpApi.ts';
import { AuthService } from '../src/auth/service.ts';
import { InMemoryRepository } from '../src/storage/memory.ts';

const AUTH_CONFIG = { accessSecret: 'access-secret', refreshSecret: 'refresh-secret', startingRating: 1200 };

function startApi(adminToken?: string): { http: Server; repo: InMemoryRepository } {
  const repo = new InMemoryRepository();
  const auth = new AuthService(repo, AUTH_CONFIG);
  const handler = createHttpHandler({ auth, repo, ...(adminToken ? { adminToken } : {}) });
  const http = createServer((req, res) => void handler(req, res));
  return { http, repo };
}

async function listen(http: Server): Promise<number> {
  await new Promise<void>((resolve) => http.listen(0, resolve));
  return (http.address() as AddressInfo).port;
}

async function getStats(
  port: number,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://localhost:${port}/admin/stats`, { method: 'GET', headers });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test('GET /admin/stats: 404 (undiscoverable) when no admin token is configured', async () => {
  const { http } = startApi(); // no token => disabled
  const port = await listen(http);
  try {
    const r = await getStats(port, { authorization: 'Bearer anything' });
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'not-found');
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('GET /admin/stats: 401 when configured and the token is missing', async () => {
  const { http } = startApi('secret-admin-token');
  const port = await listen(http);
  try {
    const r = await getStats(port); // no auth headers
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'unauthorized');
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('GET /admin/stats: 401 when configured and the Bearer token is wrong', async () => {
  const { http } = startApi('secret-admin-token');
  const port = await listen(http);
  try {
    const r = await getStats(port, { authorization: 'Bearer wrong-token' });
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'unauthorized');
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('GET /admin/stats: 200 with the correct token via Authorization: Bearer', async () => {
  const { http } = startApi('secret-admin-token');
  const port = await listen(http);
  try {
    const r = await getStats(port, { authorization: 'Bearer secret-admin-token' });
    assert.equal(r.status, 200);
    assert.equal(typeof r.json.stats, 'object');
    for (const key of ['users', 'active', 'newUsers', 'signupsByDay', 'matches']) {
      assert.ok(key in r.json.stats, `stats should have key ${key}`);
    }
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

test('GET /admin/stats: 200 with the correct token via x-admin-token header', async () => {
  const { http } = startApi('secret-admin-token');
  const port = await listen(http);
  try {
    const r = await getStats(port, { 'x-admin-token': 'secret-admin-token' });
    assert.equal(r.status, 200);
    assert.equal(typeof r.json.stats, 'object');
    assert.ok('users' in r.json.stats);
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});
