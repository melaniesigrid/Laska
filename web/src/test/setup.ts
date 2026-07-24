/**
 * Vitest setup for the component layer (see ../../vitest.config.ts).
 *
 * Adds jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...) and unmounts
 * every rendered tree between tests so a leaked component can't affect the next
 * assertion. jsdom does not implement localStorage the way the app expects in all
 * paths, so we also give each test a clean in-memory store.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  // Fresh storage per test — cosmetics/streak both persist through localStorage.
  const m = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => {
        m.set(k, String(v));
      },
      removeItem: (k: string) => {
        m.delete(k);
      },
      clear: () => m.clear(),
    },
  });
});

afterEach(() => {
  cleanup();
});
