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
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
    'https://noble-notations.ryanjnoble.dev',
  repository: 'https://github.com/RyRy79261/noble-notations',
  author: 'Ryan Noble',
  locale: 'en',
} as const;

export const FACET_LABELS: Record<string, string> = {
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
};
