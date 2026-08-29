/**
 * The recipe submission contract.
 *
 * One shape, used by three callers: the MCP tools an agent writes through,
 * the archive ingest script, and the Markdown exporter. Keeping them on a
 * single Zod schema is what stops the database and the site from drifting
 * apart as the model learns new ways to describe a dish.
 *
 * Everything optional is genuinely optional — a half-remembered recipe with a
 * title and six ingredient lines is a legitimate submission. The schema's job
 * is to reject incoherence (a step that references an ingredient the recipe
 * does not list), not to demand completeness.
 */
import { z } from 'zod';

export const TAXONOMY_FACETS = [
  'cuisine',
  'course',
  'technique',
  'diet',
  'season',
  'equipment',
  'occasion',
  'preservation',
  'texture',
  'ingredient_class',
] as const;
export type TaxonomyFacet = (typeof TAXONOMY_FACETS)[number];

export const RECIPE_STATUSES = ['draft', 'active', 'archived'] as const;

export const RECIPE_KINDS = [
  'recipe',
  'preparation',
  'process',
  'research',
] as const;

export const NOTE_KINDS = [
  'observation',
  'research',
  'substitution',
  'warning',
  'result',
  'idea',
  'correction',
] as const;

export const INGREDIENT_CATEGORIES = [
  'produce',
  'protein',
  'dairy',
  'grain',
  'legume',
  'spice',
  'herb',
  'condiment',
  'fat',
  'acid',
  'sweetener',
  'alcohol',
  'liquid',
  'fungus',
  'additive',
  'other',
] as const;

export const RECIPE_LINK_KINDS = [
  'derived_from',
  'variant_of',
  'component_of',
  'pairs_with',
  'references',
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────

export const noteSourceSchema = z.object({
  url: z.url().optional(),
  title: z.string().max(300).optional(),
  citation: z.string().max(2000).optional(),
  accessedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
});

export const noteSchema = z.object({
  kind: z
    .enum(NOTE_KINDS)
    .describe(
      'observation = what happened; research = sourced background; ' +
        'substitution = what was swapped and why; warning = a trap; ' +
        'result = how it turned out; idea = untried; correction = fixes an ' +
        'earlier claim',
    ),
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(20000).describe('Markdown'),
  sources: z.array(noteSourceSchema).max(100).optional(),
});
export type NoteInput = z.infer<typeof noteSchema>;

export const ingredientLineSchema = z.object({
  /**
   * The ingredient as named. Resolved against the canonical ingredient list
   * by slug, then by name, then by alias; unmatched names create a new
   * canonical ingredient rather than being silently dropped.
   */
  name: z.string().min(1).max(200),
  quantity: z.number().finite().nonnegative().nullish(),
  /** Upper bound when the amount was written as a range ("4–5 chipotle"). */
  quantityMax: z.number().finite().nonnegative().nullish(),
  unit: z.string().max(40).nullish(),
  /** Sub-list heading this line belongs under: "Wash", "Dredge". */
  component: z.string().max(120).nullish(),
  preparation: z
    .string()
    .max(200)
    .nullish()
    .describe('"deseeded", "coarsely ground"'),
  optional: z.boolean().optional().default(false),
  note: z.string().max(2000).nullish(),
  /** Overrides the rendered line if the original wording matters. */
  rawText: z.string().max(500).optional(),
});
export type IngredientLineInput = z.infer<typeof ingredientLineSchema>;

export const stepSchema = z.object({
  instruction: z.string().min(1).max(5000),
  /** Stage grouping: "Prep", "Cure", "Hang", "Finish". */
  phase: z.string().max(120).nullish(),
  durationMinutes: z.number().int().nonnegative().nullish(),
  durationMaxMinutes: z.number().int().nonnegative().nullish(),
  temperatureC: z.number().finite().nullish(),
  equipment: z.array(z.string().max(120)).max(30).optional(),
  /** Technique taxonomy term, e.g. "braising". Created if unknown. */
  technique: z.string().max(120).nullish(),
  /**
   * Names of ingredient lines this step consumes. Each must match the `name`
   * of a line in `ingredients` — validated below, because a step pointing at
   * an ingredient the recipe does not have is always a mistake.
   */
  uses: z.array(z.string().max(200)).max(50).optional(),
  note: z.string().max(2000).nullish(),
});
export type StepInput = z.infer<typeof stepSchema>;

export const recipeLinkSchema = z.object({
  kind: z.enum(RECIPE_LINK_KINDS),
  /** Slug of the other recipe. Must already exist. */
  slug: z.string().min(1).max(120),
  note: z.string().max(1000).optional(),
});

/**
 * Taxonomy as a record keyed by facet — the shape easiest to fill in.
 * `partialRecord` rather than `record`: every facet is optional, and a plain
 * record would type all ten as required.
 */
export const taxonomySchema = z
  .partialRecord(
    z.enum(TAXONOMY_FACETS),
    z.array(z.string().min(1).max(120)).max(30),
  )
  .optional();
export type TaxonomyInput = z.infer<typeof taxonomySchema>;

// ─────────────────────────────────────────────────────────────────────────
// Recipe body — the part a revision snapshots
// ─────────────────────────────────────────────────────────────────────────

export const recipeBodyShape = {
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullish(),
  summary: z.string().max(4000).nullish(),
  kind: z.enum(RECIPE_KINDS).optional().default('recipe'),
  status: z
    .enum(RECIPE_STATUSES)
    .optional()
    .default('active')
    .describe(
      'draft hides it from listings; archived keeps the URL but retires it',
    ),
  taxonomy: taxonomySchema,
  yieldQuantity: z.number().finite().positive().nullish(),
  yieldUnit: z.string().max(60).nullish(),
  servings: z.number().int().positive().nullish(),
  totalTimeMinutes: z.number().int().nonnegative().nullish(),
  activeTimeMinutes: z.number().int().nonnegative().nullish(),
  ingredients: z.array(ingredientLineSchema).max(300).optional(),
  steps: z.array(stepSchema).max(200).optional(),
  notes: z.array(noteSchema).max(100).optional(),
  links: z.array(recipeLinkSchema).max(50).optional(),
  originNote: z.string().max(2000).nullish(),
  heroImageUrl: z.url().nullish(),
  heroImageAlt: z.string().max(300).nullish(),
};

/**
 * A step may only reference ingredients the recipe actually lists. Catching
 * this at the boundary keeps `recipe_step_ingredients` honest — the
 * alternative is a silently dropped link that makes "which step uses the
 * tandoori masala" quietly wrong.
 */
function checkStepReferences(
  value: { ingredients?: IngredientLineInput[]; steps?: StepInput[] },
  ctx: z.RefinementCtx,
) {
  const known = new Set(
    (value.ingredients ?? []).map((i) => i.name.trim().toLowerCase()),
  );
  (value.steps ?? []).forEach((step, stepIndex) => {
    (step.uses ?? []).forEach((used, usedIndex) => {
      if (!known.has(used.trim().toLowerCase())) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', stepIndex, 'uses', usedIndex],
          message:
            `Step ${stepIndex + 1} uses "${used}", which is not in the ` +
            'ingredient list. Add it to `ingredients` or remove it from `uses`.',
        });
      }
    });
  });
}

/**
 * Raw shapes are exported alongside the schemas because the MCP SDK's
 * `registerTool` takes a Zod *shape* (a plain object of field schemas) to
 * derive its JSON Schema, while validation inside the handler needs the
 * assembled object schema with its cross-field refinements. Deriving both
 * from one shape keeps the advertised tool signature and the enforced
 * contract from drifting apart.
 */
export const createRecipeShape = {
  ...recipeBodyShape,
  /** Defaults to a slug of the title; must be unique. */
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase words separated by hyphens')
    .max(120)
    .optional(),
  /** Why this recipe exists at all — recorded on revision 1. */
  rationale: z.string().max(4000).optional(),
};

export const createRecipeSchema = z
  .object(createRecipeShape)
  .superRefine(checkStepReferences);

/**
 * `Input` is what a caller sends (defaults not yet applied); `CreateRecipeInput`
 * is what comes out of `parse`. Seed data and MCP arguments are written
 * against the former, the write layer consumes the latter.
 */
export type CreateRecipeArgs = z.input<typeof createRecipeSchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;

/**
 * A revision. Every field is optional except the rationale: omitted fields
 * are carried forward from the current revision, so refining one spice ratio
 * does not mean re-sending the whole recipe.
 *
 * `ingredients` and `steps` are all-or-nothing — supplying either replaces
 * that list wholesale. Partial merging of an ordered list by name is
 * ambiguous in exactly the cases that matter (reordering, renaming), so the
 * contract is explicit instead of clever.
 */
export const reviseRecipeShape = {
  slug: z.string().min(1).max(120),
  rationale: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      'What changed and why. Required — this is the point of a revision.',
    ),
  title: recipeBodyShape.title.optional(),
  subtitle: recipeBodyShape.subtitle,
  summary: recipeBodyShape.summary,
  taxonomy: recipeBodyShape.taxonomy,
  yieldQuantity: recipeBodyShape.yieldQuantity,
  yieldUnit: recipeBodyShape.yieldUnit,
  servings: recipeBodyShape.servings,
  totalTimeMinutes: recipeBodyShape.totalTimeMinutes,
  activeTimeMinutes: recipeBodyShape.activeTimeMinutes,
  ingredients: recipeBodyShape.ingredients,
  steps: recipeBodyShape.steps,
  notes: recipeBodyShape.notes,
  links: recipeBodyShape.links,
  heroImageUrl: recipeBodyShape.heroImageUrl,
  heroImageAlt: recipeBodyShape.heroImageAlt,
};

export const reviseRecipeSchema = z
  .object(reviseRecipeShape)
  .superRefine((value, ctx) => {
    // Only cross-check when both lists are being replaced together; a
    // steps-only revision is checked against the carried-forward ingredients
    // at write time, where the previous revision is in hand.
    if (value.ingredients && value.steps) checkStepReferences(value, ctx);
  });
export type ReviseRecipeArgs = z.input<typeof reviseRecipeSchema>;
export type ReviseRecipeInput = z.infer<typeof reviseRecipeSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Notes, ingredients, experiments
// ─────────────────────────────────────────────────────────────────────────

export const addNoteShape = {
  ...noteSchema.shape,
  /** Exactly one target must be given. */
  recipeSlug: z.string().max(120).optional(),
  ingredientSlug: z.string().max(120).optional(),
  experimentSlug: z.string().max(120).optional(),
  /** Attach to a specific revision of `recipeSlug` instead of the recipe. */
  revisionNumber: z.number().int().positive().optional(),
};

export const addNoteSchema = z
  .object(addNoteShape)
  .superRefine((value, ctx) => {
    const targets = [
      value.recipeSlug,
      value.ingredientSlug,
      value.experimentSlug,
    ].filter(Boolean);
    if (targets.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Give exactly one of recipeSlug, ingredientSlug or experimentSlug.',
      });
    }
    if (value.revisionNumber != null && !value.recipeSlug) {
      ctx.addIssue({
        code: 'custom',
        path: ['revisionNumber'],
        message: 'revisionNumber only applies together with recipeSlug.',
      });
    }
  });
export type AddNoteInput = z.infer<typeof addNoteSchema>;

export const upsertIngredientShape = {
  name: z.string().min(1).max(200),
  slug: z.string().max(120).optional(),
  plural: z.string().max(200).nullish(),
  category: z.enum(INGREDIENT_CATEGORIES).optional(),
  description: z.string().max(4000).nullish(),
  densityGPerMl: z.number().positive().max(25).nullish(),
  defaultUnit: z.string().max(40).nullish(),
  aliases: z.array(z.string().min(1).max(120)).max(50).optional(),
  substitutes: z
    .array(z.string().min(1).max(200))
    .max(50)
    .optional()
    .describe('Names of ingredients that can stand in for this one'),
};

export const upsertIngredientSchema = z.object(upsertIngredientShape);
export type UpsertIngredientArgs = z.input<typeof upsertIngredientSchema>;
export type UpsertIngredientInput = z.infer<typeof upsertIngredientSchema>;

export const observationSchema = z.object({
  item: z.string().max(120).nullish().describe('Item label, e.g. "A1"'),
  metric: z.string().min(1).max(80).describe('"initial_weight", "days_to_cut"'),
  value: z.number().finite().nullish(),
  unit: z.string().max(40).nullish(),
  recordedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  note: z.string().max(1000).nullish(),
});

export const logExperimentShape = {
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120)
    .optional(),
  title: z.string().min(1).max(200),
  recipeSlug: z.string().max(120).optional(),
  revisionNumber: z.number().int().positive().optional(),
  summary: z.string().max(4000).nullish(),
  startedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  completedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  scaleFactor: z.number().positive().nullish(),
  outcome: z.string().max(8000).nullish(),
  costTotal: z.number().nonnegative().nullish(),
  currency: z.string().length(3).optional(),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        note: z.string().max(1000).nullish(),
      }),
    )
    .max(500)
    .optional(),
  observations: z.array(observationSchema).max(5000).optional(),
  notes: z.array(noteSchema).max(100).optional(),
};

export const logExperimentSchema = z.object(logExperimentShape);
export type LogExperimentArgs = z.input<typeof logExperimentSchema>;
export type LogExperimentInput = z.infer<typeof logExperimentSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────

export const searchRecipesShape = {
  query: z
    .string()
    .max(300)
    .optional()
    .describe('Free text; matches title, summary, terms and ingredients'),
  /** Facet → term slugs. All listed terms must be present (AND). */
  taxonomy: taxonomySchema,
  /** Ingredient slugs or names that must all appear. */
  ingredients: z.array(z.string().max(200)).max(20).optional(),
  /** Ingredient slugs or names that must NOT appear. */
  excludeIngredients: z.array(z.string().max(200)).max(20).optional(),
  kind: z.enum(RECIPE_KINDS).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).max(10000).optional().default(0),
};

export const searchRecipesSchema = z.object(searchRecipesShape);
export type SearchRecipesInput = z.infer<typeof searchRecipesSchema>;
