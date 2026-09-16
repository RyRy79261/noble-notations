import { test, expect } from '@playwright/test';

/**
 * The theme control. D-16.
 *
 * R-CON-08 said there was no control and Q-01 answered "no". The owner
 * reversed that, so the foot carries three words — SYSTEM, LIGHT, DARK — and
 * these are the four properties that make it a control rather than a
 * decoration:
 *
 *   1. The default is the system's, and choosing nothing changes nothing.
 *      This is the one that protects every reader who never wanted a control.
 *   2. A choice beats the system preference. Without this the control is a
 *      no-op for exactly the reader who reached for it.
 *   3. A choice survives a reload, and it is applied BEFORE the first paint.
 *      An effect-only implementation passes 1 and 2 and still flashes the
 *      wrong theme on every navigation, which is what the reader notices.
 *   4. It is a real radio group. The keyboard and the screen reader get the
 *      control, not just the mouse.
 *
 * The assertions read `color-scheme` on `<html>` rather than a painted
 * colour. That is the property the whole mechanism turns on: every token is
 * one `light-dark()` and `color-scheme` picks the half that is drawn, so if
 * this is right the palette is right, and a colour assertion would be
 * asserting `light-dark()` on the browser's behalf.
 */

/**
 * Click one of the three words.
 *
 * The WORD, not the input. Each input is `sr-only` — clipped to one pixel
 * under its label — so a click aimed at the input is intercepted by the
 * label and `.check()` times out. That is the correct shape for the control
 * (a reader clicks the word; a keyboard reader focuses the input and uses
 * the arrow keys, which the test below drives), and it means a test that
 * wants to act like a reader clicks the label and then asserts on the
 * input's own checked state.
 */
function choose(page: import('@playwright/test').Page, option: string) {
  return page.locator(`[data-theme-option="${option}"]`).first().click();
}

function scheme(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).colorScheme.trim(),
  );
}

function stored(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    try {
      return window.localStorage.getItem('nn:theme');
    } catch {
      return 'STORAGE THREW';
    }
  });
}

test.describe('the theme control', () => {
  test('a reader who does not touch it follows the system', async ({
    page,
  }) => {
    // The property that protects everyone who never wanted a control: with
    // no choice stored, `color-scheme` is the two-value form and the
    // browser's own preference decides. Nothing is written to storage by
    // simply arriving.
    await page.goto('/');

    expect(await scheme(page)).toBe('light dark');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await stored(page)).toBeNull();

    // And the control says so. SYSTEM is the checked one on arrival.
    const group = page.locator('[data-theme-toggle]').first();
    await expect(group.getByRole('radio', { name: /system/i })).toBeChecked();
  });

  test('the system preference still decides which palette is drawn', async ({
    browser,
  }) => {
    // R-CON-07 is unchanged by D-16. Two contexts, two preferences, no
    // choice made in either: the reader gets what their machine says.
    for (const [preference, expected] of [
      ['dark', 'dark'],
      ['light', 'light'],
    ] as const) {
      const context = await browser.newContext({ colorScheme: preference });
      const page = await context.newPage();
      await page.goto('/');
      expect(
        await scheme(page),
        `a ${preference} machine with no choice made`,
      ).toBe('light dark');
      // The two-value form resolves to the machine's preference, which is
      // what `light-dark()` then reads.
      expect(
        await page.evaluate(
          () => matchMedia('(prefers-color-scheme: dark)').matches,
        ),
      ).toBe(expected === 'dark');
      await context.close();
    }
  });

  test('a choice beats the system preference', async ({ browser }) => {
    // The reader is on a dark machine and asks for light. This is the whole
    // point of the control, and it is the assertion that fails if the
    // `[data-theme]` rules ever stop beating the default.
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/');

    expect(await scheme(page)).toBe('light dark');

    await choose(page, 'light');

    await expect(
      page
        .locator('[data-theme-toggle]')
        .first()
        .getByRole('radio', {
          name: /^light$/i,
        }),
      'clicking the word did not check its input',
    ).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await scheme(page)).toBe('light');

    await context.close();
  });

  test('a choice survives a reload, and arrives before the first paint', async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/');

    await choose(page, 'dark');
    expect(await stored(page)).toBe('dark');

    /*
     * THE PRE-PAINT ASSERTION, AND WHY IT IS SHAPED LIKE THIS.
     *
     * `domcontentloaded` is the earliest point a test can read the DOM, and
     * it is already past the inline script in `src/app/layout.tsx` — the
     * script is the first element in the body and it runs while the document
     * parses. It is NOT past an effect: React has not hydrated at
     * `domcontentloaded`. So an implementation that set the attribute in a
     * `useEffect` fails here, which is exactly the flash this is defending
     * against.
     */
    await page.goto('/list', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await scheme(page)).toBe('dark');

    // And the control agrees with the document once it has hydrated.
    await expect(
      page
        .locator('[data-theme-toggle]')
        .first()
        .getByRole('radio', { name: /^dark$/i }),
    ).toBeChecked();

    await context.close();
  });

  test('going back to system forgets the choice', async ({ page }) => {
    // "System" is the ABSENCE of the attribute, not `data-theme="system"`,
    // and it clears storage rather than storing the word. A reader who
    // returns to the default must end up in the state they started in, or
    // the two ways of being in it can disagree.
    await page.goto('/');

    await choose(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await choose(page, 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await stored(page)).toBeNull();
    expect(await scheme(page)).toBe('light dark');
  });

  test('it is a named radio group, and the keyboard operates it', async ({
    page,
  }) => {
    // R-ACC. Three exclusive options is a radio group, and the native
    // control is what makes the arrow keys and the announcement work
    // without a line of key handling here.
    await page.goto('/');
    const group = page.getByRole('group', { name: /theme/i }).first();
    await expect(group).toBeVisible();

    const radios = group.getByRole('radio');
    await expect(radios).toHaveCount(3);

    // Arrow keys move the selection, which is the contract a row of
    // `aria-pressed` buttons would not have.
    await group.getByRole('radio', { name: /^system$/i }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: /^light$/i })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the control is in the page foot, on the 404 as well', async ({
    page,
  }) => {
    // The 404 renders its own `PageFoot` — the `@foot` slot does not reach
    // it — so it is the one screen where the foot can lose something and
    // nothing else would say so.
    const response = await page.goto('/no-such-address-at-all');
    expect(response?.status()).toBe(404);

    const foot = page.locator('[data-page-foot]');
    await expect(foot).toBeVisible();
    await expect(foot.locator('[data-theme-toggle]')).toBeVisible();
  });
});
