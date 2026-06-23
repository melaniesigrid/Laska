import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for Laska's browser flows.
 *
 * Two servers are booted for the run:
 *   1. The Laska backend (server/) on a dedicated test port with an IN-MEMORY
 *      store and IN-MEMORY cluster — so tests never touch the checked-in
 *      laska.db, and every run starts from a clean slate.
 *   2. The Vite web app (web/), pointed at that backend via VITE_API_BASE.
 *
 * Auth secrets are fixed so issued tokens stay valid for the whole run
 * (the server otherwise randomizes them per boot — see CLAUDE.md gotchas).
 */
const SERVER_PORT = 8123;
const WEB_PORT = 5273;
const API_BASE = `http://localhost:${SERVER_PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command: 'npm start',
      cwd: '../server',
      url: `${API_BASE}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(SERVER_PORT),
        LASKA_DB: 'memory',
        LASKA_CLUSTER: 'memory',
        LASKA_ACCESS_SECRET: 'e2e-access-secret',
        LASKA_REFRESH_SECRET: 'e2e-refresh-secret',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: '../web',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_BASE: API_BASE,
      },
    },
  ],
});
