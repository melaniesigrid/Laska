import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Navigate from a cold load to the online Auth panel:
 *   landing → "Start playing" → "Online" tab.
 * The web app keeps navigation in React state (no router), so a reload always
 * lands back here.
 */
export async function gotoAuthArea(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start playing' }).click();
  await page.getByRole('tab', { name: 'Online' }).click();
}

/** A globally-unique credential set (the in-memory store persists for the whole run). */
let seq = 0;
export function uniqueCreds(prefix = 'user'): { email: string; password: string; username: string } {
  seq += 1;
  const stamp = `${Date.now().toString(36)}${seq}`;
  return {
    email: `${prefix}-${stamp}@laska.test`,
    password: 'correct-horse-battery',
    username: `${prefix}_${stamp}`,
  };
}

/** Switch the auth fieldset into "Create account" mode if it isn't already. */
export async function switchToRegister(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Need an account? Register' });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole('group', { name: 'Create account' })).toBeVisible();
}

/** Switch the auth fieldset into "Sign in" mode if it isn't already. */
export async function switchToLogin(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Have an account? Sign in' });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole('group', { name: 'Sign in' })).toBeVisible();
}

export async function registerViaUi(
  page: Page,
  creds: { email: string; password: string; username: string },
): Promise<void> {
  await switchToRegister(page);
  await page.getByLabel('Username').fill(creds.username);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await switchToLogin(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** The lobby "Signed in as <name>" status — only present once authenticated. */
export function lobbyStatus(page: Page): Locator {
  return page.locator('.panel .status', { hasText: 'Signed in as' });
}

/** The auth error banner (`.status.draw`). */
export function errorBanner(page: Page): Locator {
  return page.locator('.online-auth .status.draw');
}
