/* Vercel Web Analytics sink — the production transport.
 *
 * Forwards every typed funnel envelope to Vercel's custom-event API
 * (`track(name, props)` from `@vercel/analytics`). Pageview/traffic collection
 * is handled separately by the <Analytics /> component mounted at the app root;
 * this sink only ships the strongly-typed PRODUCT events (match.finished,
 * puzzle.solved, purchase.succeeded, …) so investor dashboards get both traffic
 * AND engagement.
 *
 * COMPLIANCE: Vercel Web Analytics is cookieless and the envelopes are
 * deliberately PII-free (events.ts), so this path needs no consent gate. The
 * anonId/sessionId are random, non-cross-site ids — we still forward them as
 * dimensions so funnels (install → first match → signup → D1/D7 → purchase)
 * stay joinable, but they are not identifiers tied to a person.
 *
 * Install via setSink() from a PRODUCTION-only init path (see prodInit.ts) so
 * dev keeps the console sink and never silently sends events off device.
 */

import { track as vercelTrack } from '@vercel/analytics';
import type { AnalyticsSink, AnalyticsEnvelope } from './sink.ts';

/** Vercel custom-event property values are limited to these primitives; anything
 *  else is dropped/errors on their side, so we coerce the envelope into this. */
type VercelProps = Record<string, string | number | boolean | null>;

/** Flatten an envelope into Vercel-allowed primitive props. The event NAME is
 *  passed separately; here we merge the auto-context (stage / ids / ts) with the
 *  per-event props, coercing any non-primitive value to a string so nothing is
 *  dropped. Booleans/numbers/strings/null pass through untouched. */
function toVercelProps(envelope: AnalyticsEnvelope): VercelProps {
  const out: VercelProps = {
    stage: envelope.stage,
    anonId: envelope.anonId,
    sessionId: envelope.sessionId,
    ts: envelope.ts,
  };
  // Per-event props are a small, low-cardinality, flat record by taxonomy
  // design (events.ts), but coerce defensively so a future nested/odd value
  // never errors Vercel's track().
  for (const [key, value] of Object.entries(envelope.props as Record<string, unknown>)) {
    if (value === null) out[key] = null;
    else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    } else if (value === undefined) {
      // omit — Vercel treats absent the same as not-set; cleaner than "undefined".
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

/** Production sink: forwards typed envelopes to Vercel custom events. Resilient
 *  by contract — never throws into product code (track() also wraps in try/catch,
 *  but we guard here too so a bad envelope can't break the loop). */
export const vercelSink: AnalyticsSink = {
  emit(envelope) {
    try {
      vercelTrack(envelope.event, toVercelProps(envelope));
    } catch {
      /* analytics transport must never surface an error into product code */
    }
  },
};
