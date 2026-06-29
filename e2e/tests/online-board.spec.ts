import { test, expect } from '@playwright/test';
import { gotoAuthArea } from './helpers.ts';

test('online players see the board from their own side', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await Promise.all([gotoAuthArea(firstPage), gotoAuthArea(secondPage)]);
    await Promise.all([
      firstPage.getByRole('button', { name: 'Play as guest' }).click(),
      secondPage.getByRole('button', { name: 'Play as guest' }).click(),
    ]);

    await Promise.all([
      firstPage.getByRole('button', { name: 'Play Laska (ranked)' }).click(),
      secondPage.getByRole('button', { name: 'Play Laska (ranked)' }).click(),
    ]);

    const firstBoard = firstPage.locator('.field[data-perspective]');
    const secondBoard = secondPage.locator('.field[data-perspective]');
    await expect(firstBoard).toBeVisible();
    await expect(secondBoard).toBeVisible();

    // Pairing color is intentionally nondeterministic, so assert the two pages
    // collectively received opposite perspectives before checking orientation.
    const boards = [firstBoard, secondBoard];
    const perspectives = await Promise.all(boards.map((board) => board.getAttribute('data-perspective')));
    expect(perspectives.sort()).toEqual(['black', 'white']);

    for (const board of boards) {
      const perspective = await board.getAttribute('data-perspective');
      // A true 180° rotation reverses both axes: row 7's left corner is top-left
      // for White, while row 1's right corner is top-left for Black.
      await expect(board.locator('button').first()).toHaveAttribute(
        'data-square',
        perspective === 'black' ? '3' : '21',
      );
    }
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
