/* Pluggable analytics transport ("sink").
 *
 * The default sink is a NO-OP in production and a console logger in dev. No paid
 * vendor (PostHog/GA/Amplitude/etc.) and no API key is hard-wired here — that is
 * deliberate. The charter requires verifying any SDK/fees against live docs AND
 * gating data collection behind GDPR/CCPA consent before sending anything off
 * device. To wire a real vendor later: implement `AnalyticsSink`, then call
 * `setSink(myVendorSink)` from a consent-gated init path. Keep the default here
 * a no-op so the app never silently exfiltrates events.
 */

import type { AnalyticsEvent, AnalyticsEventProps, FunnelStage } from './events.ts';

/** The fully-formed envelope a sink receives. Auto-context (session/anon ids,
 *  timestamp, stage) is added by `track`; the sink just ships it. */
export interface AnalyticsEnvelope<E extends AnalyticsEvent = AnalyticsEvent> {
  event: E;
  stage: FunnelStage;
  props: AnalyticsEventProps[E];
  /** Random per-device id (localStorage). NOT PII, NOT cross-site stable. */
  anonId: string;
  /** Random per-session id (resets on reload). */
  sessionId: string;
  /** Epoch ms, client clock. */
  ts: number;
}

export interface AnalyticsSink {
  emit(envelope: AnalyticsEnvelope): void;
}

/** Default: log in dev, drop in prod. Never sends data off device. */
export const consoleSink: AnalyticsSink = {
  emit(envelope) {
    // import.meta.env.DEV is true under `vite dev`, false in a built bundle.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', envelope.event, envelope.props);
    }
    // prod: no-op until a consent-gated real sink is installed via setSink().
  },
};

let activeSink: AnalyticsSink = consoleSink;

/** Swap the transport. Call from a CONSENT-GATED init path when wiring a real
 *  vendor. Returns the previous sink so tests can restore it. */
export function setSink(sink: AnalyticsSink): AnalyticsSink {
  const prev = activeSink;
  activeSink = sink;
  return prev;
}

export function getSink(): AnalyticsSink {
  return activeSink;
}
