#!/usr/bin/env bash
#
# Overnight build runner for Laska — Path A (serial, one task per iteration).
#
# Runs the Dispatcher (dispatcher.md) headless, up to MAX_TASKS times, with a
# kill switch, a per-run journal, and a hard stop on any failure. Designed to be
# safe to leave running while you sleep: smallest blast radius, fully auditable.
#
# ── BEFORE FIRST USE, VERIFY (these vary by Claude Code version) ──────────────
#   1. The `claude` headless invocation below. Check `claude --help`:
#        - `-p/--print` for non-interactive, `--append-system-prompt` / prompt file,
#          and the permission flag your version uses for unattended runs.
#   2. That branch protection on `main` requires the CI checks (else auto-merge
#      in the dispatcher degrades to PR-only — which is the safe default anyway).
#   3. That the working tree in Laska/ is COMMITTED/clean before you start
#      (see README — a dirty tree makes per-task branches meaningless).
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$HARNESS_DIR/../.." && pwd)"   # .../aiprojects/laska
CODE_REPO="$PROJECT_ROOT/Laska"

MAX_TASKS="${MAX_TASKS:-3}"          # hard cap on tasks per night (cost/blast-radius)
STOP_FILE="$HARNESS_DIR/STOP"        # kill switch: `touch` this to halt
RUN_ID="$(date +%Y%m%d-%H%M%S)"
JOURNAL_DIR="$HARNESS_DIR/journal"
JOURNAL="$JOURNAL_DIR/run-$RUN_ID.md"
DISPATCHER="$HARNESS_DIR/dispatcher.md"

mkdir -p "$JOURNAL_DIR"
echo "# Overnight run $RUN_ID" > "$JOURNAL"
echo "- code repo: $CODE_REPO" >> "$JOURNAL"
echo "- max tasks: $MAX_TASKS" >> "$JOURNAL"
echo "" >> "$JOURNAL"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$JOURNAL"; }

# --- preflight ----------------------------------------------------------------
if [[ -f "$STOP_FILE" ]]; then
  log "STOP file present at start — refusing to run. Remove it to enable."
  exit 0
fi
if ! command -v claude >/dev/null 2>&1; then
  log "FATAL: 'claude' CLI not found on PATH."
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  log "FATAL: 'gh' CLI not found — dispatcher needs it to open/merge PRs."
  exit 1
fi

log "Starting overnight run (up to $MAX_TASKS tasks)."

for (( i=1; i<=MAX_TASKS; i++ )); do
  if [[ -f "$STOP_FILE" ]]; then
    log "STOP file detected — halting before task $i."
    break
  fi

  log "── Task $i/$MAX_TASKS ──"

  # The dispatcher does exactly ONE task and exits (it never loops internally).
  # JOURNAL is exported so the dispatcher appends its structured entry to it.
  #
  # VERIFY these flags against your `claude --help` before trusting unattended:
  #   -p                         : headless / print mode (no interactive UI)
  #   --permission-mode <mode>   : pre-authorize the allowlisted tools so the run
  #                                doesn't block on prompts at 3am. Use the most
  #                                RESTRICTIVE mode that still lets the allowlist
  #                                in .claude/settings.json through.
  JOURNAL="$JOURNAL" \
  claude -p "Read and follow $DISPATCHER. Do exactly one task, then stop. The run journal to append to is at: $JOURNAL" \
    --permission-mode acceptEdits \
    >> "$JOURNAL" 2>&1
  rc=$?

  if [[ $rc -ne 0 ]]; then
    log "Task $i exited non-zero ($rc) — stopping the run for safety."
    break
  fi
  log "Task $i finished."
done

log "Overnight run complete. Journal: $JOURNAL"
echo ""
echo "Morning review: open PRs ->  gh pr list -R melaniesigrid/Laska"
echo "Journal:        $JOURNAL"
