import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * tailwind-merge has to be taught this theme.
 *
 * It resolves a conflict by putting each class in a group and keeping the
 * last class of each group. It knows Tailwind's stock groups, not ours.
 * `src/app/theme.css` clears the type, leading, tracking, radius, shadow and
 * blur namespaces and puts the design's own names in their place, so every
 * one of those names is unknown to the stock configuration. Two failures
 * follow, and both are silent:
 *
 *   - A design name that the stock validators do not recognise falls
 *     through to the next group that accepts anything. `text-14` lands in
 *     the *text colour* group, next to `text-ink`, so
 *     `cn('text-14 text-ink-2', 'text-accent')` drops the size.
 *   - A design name in no group at all is passed through untouched, so
 *     `cn('rounded-chip', 'rounded-none')` keeps both and the stylesheet's
 *     source order decides instead of the caller.
 *
 * The lists below are therefore the same lists as `src/app/theme.css`. If
 * you add or rename a token there, change it here in the same commit. There
 * is a note in that file pointing back at this one.
 */

/** `--text-*` in theme.css: the seventeen steps, then the provisional three. */
const FONT_SIZES = [
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '19',
  '21',
  '24',
  '26',
  '40',
  '48',
  '72',
  '09-5',
  '11-5',
  '18',
];

/** `--tracking-*` in theme.css: the six named jobs, then the provisional three. */
const TRACKINGS = [
  'display',
  'title',
  'flat',
  'micro',
  'label',
  'spine',
  'mark-360',
  'head-360',
  'foot',
];

/** `--leading-*` in theme.css. The seven ratios are numeric, which
 *  tailwind-merge already groups; `normal` is a stock name it also knows. */
const LEADINGS = ['100', '105', '115', '130', '150', '170', '180'];

/** `--radius-*` in theme.css. The design has one corner. */
const RADII = ['chip'];

/** `--container-*` in theme.css: the two fixed column widths. */
const CONTAINERS = ['col-narrow', 'col-wide'];

/** `--spacing-*` in theme.css: the three provisional 360 gaps. */
const SPACINGS = ['list-360', 'brand-360', 'section-360'];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      container: CONTAINERS,
      spacing: SPACINGS,
      radius: RADII,
      leading: LEADINGS,
      tracking: TRACKINGS,
    },
    classGroups: {
      'font-size': [{ text: FONT_SIZES }],
    },
  },
});

/**
 * Join class names and let the last conflicting utility win.
 *
 * `clsx` flattens the conditionals; `twMerge` then drops the earlier of two
 * utilities that set the same property, so a caller's `p-0` beats a
 * component's own `p-4` instead of depending on the order Tailwind happened
 * to emit them in. shadcn/ui expects this helper under this name.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
