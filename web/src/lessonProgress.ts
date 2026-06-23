/**
 * Tutorial/lesson progress, persisted to `localStorage`.
 *
 * Follows the existing `laska-…` key convention (cf. `laska-theme`,
 * `laska-piece-theme`, `laska-rule-variant`). Shape is a flat map of
 * lessonId → true for completed lessons:
 *   localStorage["laska-lessons-completed"] = '{"one-handed-attack":true}'
 *
 * Account-backed progress is a later phase (see TUTORIAL.md); for now this is the
 * single source of truth for which lessons a player has finished. All reads/writes
 * are wrapped in try/catch so private-mode / disabled storage degrades to a
 * no-op rather than crashing the app.
 */

export type CompletedLessons = Record<string, boolean>;

const KEY = 'laska-lessons-completed';

/** Read the set of completed lessons. Returns {} if unset or unreadable. */
export function readCompletedLessons(): CompletedLessons {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Keep only `true` flags, coercing any stray values defensively.
      const out: CompletedLessons = {};
      for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v === true) out[id] = true;
      }
      return out;
    }
  } catch {
    /* ignore — treat as no progress */
  }
  return {};
}

/** Mark one lesson complete and persist. Returns the updated map (never throws). */
export function markLessonComplete(id: string): CompletedLessons {
  const next = { ...readCompletedLessons(), [id]: true };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore — still return the in-memory map so the UI reflects the change */
  }
  return next;
}

/** True if `id` is recorded as complete. */
export function isLessonComplete(id: string): boolean {
  return readCompletedLessons()[id] === true;
}
