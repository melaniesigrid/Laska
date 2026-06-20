import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/passwords.ts';
import { signToken, verifyToken } from '../src/auth/tokens.ts';
import { AuthService, AuthError } from '../src/auth/service.ts';
import { InMemoryRepository } from '../src/storage/memory.ts';

const config = { accessSecret: 'access-secret', refreshSecret: 'refresh-secret', startingRating: 1200 };

function service() {
  return new AuthService(new InMemoryRepository(), config);
}

test('password hash verifies correctly and rejects wrong password', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('two hashes of the same password differ (random salt)', async () => {
  const a = await hashPassword('same');
  const b = await hashPassword('same');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('same', a), true);
  assert.equal(await verifyPassword('same', b), true);
});

test('token round-trips and carries the subject', () => {
  const t = signToken({ sub: 'user-1', kind: 'access' }, 'secret', 60);
  const payload = verifyToken(t, 'secret');
  assert.ok(payload);
  assert.equal(payload!.sub, 'user-1');
  assert.equal(payload!.kind, 'access');
});

test('token fails verification with the wrong secret', () => {
  const t = signToken({ sub: 'u', kind: 'access' }, 'secret', 60);
  assert.equal(verifyToken(t, 'other-secret'), null);
});

test('expired token is rejected', () => {
  const t = signToken({ sub: 'u', kind: 'access' }, 'secret', -1); // already expired
  assert.equal(verifyToken(t, 'secret'), null);
});

test('tampered token is rejected', () => {
  const t = signToken({ sub: 'u', kind: 'access' }, 'secret', 60);
  const parts = t.split('.');
  const forged = `${parts[0]}.${Buffer.from('{"sub":"admin","kind":"access","iat":0,"exp":9999999999}').toString('base64url')}.${parts[2]}`;
  assert.equal(verifyToken(forged, 'secret'), null);
});

test('register then authenticate with the issued access token', async () => {
  const svc = service();
  const { user, tokens } = await svc.registerWithEmail('a@b.com', 'password123', 'alice');
  assert.equal(user.username, 'alice');
  assert.equal(user.isGuest, false);
  const { user: who } = await svc.authenticate(tokens.accessToken);
  assert.equal(who.id, user.id);
});

test('register rejects duplicate email and weak password', async () => {
  const svc = service();
  await svc.registerWithEmail('dup@b.com', 'password123', 'first');
  await assert.rejects(
    () => svc.registerWithEmail('dup@b.com', 'password123', 'second'),
    (e: unknown) => e instanceof AuthError && e.code === 'email-taken',
  );
  await assert.rejects(
    () => svc.registerWithEmail('new@b.com', 'short', 'third'),
    (e: unknown) => e instanceof AuthError && e.code === 'weak-password',
  );
});

test('login succeeds with correct password and fails with wrong', async () => {
  const svc = service();
  await svc.registerWithEmail('login@b.com', 'password123', 'loginuser');
  const ok = await svc.login('login@b.com', 'password123');
  assert.equal(ok.user.username, 'loginuser');
  await assert.rejects(
    () => svc.login('login@b.com', 'nope'),
    (e: unknown) => e instanceof AuthError && e.code === 'invalid-credentials',
  );
});

test('login on a nonexistent email fails as invalid-credentials (no enumeration)', async () => {
  const svc = service();
  await assert.rejects(
    () => svc.login('ghost@b.com', 'whatever1'),
    (e: unknown) => e instanceof AuthError && e.code === 'invalid-credentials',
  );
});

test('guest can be created and later linked to a real account, keeping the same id', async () => {
  const svc = service();
  const guest = await svc.createGuest();
  assert.equal(guest.user.isGuest, true);
  const linked = await svc.linkGuestToEmail(guest.user.id, 'real@b.com', 'password123', 'realname');
  assert.equal(linked.user.id, guest.user.id, 'linking preserves the user id (and their rating/history)');
  assert.equal(linked.user.isGuest, false);
  // Can now log in with the new credentials.
  const ok = await svc.login('real@b.com', 'password123');
  assert.equal(ok.user.id, guest.user.id);
});

test('refresh exchanges a refresh token for new tokens; access token cannot refresh', async () => {
  const svc = service();
  const { tokens } = await svc.registerWithEmail('r@b.com', 'password123', 'refresher');
  const newer = await svc.refresh(tokens.refreshToken);
  assert.ok(newer.accessToken && newer.refreshToken);
  await assert.rejects(
    () => svc.refresh(tokens.accessToken),
    (e: unknown) => e instanceof AuthError && e.code === 'invalid-token',
  );
});
