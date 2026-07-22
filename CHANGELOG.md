# Changelog

All notable changes to Laska are recorded here. Versions use a four-part
`MAJOR.MINOR.PATCH.MICRO` scheme tracked in the `VERSION` file. Dates are UTC.

## [1.1.0.0] - 2026-07-22

### Added
- **Profile page** — a neumorphic identity hub with your mascot, rank, rating,
  win rate, and recent games.
- **Choose your look** — pick a mascot colour (coral, sun, mint, sky, grape),
  a piece style (Heirloom, Lineage, Crown, Dots), and a board palette. When you
  are signed in, your choices follow your account to any device; as a guest they
  are remembered on the device.
- **Daily streak** — a finished match each day builds a streak, with banked
  "freezes" that forgive the occasional missed day. Shown as a top-bar pill.
- **Web test suite** — the web app gained a real test runner (vitest + jsdom +
  Testing Library for components, Node's runner for pure logic), replacing
  typecheck-only verification.

### Changed
- Accounts now store cosmetic preferences; the login/guest/restore payload
  carries them so your look is applied the moment you sign in.

### Fixed
- Picking the **Crown** piece style no longer silently fails to save for
  signed-in players (the server rejected a style the app offered). A parity test
  now keeps the client and server option lists from drifting apart.
- Rapidly switching cosmetics can no longer revert your pick: saves are
  sequenced so a slow earlier response can't overwrite a newer choice.
- A cosmetic that fails to save is no longer swallowed silently — the failure is
  now reported to analytics instead of looking identical to success.
