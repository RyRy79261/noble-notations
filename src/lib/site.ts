/**
 * Site-wide constants. Metadata, sitemap, robots and the Open Graph images
 * all read from here so the description on the card matches the description
 * in the <head>.
 */
export const site = {
  name: 'Noble Notations',
  tagline: 'A cooking data repository',
  description:
    'A structured repository of recipes, ingredients, techniques and batch ' +
    'logs. Every recipe is versioned: it gets refined across revisions ' +
    'instead of being re-derived from scratch.',
  // `?? ` alone is not enough: an environment that defines the variable
  // and leaves it empty would set the site URL to '', and `new URL('')`
  // in the root layout fails the whole build.
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') ||
    'https://noble-notations.ryanjnoble.dev',
  repository: 'https://github.com/RyRy79261/noble-notations',
  // The design stamps a document issue in the left slot of the page foot on
  // every screen that has no effectivity of its own — `/connect`,
  // `/sign-in`, `/connect/done` and the 404 all read this string. It is the
  // issue of the document, not today's date, so it is a constant and it
  // changes when the document is reissued. See D-07.
  issue: 'Issue 01 · 08 Sep 2026',
  author: 'Ryan Noble',
  locale: 'en',
} as const;

export const CATEGORY_TYPE_LABELS: Record<string, string> = {
  cuisine: 'Cuisine',
  course: 'Course',
  technique: 'Technique',
  diet: 'Diet',
  season: 'Season',
  equipment: 'Equipment',
  occasion: 'Occasion',
  preservation: 'Preservation',
  texture: 'Texture',
  ingredient_class: 'Ingredient class',
};

/**
 * Ingredient categories, in the order a shop is walked rather than
 * alphabetically: fresh things first, cupboard staples last. A shopping
 * list sorted A–Z sends you back and forth across the shop.
 */
export const CATEGORY_ORDER = [
  'produce',
  'protein',
  'dairy',
  'fungus',
  'herb',
  'grain',
  'legume',
  'spice',
  'condiment',
  'fat',
  'acid',
  'sweetener',
  'liquid',
  'alcohol',
  'additive',
  'other',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  protein: 'Meat & protein',
  dairy: 'Dairy',
  fungus: 'Mushrooms',
  herb: 'Fresh herbs',
  grain: 'Grains & flour',
  legume: 'Legumes',
  spice: 'Spices',
  condiment: 'Sauces & condiments',
  fat: 'Fats & oils',
  acid: 'Vinegars & acids',
  sweetener: 'Sweeteners',
  liquid: 'Liquids',
  alcohol: 'Alcohol',
  additive: 'Additives',
  other: 'Other',
};

/** Sort key for a category; unknown categories sort last, then A–Z. */
export function categoryRank(category: string): number {
  const index = (CATEGORY_ORDER as readonly string[]).indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export const KIND_LABELS: Record<string, string> = {
  recipe: 'Recipe',
  preparation: 'Preparation',
  process: 'Process',
  research: 'Research',
  science: 'Science',
};

export const NOTE_KIND_LABELS: Record<string, string> = {
  observation: 'Observation',
  research: 'Research',
  substitution: 'Substitution',
  warning: 'Warning',
  result: 'Result',
  idea: 'Idea',
  correction: 'Correction',
  // The eighth kind of §9.2 and R-CMP-06. `noteKindLabel` in
  // `src/components/f/mark.tsx` used to reach it only through its raw-key
  // fallback, which happened to render the right string and would have
  // stopped the moment the label wanted different wording.
  science: 'Science',
};

/**
 * The ordinals the design writes out. `SIXTH REVISION` is the second segment
 * of F/Recipe card's `Code` (`design/exports/home-recipes-1280.html:439`) and
 * `Sixth revision` is F/Revision's `Ordinal`
 * (`design/exports/recipe-revision-1280.html:3368`). One string, two slots —
 * so one function, here, rather than a copy in each component.
 *
 * Twenty is well past any recipe in the repository; the deepest today is six.
 * Past it the words stop and a numeral with its own suffix takes over:
 * "twenty-seventh revision" is a worse label than "27th revision" at 9px in a
 * 130px slot, and the numeral still reads as an ordinal.
 */
const REVISION_ORDINALS = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
  'Eleventh',
  'Twelfth',
  'Thirteenth',
  'Fourteenth',
  'Fifteenth',
  'Sixteenth',
  'Seventeenth',
  'Eighteenth',
  'Nineteenth',
  'Twentieth',
];

/**
 * `6` → `Sixth revision`; `21` → `21st revision`.
 *
 * Returns `undefined` rather than a string for a number that is not a
 * revision — a non-finite value, or anything below one. R-STA-05: the slot is
 * then dropped, not filled with `Revision 0`.
 */
export function revisionOrdinal(revisionNumber: number): string | undefined {
  if (!Number.isFinite(revisionNumber) || revisionNumber < 1) return undefined;
  const n = Math.floor(revisionNumber);
  const word = REVISION_ORDINALS[n - 1];
  if (word) return `${word} revision`;
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix} revision`;
}
