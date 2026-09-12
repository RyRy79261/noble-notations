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

/**
 * D-01 — the one live address of a run.
 *
 * A run that names a recipe belongs under that recipe; a run that names none
 * has no recipe slug to put in that shape and stays at the top level. Both
 * indexes link straight at whichever of the two the run's own address is, so
 * the reader never pays for the redirect in `/batch-logs/[log]`.
 *
 * It lived in `src/app/batch-logs/batch-log-parts.tsx` and the rule was
 * written out again inline in `src/app/sitemap.ts`, which is how a sitemap
 * comes to disagree with the pages it lists. `/search` now links runs too,
 * from a file with no business importing a page component, so the rule
 * moved here — beside the other addresses — and is stated once.
 */
export function batchLogPath(log: {
  slug: string;
  recipe: { slug: string } | null;
}): string {
  return log.recipe
    ? `/recipes/${log.recipe.slug}/batch-logs/${log.slug}`
    : `/batch-logs/${log.slug}`;
}

export const KIND_LABELS: Record<string, string> = {
  recipe: 'Recipe',
  preparation: 'Preparation',
  process: 'Process',
  research: 'Research',
  science: 'Science',
};

/**
 * The same five kinds as nouns, for running prose.
 *
 * `KIND_LABELS` is a label: it sits in a `<select>`, a tag and a table
 * head, where a capitalised singular is right. A sentence needs neither —
 * "Six Recipe mention biltong" — and the plurals are not all `+ s`:
 * `/recipes` already hand-writes "research write-ups" rather than
 * "researches". Kept beside the labels so a sixth kind cannot be given one
 * and not the other.
 */
export const KIND_NOUNS: Record<string, { one: string; many: string }> = {
  recipe: { one: 'recipe', many: 'recipes' },
  preparation: { one: 'preparation', many: 'preparations' },
  process: { one: 'process', many: 'processes' },
  research: { one: 'research write-up', many: 'research write-ups' },
  science: { one: 'science study', many: 'science studies' },
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

/**
 * How much of a summary a card shows, in characters. C-05 of the
 * specification says 160; M4 removed the cut (D-11) and this restores it,
 * on the terms D-11 itself set out.
 *
 * D-11 weighed the cut against the summaries the DESIGN drew, 181 and 245
 * characters, and at that length the cut is the wrong trade. The summaries
 * the repository STORES are a different case: they are multi-paragraph, and
 * the longest is 1,028 characters — four times anything the design drew, and
 * fourteen lines of body text under a 26px title, because a card flattens
 * the paragraphs into one block. A grid of three of those is a wall of prose
 * with the titles lost in it.
 *
 * It is a ceiling and not a target. Nothing is padded up to it, and a
 * summary shorter than it is drawn exactly as written.
 */
export const CARD_SUMMARY = 160;

/**
 * A quarter of the limit, used twice below and meaning the same thing both
 * times: roughly one line of the card's 14px body in a 286px column. It is
 * the smallest piece of text worth treating as a unit.
 */
const CARD_SUMMARY_LINE = CARD_SUMMARY / 4;

/**
 * The card-length reading of a summary. Long text is cut; short text is
 * returned whole.
 *
 * THE CUT LANDS ON A SENTENCE, not on a character count. A card that stops
 * mid-clause reads as damaged, and these summaries are written as whole
 * sentences, so the boundary is free and it is better. It takes as many
 * sentences as fit within `limit` and stops there, appending nothing — the
 * result is a complete sentence, and the ellipsis is a mark the design draws
 * nowhere.
 *
 * TWO CASES CANNOT END ON A SENTENCE, and both fall through to a word cut
 * with an ellipsis: a first sentence long enough to swallow the card on its
 * own, and an opening so short that the sentences which fit add up to less
 * than a line — a three-word lede in front of a hundred-word second sentence
 * would otherwise leave the card almost blank. Outside those two, a whole
 * sentence wins however far short of the limit it stops.
 *
 * TEXT THAT OVERRUNS BY LESS THAN A LINE IS LEFT WHOLE. Trading an ellipsis
 * for fourteen characters is a bad trade: one more line costs the grid less
 * than a mark that says "there is more" about almost nothing. Two of the ten
 * stored summaries are in that band, and the design's own 181-character card
 * is too — so it still draws whole, which is what D-11 was protecting.
 *
 * Paragraph breaks collapse to single spaces, because the card draws one
 * `<p>` and a raw newline renders as a space there anyway.
 *
 * Returns `undefined` for an empty summary, so the card drops the slot
 * instead of drawing an empty paragraph (R-STA-05).
 */
export function cardSummary(
  text: string | null | undefined,
  limit: number = CARD_SUMMARY,
): string | undefined {
  const whole = text?.trim().replace(/\s+/g, ' ');
  if (!whole) return undefined;
  if (whole.length <= limit) return whole;

  /* Every sentence ending that finishes at or before the limit, keeping the
     last one. A closing quote or bracket belongs to the sentence it ends. */
  const endings = /[.!?]['")\]]*(?=\s|$)/g;
  let cut = 0;
  for (let m = endings.exec(whole); m; m = endings.exec(whole)) {
    const end = m.index + m[0].length;
    if (end > limit) break;
    cut = end;
  }
  if (cut >= CARD_SUMMARY_LINE) return whole.slice(0, cut);

  /* No sentence to stop at. An overrun shorter than a line is not worth an
     ellipsis; anything longer is cut on a word. */
  if (whole.length <= limit + CARD_SUMMARY_LINE) return whole;

  const head = whole.slice(0, limit);
  const lastSpace = head.lastIndexOf(' ');
  const word = lastSpace > 0 ? head.slice(0, lastSpace) : head;
  return `${word.replace(/[\s,;:.]+$/, '')}\u2026`;
}

/**
 * `1` → `I`, `4` → `IV`. The ordinal in F/Section label's 40px column.
 *
 * The design numbers every page-level section of a document screen in roman
 * capitals — the aisles of `/ingredients`, the three parts of a batch log,
 * the substitutes and recipes of an ingredient — so the numeral is a
 * function here rather than a literal in each screen. Anything that is not a
 * counting number gets an empty string, and `SectionLabel` then draws no
 * ordinal column at all (R-STA-05).
 */
export function roman(value: number): string {
  if (!Number.isFinite(value) || value < 1) return '';
  const n = Math.floor(value);
  if (n > 3999) return String(n);

  const NUMERALS: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let left = n;
  let out = '';
  for (const [size, glyph] of NUMERALS) {
    while (left >= size) {
      out += glyph;
      left -= size;
    }
  }
  return out;
}

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/**
 * `6` → `six`, `27` → `twenty-seven`, `140` → `140`.
 *
 * Every count the design writes into a section meta or a page kicker is
 * spelled: `SIX INGREDIENTS`, `THIRTY INGREDIENTS · SIX AISLES`,
 * `COMPILED 08 SEP 2026 · TWENTY-SEVEN INGREDIENTS`, `THREE LINES`. The one
 * numeral in all of them is home's `34 TAGS`, and it is the exception rather
 * than the rule the others follow.
 *
 * The words stop at ninety-nine. Past it a hyphenated compound is longer
 * than the row it sits in and reads worse than the figure — the same
 * judgement `revisionOrdinal` makes at twenty.
 *
 * The result is lower case. Every slot that draws it — F/Section label's
 * meta, F/Page head's two slots, F/Stat's label — sets `uppercase` in CSS,
 * so the DOM keeps a string a screen reader can pronounce and a reader can
 * copy. A LEDE IS THE ONE SLOT THAT DOES NOT. Use `Cardinal` there.
 */
export function cardinal(value: number): string {
  if (!Number.isFinite(value) || value < 0) return String(value);
  const n = Math.floor(value);
  if (n < 20) return ONES[n]!;
  if (n > 99) return String(n);
  const tens = TENS[Math.floor(n / 10)]!;
  const unit = n % 10;
  return unit === 0 ? tens : `${tens}-${ONES[unit]!}`;
}

/**
 * `cardinal`, for a count that OPENS A SENTENCE. `11` → `Eleven`.
 *
 * Running prose is the one register in this system that is not uppercased
 * by the slot it sits in, and four screens opened a sentence with the bare
 * lower-case word: `/archive`'s lede read `eleven notes written before there
 * was a catalogue…` where the design draws `Eleven notes written…`
 * (`png/ajY6O.png`), `/search` read `…in their text. five recipes were
 * considered…`, `/list` `…rather than guessed at. one ingredient is held
 * apart…`, and `/science` `…what to do. two long-form studies…`.
 *
 * Only the first letter is touched, so `twenty-seven` becomes
 * `Twenty-seven` and a numeral past ninety-nine is returned unchanged.
 * Leave the mid-sentence and meta uses on `cardinal`.
 */
export function Cardinal(value: number): string {
  const word = cardinal(value);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The ingredient catalogue in the order the design numbers it.
 *
 * `/ingredients` groups by aisle in shop order and numbers the rows `01` to
 * `30` straight down the page, and `/ingredients/[slug]` prints that same
 * number as `INGREDIENT 16` in its kicker and its `ITEM NO.` figure. The two
 * screens have to agree, so the ordering lives here rather than in either of
 * them.
 *
 * Within an aisle the incoming order is kept: `listIngredients` already
 * sorts by how many recipes call for a thing, and re-sorting here would put
 * the index and the shopping list in two different orders.
 */
export function shopOrder<T extends { category: string }>(
  ingredients: readonly T[],
): T[] {
  return ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .sort(
      (a, b) =>
        categoryRank(a.ingredient.category) -
          categoryRank(b.ingredient.category) ||
        a.ingredient.category.localeCompare(b.ingredient.category) ||
        a.index - b.index,
    )
    .map((entry) => entry.ingredient);
}
