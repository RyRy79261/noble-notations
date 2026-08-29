/**
 * Unit handling.
 *
 * The repository is weight-first: the biltong logs are all grams, and grams
 * are the only way to compare a spice ratio across batches of different size.
 * Volume and count units are preserved as written, but anything that can be
 * expressed in grams also carries a gram value so ratios stay computable.
 */

export type UnitKind =
  'mass' | 'volume' | 'count' | 'length' | 'time' | 'other';

interface UnitDef {
  canonical: string;
  kind: UnitKind;
  /** Multiplier to the kind's base unit: grams for mass, ml for volume. */
  toBase: number;
  aliases: string[];
}

const UNITS: UnitDef[] = [
  {
    canonical: 'g',
    kind: 'mass',
    toBase: 1,
    aliases: ['g', 'gram', 'grams', 'gr'],
  },
  {
    canonical: 'kg',
    kind: 'mass',
    toBase: 1000,
    aliases: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  },
  {
    canonical: 'mg',
    kind: 'mass',
    toBase: 0.001,
    aliases: ['mg', 'milligram', 'milligrams'],
  },
  {
    canonical: 'oz',
    kind: 'mass',
    toBase: 28.3495,
    aliases: ['oz', 'ounce', 'ounces'],
  },
  {
    canonical: 'lb',
    kind: 'mass',
    toBase: 453.592,
    aliases: ['lb', 'lbs', 'pound', 'pounds'],
  },

  {
    canonical: 'ml',
    kind: 'volume',
    toBase: 1,
    aliases: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  },
  {
    canonical: 'l',
    kind: 'volume',
    toBase: 1000,
    aliases: ['l', 'litre', 'litres', 'liter', 'liters'],
  },
  {
    canonical: 'tsp',
    kind: 'volume',
    toBase: 4.92892,
    aliases: ['tsp', 'teaspoon', 'teaspoons'],
  },
  {
    canonical: 'tbsp',
    kind: 'volume',
    toBase: 14.7868,
    aliases: ['tbsp', 'tablespoon', 'tablespoons', 'tbs'],
  },
  {
    canonical: 'cup',
    kind: 'volume',
    toBase: 236.588,
    aliases: ['cup', 'cups'],
  },
  {
    canonical: 'fl oz',
    kind: 'volume',
    toBase: 29.5735,
    aliases: ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'],
  },

  {
    canonical: 'piece',
    kind: 'count',
    toBase: 1,
    aliases: ['piece', 'pieces', 'pc', 'pcs', 'whole', 'each'],
  },
  {
    canonical: 'clove',
    kind: 'count',
    toBase: 1,
    aliases: ['clove', 'cloves'],
  },
  { canonical: 'pod', kind: 'count', toBase: 1, aliases: ['pod', 'pods'] },
  { canonical: 'head', kind: 'count', toBase: 1, aliases: ['head', 'heads'] },
  {
    canonical: 'bunch',
    kind: 'count',
    toBase: 1,
    aliases: ['bunch', 'bunches'],
  },
  {
    canonical: 'sprig',
    kind: 'count',
    toBase: 1,
    aliases: ['sprig', 'sprigs'],
  },
  { canonical: 'leaf', kind: 'count', toBase: 1, aliases: ['leaf', 'leaves'] },
  {
    canonical: 'pinch',
    kind: 'count',
    toBase: 1,
    aliases: ['pinch', 'pinches'],
  },
  {
    canonical: 'bottle',
    kind: 'count',
    toBase: 1,
    aliases: ['bottle', 'bottles'],
  },
  { canonical: 'ear', kind: 'count', toBase: 1, aliases: ['ear', 'ears'] },
];

const BY_ALIAS = new Map<string, UnitDef>();
for (const def of UNITS) {
  for (const alias of def.aliases) BY_ALIAS.set(alias, def);
}

export function normaliseUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\.$/, '');
  return BY_ALIAS.get(key)?.canonical ?? raw.trim();
}

export function unitKind(raw: string | null | undefined): UnitKind {
  if (!raw) return 'other';
  return BY_ALIAS.get(raw.trim().toLowerCase())?.kind ?? 'other';
}

/**
 * Convert a quantity to grams where that is meaningful.
 *
 * Mass units convert directly. Volume units need the ingredient's density,
 * which most ingredients do not have — returning null there is correct and
 * callers must handle it rather than assuming water.
 */
export function toGrams(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  densityGPerMl?: number | null,
): number | null {
  if (quantity == null || !Number.isFinite(quantity)) return null;
  const def = unit ? BY_ALIAS.get(unit.trim().toLowerCase()) : null;
  if (!def) return null;
  if (def.kind === 'mass') return quantity * def.toBase;
  if (def.kind === 'volume' && densityGPerMl != null && densityGPerMl > 0) {
    return quantity * def.toBase * densityGPerMl;
  }
  return null;
}

/** Render a quantity range the way it was written: "4–5", "162", "1.5". */
export function formatQuantity(
  quantity: number | null | undefined,
  quantityMax?: number | null,
): string | null {
  if (quantity == null) return null;
  const one = trimNumber(quantity);
  if (quantityMax == null || quantityMax === quantity) return one;
  return `${one}–${trimNumber(quantityMax)}`;
}

function trimNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

/** "162 g Worcestershire sauce, deseeded" from its parts. */
export function formatIngredientLine(line: {
  quantity?: number | null;
  quantityMax?: number | null;
  unit?: string | null;
  name: string;
  preparation?: string | null;
  optional?: boolean;
}): string {
  const amount = formatQuantity(line.quantity, line.quantityMax);
  const parts = [
    amount && line.unit ? `${amount} ${line.unit}` : amount,
    line.name,
  ].filter(Boolean);
  let text = parts.join(' ');
  if (line.preparation) text += `, ${line.preparation}`;
  if (line.optional) text += ' (optional)';
  return text;
}
