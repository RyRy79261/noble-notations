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
  deleteRecordSchema,
  deleteRecordShape,
  describeMechanismSchema,
  describeMechanismShape,
  listDeletedSchema,
  listDeletedShape,
  logExperimentSchema,
  logExperimentShape,
  reportIssueSchema,
  reportIssueShape,
  restoreRecordSchema,
  restoreRecordShape,
  reviseRecipeSchema,
  reviseRecipeShape,
  backfillRevisionSchema,
  backfillRevisionShape,
  buildShoppingListSchema,
  buildShoppingListShape,
  searchRecipesSchema,
  searchRecipesShape,
  updateNoteSchema,
  updateNoteShape,
  updateRecipeSchema,
  updateRecipeShape,
  updateRevisionSchema,
  updateRevisionShape,
  CATEGORY_TYPES,
  upsertIngredientSchema,
  upsertIngredientShape,
  upsertCategorySchema,
  upsertCategoryShape,
  type CategoryType,
  type DeletableKind,
} from '@/lib/domain/schemas';
import {
  buildShoppingList,
  getExperiment,
  getIngredient,
  getRecipeBySlug,
  getRecipeIdentity,
  getStats,
  listExperiments,
  listIngredients,
  listCategories,
  searchRecipes,
} from '@/lib/queries/read';
/**
 * The one read module that sees deleted rows, imported by the one tool that
 * shows them. `src/lib/queries/read.ts` cannot name a base table at all —
 * `eslint.config.mjs` refuses the import — so the bin lives in its own file
 * and reaches the registry from there.
 */
import { isDeletedRecipe, listDeleted } from '@/lib/queries/deleted';
import {
  addMassFlow,
  addNote,
  ConflictError,
  createRecipe,
  deleteRecord,
  describeMechanism,
  logExperiment,
  NotFoundError,
  restoreRecord,
  reviseRecipe,
  backfillRevision,
  updateNote,
  updateRecipe,
  updateRevision,
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

/**
 * The word a person reads for one of the six deletable kinds.
 *
 * The enum says `revision` and `experiment`; every sentence this connector
 * writes says "version" and "run", because that is the vocabulary of the
 * guide, the site and the other tool descriptions. Nothing is lost by writing
 * the readable word in the prose: the structured `kind` sits beside it in the
 * same result, and `restore_record` takes the enum value from there.
 */
const KIND_WORDS: Record<DeletableKind, readonly [string, string]> = {
  recipe: ['recipe', 'recipes'],
  revision: ['version', 'versions'],
  note: ['note', 'notes'],
  experiment: ['run', 'runs'],
  ingredient: ['ingredient', 'ingredients'],
  tag: ['tag', 'tags'],
};

/** "1 version, 3 notes and 2 runs", or null when the list is empty. */
function countsInWords(
  entries: { kind: DeletableKind; count: number }[],
): string | null {
  const parts = entries.map(({ kind, count }) => {
    const [one, many] = KIND_WORDS[kind];
    return `${count} ${count === 1 ? one : many}`;
  });
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
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
        if (!recipe) {
          // A numbered read of a LIVE recipe misses when that one version is
          // deleted, and `getRecipeBySlug` cannot tell the two apart — it
          // returns null either way. Saying the recipe does not exist would
          // be false, and it is the one answer that stops a model looking.
          if (args.revisionNumber && (await getRecipeIdentity(args.slug))) {
            throw new NotFoundError(
              `Recipe "${args.slug}" has no revision ${args.revisionNumber} ` +
                'that can be read. Call list_deleted to see whether it was ' +
                'deleted, or get_recipe without revisionNumber for the ' +
                'current version.',
            );
          }
          // The same answer one level up. A deleted RECIPE also returns null
          // from `getRecipeBySlug`, and `No recipe with slug "x"` is the one
          // sentence that stops a model looking — it reads as "this never
          // existed" for a record that is sitting in the bin with a reason
          // written on it, one call from coming back. The refusal for a
          // deleted VERSION has named `list_deleted` since it was written;
          // these two are the same event at two scales and now say so.
          if (await isDeletedRecipe(args.slug)) {
            throw new NotFoundError(
              `Recipe "${args.slug}" is deleted, so there is nothing to ` +
                'read. Call list_deleted to see the bin, or restore_record ' +
                `{ kind: "recipe", slug: "${args.slug}" } to bring it back.`,
            );
          }
          throw new NotFoundError(`No recipe with slug "${args.slug}".`);
        }
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

  /**
   * The bin, and the only read in the registry that reports a row the site
   * does not show.
   *
   * IT IS IN THE READ SCOPE, deliberately. A caller that can delete can
   * already see what it deleted in the delete's own result; the value of this
   * tool is to the caller that arrives afterwards and has to find out what is
   * missing and why. The read scope already grants archived recipes, and
   * `ALLOWED_EMAILS` means one administrator approves every connector — so
   * the rows are not hidden from a different audience, they are hidden from
   * the public site. Putting the bin behind write would mean a read-only
   * agent could see that a recipe is absent and never learn that it is
   * recoverable.
   */
  server.registerTool(
    'list_deleted',
    {
      title: 'What is in the bin',
      description:
        'List the records that are deleted. Each row gives the kind, a name ' +
        'that you can read, the date, who deleted it, and the reason.\n\n' +
        'Each row also gives the arguments for restore_record, ready to ' +
        'send. A row that must wait names the record to restore first.\n\n' +
        'Give `kind` to see one kind only.',
      inputSchema: listDeletedShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'list_deleted',
        { kind: args.kind },
        async () => {
          const input = listDeletedSchema.parse(args);
          return listDeleted(input);
        },
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
        'for whenever the dish changes. A revision costs nothing and the ' +
        'version it supersedes stays readable.\n\n' +
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
        'version. To give a stored version its figure, call add_mass_flow.\n\n' +
        /*
         * THE ONE PARAGRAPH THAT DECIDES BETWEEN TWO TOOLS, and it is in both
         * descriptions in the same words. An agent that reaches for
         * update_revision when it means this tool overwrites the version a
         * person cooked from and loses the history this repository exists to
         * keep. The question is put first because a model picks a tool from
         * the top of a description far more often than from the bottom of
         * one, and the answer is a fact about the food rather than about the
         * database — which is the only thing the caller reliably knows.
         */
        'Use this tool when the dish changed. It adds a new version and ' +
        'moves the recipe to it. The old version stays and people can still ' +
        'read it.\n\n' +
        'If the dish did not change, and the record is wrong, call ' +
        'update_revision. It corrects the stored version. It makes no new ' +
        'version and it moves no number.',
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
        'in Berlin" is research. Give `sources` where you have them. Each ' +
        'source needs a `url`, a `title` or a `citation`. One of the three ' +
        'is enough. An `accessedAt` on its own is not a source.\n\n' +
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
   * The two tools below reach a record that is already stored. Every other
   * write tool either makes a new record or appends one, because that is the
   * whole shape of this repository — so these two need their reason written
   * down beside them.
   *
   * Each fills a field that could not exist when the record was written.
   * D-02 added `notes.conditions` and D-12 added the mass flow tables, and
   * every recipe and every science note in the archive predates both. No
   * other path reaches them: `pnpm ingest` skips a recipe that exists, and a
   * revision whose only change is a diagram has no reason to exist and would
   * move a number that is in URLs and in the ticked-ingredient keys.
   *
   * NEITHER IS AN EDIT, AND THAT PROMISE IS NOW LOCAL TO THEM. Both still
   * refuse a second write, so a value goes from absent to present exactly
   * once and neither of these two tools can quietly replace a measurement —
   * which is the whole reason they are shaped this way. What changed is that
   * the repository now has a general correction path: `update_revision`
   * replaces a stored figure and `update_note` replaces a stored set of
   * conditions. So the refusals here no longer say "this cannot be changed",
   * which was true when they were written and would now be a lie in the one
   * place a model has no way to check. They name the tool that does it.
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
        'different batch, call revise_recipe and send `massFlow` with it. ' +
        'To correct a figure that is wrong, call update_revision.',
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
              'figure, so this tool refuses a second one. To correct this ' +
              'figure, call update_revision.',
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
        'To correct them, call update_note. To leave the old claim readable, ' +
        'call add_note with the kind "correction" and say what is wrong.\n\n' +
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
              'This tool refuses a second set. To correct them, call ' +
              'update_note.',
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
        '`recipeSlug: null` to unlink the run from every recipe.',
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
  // Correcting a record
  //
  // Three tools, not six. `log_experiment`, `upsert_ingredient` and
  // `upsert_category` are already the update path for their own records —
  // each one merges the keys the caller sent onto the stored row — so a
  // second tool for those three would be two tools writing one row under two
  // different merge rules.
  //
  // TYPED, ONE PER RECORD, WHERE DELETE AND RESTORE ARE GENERIC. Delete and
  // restore take a kind and an address, which is genuinely uniform. An update
  // carries a body, and a generic `update(kind, id, patch)` would have to
  // take that body as an opaque object — which throws away
  // `src/lib/domain/schemas.ts`, where the raw SHAPE is the advertised JSON
  // Schema and the assembled SCHEMA enforces it, so the signature a model
  // reads and the contract the server keeps cannot drift.
  // ───────────────────────────────────────────────────────────────────────

  server.registerTool(
    'update_recipe',
    {
      title: 'Correct a recipe',
      description:
        'Correct the record of a recipe. This tool changes the name, the ' +
        'summary, the tags, the links, the kind and the status. It touches ' +
        'no version and it makes no version.\n\n' +
        'Use revise_recipe when the dish changed. Use this tool when the ' +
        'record is wrong: a typo in the title, a summary that says the ' +
        'wrong thing, a tag that does not belong.\n\n' +
        'You cannot change the slug. The slug is the public address of the ' +
        'recipe.\n\n' +
        '`categories` and `links` each replace the whole list. Call ' +
        'get_recipe first. Then send back each one that you want to keep.\n\n' +
        '`currentRevisionNumber` moves the recipe to another stored ' +
        'version. People then read that version. Every version stays.',
      inputSchema: updateRecipeShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'update_recipe',
        { slug: args.slug },
        async (principal) => {
          requireWrite(principal);
          const input = updateRecipeSchema.parse(args);
          const result = await updateRecipe(input);
          return {
            ...result,
            url: `/recipes/${result.slug}`,
            // The same follow-up text `create_recipe` gets, for the same
            // reason: `categories` replaces the whole list and names what it
            // creates, so a correction can mint a bare tag exactly as a
            // creation can, and it owes the same description.
            message: followUpMessage('Corrected.', result),
          };
        },
      ),
  );

  server.registerTool(
    'update_revision',
    {
      title: 'Correct a version',
      description:
        'Correct a version that is already stored. This tool changes the ' +
        'version in place. It makes no new version. It moves no number.\n\n' +
        'Ask one question first: did the food change, or is the record ' +
        'wrong? If the food changed, call revise_recipe. It adds a new ' +
        'version and keeps the old one. If the record is wrong, call this ' +
        'tool. Use it for a typo, for an amount that nobody cooked, or for ' +
        'a version that two chats wrote twice.\n\n' +
        '`ingredients`, `steps` and `massFlow` each replace the whole list. ' +
        'A list that you leave out stays as it is. Send `steps` with ' +
        '`ingredients` when you change a line that a step names. Send ' +
        '`massFlow` as null to remove the figure.\n\n' +
        '`occurredAt` says when this version existed. The history is ' +
        'ordered by it, so the history re-orders.\n\n' +
        'You do not need to give a reason.',
      inputSchema: updateRevisionShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'update_revision',
        { slug: args.slug, revisionNumber: args.revisionNumber },
        async (principal) => {
          requireWrite(principal);
          const input = updateRevisionSchema.parse(args);
          const result = await updateRevision(input);
          return {
            ...result,
            url: `/recipes/${result.slug}/revisions/${result.revisionNumber}`,
            message: followUpMessage(
              `Corrected revision ${result.revisionNumber}. No version was ` +
                'made and no number moved.',
              result,
            ),
          };
        },
      ),
  );

  server.registerTool(
    'update_note',
    {
      title: 'Correct a note',
      description:
        'Correct a note that is already stored. This tool changes the kind, ' +
        'the title, the body, the conditions and the sources. It can also ' +
        'move the note to another recipe, version, ingredient or run.\n\n' +
        '`conditions` and `sources` each replace the whole list. Send an ' +
        'empty list to clear one.\n\n' +
        'Add a note of kind "correction" when you want the old claim to ' +
        'stay readable. Use this tool when the note itself is wrong: a ' +
        'typo, a wrong number, the wrong recipe.\n\n' +
        'get_recipe gives the id of each note on a recipe. Use that id ' +
        'here.\n\n' +
        'You do not need to give a reason.',
      inputSchema: updateNoteShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'update_note',
        { noteId: args.noteId },
        async (principal) => {
          requireWrite(principal);
          const input = updateNoteSchema.parse(args);
          const result = await updateNote(input);
          return { ...result, message: 'Corrected.' };
        },
      ),
  );

  // ───────────────────────────────────────────────────────────────────────
  // Delete and restore
  //
  // TWO TOOLS FOR SIX KINDS, AND NOT TWELVE. The argument list of a delete
  // is a kind and an address, which is the same for every record — so a pair
  // per kind would be twelve definitions of roughly a hundred tokens each,
  // about a thousand tokens on every `tools/list` in every conversation,
  // forever, to carry a distinction the `kind` argument already carries. The
  // enum is in the schema the model reads beside the name, so the six legal
  // values are as visible as six registry entries would be, and strictly
  // more visible for the question "what can I delete?", which is one enum
  // instead of a scan of the whole list.
  //
  // The counter-argument is blast radius: `delete_record` is easier to call
  // by accident than `delete_tag`. It is bounded by construction. Every
  // delete is soft, the result names everything that went with it,
  // `list_deleted` shows the bin, and `restore_record` takes the same
  // arguments back.
  //
  // THE NAMES ARE NOT `delete` AND `restore`. Every tool in this registry is
  // verb_noun, and a bare `delete` is the single most likely name in this
  // surface to collide with another connector in a session that has several.
  // ───────────────────────────────────────────────────────────────────────

  server.registerTool(
    'delete_record',
    {
      title: 'Delete a record',
      description:
        'Delete one record. The record stops being visible: the site does ' +
        'not show it and the read tools do not return it. It is not ' +
        'destroyed. Call restore_record to bring it back.\n\n' +
        'ONE ADDRESS IS NOT COVERED, and it is not a fault. A recipe that ' +
        'came from the frozen Markdown archive is also served at ' +
        '/archive/<path>, which reads the file off disk and never the ' +
        'database. Deleting the record does not change that page. To take ' +
        'the archived text down, remove the file.\n\n' +
        'Name the kind, then say which record. Use `id` for any kind. Use ' +
        '`slug` for a recipe, a run or an ingredient. Use `slug` with ' +
        '`revisionNumber` for a version. Use `slug` with `categoryType` for ' +
        'a tag. A note has only an `id`.\n\n' +
        'Some records take others with them. A recipe takes its versions, ' +
        'its notes and its runs. A version takes its notes. A run takes its ' +
        'notes. The result names what went with it, and one restore brings ' +
        'back the same set.\n\n' +
        'Give a `reason`. The bin shows it. It is the only thing that tells ' +
        'the next reader why the record went.\n\n' +
        'Delete a duplicate. Delete a record that somebody wrote by ' +
        'mistake. Do not delete a version because the dish changed: call ' +
        'revise_recipe for that.',
      inputSchema: deleteRecordShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'delete_record',
        // The audit rule holds: identifying primitives only. `reason` is
        // free-form text the caller wrote, so it is not logged here — it is
        // stored on the row itself, which is where the bin reads it.
        {
          kind: args.kind,
          id: args.id,
          slug: args.slug,
          revisionNumber: args.revisionNumber,
          categoryType: args.categoryType,
        },
        async (principal) => {
          requireWrite(principal);
          const input = deleteRecordSchema.parse(args);
          const { reason, ...address } = input;
          const result = await deleteRecord(address, {
            reason,
            // The one new thing the write layer learns. `deleted_by` is
            // denormalised on purpose: the bin prints it beside the date and
            // the reason, and `mcp_audit_log` cannot be asked for it — that
            // write is fire-and-forget, nothing reads the table, and it
            // records tool CALLS rather than the state of a row.
            actor: principal.userId,
          });
          const went = countsInWords(result.cascaded);
          return {
            ...result,
            message: [
              `Deleted ${result.handle}. It is not destroyed: the site does`,
              'not show it and the read tools do not return it.',
              ...(went ? [`${went} went with it.`] : []),
              'Call restore_record with the same arguments to bring back the',
              'same set.',
            ].join(' '),
          };
        },
      ),
  );

  server.registerTool(
    'restore_record',
    {
      title: 'Restore a record',
      description:
        'Bring back a record that is deleted. It becomes visible again. ' +
        'Name the record the same way you name it in delete_record.\n\n' +
        'A restore brings back the set that one delete removed. It does not ' +
        'bring back a record that somebody deleted on its own before that. ' +
        'Call list_deleted to see what is still in the bin.\n\n' +
        'You cannot restore a record while the record it belongs to is ' +
        'still deleted. The refusal names what to restore first.',
      inputSchema: restoreRecordShape,
    },
    async (args, extra) =>
      runTool(
        extra as AuthCtx,
        'restore_record',
        {
          kind: args.kind,
          id: args.id,
          slug: args.slug,
          revisionNumber: args.revisionNumber,
          categoryType: args.categoryType,
        },
        async (principal) => {
          requireWrite(principal);
          const input = restoreRecordSchema.parse(args);
          const result = await restoreRecord(input, {
            actor: principal.userId,
          });
          const back = countsInWords(result.restored);
          return {
            ...result,
            message: [
              `Restored ${result.handle}. It is visible again.`,
              ...(back ? [`${back} came back with it.`] : []),
              // Only for a version, and it is the one part of a restore that
              // surprises a caller: deleting the current version moved the
              // recipe to the newest survivor, and bringing it back does not
              // move the recipe on to it again. The version returns to the
              // history; what people read is a separate decision, and
              // somebody has to state it.
              ...(result.kind === 'revision'
                ? [
                    'A restore does not decide which version people read.',
                    'Call update_recipe with `currentRevisionNumber` to move',
                    'the recipe to this version.',
                  ]
                : []),
            ].join(' '),
          };
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
   * `noble-notations:write` means "may change the content of this
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
