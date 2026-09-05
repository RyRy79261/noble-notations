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
  // Added because a real write used "stalk" for lemongrass and it fell
  // through as an unrecognised unit. Now that unknown units are refused,
  // anything legitimate has to actually be in here — and these three are
  // how ordinary recipes count lemongrass, ginger and citrus.
  {
    canonical: 'stalk',
    kind: 'count',
    toBase: 1,
    aliases: ['stalk', 'stalks'],
  },
  {
    canonical: 'slice',
    kind: 'count',
    toBase: 1,
    aliases: ['slice', 'slices'],
  },
  {
    canonical: 'stick',
    kind: 'count',
    toBase: 1,
    aliases: ['stick', 'sticks'],
  },
];

const BY_ALIAS = new Map<string, UnitDef>();
for (const def of UNITS) {
  for (const alias of def.aliases) BY_ALIAS.set(alias, def);
}

/** The single spelling every alias folds onto, for error messages and docs. */
export const CANONICAL_UNITS: readonly string[] = UNITS.map((u) => u.canonical);

/**
 * The one place a written unit is turned into a lookup key.
 *
 * `unitKind` used to lower-case without stripping a trailing full stop while
 * `normaliseUnit` stripped it, so the two disagreed: "TSP." normalised to
 * "tsp" and then reported its kind as "other". Both go through this now.
 */
function aliasKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, '');
}

function lookup(raw: string | null | undefined): UnitDef | undefined {
  if (!raw) return undefined;
  return BY_ALIAS.get(aliasKey(raw));
}

/** True when this spelling is in the vocabulary at all. */
export function isKnownUnit(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return true; // "no unit" is a legitimate answer.
  return lookup(raw) !== undefined;
}

/**
 * Fold a written unit onto its canonical spelling.
 *
 * Unknown spellings are returned as written. That is deliberate for reads —
 * rows already in the database must render as they were stored — but it is
 * NOT acceptable on write, where an unrecognised unit means the vocabulary
 * silently grows a synonym nobody can query across. The write path rejects
 * instead; see `assertKnownUnit`.
 */
export function normaliseUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return lookup(raw)?.canonical ?? raw.trim();
}

export function unitKind(raw: string | null | undefined): UnitKind {
  return lookup(raw)?.kind ?? 'other';
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

// ─────────────────────────────────────────────────────────────────────────
// Aggregation, for shopping lists
// ─────────────────────────────────────────────────────────────────────────

/**
 * The bucket a quantity may be summed within.
 *
 * Mass and volume convert freely inside their kind, so 800 g and 1 kg add up
 * to 1.8 kg. Count units emphatically do not: every one of them carries
 * `toBase: 1`, but three cloves and two heads are not five of anything.
 * They therefore bucket per unit, and so does anything unrecognised — a
 * wrong total on a shopping list is worse than two honest lines.
 */
export interface QuantityBucket {
  kind: UnitKind;
  /** Buckets that share this key may be summed. */
  key: string;
  /** Multiplier into the bucket's base unit. */
  toBase: number;
  canonical: string | null;
}

export function quantityBucket(
  unit: string | null | undefined,
): QuantityBucket {
  const def = unit ? BY_ALIAS.get(unit.trim().toLowerCase()) : null;

  if (def && (def.kind === 'mass' || def.kind === 'volume')) {
    return {
      kind: def.kind,
      key: def.kind,
      toBase: def.toBase,
      canonical: def.canonical,
    };
  }

  const canonical = def?.canonical ?? (unit ? unit.trim() : null);
  return {
    kind: def?.kind ?? (unit ? 'other' : 'count'),
    key: canonical ? `unit:${canonical.toLowerCase()}` : 'unitless',
    toBase: 1,
    canonical,
  };
}

/**
 * Render a summed amount back into the unit a person would shop in: grams
 * until a kilogram is reached, millilitres until a litre.
 */
export function formatAggregate(
  bucket: QuantityBucket,
  amount: number,
): string {
  if (bucket.kind === 'mass') {
    return amount >= 1000
      ? `${trimNumber(Math.round((amount / 1000) * 100) / 100)} kg`
      : `${trimNumber(Math.round(amount * 10) / 10)} g`;
  }
  if (bucket.kind === 'volume') {
    return amount >= 1000
      ? `${trimNumber(Math.round((amount / 1000) * 100) / 100)} l`
      : `${trimNumber(Math.round(amount * 10) / 10)} ml`;
  }
  const value = trimNumber(Math.round(amount * 100) / 100);
  return bucket.canonical ? `${value} ${bucket.canonical}` : value;
}
