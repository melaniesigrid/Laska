/**
 * Hook tests for useStreak (vitest + jsdom + Testing Library).
 *
 * useStreak is the glue layer: React state + localStorage persistence + the
 * analytics seam. The streak RULES are unit-tested in streak.test.ts, so this
 * file covers the glue — that a finished match persists, that it is idempotent
 * per calendar day, and that the funnel events actually fire.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// The analytics seam is a side effect, not behaviour under test — stub it and
// assert on the calls. Must be hoisted above the useStreak import.
const track = vi.fn();
vi.mock('./analytics/index.ts', () => ({ track: (...a: unknown[]) => track(...a) }));

import { useStreak } from './useStreak.ts';
import { dayKey, dayKeyOffset } from './streak.ts';

const KEY = 'laska-streak';

function stored(): Record<string, unknown> | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe('useStreak', () => {
  beforeEach(() => {
    track.mockClear();
  });

  test('starts at zero for a brand-new player', () => {
    const { result } = renderHook(() => useStreak());
    expect(result.current.state.current).toBe(0);
    expect(result.current.countedToday).toBe(false);
  });

  test('recording a finished match advances the streak and persists it', () => {
    const { result } = renderHook(() => useStreak());

    act(() => result.current.recordDailyAction());

    expect(result.current.state.current).toBe(1);
    expect(result.current.countedToday).toBe(true);
    expect(stored()).toMatchObject({ current: 1, lastActiveDay: dayKey() });
    expect(track).toHaveBeenCalledWith('streak.advanced', { length: 1 });
  });

  test('a second match the same day does not double-count', () => {
    const { result } = renderHook(() => useStreak());

    act(() => result.current.recordDailyAction());
    track.mockClear();
    act(() => result.current.recordDailyAction());

    expect(result.current.state.current).toBe(1);
    // No second advance event — the day was already counted.
    expect(track).not.toHaveBeenCalledWith('streak.advanced', expect.anything());
  });

  test('continues an existing streak recorded yesterday', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        current: 3,
        longest: 3,
        lastActiveDay: dayKeyOffset(dayKey(), -1),
        freezes: 0,
        freezeProgress: 0,
      }),
    );

    const { result } = renderHook(() => useStreak());
    act(() => result.current.recordDailyAction());

    expect(result.current.state.current).toBe(4);
  });

  test('reconciles a lapsed streak on mount and reports the break', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        current: 9,
        longest: 9,
        lastActiveDay: dayKeyOffset(dayKey(), -30),
        freezes: 0,
        freezeProgress: 0,
      }),
    );

    const { result } = renderHook(() => useStreak());

    expect(result.current.state.current).toBe(0);
    expect(track).toHaveBeenCalledWith('streak.broken', { previousLength: 9 });
  });

  test('a corrupt stored blob degrades to a fresh streak instead of crashing', () => {
    localStorage.setItem(KEY, '{not valid json');
    const { result } = renderHook(() => useStreak());
    expect(result.current.state.current).toBe(0);
  });

  test('a partially-shaped stored blob is coerced field by field', () => {
    localStorage.setItem(KEY, JSON.stringify({ current: 'nope', longest: null }));
    const { result } = renderHook(() => useStreak());
    expect(result.current.state.current).toBe(0);
    expect(result.current.state.longest).toBe(0);
  });
});
