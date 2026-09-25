'use client';

import { useEffect, useId, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The theme control, in the page foot. D-16.
 *
 * R-CON-08 said there was no theme control and Q-01 answered "no". The owner
 * asked for one, D-16 records the reversal, and this is it.
 *
 * ── THREE STATES, NOT TWO ────────────────────────────────────────────────
 *
 * System, Light, Dark. A two-state switch cannot express "follow my
 * machine", so the first thing it does to a reader who never wanted a
 * control is take that behaviour away: they click once to see the other
 * theme, and the site stops following their machine for good. The third
 * state is the one most readers should stay in, so it is the default and it
 * is first.
 *
 * "System" is the ABSENCE of `data-theme`, not `data-theme="system"`. A
 * reader who has never touched this control is already in that state, and
 * one state for "no choice" cannot disagree with itself.
 *
 * ── RADIO INPUTS, NOT BUTTONS ────────────────────────────────────────────
 *
 * Three exclusive options is what a radio group is. Native inputs bring the
 * whole keyboard contract — arrow keys move and select, Tab enters and
 * leaves the group once, the screen reader announces "Theme, radio group,
 * Dark, 3 of 3" — and none of it is code that can be got wrong here. A row
 * of `aria-pressed` buttons would be three tab stops and a state that reads
 * as three independent toggles.
 *
 * The inputs are `sr-only` and the label carries the drawn text, so the
 * design's mono row is what is seen and a real control is what is operated.
 * The drawn state comes from React rather than from a `peer-checked:`
 * variant: this component already holds the choice — it has to, to write the
 * attribute and the storage — so a CSS variant would be a second source for
 * the same fact, and the two could disagree while the page was hydrating.
 *
 * ── THE FLASH, AND WHY THE SCRIPT IS IN THE LAYOUT ───────────────────────
 *
 * R-STO-02 says read storage after mount, never during render: the server
 * has no `localStorage` and seeding state from it would mismatch the
 * hydrated markup. That rule is right and it is why this component starts at
 * "system" and corrects itself in an effect.
 *
 * It is also why the ATTRIBUTE is not written here. An effect runs after the
 * first paint, so a reader who chose dark on a light machine would see a
 * white page flash first. The inline script in `src/app/layout.tsx` sets
 * `data-theme` before the first paint; this component only keeps the control
 * in step with it and writes the reader's next choice.
 */

/** The three states, in the order the foot draws them. */
const THEMES = ['system', 'light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/**
 * R-STO-06 and §12: the `nn:` prefix, and a name that says what it holds.
 *
 * The same string is in the inline script in `src/app/layout.tsx`, written
 * out rather than imported: that script is a string in the server's HTML and
 * cannot import anything. `e2e/screen-theme.spec.ts` drives the real control
 * and then reloads, so a key that differed in the two places would fail
 * there rather than in production.
 */
const STORAGE_KEY = 'nn:theme';

function isTheme(value: string | null): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** What the document is set to now, which the inline script decided. */
function readTheme(): Theme {
  const attribute = document.documentElement.getAttribute('data-theme');
  return isTheme(attribute) && attribute !== 'system' ? attribute : 'system';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  try {
    if (theme === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode, or storage blocked. The choice still applies to this
    // page — the attribute is already set — and it is forgotten on the next
    // load. There is nothing to report and nothing the reader can do.
  }
}

export function ThemeToggle() {
  const name = useId();
  const [theme, setTheme] = useState<Theme>('system');

  // R-STO-02. The server renders "system" checked, and this corrects it to
  // whatever the inline script read out of storage. It reads the ATTRIBUTE
  // rather than storage: the script has already resolved the two, so this
  // cannot disagree with what is drawn on the screen.
  useEffect(() => setTheme(readTheme()), []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    /*
     * `data-theme-toggle` is a test hook, not a style.
     *
     * A `fieldset` for the group and a `legend` for its name: the pair is
     * what gives a radio group its accessible name natively, and the legend
     * is `sr-only` because the design's foot has no room for a fourth label
     * and the three words say what they are.
     */
    <fieldset
      data-theme-toggle=""
      className="flex min-w-0 shrink-0 flex-row items-center gap-1.5 border-0 p-0"
    >
      <legend className="sr-only">Theme</legend>
      {THEMES.map((option) => (
        <ThemeOption
          key={option}
          name={name}
          option={option}
          checked={theme === option}
          onChoose={choose}
        />
      ))}
    </fieldset>
  );
}

/**
 * One of the three words.
 *
 * The drawn type is the foot's own — `text-09` mono, `tracking-label`, upper
 * case, `text-ink-3` — so the row reads as a third quiet string beside
 * `CONNECT · SOURCE · LLMS.TXT` rather than as a widget bolted to the
 * bottom of the page.
 *
 * `min-h-6` is the same 24px WCAG 2.5.8 floor `FootLink` takes, with the
 * same negative block margin giving the height back to the row, so adding
 * this control does not move the drawn baseline (G-5).
 */
function ThemeOption({
  name,
  option,
  checked,
  onChoose,
}: {
  name: string;
  option: Theme;
  checked: boolean;
  onChoose: (next: Theme) => void;
}) {
  return (
    /*
     * `data-theme-option` is a test hook, not a style.
     *
     * The input is `sr-only`, which clips it to one pixel under the label,
     * so a click aimed at the INPUT is intercepted by the label every time —
     * Playwright's `.check()` fails on it with a 30-second timeout. That is
     * not a fault: a reader clicks the word, the label activates the input,
     * and a keyboard reader focuses the input itself and uses the arrow
     * keys. Both paths work. The hook lets `e2e/screen-theme.spec.ts` click
     * the thing a person clicks and then assert on the input's own state,
     * which is the pair worth testing.
     */
    <label
      data-theme-option={option}
      className={cn(
        '-my-1.5 inline-flex min-h-6 cursor-pointer items-center align-middle',
        'text-09 leading-normal font-mono tracking-label whitespace-nowrap uppercase',
        'shell:text-09-5 shell:tracking-foot',
        // The checked word is the one in full ink. Colour is not the only
        // signal — the input is a real radio and its state is in the
        // accessibility tree — so R-ACC-10 is met without an extra glyph.
        checked ? 'text-ink underline underline-offset-2' : 'text-ink-3',
        'hover:text-ink',
        // R-ACC-05. The ring is on the label because the input it belongs to
        // is `sr-only`, and a focus ring nobody can see is not one.
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
      )}
    >
      <input
        type="radio"
        name={name}
        value={option}
        checked={checked}
        onChange={() => onChoose(option)}
        className="sr-only"
      />
      {option}
    </label>
  );
}
