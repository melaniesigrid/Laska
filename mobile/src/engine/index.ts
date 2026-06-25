/**
 * Thin re-export of the SHARED rules engine. The engine lives at ../../src and
 * is bundled directly (Metro watchFolders, see metro.config.js) — this file just
 * gives the mobile app a stable `@/engine` import surface and a single place to
 * adapt if the shared path ever moves.
 *
 * The engine is pure and DOM-free (see ../../src/index.ts header), so it runs
 * unchanged on device.
 */
export * from '../../../src/index.ts';
