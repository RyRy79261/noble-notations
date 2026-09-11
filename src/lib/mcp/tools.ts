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
  addMassFlowSchema,
  addMassFlowShape,
  addNoteSchema,
  addNoteShape,
  createRecipeSchema,
  createRecipeShape,
  describeMechanismSchema,
  describeMechanismShape,
  logExperimentSchema,
  logExperimentShape,
  reattachNoteSchema,
  reattachNoteShape,
  reportIssueSchema,
  reportIssueShape,
  reviseRecipeSchema,
  reviseRecipeShape,
  backfillRevisionSchema,
  backfillRevisionShape,
  buildShoppingListSchema,
  buildShoppingListShape,
  searchNotesSchema,
  searchNotesShape,
  searchRecipesSchema,
  searchRecipesShape,
  CATEGORY_TYPES,
  upsertIngredientSchema,
  upsertIngredientShape,
  upsertCategorySchema,
  upsertCategoryShape,
  type CategoryType,
} from '@/lib/domain/schemas';
import {
  buildShoppingList,
  getExperiment,
  getIngredient,
  getRecipeBySlug,
  getStats,
  listExperiments,
  listIngredients,
  listCategories,
  searchNotes,
  searchRecipes,
} from '@/lib/queries/read';
import {
  addMassFlow,
  addNote,
  ConflictError,
  createRecipe,
  describeMechanism,
  logExperiment,
  NotFoundError,
  reattachNote,
  reviseRecipe,
  backfillRevision,
  upsertIngredient,
  upsertCategory,
} from '@/lib/queries/write';
import type { WriteResult } from '@/lib/queries/write';
import { issueReportingConfigured, issueToken } from '@/lib/github/config';
import { createGitHubIssues } from '@/lib/github/client';
import { ReportFailedError, submitReport } from '@/lib/github/report';
import { redact } from '@/lib/github/redact';
import { agentGuide } from '@/lib/mcp/guide';
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

/**
 * Say plainly what the write left unfinished.
 *
 * `needsDescription` is in the payload either way, but a model reads the
 * message first and acts on prose more reliably than on a nested object it
 * has to notice. Naming the tool to call next is the point: the previous
 * result said "Created." and nothing else while seven unexplained tags and
 * fifteen bare ingredients went in behind it.
 */
function followUpMessage(headline: string, result: WriteResult): string {
  const parts = [headline];

  if (result.unresolvedLinks.length > 0) {
    parts.push(
      `These linked slugs do not exist yet and were skipped: ${result.unresolvedLinks.join(', ')}.`,
    );
  }

  const {
    categories,
    ingredients: bare,
    needsDensity,
  } = result.needsDescription;

  if (categories.length > 0) {
    parts.push(
      `${categories.length} tag(s) have no explanation yet — call ` +
        `upsert_category for each: ${categories
          .map((c) => `${c.categoryType}/${c.slug}`)
          .join(', ')}.`,
    );
  }

  if (bare.length > 0) {
    parts.push(
      `${bare.length} ingredient(s) are bare — call upsert_ingredient for ` +
        `each: ${bare.map((i) => `${i.slug} (needs ${i.missing.join(', ')})`).join('; ')}.`,
    );
  }

  if (needsDensity.length > 0) {
    parts.push(
      'These are written in a volume unit and have no densityGPerMl, so ' +
        'their amounts cannot be converted to mass or compared across ' +
        `batches: ${needsDensity.map((d) => `${d.slug} (${d.unit})`).join(', ')}. ` +
        'Set densityGPerMl with upsert_ingredient, or rewrite the line in grams.',
    );
  }

  return parts.join(' ');
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
      err instanceof ReportFailedError ||
      err instanceof z.ZodError;
    if (err instanceof z.ZodError) {
      return fail(`Invalid input:\n${z.prettifyError(err)}`);
    }
    return expected
      ? fail(message)
      : fail('An internal error occurred while processing your request.');
  }
}

/**
 * `report_issue` is registered only when `GITHUB_ISSUE_TOKEN` is set, so the
 * human half of that notice is a warning printed once per process rather
 * than once per request.
 */
let warnedReportingIsOff = false;

function warnIssueReportingIsOff(): void {
  if (warnedReportingIsOff) return;
  warnedReportingIsOff = true;
  console.warn(
    '[mcp] GITHUB_ISSUE_TOKEN is not set — report_issue is not registered.',
  );
}

/**
 * The tool name as the audit row may hold it: redacted, then cut.
 *
 * The audit row is written from the raw arguments, so this value has met
 * neither the schema's `max(64)` nor the redaction that protects the public
 * issue. `src/lib/mcp/audit.ts` says free-form text is never logged, and a
 * caller that puts a bearer token where a tool name belongs must not be the
 * exception.
 */
function auditToolName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return redact(raw).text.slice(0, 64);
}

export function registerTools(server: McpServer): void {
  // ───────────────────────────────────────────────────────────────────────
  // Read
  // ───────────────────────────────────────────────────────────────────────

  server.registerTool(
    'get_started',
    {
      title: 'How this repository works',
      description:
        'Read this first. Explains how the pieces fit together — the ' +
        'revision rule, which note kind means what, how the categories ' +
        'work, and the order of operations.\n\n' +
        'Every other tool description explains one tool; this explains the ' +
        'system. Worth one call at the start of any session that intends ' +
        'to write, because the most common mistake — creating a second ' +
        'recipe for a dish that already exists — comes from not knowing ' +
        'the repository is revision-first.',
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool(extra as AuthCtx, 'get_started', {}, async () => agentGuide()),
  );

  server.registerTool(
    'search_recipes',
    {
      title: 'Search recipes',
      description:
        'Search the repository before writing anything. Free text matches ' +
        'titles, categories, summaries and ingredients, in that order of ' +
        'importance. ' +
        'All filters must agree: categories {cuisine:["sichuan"]} plus ' +
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
        'ingredients each one uses, categories, notes with their sources, ' +
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
    'list_categories',
    {
      title: 'List the categories',
      description:
        'Every tag, and the number of recipes that use it. Call this before ' +
        'you add tags to a new recipe. Then you use the tags that exist. ' +
        'You do not make a tag that is almost the same as one that is here ' +
        '("stir fry" when "stir-frying" is here already).\n\n' +
        'Each row gives `parent`: the broader tag that this tag sits under, ' +
        'or null. A parent is always in the same category type. This is ' +
        'how you read the hierarchy, and how you check a parent that you ' +
        'set with upsert_category.\n\n' +
        'Do not give categoryType if you want all the tags.',
      inputSchema: {
        categoryType: z.enum(CATEGORY_TYPES).optional(),
      },
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'list_categories',
        { categoryType: args.categoryType },
        async () =>
          listCategories(args.categoryType as CategoryType | undefined),
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
        'experiment is what happened when it met reality.\n\n' +
        'The website calls these batch logs. Every run is listed at ' +
        '/batch-logs.',
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
        'than by taste memory.\n\n' +
        'The website calls this a batch log. One run is at ' +
        '/batch-logs/<slug>. A run that names a recipe is also at ' +
        '/recipes/<recipe>/batch-logs/<slug>. The address /batch-logs/<slug> ' +
        'always answers.',
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
    'search_notes',
    {
      title: 'Search notes',
      description:
        'Find what the repository already knows. A note can hang off a ' +
        'recipe, a version of a recipe, a step, an ingredient or a run, so ' +
        'reading one record shows you only the notes on that record. This ' +
        'searches all of them at once.\n\n' +
        'Call it before add_note. A near-copy of a note that is already ' +
        'here cannot be told apart from the original later, and nothing ' +
        'removes either one.\n\n' +
        'Free text matches the title and the body. Leave `query` out to ' +
        'list notes, newest first. Use `kind` on its own to read a class of ' +
        'note across the whole store: every warning, or every science note.' +
        '\n\n' +
        'Each result names the record it is attached to, so you can fetch ' +
        'the whole thing with get_recipe, get_ingredient or get_experiment. ' +
        '`recipeSlug` covers every version of that recipe, not only the ' +
        'current one. It does not cover runs of it; ask for those with ' +
        '`experimentSlug`.\n\n' +
        'A body is cut to an excerpt. `truncated` says whether it was, and ' +
        '`bodyLength` says how long the whole body is. `sourceCount` says ' +
        'how many sources the note cites. The `id` on a result is the one ' +
        'describe_mechanism asks for.',
      inputSchema: searchNotesShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'search_notes',
        { query: args.query, kind: args.kind },
        async () => {
          const input = searchNotesSchema.parse(args);
          return searchNotes(input);
        },
      ),
  );

  server.registerTool(
    'build_shopping_list',
    {
      title: 'Build a shopping list',
      description:
        'Combine the ingredients of several recipes into one list, grouped ' +
        'by where they sit in a shop (produce, meat, spices, sauces…) ' +
        'rather than alphabetically.\n\n' +
        "Reads each recipe's *current* revision — shopping for a " +
        "superseded version means cooking last month's mistake.\n\n" +
        'Amounts are summed only within compatible units: 800 g and 1 kg ' +
        'become 1.8 kg, but three cloves and two heads stay two lines. ' +
        'Lines with no quantity are flagged rather than guessed at, so ' +
        'report them as-is instead of inventing an amount.',
      inputSchema: buildShoppingListShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'build_shopping_list',
        { slugs: args.slugs },
        async () => {
          const input = buildShoppingListSchema.parse(args);
          return buildShoppingList(input.slugs);
        },
      ),
  );

  server.registerTool(
    'get_repository_stats',
    {
      title: 'Repository statistics',
      description:
        'Counts of recipes, revisions, ingredients, tags, notes and ' +
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
        'Everything except the title is optional. Set `kind` to ' +
        '"preparation" for a part another recipe pulls in (a spice ' +
        'dredge, a demi-glace), "process" for a technique with no fixed ' +
        'yield, or "research" for a sourced write-up with no steps of its own.\n\n' +
        'A step may name ingredients in `uses`. Each name must fit exactly ' +
        'one line in `ingredients`. One recipe can list one ingredient on ' +
        'two lines: rice for a powder and rice for the table. To point at ' +
        'one of them, write the `component` of that line, then a colon, ' +
        'then the name: "To serve: Glutinous rice". You can write a name ' +
        'this way at any time. You must write it this way when two lines ' +
        'share a name. The tool refuses a bare name that fits two lines, ' +
        'because it must not choose the line for you. The refusal names ' +
        'both lines and says how to tell them apart.\n\n' +
        'Send `massFlow` only for a dish that loses or gains weight. The ' +
        'figure shows what the food weighs at each stage. Most dishes do ' +
        'not need it.\n\n' +
        'Give `conditions` to a science note in `notes`. Conditions are ' +
        'the values the note holds under, such as a temperature and a time.',
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
            message: followUpMessage('Created.', result),
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
        'for whenever a recipe changes — ingredients and steps are never ' +
        'edited in place, so a revision costs nothing and preserves what ' +
        'came before.\n\n' +
        'Omitted fields carry forward from the current revision, so changing ' +
        'one spice ratio means sending `slug`, `rationale` and `ingredients` ' +
        'only. `ingredients`, `steps` and `categories` each replace their ' +
        'whole list when given — send the complete list, not a diff.\n\n' +
        '`categories` replaces every tag on the recipe. A category type that ' +
        'you do not send loses its tags. If you send one cuisine tag only, ' +
        'the write deletes the course tag and the technique tag. An empty ' +
        '`categories` object removes every tag. Call get_recipe first. Then ' +
        'send back each tag that you want to keep.\n\n' +
        'A step names ingredients in `uses`, and each name must fit exactly ' +
        'one line. To point at one of two lines of the same ingredient, ' +
        'write the `component` of that line, then a colon, then the name: ' +
        '"To serve: Glutinous rice". Send `steps` alongside `ingredients` ' +
        'whenever you change a line that a step names. A revision that ' +
        'sends `ingredients` alone keeps the stored steps. A kept step ' +
        'carries the component in front of the name when two lines share ' +
        'that name, so give the new lines the same components. If you ' +
        'rename a component, the kept step no longer points at that line by ' +
        'its heading. The tool then reads the name alone. It keeps the step ' +
        'on the one line that answers to the name. It refuses the revision ' +
        'when two lines answer to the name. Send `steps` again with the new ' +
        'components.\n\n' +
        '`rationale` is required and should say what changed and why, in the ' +
        'terms that will matter next time: "coriander to a coarse grind, the ' +
        'fine grind disappeared into the dredge", not "updated ingredients".\n\n' +
        '`massFlow` does NOT carry forward. Ingredients and steps say what a ' +
        'cook intends, so an unchanged intent stays true. A mass flow says ' +
        'what one batch weighed. Send it again only when you weighed this ' +
        'version. To give a stored version its figure, call add_mass_flow.',
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
            message: followUpMessage(
              `Revision ${result.revisionNumber} created.`,
              result,
            ),
          };
        },
      ),
  );

  server.registerTool(
    'backfill_revision',
    {
      title: 'Backfill an earlier revision',
      description:
        'Record a version of a recipe that existed BEFORE everything already ' +
        'stored. This is for history you are writing down late — an older ' +
        'version found in a notebook, a photo, or an earlier conversation — ' +
        'not for changing a recipe. To change a recipe, use revise_recipe.\n\n' +
        '`occurredAt` must be earlier than every revision already recorded, ' +
        'and the call is refused if it is not. The recipe a reader sees does ' +
        'not change: the current revision stays exactly where it was.\n\n' +
        '`ingredients` is required, and `steps` should be sent whenever the ' +
        'old version had any. Unlike revise_recipe nothing carries forward, ' +
        'because carrying a later version backwards would invent a history ' +
        'that never happened. Send what that version actually was; leave out ' +
        'what you do not know. A name in `uses` must fit exactly one line, ' +
        'as in create_recipe. To point at one of two lines of the same ' +
        'ingredient, write the `component` of that line, then a colon, then ' +
        'the name: "To serve: Glutinous rice".\n\n' +
        '`rationale` should say what this version was and how you know — ' +
        '"the batch-two dredge, from the photo of the notebook page" — since ' +
        'a version recorded years late is only worth having with its source.\n\n' +
        'Send `massFlow` only if you know what that batch weighed at each ' +
        'stage. Do not copy the figure from a later version. That would ' +
        'record a measurement that nobody took.',
      inputSchema: backfillRevisionShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'backfill_revision',
        { slug: args.slug, occurredAt: args.occurredAt },
        async (principal) => {
          requireWrite(principal);
          const input = backfillRevisionSchema.parse(args);
          const result = await backfillRevision(input, 'mcp');
          return {
            ...result,
            url: `/recipes/${result.slug}/revisions/${result.revisionNumber}`,
            message:
              `Recorded as revision ${result.revisionNumber}, placed in the ` +
              `history at ${input.occurredAt}. The current revision did not move.`,
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
        'Pick the kind honestly. The two that get confused:\n' +
        '- `science` explains what is happening *in the dish* — the ' +
        'mechanism, why a technique works. "Duxelles is a moisture ' +
        'barrier, not a flavour layer" is science.\n' +
        '- `research` is what was learned around it afterwards: ' +
        'alternatives, hacks, sourcing, background. "Where to buy crayfish ' +
        'in Berlin" is research. A `research` note must carry at least one ' +
        'source, because research is the kind that records where something ' +
        'came from. With nothing to cite it is an `observation` or an ' +
        '`idea` instead. Each ' +
        'source needs a `url`, a `title` or a `citation`. One of the three ' +
        'is enough. An `accessedAt` on its own is not a source. The other ' +
        'kinds may carry sources; none of them has to.\n\n' +
        'The rest: `observation` for what was noticed, `result` for how it ' +
        'turned out, `substitution` for what was swapped and why, `warning` ' +
        'for a trap worth flagging, `idea` for something untried, ' +
        '`correction` when an earlier claim was wrong.\n\n' +
        'Pass `revisionNumber` alongside `recipeSlug` to pin the note to one ' +
        'revision instead of the recipe as a whole.\n\n' +
        'The site draws a `science` note as a mechanism. Give `conditions` ' +
        'when the mechanism holds under set values: a temperature, a time, ' +
        'a depth. Write each condition as a separate value. Do not write ' +
        'them into a sentence. To add conditions to a note that is already ' +
        'stored, call describe_mechanism.',
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

  /**
   * The three tools below reach a record that is already stored. Every other
   * write tool either makes a new record or appends one, because that is the
   * whole shape of this repository — so these three need their reason
   * written down beside them.
   *
   * The first two fill a field that could not exist when the record was
   * written. D-02 added `notes.conditions` and D-12 added the mass flow
   * tables, and every recipe and every science note in the archive predates
   * both. No other path reaches them: `pnpm ingest` skips a recipe that
   * exists, and a revision whose only change is a diagram has no reason to
   * exist and would move a number that is in URLs and in the
   * ticked-ingredient keys. Neither is an edit. Both refuse a second write,
   * so a value goes from absent to present exactly once and can never be
   * quietly replaced.
   *
   * The third, `reattach_note`, is a different shape and is D-13. It changes
   * no field a reader reads: the note's kind, title, body, conditions,
   * sources and date all stay exactly as they were, and only which record
   * the note hangs off changes. A note's text being fixed does not make its
   * location fixed — the choice of parent is usually forced by what happens
   * to exist yet, and a note written against a batch because the recipe did
   * not exist was stranded there for good. The move is recorded on the note
   * rather than performed silently.
   */
  server.registerTool(
    'add_mass_flow',
    {
      title: 'Add the mass flow figure',
      description:
        'Add the mass flow figure to a version that is already stored. The ' +
        'figure shows what the food weighs at each stage: 10 kg raw, ' +
        '321.7 g of wash, 4.5 kg dried.\n\n' +
        'Use it only for a dish that loses or gains weight, where the ' +
        'reader must plan for the change. Most dishes do not need it.\n\n' +
        'Give the stages in order, first to last. Give two stages at ' +
        'least. Each stage has a label and one figure. The figure is a ' +
        'weight, a count or a wait. Write a wait in minutes: 1440 is one ' +
        'day. Do not give a weight and a wait in the same stage. Split ' +
        'them into two stages.\n\n' +
        'Write a range as a pair. Give `quantity` and `quantityMax` for a ' +
        'weight or a count. Give `durationMinutes` and `durationMaxMinutes` ' +
        'for a wait. Use `rawText` for a stage that neither pair can hold, ' +
        'such as "held under 100 °C".\n\n' +
        '`revisionNumber` says which version the figure describes. Leave it ' +
        'out and the figure goes on the current version. Give a number when ' +
        'the batch you weighed was an older version.\n\n' +
        'Set `emphasis` on the stage that matters most. This is usually ' +
        'the last one.\n\n' +
        'Give `netChangePercent` and `ratePercentPerDay` only if you ' +
        'measured them. The tool does not calculate them. The first stage ' +
        'and the last stage do not have to share a unit.\n\n' +
        'A version takes one figure. The tool refuses a second one. The ' +
        'numbers record a batch that a person weighed. To record a ' +
        'different batch, call revise_recipe and send `massFlow` with it.',
      inputSchema: addMassFlowShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'add_mass_flow',
        { slug: args.slug, revisionNumber: args.revisionNumber },
        async (principal) => {
          requireWrite(principal);
          const input = addMassFlowSchema.parse(args);
          const result = await addMassFlow(input);
          return {
            ...result,
            url: `/recipes/${result.slug}`,
            message:
              `Added the mass flow figure to revision ${result.revisionNumber}. ` +
              'The current revision did not move. A revision takes one ' +
              'figure, so this one cannot be changed.',
          };
        },
      ),
  );

  server.registerTool(
    'describe_mechanism',
    {
      title: 'Give a mechanism its conditions',
      description:
        'Add the conditions to a science note that is already stored. The ' +
        'site draws a science note as a mechanism. The conditions are the ' +
        'values the mechanism holds under: a temperature, a time, a ' +
        'depth.\n\n' +
        'Give each condition as a separate value: ["232 °C", "45 min", ' +
        '"single layer on a rack"]. Do not write them into a sentence. Do ' +
        'not join them with a comma or a dot. The page draws the ' +
        'separators. Keep a range in one value: "4 °C → 71 °C" is one ' +
        'condition, not two.\n\n' +
        'get_recipe gives the id of each note on a recipe. Use that id ' +
        'here.\n\n' +
        'A note states its conditions once. The tool refuses a second set. ' +
        'If the conditions are wrong, call add_note with the kind ' +
        '"correction" and say what is wrong.\n\n' +
        'When you write a new note, send `conditions` to add_note instead. ' +
        'This tool is for a note that was written before.',
      inputSchema: describeMechanismShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'describe_mechanism',
        { noteId: args.noteId },
        async (principal) => {
          requireWrite(principal);
          const input = describeMechanismSchema.parse(args);
          const result = await describeMechanism(input);
          const count = result.conditions.length;
          return {
            ...result,
            message:
              `The mechanism now states ${count} ` +
              `${count === 1 ? 'condition' : 'conditions'}. ` +
              'They cannot be changed.',
          };
        },
      ),
  );

  server.registerTool(
    'reattach_note',
    {
      title: 'Move a note to another record',
      description:
        'Move a note from the record it is on to a different one. Give the ' +
        'note id and exactly one of `recipeSlug`, `ingredientSlug` or ' +
        '`experimentSlug`.\n\n' +
        'The note does not change. Its kind, its title, its text, its ' +
        'conditions, its sources and its date all stay as they are. Only ' +
        'the record it hangs off changes.\n\n' +
        'Use it when a note went somewhere because its real subject did ' +
        'not exist yet. A note about a dish often goes on a run, because ' +
        'the recipe is not written. When you write the recipe, move the ' +
        'note to it. Do not write the note a second time. Two copies of ' +
        'one note drift apart and nothing can tell them apart later.\n\n' +
        'The store keeps each record the note was on before. A reader can ' +
        'see that the note was written somewhere else first.\n\n' +
        'A note on one version of a recipe cannot be moved. That note says ' +
        'something about that version. Write the note again where it ' +
        'belongs.\n\n' +
        'get_recipe, get_ingredient and get_experiment give the id of ' +
        'every note they return. So does search_notes. A moved note takes ' +
        'the last place in the list of its new record.',
      inputSchema: reattachNoteShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'reattach_note',
        {
          noteId: args.noteId,
          recipeSlug: args.recipeSlug,
          ingredientSlug: args.ingredientSlug,
          experimentSlug: args.experimentSlug,
        },
        async (principal) => {
          requireWrite(principal);
          const input = reattachNoteSchema.parse(args);
          const result = await reattachNote(input);
          return {
            ...result,
            message:
              `The note moved from ${result.from} to ${result.to}. Its ` +
              'text did not change. The store keeps where it was before.',
          };
        },
      ),
  );

  server.registerTool(
    'upsert_ingredient',
    {
      title: 'Create or update an ingredient',
      description:
        'Create an ingredient, or change one that is stored. A new recipe ' +
        'makes a bare ingredient record. This tool gives that record its ' +
        'category, its other names, its density and its replacements.\n\n' +
        'A field that you leave out keeps the value the store holds. An ' +
        'explicit null clears `plural`, `description`, `densityGPerMl` and ' +
        '`defaultUnit`. `category` takes no null. Leave `category` out when ' +
        'you do not know it. Send "other" only for a new ingredient that ' +
        'belongs in no group.\n\n' +
        '`name` is the one field that this rule does not cover. It is ' +
        'required, so every call writes it. Send the stored name unless you ' +
        'mean to change it. Send `slug` as well, so the tool changes the ' +
        'record you mean. The tool refuses a `name` that another ingredient ' +
        'already answers to, because two records with one name split the ' +
        'ingredient list for good.\n\n' +
        'The tool also refuses a `name` that carries a backslash escape, ' +
        'such as \\u2014 or \\". That text is a message that was encoded ' +
        'two times. If the stored name already carries one, send `slug` ' +
        'with the clean name: the tool finds the record by its slug and ' +
        'writes the name you send. This is how you mend such a record.\n\n' +
        '`aliases` replaces the whole list. Send every name that you want to ' +
        'keep. Send an empty list to remove them all. The other names make ' +
        'search work across two vocabularies: a search for "cilantro" finds ' +
        'coriander. An alias is also how one recipe lists one ingredient ' +
        'twice: give the second line its own spelling here, then a step can ' +
        'name the line it means.\n\n' +
        '`substitutes` does not replace. It adds to the list, and it never ' +
        'removes a name. The tool records each pair in both directions. A ' +
        'name here that is not an ingredient makes a new ingredient record. ' +
        'Call list_ingredients first, and use the name that is there.\n\n' +
        '`densityGPerMl` lets you compare a volume in one recipe with grams ' +
        'in another.',
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
    'upsert_category',
    {
      title: 'Describe a category tag',
      description:
        'Give a tag its display label, its explanatory blurb and its place ' +
        'in the hierarchy. Tagging a recipe auto-creates any tag it names, ' +
        'so tags usually exist already but with no explanation attached; ' +
        'this is how one gets described.\n\n' +
        'The `description` is shown to readers on hover, so write the ' +
        'sentence a curious reader needs: what distinguishes this tag, not ' +
        'just a restatement of its name. "Cajun" should explain that it is ' +
        'Louisiana country cooking built on a dark roux, not that it is a ' +
        'kind of cuisine.\n\n' +
        'A field that you leave out keeps the value the store holds. Send ' +
        'null to clear `description` or `parentSlug`. `label` is required, ' +
        'so every call writes it.\n\n' +
        '`parentSlug` puts a narrower tag under a broader one in the same ' +
        'category type ("cajun" under "american"). A tag never crosses ' +
        'category types: a cuisine cannot take a technique as its parent. ' +
        'The tool refuses a `parentSlug` that names no tag, and it refuses a ' +
        'tag that names itself. The error says which tag it looked for, and ' +
        'the call writes nothing.\n\n' +
        'TO CLEAR A PARENT, SEND JSON null. Send the value null. Do not ' +
        'send the four letters "null" as text. A text "null" is read as the ' +
        'name of a tag, and the tool then looks for a tag with that name.\n\n' +
        'The result gives `parent`: the tag that this tag now sits under, ' +
        'or null. It is there after every call, so you can see what your ' +
        'call did. A call that leaves `parentSlug` out gets back the parent ' +
        'that is stored. list_categories reports the same field for every ' +
        'tag.\n\n' +
        'A tag cannot be named after an empty value: null, undefined, ' +
        'none, true, false and object-object are refused. These are what a ' +
        'program prints when a value is missing, so a tag with one of these ' +
        'names is an accident. To keep such a word as the label a reader ' +
        'sees, send your own `slug` beside it.\n\n' +
        'Use this after creating a recipe that introduced new tags, so the ' +
        'repository does not accumulate bare, unexplained labels.',
      inputSchema: upsertCategoryShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'upsert_category',
        { categoryType: args.categoryType, label: args.label },
        async (principal) => {
          requireWrite(principal);
          const input = upsertCategorySchema.parse(args);
          return upsertCategory(input);
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
        'A field that you leave out keeps the value the store holds. A ' +
        'second call that adds one observation does not clear the cost, the ' +
        'dates or the recipe. `title` is the exception: it is required, so ' +
        'every call writes it. Send the stored title unless you mean to ' +
        'change it.\n\n' +
        '`items` and `observations` move together, and they replace rather ' +
        'than add. If you send either list, the tool writes both lists again ' +
        'from what you sent, and a measurement that you leave out is gone. ' +
        'So send every item and every observation of the run each time. If ' +
        'you send neither list, the tool keeps the stored measurements.\n\n' +
        'A run records one version of one recipe. Send `recipeSlug` with ' +
        '`revisionNumber` to say which version you cooked. The run keeps ' +
        'that version, so a later call that names the same recipe again does ' +
        'not move the run onto the newest version. Send `revisionNumber` ' +
        'only to correct it, and always with `recipeSlug`. Send ' +
        '`recipeSlug: null` to unlink the run from every recipe.\n\n' +
        'After you write the run it is on /batch-logs at once. The website ' +
        'calls a run a batch log. A run with no `recipeSlug` keeps its own ' +
        'address at /batch-logs/<slug>.',
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

  // ───────────────────────────────────────────────────────────────────────
  // Reporting a fault
  // ───────────────────────────────────────────────────────────────────────

  /**
   * The one tool whose effect lands outside this system.
   *
   * It exists because an agent hit six problems with this connector and had
   * no way to tell anybody. The owner copied the report out of a chat and
   * pasted it to a developer; seven agents then reproduced every claim and
   * three were wrong. Every one of those errors was the same error — the
   * report carried a MEMORY of what happened instead of the EVIDENCE. So
   * this is not a feedback box. It captures, at the moment of failure, the
   * tool that was called, the payload that was sent, the response that came
   * back, and the commit that is deployed.
   *
   * REGISTERED ONLY WHEN THE CREDENTIAL EXISTS. `registerTools` is
   * synchronous and is called from `createMcpHandler`'s builder inside a
   * route marked `export const dynamic = "force-dynamic"`, so this `if` runs
   * per request and reads the live environment. A registered-but-broken
   * `report_issue` would be strictly worse than no tool, because an agent
   * would file into a void and consider the problem reported.
   *
   * NO SCOPE CHECK, AND DELIBERATELY SO. Do not add `requireWrite` here.
   * `noble-notations:write` means "may add and revise content in this
   * repository"; this tool writes no row and reads none. Worse, gating on it
   * fails the use case: a read-only agent is exactly the one that meets a
   * read tool's bug, and the reports we most want would be the ones we could
   * not receive. A third scope was rejected too — `parseScopeString` drops
   * an unrecognised scope and falls back to read, so every token already
   * minted would lack it and every existing connector would be refused this
   * tool until its owner re-ran the whole OAuth dance. The gate is
   * authentication: `withMcpAuth` is `required: true`, so every caller holds
   * a token the owner approved on a consent screen, and that approval is the
   * permission that matters.
   */
  if (issueReportingConfigured()) {
    server.registerTool(
      'report_issue',
      {
        title: 'Report a fault in this connector',
        description:
          'File a report about this connector. The report becomes an issue ' +
          'on the public GitHub repository of this project. Call it the ' +
          'moment a tool does the wrong thing. Do not wait until your task ' +
          'is finished.\n\n' +
          'Send evidence. Do not send memory. Copy the arguments you sent ' +
          'into `payload`. Copy the answer you got into `response`. Name ' +
          'the tool in `toolName`. The tool adds the commit that is ' +
          'deployed. Those four facts settle a report. A report written ' +
          'from memory has been wrong before.\n\n' +
          'A report of kind "bug" must carry toolName, payload and ' +
          'response. The tool refuses a bug report without all three. Use ' +
          'the kind "unclear-docs", "missing-capability" or "idea" when you ' +
          'do not have them.\n\n' +
          'The report is public. The tool removes values that match a known ' +
          'credential pattern. It tells you how many values it removed. It ' +
          'cannot find every credential, so do not send one.\n\n' +
          'The tool writes to one repository. You cannot choose it.\n\n' +
          'Call the tool one time for one fault. If the same fault happens ' +
          'again, call it again with the same title. The tool then adds a ' +
          'comment to the report that is already filed. It does not file a ' +
          'second one. The tool adds three comments for one fault. Then it ' +
          'refuses, and you must stop.',
        inputSchema: reportIssueShape,
      },
      async (args, extra) =>
        runTool(
          extra as AuthCtx,
          'report_issue',
          // The audit rule holds here as everywhere: no free-form text. The
          // kind and the tool name are identifying primitives; the title,
          // the body, the payload and the response are not logged. This row
          // is the only local record that a filing happened at all, and it
          // is the evidence for "who filed the hundred issues" when the cap
          // is investigated. The cap does not read it — that write is
          // fire-and-forget and may fail, and enforcement must not stand on
          // data that is allowed to be missing.
          //
          // `toolName` is free-form text until the schema has seen it, and
          // this row is written from the RAW arguments, before the parse and
          // before the redaction that protects the public issue. Sixty-four
          // characters is room enough for one of this server's own access
          // tokens, so it is redacted and cut here.
          { kind: args.kind, toolName: auditToolName(args.toolName) },
          async (principal) => {
            const input = reportIssueSchema.parse(args);
            const token = issueToken();
            if (!token) {
              // Only reachable if the variable was cleared between the
              // registration above and this call.
              throw new ReportFailedError(
                'The tool did not file this report. This deployment cannot ' +
                  'file reports. The fault is in the server. Your report is ' +
                  'correct.\n\nTell the person you work with about this ' +
                  'fault. Give them the tool name, the payload and the ' +
                  'response. Do not call report_issue again in this session.',
                0,
              );
            }
            return submitReport(input, createGitHubIssues({ token }), {
              userId: principal.userId,
            });
          },
        ),
    );
  } else {
    warnIssueReportingIsOff();
  }
}
