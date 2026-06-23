# Laska E2E — browser flows

Playwright end-to-end tests that drive the **real web UI** (`web/`) against the
**real backend** (`server/`). Playwright boots both for you:

- the server on `:8123` with an **in-memory** store + cluster (your checked-in
  `laska.db` is never touched, every run starts clean), with fixed auth secrets
  so tokens stay valid for the whole run;
- the Vite app on `:5273`, pointed at that server via `VITE_API_BASE`.

## Setup (once)

```bash
cd e2e
npm install
npm run install:browsers   # downloads Chromium for Playwright
```

(The engine, web, and server packages must each have had `npm install` run —
see the repo CLAUDE.md.)

## Run

```bash
npm test            # headless
npm run test:headed # watch it in a real browser
npm run test:ui     # Playwright's interactive UI runner
npm run report      # open the HTML report from the last run
```

Run a single file or test:

```bash
npx playwright test tests/auth.spec.ts
npx playwright test -g "survives a full page reload"
```

## What's covered

`tests/auth.spec.ts`:

- Reaching the auth panel from the landing page → Online tab.
- Sign-in ⇄ Create-account toggle swaps the form.
- Guest play (`Play as guest`) → guest identity at the 1200 starting rating.
- Registration: success, weak password, malformed email, duplicate email.
- Login: register → sign out → sign back in; wrong password; non-existent
  account (same generic message — no account enumeration).
- Session lifecycle: survives a full reload (refresh-token restore); sign-out
  clears the session and it stays cleared after reload.

`tests/online-board.spec.ts`:

- Two guest clients match through the real WebSocket server.
- White and Black receive opposite board perspectives.
- Black's board is rotated 180°, with both axes reversed.

## Running from VS Code

These are Playwright tests — they must run **through Playwright**, not as plain
files. Use one of:

- The **Playwright Test extension** (`ms-playwright.playwright`): click the green
  triangle next to a `test(...)` / `test.describe(...)`, or use the **Testing**
  panel (flask icon). These boot the backend + Vite app automatically.
- **Run and Debug → "Run Laska E2E (Playwright)"** (see `.vscode/launch.json` at
  the repo root) for the whole suite, or "…current spec" for the open file.

Do **not** use the generic top-right ▶ / `F5` on the spec file — that runs it as
a Node script and fails with
`Playwright Test did not expect test.describe() to be called here`.

## Notes

- Ports `8123`/`5273` are dedicated to the test run. If they collide with
  something local, change `SERVER_PORT` / `WEB_PORT` in `playwright.config.ts`.
- The in-memory store persists for the duration of a run, so tests mint unique
  emails/usernames (`helpers.ts → uniqueCreds`) and stay independent.
- Selectors lean on roles and visible text, matching the real `Online.tsx`
  markup — if the auth UI copy changes, update `helpers.ts` in one place.
