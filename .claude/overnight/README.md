# Overnight build pipeline (Path A)

An unattended-with-checkpoints harness that advances the Laska backlog while you
sleep. It does **not** run the full build→deploy→market pipeline autonomously —
that isn't reliable today. It automates the one lane that is: **engine / AI /
server changes, taken to a tested, reviewed PR — auto-merged only behind green
CI.** Everything irreversible (deploy, secrets, billing, public posting) is
gated to you.

## Files

- `dispatcher.md` — the planner's charter: pick one eligible task → route to the
  owning subagent → verify → independent review → gate (auto-merge or PR-only) →
  journal. Read this to understand exactly what runs.
- `run-overnight.sh` — the loop: runs the dispatcher up to `MAX_TASKS` times,
  with a kill switch and a per-run journal. Stops on the first failure.
- `journal/` — created on first run; one markdown log per night (auditable trail).
- `STOP` — kill switch (does not exist yet). `touch STOP` to halt; the runner
  checks it before every task and the dispatcher checks it before doing any work.

## The trust anchor: CI

`Laska/.github/workflows/ci.yml` runs engine + server tests, all typechecks, and
the web build **on a clean GitHub runner** — not in the agent's own session.
"Auto-merge behind tests" only means something once a clean machine is the judge.

**One-time setup required for auto-merge to be enforcing:**
1. Commit + push the working tree (see "Blocker" below) and the CI workflow.
2. On GitHub: Settings → Branches → protect `main`, require the `engine`,
   `server`, and `web` checks. Until you do this, the dispatcher safely degrades
   to **PR-only** — it will open PRs but not merge.

## Run it

```sh
# safe first night: cap at one task
MAX_TASKS=1 .claude/overnight/run-overnight.sh

# normal
.claude/overnight/run-overnight.sh        # MAX_TASKS defaults to 3

# halt mid-run
touch .claude/overnight/STOP              # remove it to re-enable
```

Cloud alternative: the gstack `/schedule` skill can run a cron'd cloud agent, but
a cloud run may not have local repo access or your browser/MCP auth — this local
runner is the realistic choice for a repo on your disk.

## Blast radius / gates (what it will and won't do)

| Lane | Behavior |
|---|---|
| engine / AI / server, CI green, reviewer OK | **auto-merge** (squash) |
| web / UI / design | **PR-only** — no web tests, needs your eyes |
| anything reviewer can't clear | **PR-only** |
| deploy, secrets, billing, real-money tournaments | **refused** — stop + journal |

## ⚠️ Blocker to clear before the first real run

The `Laska/` working tree currently has **a large amount of uncommitted work**
(modified `src/` files + many untracked files: `server/`, `BUILD_LOG.md`, docs,
benchmarks). Only the "First MVP" commit is on `origin/main`.

Per-task branches are meaningless on a dirty tree — every branch would carry all
that WIP, and PRs would be unreviewable. **Commit (or stash) the working tree to
a clean baseline first.** The project rule is "don't commit unless asked," so
this is your call — do it manually, or ask and I'll stage it into reviewable
commits. Until the tree is clean, run with `MAX_TASKS=1` and PR-only, and read
the diff before merging anything.

## Honest limits

- **Verify against your Claude Code version**: the `claude -p` flags and
  `--permission-mode` value in `run-overnight.sh` (`claude --help`).
- **Web correctness** isn't tested — typecheck + build is the ceiling. A
  Playwright layer (settings already allow `npx playwright`) is the real fix and
  would let web changes graduate into the auto-merge lane.
- **Self-review is partial** even with an independent reviewer agent; treat
  morning PR review as real work for the first week.
- **Claude Max** covers the agent usage but has rate/weekly caps — a long fleet
  can stall mid-run. `MAX_TASKS` is your cost/blast-radius cap; raise it slowly.
- This is **Path A** (serial). Once you trust it, Path B (parallel fan-out via
  worktrees) raises throughput at higher token cost.
