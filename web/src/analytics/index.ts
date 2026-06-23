/* Analytics seam — public API.
 *
 * The ONE place the app emits funnel events. Other growth engineers import from
 * here:
 *
 *     import { track } from './analytics/index.ts';
 *     track('puzzle.solved', { puzzleId, attempts });
 *
 * `track` is fully typed: the event name autocompletes from the taxonomy and the
 * props object is checked against that event's payload shape (events.ts). You
 * cannot emit an unknown event or the wrong props — that is the whole point, so
 * the funnel stays joinable across streaks / puzzles / billing.
 *
 * Transport is pluggable and defaults to a no-op/console sink (sink.ts). No
 * vendor SDK or API key is wired in. See sink.ts / identity.ts for the
 * compliance notes (consent gate required before a real off-device sink).
 */

import type { AnalyticsEvent, AnalyticsEventProps } from './events.ts';
import { EVENT_STAGE } from './events.ts';
import { getSink, type AnalyticsEnvelope } from './sink.ts';
import { getAnonId, sessionId, resolveFirstSeen } from './identity.ts';

export type { AnalyticsEvent, AnalyticsEventProps, FunnelStage, MatchMode, PurchaseSurface } from './events.ts';
export { EVENT_STAGE } from './events.ts';
export type { AnalyticsSink, AnalyticsEnvelope } from './sink.ts';
export { setSink, consoleSink } from './sink.ts';
export { getAnonId, resolveFirstSeen } from './identity.ts';

/** Emit a funnel event. Auto-attaches stage, anon/session ids, and a timestamp.
 *  Never throws — instrumentation must not break the app. */
export function track<E extends AnalyticsEvent>(event: E, props: AnalyticsEventProps[E]): void {
  try {
    const envelope: AnalyticsEnvelope<E> = {
      event,
      stage: EVENT_STAGE[event],
      props,
      anonId: getAnonId(),
      sessionId,
      ts: Date.now(),
    };
    getSink().emit(envelope as AnalyticsEnvelope);
  } catch {
    /* analytics must never surface an error into product code */
  }
}

/** Fire the app-open events for this session. Call ONCE at app boot. Emits
 *  `app.loaded` always, plus `app.returned` for a non-first-ever boot (the
 *  D1/D7 retention signal). Idempotent-ish: relies on resolveFirstSeen's
 *  per-session guard, but guard the call site too (e.g. a mount-once effect). */
export function trackAppOpen(): void {
  const { firstEver, daysSinceFirstSeen } = resolveFirstSeen();
  track('app.loaded', { firstEver });
  if (!firstEver) track('app.returned', { daysSinceFirstSeen });
}
