/**
 * Component tests for <StreakIndicator> (vitest + jsdom + Testing Library).
 *
 * Run with `npm test` from web/. Pure streak RULES are covered by streak.test.ts
 * under Node's runner; this file covers what the player actually SEES: when the
 * pill hides itself, how it pluralises, the dim "not yet today" state, and the
 * accessible label a screen reader announces.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakIndicator } from './StreakIndicator.tsx';
import type { StreakState } from './streak.ts';

function state(over: Partial<StreakState> = {}): StreakState {
  return {
    current: 0,
    longest: 0,
    lastActiveDay: null,
    freezes: 0,
    freezeProgress: 0,
    ...over,
  };
}

describe('StreakIndicator', () => {
  test('renders nothing before the player has any streak or freezes', () => {
    const { container } = render(
      <StreakIndicator state={state({ current: 0, freezes: 0 })} countedToday={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('still renders when the streak is 0 but freezes are banked', () => {
    render(<StreakIndicator state={state({ current: 0, freezes: 2 })} countedToday={false} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('shows the current streak count', () => {
    render(<StreakIndicator state={state({ current: 7 })} countedToday />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  test('pluralises the accessible label: 1 day vs N days', () => {
    const { unmount } = render(<StreakIndicator state={state({ current: 1 })} countedToday />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Daily streak: 1 day.'),
    );
    unmount();

    render(<StreakIndicator state={state({ current: 4 })} countedToday />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Daily streak: 4 days.'),
    );
  });

  test('announces banked freezes, and pluralises them too', () => {
    const { unmount } = render(
      <StreakIndicator state={state({ current: 3, freezes: 1 })} countedToday />,
    );
    expect(screen.getByRole('status').getAttribute('aria-label')).toContain('1 streak freeze banked.');
    unmount();

    render(<StreakIndicator state={state({ current: 3, freezes: 2 })} countedToday />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toContain('2 streak freezes banked.');
  });

  test('omits the freeze mention entirely when none are banked', () => {
    render(<StreakIndicator state={state({ current: 3, freezes: 0 })} countedToday />);
    expect(screen.getByRole('status').getAttribute('aria-label')).not.toContain('freeze');
  });

  test('dims and nudges when the streak is alive but today is not logged yet', () => {
    render(<StreakIndicator state={state({ current: 5 })} countedToday={false} />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('streak-dim');
    expect(pill.getAttribute('aria-label')).toContain('Play a match today to keep it.');
    expect(pill).toHaveAttribute('title', 'Finish a match today to extend your streak');
  });

  test('is not dimmed once today has been counted', () => {
    render(<StreakIndicator state={state({ current: 5 })} countedToday />);
    const pill = screen.getByRole('status');
    expect(pill.className).not.toContain('streak-dim');
    expect(pill.getAttribute('aria-label')).not.toContain('Play a match today');
    expect(pill).toHaveAttribute('title', 'Your daily streak');
  });
});
