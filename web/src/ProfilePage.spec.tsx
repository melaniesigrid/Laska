/**
 * Component tests for <ProfilePage> (vitest + jsdom + Testing Library).
 *
 * The Profile page is the home of the cosmetics picker — the flagship surface of
 * this PR. These tests cover the contract the page owes App.tsx: each picker
 * reflects the CURRENT selection via aria-checked, and clicking an option calls
 * the matching setter with the right id (App then applies it optimistically and
 * persists via useOnline.saveCosmetics).
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePage, type ProfilePageProps } from './ProfilePage.tsx';

const BOARD_OPTIONS = [
  { id: 'navy', label: 'Navy' },
  { id: 'stone', label: 'Stone' },
  { id: 'twilight', label: 'Twilight' },
];

function setup(over: Partial<ProfilePageProps> = {}) {
  const props: ProfilePageProps = {
    player: { username: 'Mel', rating: 1200, ratedGames: 0, isGuest: false, signedIn: true },
    onBack: vi.fn(),
    onSignIn: vi.fn(),
    mascotTint: 'grape',
    onMascotTint: vi.fn(),
    pieceTheme: 'heirloom',
    onPieceTheme: vi.fn(),
    boardTheme: 'navy',
    boardThemeOptions: BOARD_OPTIONS,
    onBoardTheme: vi.fn(),
    ...over,
  };
  render(<ProfilePage {...props} />);
  return props;
}

describe('ProfilePage cosmetics pickers', () => {
  test('marks the currently-selected mascot tint as checked', () => {
    setup({ mascotTint: 'mint' });
    const group = screen.getByRole('radiogroup', { name: 'Mascot colour' });
    expect(within(group).getByRole('radio', { name: 'Mint' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Grape' })).not.toBeChecked();
  });

  test('picking a mascot colour calls back with that tint', async () => {
    const user = userEvent.setup();
    const props = setup({ mascotTint: 'grape' });
    const group = screen.getByRole('radiogroup', { name: 'Mascot colour' });

    await user.click(within(group).getByRole('radio', { name: 'Sky' }));

    expect(props.onMascotTint).toHaveBeenCalledOnce();
    expect(props.onMascotTint).toHaveBeenCalledWith('sky');
  });

  test('offers every allow-listed mascot tint', () => {
    setup();
    const group = screen.getByRole('radiogroup', { name: 'Mascot colour' });
    const names = within(group)
      .getAllByRole('radio')
      .map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual(['Coral', 'Sun', 'Mint', 'Sky', 'Grape']);
  });

  test('picking a piece style calls back with that theme', async () => {
    const user = userEvent.setup();
    const props = setup({ pieceTheme: 'heirloom' });

    await user.click(screen.getByRole('radio', { name: /Dots/i }));

    expect(props.onPieceTheme).toHaveBeenCalledOnce();
    expect(props.onPieceTheme).toHaveBeenCalledWith('dots');
  });

  test('picking a board palette calls back with that palette id', async () => {
    const user = userEvent.setup();
    const props = setup({ boardTheme: 'navy' });

    await user.click(screen.getByRole('radio', { name: 'Twilight' }));

    expect(props.onBoardTheme).toHaveBeenCalledOnce();
    expect(props.onBoardTheme).toHaveBeenCalledWith('twilight');
  });

  test('renders one swatch per supplied board palette, checking the active one', () => {
    setup({ boardTheme: 'stone' });
    expect(screen.getByRole('radio', { name: 'Stone' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Navy' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Twilight' })).not.toBeChecked();
  });
});

describe('ProfilePage account state', () => {
  test('back button calls onBack', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  test('a signed-out player is offered sign-in', async () => {
    const user = userEvent.setup();
    const props = setup({
      player: { username: 'Guest', rating: 1200, ratedGames: 0, isGuest: true, signedIn: false },
    });

    const signIn = screen.getByRole('button', { name: /Sign in/i });
    await user.click(signIn);

    expect(props.onSignIn).toHaveBeenCalledOnce();
  });

  test('optional streak and achievement regions stay out of the DOM when omitted', () => {
    setup();
    expect(screen.queryByText(/day streak/i)).not.toBeInTheDocument();
  });
});
