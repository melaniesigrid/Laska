# Laska engineering org — subagents

Each file here is one "engineer": a charter + the files it owns + its verify loop + hard guardrails. Invoke one with the Agent tool (`subagent_type: <name>`) or just describe the task — the descriptions route automatically.

| Subagent | Owns | Why it exists |
|---|---|---|
| `engine-engineer` | `Laska/src/`, `Laska/test/rules.test.ts` | The rules constitution. Sacred, test-gated, must keep Lasker's games replaying. |
| `game-ai-engineer` | `Laska/src/ai.ts`, `Laska/bench-baseline.ts` | The opponent. Flagship job: benchmark + tune AI strength (roadmap-flagged as undone). |
| `frontend-board-engineer` | `Laska/web/src/Board.tsx`, `App.tsx`, online UX | What the player touches. Verified in a real browser (no web unit tests). |
| `tutorial-content-engineer` | new `TutorialBoard` + lesson data, `Laska/TUTORIAL.md` | **Highest-ROI lever**: the interactive tutorial + paid courses. |
| `backend-realtime-engineer` | `Laska/server/src/net/`, `game/`, `auth/`, `rating/` | Online-play integrity. Server validates every move. |
| `infra-platform-engineer` | `Laska/server/src/storage/`, `cluster/`, CI | Production hardening: migrations, failover, Redis-in-CI. |
| `heritage-archivist-engineer` | `Laska/web/src/games.ts`, `ReplayPage`, `BrochurePage`, `LaskerPage` | The moat: transcribe + engine-validate historic games. |
| `growth-monetization-engineer` | streaks/puzzles/billing/analytics | Retention + revenue. **Hard gate: no real-money tournaments.** |
| `seo-discoverability-engineer` | `Laska/web/index.html` head, `Laska/web/public/`, `Laska/web/src/seo/`, `Laska/vercel.json` | Organic discoverability: crawlable URLs, meta/OG, JSON-LD, sitemap. Flagship fix: the SPA has no per-page URLs. |
| `puzzle-generator-engineer` | `Laska/web/src/puzzles/`, `Laska/PUZZLES.md` | Daily tactical puzzle: mine forcing moments from finished games, **engine-verify** the best move, surface a deterministic puzzle-of-the-day. Consumes engine + historic games read-only. |
| `opening-book-curator-engineer` | `Laska/web/src/openings.ts`, `openingsData.ts`, `OpeningsPage.tsx`, `Laska/OPENINGS.md` | Opening theory/repertoire: Lasker's named openings + lines as **engine-validated** data and a read-only study page. Distinct from historic GAMES (heritage) and interactive LESSONS (tutorial). |
| `i18n-localization-engineer` | `Laska/web/src/i18n/` (catalogs, provider, `useTranslation`, `keys.ts`), `Laska/I18N.md` | Translation infra + locale content the SEO re-arch deferred. Owns NEW i18n files only; consumes router/SEO head read-only (no `seo/`, `index.html`, `vercel.json`, `App.tsx`). |
| `charter-smith` *(meta)* | `.claude/agents/TEMPLATE.txt`, `validate-charter.mjs`, `README.md`, new `*-engineer.md` | The meta-engineer that staffs the org: drafts new charters and gates them. Drafts only — humans promote + grant trust. See "Adding a new engineer" below. |

## Adding a new engineer (the charter factory)
New domain that needs an owner? Don't hand-write a charter — staff it with the meta-agent.

- **`charter-smith`** — the meta-engineer that staffs the org. Reads the current roster, fills `TEMPLATE.txt` in the house voice, chooses owned files disjoint from every existing engineer, and runs the gate. It *drafts only*: a human promotes the charter into the live roster and grants trust (drafting is reversible, trust is not). Recursion is capped at one level — it staffs *workers*, never another meta-agent.
- **`validate-charter.mjs`** — the deterministic gate, an exit code rather than a judgment call. Enforces one-owner-per-file ownership disjointness, unique names, required sections, and real verify-loop commands.
  - `node .claude/agents/validate-charter.mjs <path>` — gate one new charter (must exit 0).
  - `node .claude/agents/validate-charter.mjs --roster` — regression-check the whole org stays green.
- **`TEMPLATE.txt`** — the fill-in charter every worker is built from. Kept as `.txt` so the agent loader can't register the template itself as a phantom engineer.

## Reused gstack skills (not duplicated here)
- **Design / neumorphism review** → `/design-review`, scoped by reading `Laska/DESIGN.md`.
- **QA / release gate** → `/qa` and `/ship`, run against the Definition of Done in `Laska/CLAUDE.md`.

## Shared DNA (every subagent honors)
- `src/` is the ONE rules engine — `web/` and `server/` import it; never fork game logic.
- Imports include the file extension; named exports only; `lucide-react` icons only (no emoji).
- Verify loops come straight from `Laska/CLAUDE.md` → "Golden-Path Examples" and "Definition of Done."
- **Branch + PR, never `main`.** Multiple agents and the user work this repo in parallel. Each agent works on its own feature branch (`<role>/<short-task>`), scopes edits to its owned files, and integrates via PR (`/ship`). For known hot-spots (notably `src/ai.ts`), prefer worktree isolation; rebase before verifying. A red test you didn't cause is another agent's in-flight work — flag it, don't fix outside your lane. (See notebook finding B3.)

## Cross-org decisions
- **D-001 — Eval-term strength gate (2026-06-23).** A new evaluation term in `src/ai.ts` ships at **weight 0** until `game-ai-engineer`'s self-play A/B proves it improves play (not just passes a unit test). The term *logic/idea* is the STRATEGY workstream's lane; the *default weight that ships* is `game-ai-engineer`'s. Resolves the ownership overlap between STRATEGY-driven eval terms and AI weight-tuning. Origin: notebook EXP-003 (terms that passed tests but weakened the intermediate tier). See `game-ai-engineer.md` → "The strength gate."

- **D-002 — One arena; `src/agents/` is the canonical AI-research substrate (2026-06-23).** A parallel workstream built `src/agents/` (typed pluggable AIs + quiescence + MCTS + a `roundRobin` arena), duplicating `bench-strength.ts`. Going forward `src/agents/arena.ts` is canonical; `bench-strength.ts` is legacy (retire after EXP-004). New AI comparisons build on `src/agents/`; agents must check `src/agents/index.ts` before building a new benchmark. Open question to the user: is `src/agents/` the intended future *production* engine, or a sandbox? Origin: notebook recon R-001 / findings A6, B5.

## Priority to staff first
Tutorial → Game-AI benchmark → Infra hardening (the three the roadmap calls highest-leverage and least-done).
