import { test, expect } from '@playwright/test';
import {
  gotoAuthArea,
  uniqueCreds,
  registerViaUi,
  loginViaUi,
  switchToRegister,
  switchToLogin,
  lobbyStatus,
  errorBanner,
} from './helpers.ts';

test.describe('Auth panel — reaching it', () => {
  test('the Online tab shows the sign-in panel for a signed-out visitor', async ({ page }) => {
    await gotoAuthArea(page);
    await expect(page.getByText('Play online — sign in, or jump in as a guest.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play as guest' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sign in' })).toBeVisible();
  });

  test('toggling between Sign in and Create account swaps the form', async ({ page }) => {
    await gotoAuthArea(page);
    // Sign-in mode has no Username field.
    await expect(page.getByLabel('Username')).toHaveCount(0);

    await switchToRegister(page);
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

    await switchToLogin(page);
    await expect(page.getByLabel('Username')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('Guest play', () => {
  test('"Play as guest" signs in with a guest identity at the starting rating', async ({ page }) => {
    await gotoAuthArea(page);
    await page.getByRole('button', { name: 'Play as guest' }).click();

    const status = lobbyStatus(page);
    await expect(status).toBeVisible();
    await expect(status).toContainText(/guest-[0-9a-f]{8}/);
    await expect(status).toContainText('(guest)');
    await expect(status).toContainText('rating 1200');
    await expect(page.getByRole('button', { name: 'Play online (ranked)' })).toBeVisible();
  });
});

test.describe('Registration', () => {
  test('a new account can be created and lands in the lobby', async ({ page }) => {
    const creds = uniqueCreds('signup');
    await gotoAuthArea(page);
    await registerViaUi(page, creds);

    const status = lobbyStatus(page);
    await expect(status).toBeVisible();
    await expect(status).toContainText(creds.username);
    await expect(status).toContainText('rating 1200');
    // A real (non-guest) account must not be flagged as a guest.
    await expect(status).not.toContainText('(guest)');
  });

  test('a password under 8 characters is rejected with a clear message', async ({ page }) => {
    const creds = uniqueCreds('weakpw');
    await gotoAuthArea(page);
    await switchToRegister(page);
    await page.getByLabel('Username').fill(creds.username);
    await page.getByLabel('Email').fill(creds.email);
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(errorBanner(page)).toHaveText('Password must be at least 8 characters');
    await expect(lobbyStatus(page)).toHaveCount(0);
  });

  test('a malformed email is rejected', async ({ page }) => {
    const creds = uniqueCreds('bademail');
    await gotoAuthArea(page);
    await switchToRegister(page);
    await page.getByLabel('Username').fill(creds.username);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill(creds.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(errorBanner(page)).toHaveText('Invalid email address');
    await expect(lobbyStatus(page)).toHaveCount(0);
  });

  test('registering an email that is already taken is rejected', async ({ page }) => {
    const creds = uniqueCreds('dupe');
    await gotoAuthArea(page);

    // First registration succeeds…
    await registerViaUi(page, creds);
    await expect(lobbyStatus(page)).toBeVisible();

    // …sign out and try the same email again with a fresh username.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await registerViaUi(page, { ...creds, username: `${creds.username}_2` });

    await expect(errorBanner(page)).toHaveText('Email already registered');
  });
});

test.describe('Login', () => {
  test('a registered user can sign out and sign back in', async ({ page }) => {
    const creds = uniqueCreds('login');
    await gotoAuthArea(page);

    await registerViaUi(page, creds);
    await expect(lobbyStatus(page)).toContainText(creds.username);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Play as guest' })).toBeVisible();

    await loginViaUi(page, creds.email, creds.password);
    await expect(lobbyStatus(page)).toContainText(creds.username);
  });

  test('wrong credentials surface "Invalid email or password"', async ({ page }) => {
    const creds = uniqueCreds('badcreds');
    await gotoAuthArea(page);

    await registerViaUi(page, creds);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await loginViaUi(page, creds.email, 'definitely-wrong-password');
    await expect(errorBanner(page)).toHaveText('Invalid email or password');
    await expect(lobbyStatus(page)).toHaveCount(0);
  });

  test('logging into an account that does not exist is rejected without enumeration', async ({ page }) => {
    const creds = uniqueCreds('ghost');
    await gotoAuthArea(page);
    await loginViaUi(page, creds.email, creds.password);

    // Same generic message as a wrong password — no account-existence leak.
    await expect(errorBanner(page)).toHaveText('Invalid email or password');
  });
});

test.describe('Session lifecycle', () => {
  test('a session survives a full page reload', async ({ page }) => {
    const creds = uniqueCreds('persist');
    await gotoAuthArea(page);
    await registerViaUi(page, creds);
    await expect(lobbyStatus(page)).toContainText(creds.username);

    // Reload: React state resets to the landing page, but the stored refresh
    // token should restore the session under the hood.
    await page.reload();
    await page.getByRole('button', { name: 'Start playing' }).click();
    await page.getByRole('tab', { name: 'Online' }).click();

    await expect(lobbyStatus(page)).toContainText(creds.username);
    await expect(page.getByRole('button', { name: 'Play as guest' })).toHaveCount(0);
  });

  test('signing out clears the session and returns to the auth panel', async ({ page }) => {
    const creds = uniqueCreds('signout');
    await gotoAuthArea(page);
    await registerViaUi(page, creds);
    await expect(lobbyStatus(page)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Play as guest' })).toBeVisible();

    // And the cleared session must not come back after a reload.
    await page.reload();
    await page.getByRole('button', { name: 'Start playing' }).click();
    await page.getByRole('tab', { name: 'Online' }).click();
    await expect(page.getByRole('button', { name: 'Play as guest' })).toBeVisible();
  });
});
