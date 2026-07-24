/**
 * Vitest config for the React component layer.
 *
 * Two test runners live side by side in web/, split by filename on purpose:
 *
 *   *.test.ts   pure logic (streak.ts, cosmetics.ts) — Node's built-in runner,
 *               no DOM, no deps:  node --test src/streak.test.ts
 *   *.spec.tsx  component/hook tests — vitest + jsdom + Testing Library:
 *               npm test
 *
 * `include` below is deliberately narrow so vitest never picks up the node:test
 * files (they import from 'node:test', which vitest does not provide).
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.spec.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
