/**
 * Board coordinate labels (files a–g / ranks 1–7) are a global display
 * preference, on by default. Every board surface — local game, online, tutorial,
 * replay — reads the same value through `useCoords()`, and the topbar toggle
 * flips it, so there is no prop to thread through every page.
 *
 * Backed by a module-level store + `useSyncExternalStore` (the app has no state
 * library) and persisted to `localStorage` under the existing `laska-…`
 * convention (cf. `laska-theme`, `laska-piece-theme`).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'laska-coords';

function read(): boolean {
  try {
    // Default ON: only an explicit 'off' hides the labels.
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getCoords(): boolean {
  return current;
}

export function setCoords(on: boolean): void {
  if (on === current) return;
  current = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* preference simply isn't persisted */
  }
  listeners.forEach((l) => l());
}

export function toggleCoords(): void {
  setCoords(!current);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to the coordinate preference; re-renders on toggle. */
export function useCoords(): boolean {
  return useSyncExternalStore(subscribe, getCoords, getCoords);
}
