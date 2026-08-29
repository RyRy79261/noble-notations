import 'server-only';

/**
 * MCP tool registry.
 *
 * These tools exist to solve one problem: the same dish kept getting derived
 * from scratch in every conversation. So the read tools are shaped to make
 * "have I already worked this out?" the cheap question, and the write tools
 * are shaped to make revising an existing recipe easier than creating a new
 * one. The descriptions carry that intent — they are the only instructions
 * the model gets.
 *
 * Every tool: validates with Zod, checks scope, calls a query function,
 * writes an audit row, and returns JSON as text content.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { z } from 'zod';
import {
  addNoteSchema,
  addNoteShape,
  createRecipeSchema,
  createRecipeShape,
  logExperimentSchema,
  logExperimentShape,
  reviseRecipeSchema,
  reviseRecipeShape,
  searchRecipesSchema,
  searchRecipesShape,
  TAXONOMY_FACETS,
  upsertIngredientSchema,
  upsertIngredientShape,
  type TaxonomyFacet,
} from '@/lib/domain/schemas';
import {
  getExperiment,
  getIngredient,
  getRecipeBySlug,
  getStats,
  listExperiments,
  listIngredients,
  listTaxonomy,
  searchRecipes,
} from '@/lib/queries/read';
import {
  addNote,
  ConflictError,
  createRecipe,
  logExperiment,
  NotFoundError,
  reviseRecipe,
  upsertIngredient,
} from '@/lib/queries/write';
import { writeMcpAudit } from '@/lib/mcp/audit';
import { hasScope, WRITE_SCOPE } from '@/lib/mcp/scopes';

interface AuthCtx {
  authInfo?: AuthInfo;
}

interface Principal {
  userId: string;
  clientId: string;
  scope: string;
}

function getPrincipal(ctx: AuthCtx): Principal {
  const info = ctx.authInfo;
  const extra = info?.extra as
    { userId?: string; clientId?: string; scope?: string } | undefined;
  if (!extra?.userId || !extra.clientId) {
    throw new Error('Missing auth context');
  }
  return {
    userId: extra.userId,
    clientId: extra.clientId,
    scope: extra.scope ?? '',
  };
}

class ScopeError extends Error {}

function requireWrite(principal: Principal): void {
  if (!hasScope(principal.scope, WRITE_SCOPE)) {
    throw new ScopeError(
      'This connector was granted read-only access. Reconnect and approve ' +
        'write access to create or revise recipes.',
    );
  }
}

function ok(payload: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  };
}

/**
 * Run a tool body with auditing and uniform error handling.
 *
 * Errors we raised deliberately (not found, conflict, scope, validation) are
 * returned verbatim — the model can act on "that slug already exists, use
 * revise_recipe". Anything else is an internal fault and is reported
 * generically so SQL shapes and stack frames never reach the model; the real
 * message goes to the audit log.
 */
async function runTool<T>(
  ctx: AuthCtx,
  tool: string,
  argsForAudit: Record<string, unknown> | null,
  body: (principal: Principal) => Promise<T>,
) {
  const started = Date.now();
  let principal: Principal;
  try {
    principal = getPrincipal(ctx);
  } catch {
    return fail('Missing auth context.');
  }

  try {
    const result = await body(principal);
    void writeMcpAudit({
      userId: principal.userId,
      clientId: principal.clientId,
      tool,
      argsForAudit,
      status: 'success',
      durationMs: Date.now() - started,
    });
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void writeMcpAudit({
      userId: principal.userId,
      clientId: principal.clientId,
      tool,
      argsForAudit,
      status: 'error',
      errorMessage: message,
      durationMs: Date.now() - started,
    });

    const expected =
      err instanceof NotFoundError ||
      err instanceof ConflictError ||
      err instanceof ScopeError ||
      err instanceof z.ZodError;
    if (err instanceof z.ZodError) {
      return fail(`Invalid input:\n${z.prettifyError(err)}`);
    }
    return expected
      ? fail(message)
      : fail('An internal error occurred while processing your request.');
  }
}

export function registerTools(server: McpServer): void {
  // ───────────────────────────────────────────────────────────────────────
  // Read
  // ───────────────────────────────────────────────────────────────────────

  server.registerTool(
    'search_recipes',
    {
      title: 'Search recipes',
      description:
        'Search the repository before writing anything. Free text matches ' +
        'titles, taxonomy, summaries and ingredients, weighted in that order. ' +
        'Filters are conjunctive: taxonomy {cuisine:["sichuan"]} plus ' +
        'ingredients ["tofu"] means both must hold. Use excludeIngredients to ' +
        'rule things out ("dan dan noodles without sesame paste"). If a result ' +
        'is the dish you were asked about, fetch it with get_recipe and revise ' +
        'it — do not create a second recipe for the same dish.',
      inputSchema: searchRecipesShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'search_recipes',
        { query: args.query },
        async () => {
          const input = searchRecipesSchema.parse(args);
          return searchRecipes(input);
        },
      ),
  );

  server.registerTool(
    'get_recipe',
    {
      title: 'Get a recipe',
      description:
        'The full structured recipe: ingredient lines, ordered steps with the ' +
        'ingredients each one consumes, taxonomy, notes with their sources, ' +
        'related recipes, recorded experiments, and the list of every revision ' +
        'with the rationale for each. Read the rationales before revising — ' +
        'they say what has already been tried and rejected. Pass ' +
        'revisionNumber to read a superseded version.',
      inputSchema: {
        slug: z.string().min(1).max(120),
        revisionNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Defaults to the current revision'),
      },
    },
    async (args, extra) =>
      runTool(extra as AuthCtx, 'get_recipe', { slug: args.slug }, async () => {
        const recipe = await getRecipeBySlug(args.slug, args.revisionNumber);
        if (!recipe)
          throw new NotFoundError(`No recipe with slug "${args.slug}".`);
        return recipe;
      }),
  );

  server.registerTool(
    'list_taxonomy',
    {
      title: 'List taxonomy terms',
      description:
        'Every classification term with the number of recipes using it. Call ' +
        'this before classifying a new recipe so you reuse existing terms ' +
        'instead of coining near-duplicates ("stir fry" when "stir-frying" ' +
        'already exists). Omit facet to list all of them.',
      inputSchema: {
        facet: z.enum(TAXONOMY_FACETS).optional(),
      },
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'list_taxonomy',
        { facet: args.facet },
        async () => listTaxonomy(args.facet as TaxonomyFacet | undefined),
      ),
  );

  server.registerTool(
    'list_ingredients',
    {
      title: 'List ingredients',
      description:
        'The canonical ingredient list with usage counts. Use it to find the ' +
        'name the repository already uses for something before adding a new ' +
        'one — "coriander" and "cilantro" should be one ingredient with an ' +
        'alias, not two.',
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool(extra as AuthCtx, 'list_ingredients', null, async () =>
        listIngredients(),
      ),
  );

  server.registerTool(
    'get_ingredient',
    {
      title: 'Get an ingredient',
      description:
        'One ingredient with every recipe that uses it, its recorded ' +
        'substitutes, and any notes attached to it. This is the referential ' +
        'lookup: "what have I made with gochujang", "what can stand in for ' +
        'tandoori masala".',
      inputSchema: { slug: z.string().min(1).max(120) },
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'get_ingredient',
        { slug: args.slug },
        async () => {
          const found = await getIngredient(args.slug);
          if (!found) throw new NotFoundError(`No ingredient "${args.slug}".`);
          return found;
        },
      ),
  );

  server.registerTool(
    'list_experiments',
    {
      title: 'List experiments',
      description:
        'Recorded runs — an actual batch that was cooked, with its ' +
        'measurements. Distinct from a recipe: the recipe is the intent, an ' +
        'experiment is what happened when it met reality.',
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool(extra as AuthCtx, 'list_experiments', null, async () =>
        listExperiments(),
      ),
  );

  server.registerTool(
    'get_experiment',
    {
      title: 'Get an experiment',
      description:
        'One recorded run with every per-item observation (weights, dates, ' +
        'costs), its outcome, and the recipe revision it was cooking. Use it ' +
        'when a revision needs to be justified by measured results rather ' +
        'than by taste memory.',
      inputSchema: { slug: z.string().min(1).max(120) },
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'get_experiment',
        { slug: args.slug },
        async () => {
          const found = await getExperiment(args.slug);
          if (!found) throw new NotFoundError(`No experiment "${args.slug}".`);
          return found;
        },
      ),
  );

  server.registerTool(
    'get_repository_stats',
    {
      title: 'Repository statistics',
      description:
        'Counts of recipes, revisions, ingredients, taxonomy terms, notes and ' +
        'experiments. A cheap way to confirm the connector is reading the ' +
        'right database.',
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool(extra as AuthCtx, 'get_repository_stats', null, async () =>
        getStats(),
      ),
  );

  // ───────────────────────────────────────────────────────────────────────
  // Write
  // ───────────────────────────────────────────────────────────────────────

  server.registerTool(
    'create_recipe',
    {
      title: 'Create a recipe',
      description:
        'Create a NEW recipe. Call search_recipes first: if the dish already ' +
        'exists in any form, use revise_recipe instead — the whole point of ' +
        'this repository is that a recipe improves across revisions rather ' +
        'than being re-derived each time. Creating a duplicate loses the ' +
        'history that makes the original useful.\n\n' +
        'Everything except the title is optional. Steps may name ingredients ' +
        'in `uses`, but only ones present in `ingredients`. Set `kind` to ' +
        '"preparation" for a component another recipe pulls in (a spice ' +
        'dredge, a demi-glace), "process" for a technique with no fixed ' +
        'yield, or "research" for a sourced write-up with no steps of its own.',
      inputSchema: createRecipeShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'create_recipe',
        { slug: args.slug, title: args.title },
        async (principal) => {
          requireWrite(principal);
          const input = createRecipeSchema.parse(args);
          const result = await createRecipe(input, 'mcp');
          return {
            ...result,
            url: `/recipes/${result.slug}`,
            unresolvedLinks: result.unresolvedLinks,
            message:
              result.unresolvedLinks.length > 0
                ? `Created. These linked slugs do not exist yet and were skipped: ${result.unresolvedLinks.join(', ')}`
                : 'Created.',
          };
        },
      ),
  );

  server.registerTool(
    'revise_recipe',
    {
      title: 'Revise a recipe',
      description:
        'Append a revision to an existing recipe. This is the tool to reach ' +
        'for whenever a recipe changes — nothing is ever edited in place, so ' +
        'a revision costs nothing and preserves what came before.\n\n' +
        'Omitted fields carry forward from the current revision, so changing ' +
        'one spice ratio means sending `slug`, `rationale` and `ingredients` ' +
        'only. `ingredients` and `steps` each replace their whole list when ' +
        'given — send the complete list, not a diff.\n\n' +
        '`rationale` is required and should say what changed and why, in the ' +
        'terms that will matter next time: "coriander to a coarse grind, the ' +
        'fine grind disappeared into the dredge", not "updated ingredients".',
      inputSchema: reviseRecipeShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'revise_recipe',
        { slug: args.slug },
        async (principal) => {
          requireWrite(principal);
          const input = reviseRecipeSchema.parse(args);
          const result = await reviseRecipe(input, 'mcp');
          return {
            ...result,
            url: `/recipes/${result.slug}`,
            message: `Revision ${result.revisionNumber} created.`,
          };
        },
      ),
  );

  server.registerTool(
    'add_note',
    {
      title: 'Add a note',
      description:
        'Attach a note to a recipe, an ingredient or an experiment — exactly ' +
        'one of them. Notes are how the repository accumulates judgement ' +
        'rather than just instructions.\n\n' +
        'Pick the kind honestly: `research` for sourced background (give ' +
        '`sources`), `observation` for what was noticed, `result` for how it ' +
        'turned out, `substitution` for what was swapped and why, `warning` ' +
        'for a trap worth flagging, `idea` for something untried, ' +
        '`correction` when an earlier claim was wrong.\n\n' +
        'Pass `revisionNumber` alongside `recipeSlug` to pin the note to one ' +
        'revision instead of the recipe as a whole.',
      inputSchema: addNoteShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'add_note',
        {
          kind: args.kind,
          recipeSlug: args.recipeSlug,
          ingredientSlug: args.ingredientSlug,
          experimentSlug: args.experimentSlug,
        },
        async (principal) => {
          requireWrite(principal);
          const input = addNoteSchema.parse(args);
          return addNote(input);
        },
      ),
  );

  server.registerTool(
    'upsert_ingredient',
    {
      title: 'Create or update an ingredient',
      description:
        'Enrich the canonical ingredient list. Recipes auto-create bare ' +
        'ingredient stubs as they are written; this is how a stub gains its ' +
        'category, aliases, density and substitutes.\n\n' +
        '`aliases` is what makes search work across vocabularies (cilantro / ' +
        'coriander). `densityGPerMl` is what lets a cup in one recipe be ' +
        'compared against grams in another. `substitutes` is recorded in both ' +
        'directions.',
      inputSchema: upsertIngredientShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'upsert_ingredient',
        { name: args.name, slug: args.slug },
        async (principal) => {
          requireWrite(principal);
          const input = upsertIngredientSchema.parse(args);
          return upsertIngredient(input);
        },
      ),
  );

  server.registerTool(
    'log_experiment',
    {
      title: 'Log an experiment',
      description:
        'Record an actual run: a batch that was cooked, with per-item ' +
        'measurements. `items` are the individually tracked units (hanging ' +
        'pieces, jars, loaves) and `observations` are the numbers taken ' +
        'against them — use a consistent `metric` name across runs ' +
        '("initial_weight", "final_weight", "days_to_cut") so batches can be ' +
        'compared.\n\n' +
        "Re-logging the same slug replaces that run's items and observations " +
        'rather than appending duplicates.',
      inputSchema: logExperimentShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'log_experiment',
        { slug: args.slug, title: args.title, recipeSlug: args.recipeSlug },
        async (principal) => {
          requireWrite(principal);
          const input = logExperimentSchema.parse(args);
          return logExperiment(input);
        },
      ),
  );
}
