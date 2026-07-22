/* Production analytics wiring.
 *
 * Single place that decides which transport is live. The default sink (sink.ts)
 * is a no-op in prod / console in dev; here we swap in the real Vercel sink, but
 * ONLY in a production build. Dev keeps the existing console behavior — we never
 * silently send events off device while developing.
 *
 * Called once from the app entry (main.tsx), before/around <App /> mount.
 * Idempotent: a second call is a harmless re-set of the same sink.
 */

import { setSink } from './sink.ts';
import { vercelSink } from './vercelSink.ts';

/** Install the production transport in built bundles; leave dev on the console
 *  sink. `import.meta.env.PROD` is true under `vite build`, false under `vite
 *  dev` (the mirror of the DEV guard inside consoleSink). */
export function initProdAnalytics(): void {
  if (import.meta.env.PROD) {
    setSink(vercelSink);
  }
}
