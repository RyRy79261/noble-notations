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
import { CANONICAL_UNITS, isKnownUnit } from '@/lib/domain/units';
import { slugify } from '@/lib/domain/slug';

/**
 * The kinds of category a tag can belong to.
 *
 * The database column is still named `facet`; only the words people and
 * agents see changed. A rename of the column would be a destructive
 * migration for a vocabulary change, which is not a good trade.
 */
export const CATEGORY_TYPES = [
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
export type CategoryType = (typeof CATEGORY_TYPES)[number];

/** @deprecated Use CategoryType. Kept so the db layer reads naturally. */
export type TaxonomyFacet = CategoryType;

/**
 * Slugs a tag may never take.
 *
 * Every entry is what a programming language prints when it turns an empty
 * or non-string value into text: JavaScript's `String(null)`,
 * `String(undefined)`, `String(true)` and `` `${{}}` ``, and Python's
 * `str(None)`, `str(True)` and `str(False)`. None of them is a word a cook
 * would choose for a tag, and all of them arrive the same way — a variable
 * that held nothing was interpolated into a label.
 *
 * The rule exists because such a tag is not merely useless: it is usable.
 * `slugify('null')` is `'null'`, so one accidental label makes a real term
 * with a real slug, and `parentSlug: 'null'` — which a caller reaches for
 * when it means "no parent" — then RESOLVES against it and silently
 * reparents a tag onto the junk. Refusing the name is what stops the pair
 * of mistakes meeting.
 *
 * THE TEST IS ON THE SLUG, NOT THE LABEL, and that is the escape hatch. A
 * label is free text; only the slug is identity. `upsert_category` takes an
 * explicit `slug`, so a tag that genuinely wants one of these words as its
 * display label can still have it — `{ label: 'None', slug: 'no-diet' }` is
 * accepted, and the reader sees "None".
 *
 * `nan` IS DELIBERATELY NOT IN THIS LIST, and a later reader should not add
 * it. It is `String(NaN)`, so it fits the pattern — but this is a cooking
 * repository, `nan` is bread, and `slugify('Nan')` is `'nan'`. NaN comes out
 * of arithmetic, and no arithmetic produces a tag label, so the accident it
 * would catch is rarer than the tag it would refuse.
 */
export const RESERVED_TAG_SLUGS = [
  'null',
  'undefined',
  'none',
  'true',
  'false',
  'object-object',
] as const;

/** Whether an already-slugified string is one of the reserved words. */
export function isReservedTagSlug(slug: string): boolean {
  return (RESERVED_TAG_SLUGS as readonly string[]).includes(slug);
}

/** The refusal, worded for the caller that is naming a tag. */
export function reservedTagSlugMessage(slug: string): string {
  return (
    `"${slug}" is not a name a tag can have. It is what a program prints ` +
    'when a value is empty, so a tag with that name is almost always an ' +
    'accident. The reserved names are: ' +
    `${RESERVED_TAG_SLUGS.join(', ')}. Give the tag the name of the thing ` +
    'it groups. To keep one of these words as the label a reader sees, send ' +
    'a `slug` of your own beside it.'
  );
}

/**
 * Text that a JSON encoder ran over two times.
 *
 * A client that encodes a string, then encodes the result again, sends the
 * ESCAPE instead of the character: the six characters `\u2014` where an em
 * dash belongs, and `\"` where a quotation mark belongs. Both are legal
 * JSON string content, so the request parses, and the escape is then stored
 * and drawn exactly as it arrived. Two titles in this repository carry that
 * damage today. Nothing can repair them: a title is not a note, so a
 * `correction` note cannot answer it, and no tool edits a stored title.
 *
 * So the check is at the boundary, and it REFUSES rather than repairs.
 * Unescaping on read or on write would corrupt a title that legitimately
 * holds a backslash, and it would guess; a refusal asks.
 *
 * ONLY THESE TWO PATTERNS, and each is chosen because `JSON.parse` consumes
 * it. A decoded string can hold a backslash, but it cannot hold `\u` before
 * four hex digits, and it cannot hold `\` before a quotation mark, unless
 * the encoding happened twice. `\n` and `\t` are deliberately absent: they
 * collide with `C:\notes` and `C:\temp`, and a Windows path is a thing a
 * person writes. `\Users` does not match either, because the escape JSON
 * emits is a lower-case `u` and the four characters after it must all be
 * hexadecimal.
 */
const DOUBLE_ENCODED = /\\u[0-9a-fA-F]{4}|\\"/;

/**
 * Guard the one-line name of a thing.
 *
 * Applied to titles, labels and names — the short strings a reader meets as
 * a heading and the writer meets as identity. NOT applied to a body, a
 * summary, a description or a citation: those are Markdown, Markdown holds
 * code, and a fenced block that explains `\u2014` or a regular expression
 * that contains `\"` is text somebody meant.
 *
 * EVERY DOOR OF THAT SHAPE, NOT THE FIRST FIVE. The rule began on the note
 * title, which is where the damage was reported, and on the four titles and
 * labels beside it. That left the sibling paths that write the same kind of
 * text somewhere worse: `ingredients[].name` on a recipe mints a canonical
 * ingredient and a permanent slug and lands in an immutable revision, a tag
 * label mints a term, an alias becomes a lookup key nobody can type, and
 * `phase` and `component` are headings a reader meets inside a revision that
 * no tool can edit. A rule that refuses `upsert_ingredient {name}` and
 * accepts the identical string one field away is not a boundary; it is a
 * sign on one of two doors.
 *
 * DELIBERATELY LEFT OUT, so a later reader does not take the list for an
 * oversight: `subtitle`, `sources[].title`, `steps[].equipment` and
 * `observations[].metric`. None of them names a record and none mints a
 * slug; each is closer to prose or to machine vocabulary than to a heading,
 * and a wrong one there is legible and can be superseded by a new revision.
 * That is the test this rule is drawn against.
 *
 * A STORED NAME THAT IS ALREADY DAMAGED IS STILL REPAIRABLE, which is worth
 * knowing because the refusal reads as a dead end otherwise.
 * `upsert_ingredient` finds its row by `slug`, so the damaged slug sent
 * beside a clean `name` rewrites the name. The rule refuses what arrives; it
 * never refuses to mend what is stored.
 */
const PLAIN_NAME_RULE =
  'Send the characters themselves. A name that arrives holding a backslash ' +
  'escape — `\\u2014` where an em dash belongs, `\\"` where a quotation ' +
  'mark belongs — is refused, because it is almost always a string that was ' +
  'encoded twice and the store cannot correct it later.';

const TAG_NAME_RULE =
  'A tag cannot be named after an empty value. These names are refused: ' +
  `${RESERVED_TAG_SLUGS.join(', ')}. To keep one of them as the label a ` +
  'reader sees, send a `slug` of your own beside it.';

/**
 * Append a rule to a field's description without losing what is there.
 *
 * The rule is a refinement, so JSON Schema cannot express it. A caller that
 * reads the advertised signature would meet it only by being refused. The
 * repository already holds that principle — see the contract test named
 * "the two rules a caller cannot see in the schema are in the text" — so the
 * sentence goes where the caller is already looking.
 */
function withRule<T extends z.ZodType>(schema: T, rule: string): T {
  const existing = schema.description;
  return schema.describe(existing ? `${existing} ${rule}` : rule) as T;
}

function plainName<T extends z.ZodString>(schema: T, field: string): T {
  return withRule(
    schema.refine((value) => !DOUBLE_ENCODED.test(value), {
      error:
        `\`${field}\` carries a backslash escape: text of the form \\u2014 ` +
        'or \\". This is almost always a string that was encoded as JSON two ' +
        'times. Send the characters themselves — the em dash, the quotation ' +
        'mark — and let your encoder escape them one time. The store keeps ' +
        'the text exactly as it arrives, and no tool can correct it later.',
    }),
    PLAIN_NAME_RULE,
  ) as T;
}

/**
 * The name of a tag, wherever one is written.
 *
 * Three fields reach `resolveTermId` in `src/lib/queries/write.ts` and each
 * one creates a tag from the text it is given: `upsert_category`'s label, a
 * recipe's `categories`, and a step's `technique`. They are one rule and
 * they are written as one function, because the first fix wrote the rule
 * twice, missed the third field, and then stated an invariant that field
 * made false.
 *
 * The base schema is a parameter rather than a constant so a caller keeps
 * its own bounds. `technique` is `max(120)` with no floor and a tag label is
 * `min(1).max(120)`; a helper that imposed one shape would change an
 * advertised JSON Schema as a side effect of tightening a rule.
 */
function tagName<T extends z.ZodString>(schema: T, field: string): T {
  return withRule(
    plainName(schema, field).refine(
      (label) => !isReservedTagSlug(slugify(label)),
      {
        error: (issue) => reservedTagSlugMessage(slugify(String(issue.input))),
      },
    ),
    TAG_NAME_RULE,
  ) as T;
}

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
  'science',
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

/**
 * A source has to name something. Every field on it is optional, so `{}` is
 * a legal object — and `requireSourcesForResearch` only counts the array,
 * so one empty object satisfied the count and defeated the rule the
 * `research` kind exists for. `sources: [{}]` and `sources: [{title: ''}]`
 * were both accepted; the page then drew the row as "Untitled source",
 * which is the row `src/components/f/citation.tsx` says must assert
 * nothing. Provenance that names nothing is not provenance.
 *
 * The check goes on the leaf rather than on `noteSchema`, for two reasons.
 * `noteSourceSchema` is referenced in exactly one place — `noteSchema.sources`
 * — so refining it here reaches all five note paths at once and
 * `requireSourcesForResearch` needs no change. And a check on `noteSchema`
 * would have to reach through the array itself, while `addNoteShape` spreads
 * `noteSchema.shape`: keeping the object schema unwrapped keeps that spread
 * working and keeps the issue path on the offending row rather than on the
 * note.
 *
 * Trimmed, because a string of spaces is as empty as no string at all, and
 * `accessedAt` is excluded on purpose: a date says when the source was read,
 * not what was read. It qualifies a source; it cannot be one.
 */
export const noteSourceSchema = z
  .object({
    url: z.url().optional(),
    title: z.string().max(300).optional(),
    citation: z.string().max(2000).optional(),
    accessedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .optional(),
  })
  .refine(
    (source) =>
      [source.url, source.title, source.citation].some(
        (field) => (field ?? '').trim() !== '',
      ),
    {
      error:
        'This entry in `sources` is empty. Give it a `url`, a `title` or a ' +
        '`citation`. One of the three is enough. A blank string does not ' +
        'count. An `accessedAt` on its own does not count either — a date ' +
        'says when you read the source, not what the source is.',
    },
  );

/**
 * A unit the vocabulary knows, in any of its spellings.
 *
 * The vocabulary and its alias table already existed, and `normaliseUnit`
 * was already applied on write — "pieces" and "pc" have always folded onto
 * "piece". What was missing is refusal: an unrecognised spelling fell
 * through and was stored verbatim, so "stalk" and "sachet" entered the data
 * as units nobody can total or convert. Rejecting at the edge keeps the set
 * closed; the error names the canonical spellings so the caller can pick.
 */
const unitField = z
  .string()
  .max(40)
  .refine(isKnownUnit, {
    error: (issue) =>
      `"${String(issue.input)}" is not a unit this repository uses. ` +
      `Canonical units: ${CANONICAL_UNITS.join(', ')}. Common spellings ` +
      'fold onto these — "pieces" and "pc" both become "piece" — but a ' +
      'unit outside the set is refused rather than stored, because a unit ' +
      'nobody can convert cannot be summed into a shopping list or ' +
      'compared across batches.',
  })
  .describe(
    'One of the canonical units, or any of their spellings. Mass is ' +
      'preferred: only mass compares across batches of different size. ' +
      'Volume and count are accepted and preserved as written.',
  );

/**
 * The conditions a mechanism holds under.
 *
 * R-SCR-41 wants them as separate values, and the tool description is the
 * only instruction the model gets, so it says what "separate" means and
 * gives the two cases that get it wrong: joining them into a sentence, and
 * splitting a range that is one condition.
 */
const conditionsField = z
  .array(z.string().min(1).max(120))
  .max(12)
  .describe(
    'Conditions, as separate values: ["232 °C", "45 min", "single layer ' +
      'on a rack"]. Give one value for each condition. Do not write them ' +
      'into a sentence. Do not join them with a comma or a dot — the page ' +
      'draws the separators. Keep a range in one value: "4 °C → 71 °C" is ' +
      'one condition, not two. Write them as you would say them; the page ' +
      'puts them in capitals.',
  );

export const noteSchema = z.object({
  kind: z
    .enum(NOTE_KINDS)
    .describe(
      'science = what is physically or chemically happening in the dish, ' +
        'and why a technique works; research = what was learned after ' +
        'making it — alternatives, hacks, sourcing, background (must give ' +
        'at least one entry in `sources`); observation = what happened; ' +
        'substitution = what was ' +
        'swapped and why; warning = a trap; result = how it turned out; ' +
        'idea = untried; correction = fixes an earlier claim',
    ),
  title: plainName(z.string().max(200), 'title').optional(),
  body: z.string().min(1).max(20000).describe('Markdown'),
  /**
   * Meaningful on a `science` note, which the site draws as a mechanism.
   * Accepted on every kind: an empty list on the other seven costs nothing,
   * and refusing them there would have to be undone the first time a
   * `warning` wants to say at what temperature it applies.
   */
  conditions: conditionsField.optional(),
  sources: z
    .array(noteSourceSchema)
    .max(100)
    .optional()
    .describe(
      'A `research` note must have at least one source. The other kinds do ' +
        'not need a source, but they can have one. ' +
        'Each source needs a `url`, a `title` or a `citation`. One of the ' +
        'three is enough. An `accessedAt` on its own is not a source.',
    ),
});
export type NoteInput = z.infer<typeof noteSchema>;

/**
 * **`position` is deliberately NOT in this shape, and not in any MCP tool.**
 *
 * `notes.position` and `note_sources.position` were added so a note holds a
 * fixed place in the list it is drawn in — `/science` numbers a study's
 * mechanisms `M1…Mn` from that order. The obvious next step is to let a
 * client name the position, and it is the wrong one.
 *
 * The order a client can express, it already expresses: `notes` is an array
 * and `writeNotes` stores it in the order given, so a caller writing four
 * mechanisms in the order a cook meets them gets exactly that back. A
 * `position` field on top of that is a second way to say the same thing,
 * and the two disagree the first time a caller sets one and not the other.
 *
 * What a writable position would add is the one thing the model refuses
 * everywhere else: writing into a list somebody else made. `add_note`
 * appends to a recipe whose other notes it did not write, and choosing
 * their slot would renumber a mechanism a reader has already cited, and
 * change what `M2` means on a page that is already published — an edit of
 * stored notes dressed as an insert. A note is append-only, its answer to a
 * wrong claim is a `correction`, and the same rule holds for where it sits:
 * a new note goes at the end of its subject, at `MAX(position) + 1`.
 *
 * To change it, add `position` here, drop it from the assignment in
 * `writeNotes`, and decide what happens to the notes it pushes down —
 * which is the design work this note is declining, not the code.
 */

/**
 * A research note without a source is not research.
 *
 * `research` exists to hold what was learned *around* a dish — an
 * alternative, a hack, where to buy something — and the whole reason it is
 * its own kind rather than a free note is that it says where the claim came
 * from. Accepting one with no provenance produced exactly the thing the
 * kind was invented to prevent. Every other kind is a first-hand
 * observation and stays optional.
 *
 * The message says the other two kinds "need no source" rather than "take
 * no sources", because the seven non-research kinds MAY carry one and the
 * earlier wording read as a prohibition. `writeNotes` stores `sources` for
 * any kind, `notes.tsx` renders them for any kind, and the study reader in
 * `read.ts` records the standing counterexample: the Wellington's one
 * source hangs off a `warning`. Only `research` is made to cite.
 */
export function requireSourcesForResearch(
  value: { kind: string; sources?: unknown[] | null },
  ctx: z.RefinementCtx,
): void {
  if (value.kind !== 'research') return;
  if (value.sources && value.sources.length > 0) return;
  ctx.addIssue({
    code: 'custom',
    path: ['sources'],
    message:
      'A research note must cite at least one source in `sources` — give a ' +
      '`url`, a `title` or a `citation`. Research is the kind that records ' +
      'where something came from; without that it is an `observation` or ' +
      'an `idea`, which need no source.',
  });
}

export const ingredientLineSchema = z.object({
  /**
   * The ingredient as named. Resolved against the canonical ingredient list
   * by slug, then by name, then by alias; unmatched names create a new
   * canonical ingredient rather than being silently dropped.
   */
  name: plainName(z.string().min(1).max(200), 'name'),
  quantity: z.number().finite().nonnegative().nullish(),
  /** Upper bound when the amount was written as a range ("4–5 chipotle"). */
  quantityMax: z.number().finite().nonnegative().nullish(),
  unit: unitField.nullish(),
  /**
   * Sub-list heading this line belongs under: "Wash", "Dredge".
   *
   * Described on the wire because `uses` now tells a caller to write it, and
   * a caller that never sets one cannot use that form at all. A field the
   * advertised remedy depends on cannot be the one field with no sentence.
   */
  component: plainName(z.string().max(120), 'component')
    .nullish()
    .describe(
      'The heading this line sits under: "Khao khua", "To serve". A step ' +
        'can write it in front of the name in `uses` to point at this line.',
    ),
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
  phase: plainName(z.string().max(120), 'phase').nullish(),
  durationMinutes: z.number().int().nonnegative().nullish(),
  durationMaxMinutes: z.number().int().nonnegative().nullish(),
  temperatureC: z.number().finite().nullish(),
  equipment: z.array(z.string().max(120)).max(30).optional(),
  /**
   * Technique taxonomy term, e.g. "braising". Created if unknown.
   *
   * THE THIRD DOOR INTO `taxonomy_terms`, and the one that was left open.
   * `upsert_category` and a recipe's `categories` both refuse a reserved
   * name; this field reaches `resolveTermId` in `write.ts` exactly as they
   * do, and it took `technique: "null"` without a word. So the invariant the
   * other two state — a tag holding a reserved name is a legacy accident and
   * not something reachable today — was false while this stayed a bare
   * string, and the audit written for the owner was a clean-up for a hole
   * that was still open.
   *
   * There is no `slug` to escape through here, as there is on
   * `upsert_category`. A technique that really wants one of these words as
   * its label is authored with `upsert_category` and its own slug, and the
   * step then names that slug.
   */
  technique: tagName(z.string().max(120), 'technique').nullish(),
  /**
   * Names of ingredient lines this step consumes. Each must match the `name`
   * of a line in `ingredients`, or that line's `component` and name written
   * together as "To serve: Glutinous rice" — validated below, because a step
   * pointing at an ingredient the recipe does not have is always a mistake.
   *
   * 322 characters, not 200. A `component` is `max(120)`, a `name` is
   * `max(200)`, and the separator costs a colon and an optional space: a
   * legal qualified reference is therefore 322 characters long, and the old
   * bound cut it into a refusal that named the wrong problem. Raising a
   * bound refuses nothing that parses today.
   */
  uses: z
    .array(z.string().max(322))
    .max(50)
    .optional()
    .describe(
      'Names of ingredient lines this step uses. Each name must fit exactly ' +
        'one line in `ingredients`. Two lines can share a name. To pick ' +
        'one, write the line\'s `component`, a colon, then the name: "To ' +
        'serve: Glutinous rice". The tool refuses a name that fits two lines.',
    ),
  /**
   * Optional picture of what this stage should look like. Images are
   * referenced by URL rather than uploaded — the repository stores notes,
   * not binaries, and a link survives being exported back out to Markdown.
   */
  imageUrl: z.url().nullish(),
  imageAlt: z.string().max(300).nullish(),
  note: z.string().max(2000).nullish(),
});
export type StepInput = z.infer<typeof stepSchema>;

/**
 * One stage of the mass flow figure — "RAW 10 kg", "CURE 24–48 h".
 *
 * A stage carries one figure: a weight or a count in `quantity`/`unit`, or
 * a wait in `durationMinutes`. Never both — the figure draws one value line
 * per stage — and a wait carries no unit, because the unit vocabulary holds
 * no time unit and widening it to caption a figure would make "24 h of
 * beef" a legal ingredient line.
 */
export const massFlowStageSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(60)
    .describe('"Raw", "Cut", "Dried". The page puts it in capitals.'),
  /*
   * EVERY FIELD HERE CARRIES A `.describe()`, and that is not tidiness.
   * A JSDoc comment never reaches the wire: the tool advertises this shape
   * as JSON Schema, so a field explained only in a comment is a field the
   * model meets as a bare `{"type":"number"}`. Three of the four the
   * repository's own reference figure uses — `quantityMax`,
   * `durationMaxMinutes` and `rawText` — were exactly that.
   */
  quantity: z
    .number()
    .finite()
    .nonnegative()
    .nullish()
    .describe('For a stage that is a weight or a count. Give `unit` with it.'),
  quantityMax: z
    .number()
    .finite()
    .nonnegative()
    .nullish()
    .describe(
      'The top of a range. Give `quantity` as the bottom: 25 and 30 draw ' +
        '"25–30 pieces". Leave it out for a single figure.',
    ),
  unit: unitField.nullish(),
  durationMinutes: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .describe('For a stage that is a wait. Minutes: 1440 is one day.'),
  durationMaxMinutes: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .describe(
      'The top of a wait that is a range. Give `durationMinutes` as the ' +
        'bottom: 1440 and 2880 draw "24–48 h". The page picks the unit.',
    ),
  emphasis: z
    .boolean()
    .optional()
    .default(false)
    .describe('Draw this stage as the one that matters. Usually the last.'),
  rawText: z
    .string()
    .max(120)
    .nullish()
    .describe(
      'The value as written, for a stage that is neither a figure nor a ' +
        'wait: "held under 100 °C". It is read only when the stage has no ' +
        'quantity and no duration. Do not use it to spell one of those again.',
    ),
});
export type MassFlowStageInput = z.infer<typeof massFlowStageSchema>;

export const massFlowSchema = z.object({
  /**
   * In order, first to last. Two at least: R-SCR-39 describes the figure as
   * "10 kg raw to 4.5 kg dried", and a flow needs a from and a to. One box
   * on its own is not the figure, so it is refused here rather than
   * accepted and then drawn as nothing.
   */
  stages: z.array(massFlowStageSchema).min(2).max(24),
  netChangePercent: z
    .number()
    .finite()
    .min(-9999.99)
    .max(9999.99)
    .nullish()
    .describe(
      'The whole change, as a signed percentage. -55 is a loss of 55 per ' +
        'cent. Give the number you measured. The tool does not calculate ' +
        'it. The first stage and the last stage do not have to share a unit.',
    ),
  ratePercentPerDay: z
    .number()
    .finite()
    .min(-9999.99)
    .max(9999.99)
    .nullish()
    .describe('Percent of the starting weight for each day. 4.21 is 4.21%.'),
  note: z
    .string()
    .max(2000)
    .nullish()
    .describe('Where the numbers came from. Not shown on the page.'),
});
export type MassFlowInput = z.infer<typeof massFlowSchema>;

/**
 * The same three rules the database checks, applied at the boundary so a
 * caller reads a sentence rather than a constraint name.
 */
function checkMassFlowStages(
  stages: MassFlowStageInput[] | undefined,
  ctx: z.RefinementCtx,
  base: (string | number)[],
): void {
  (stages ?? []).forEach((stage, index) => {
    const at = (field: string) => [...base, index, field];
    if (stage.quantity != null && stage.durationMinutes != null) {
      ctx.addIssue({
        code: 'custom',
        path: at('durationMinutes'),
        message:
          `Stage ${index + 1} ("${stage.label}") gives both a quantity and ` +
          'a duration. A stage draws one figure. Split it into two stages.',
      });
    }
    if (
      stage.quantity == null &&
      stage.durationMinutes == null &&
      !stage.rawText
    ) {
      ctx.addIssue({
        code: 'custom',
        path: at('quantity'),
        message:
          `Stage ${index + 1} ("${stage.label}") has nothing to draw. Give ` +
          'a quantity, a durationMinutes, or a rawText.',
      });
    }
    if (stage.quantityMax != null) {
      if (stage.quantity == null) {
        ctx.addIssue({
          code: 'custom',
          path: at('quantityMax'),
          message: `Stage ${index + 1} has an upper bound and no quantity.`,
        });
      } else if (stage.quantityMax < stage.quantity) {
        ctx.addIssue({
          code: 'custom',
          path: at('quantityMax'),
          message: `Stage ${index + 1} has an upper bound below its quantity.`,
        });
      }
    }
    if (stage.durationMaxMinutes != null) {
      if (stage.durationMinutes == null) {
        ctx.addIssue({
          code: 'custom',
          path: at('durationMaxMinutes'),
          message: `Stage ${index + 1} has an upper bound and no duration.`,
        });
      } else if (stage.durationMaxMinutes < stage.durationMinutes) {
        ctx.addIssue({
          code: 'custom',
          path: at('durationMaxMinutes'),
          message: `Stage ${index + 1} has an upper bound below its duration.`,
        });
      }
    }
  });
}

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
// ─────────────────────────────────────────────────────────────────────────
// Taxonomy term authoring
// ─────────────────────────────────────────────────────────────────────────

/**
 * Terms are created on demand whenever a recipe is tagged, which gets the
 * slug right but leaves the label as written and the description empty.
 * This is the pass that gives a term its display label, its explanatory
 * blurb, and its place in a hierarchy.
 */
export const upsertCategoryShape = {
  /** Which kind of category this tag belongs to. */
  categoryType: z.enum(CATEGORY_TYPES),
  /** Display label. The slug is derived from it unless `slug` is given. */
  label: plainName(z.string().min(1).max(120), 'label'),
  slug: z.string().min(1).max(120).optional(),
  /**
   * One or two sentences explaining what the term means, shown to readers
   * on hover. Say what distinguishes it, not just what it is.
   */
  description: z.string().max(1000).nullish(),
  /**
   * Slug of a broader term in the *same* facet, e.g. "cajun" under
   * "american". Terms never cross facets, so a parent in another facet is
   * rejected rather than silently ignored.
   */
  parentSlug: z.string().min(1).max(120).nullish(),
};
/**
 * The reserved-name rule sits here rather than on `label` or on `slug`,
 * because neither field alone decides the answer: the write layer slugifies
 * `slug` when it is given and `label` when it is not, so the value the rule
 * governs only exists once both are in hand. That is what a cross-field
 * refinement is for, and putting it on the assembled schema keeps
 * `upsertCategoryShape` — the JSON Schema an agent reads — unchanged.
 *
 * `parentSlug` is NOT checked here. A reserved word there is a different
 * mistake with a different answer, and the write layer already tells a
 * caller that names a tag which is not there to send an explicit `null`
 * instead. See `upsertCategory` in `src/lib/queries/write.ts`.
 */
export const upsertCategorySchema = z
  .object(upsertCategoryShape)
  .superRefine((value, ctx) => {
    const named = value.slug ? 'slug' : 'label';
    const slug = slugify(value.slug ?? value.label);
    if (isReservedTagSlug(slug)) {
      ctx.addIssue({
        code: 'custom',
        path: [named],
        message: reservedTagSlugMessage(slug),
      });
    }
  });
export type UpsertCategoryArgs = z.input<typeof upsertCategorySchema>;
export type UpsertCategoryInput = z.infer<typeof upsertCategorySchema>;

export const buildShoppingListShape = {
  /** Recipe slugs to combine. Their *current* revisions are used. */
  slugs: z.array(z.string().min(1).max(200)).min(1).max(50),
};
export const buildShoppingListSchema = z.object(buildShoppingListShape);
export type BuildShoppingListArgs = z.input<typeof buildShoppingListSchema>;
export type BuildShoppingListInput = z.infer<typeof buildShoppingListSchema>;

/**
 * The other door a junk tag comes in by.
 *
 * Tagging a recipe auto-creates any tag it names, which is deliberate — a
 * recipe should not be refused because a tag is new. But it means
 * `categories: { diet: ['None'] }` makes a real term with the slug `none`,
 * exactly as `upsert_category` would, and this path has no `slug` field to
 * escape through. So the same list applies, on the label as slugified, and
 * the issue lands on the offending entry rather than on the recipe.
 */
const tagLabel = tagName(z.string().min(1).max(120), 'label');

/**
 * Tags on a recipe. A WRITE: every name here can make a tag.
 */
export const categoriesSchema = z
  .partialRecord(z.enum(CATEGORY_TYPES), z.array(tagLabel).max(30))
  .optional();
export type CategoriesInput = z.infer<typeof categoriesSchema>;

/**
 * Tags to filter a search by. A READ, and that is the whole difference.
 *
 * It had the same element schema as the write, and the rule above then
 * refused `search_recipes {categories: {technique: ['null']}}` — with a
 * message telling the caller to give the tag the name of the thing it
 * groups and to send a `slug` beside it, neither of which a search can act
 * on, since it has no `slug` field and is naming nothing.
 *
 * It matters more than a wrong sentence. The reserved rule exists because
 * junk tags are in the store already, and the clean-up starts by asking
 * which recipes carry one. `list_categories` shows the tag; `search_recipes`
 * is the only tool that answers "which recipes", and it was the one refusing.
 * A read tool answers with nothing found. It does not refuse the question.
 */
export const categoryFilterSchema = z
  .partialRecord(
    z.enum(CATEGORY_TYPES),
    z.array(z.string().min(1).max(120)).max(30),
  )
  .optional();

// ─────────────────────────────────────────────────────────────────────────
// Recipe body — the part a revision snapshots
// ─────────────────────────────────────────────────────────────────────────

export const recipeBodyShape = {
  title: plainName(z.string().min(1).max(200), 'title'),
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
  categories: categoriesSchema,
  yieldQuantity: z.number().finite().positive().nullish(),
  yieldUnit: z.string().max(60).nullish(),
  servings: z.number().int().positive().nullish(),
  totalTimeMinutes: z.number().int().nonnegative().nullish(),
  activeTimeMinutes: z.number().int().nonnegative().nullish(),
  ingredients: z.array(ingredientLineSchema).max(300).optional(),
  steps: z.array(stepSchema).max(200).optional(),
  /**
   * What the food weighs at each stage. Optional, and normally absent —
   * R-SCR-39 asks for it only where a dish loses or gains weight in a way
   * the reader has to plan for.
   *
   * It belongs to the revision it is sent with. It is never carried forward
   * into the next one: the numbers come off a batch that was actually
   * weighed, and copying them into a version nobody weighed would invent a
   * measurement.
   */
  massFlow: massFlowSchema.optional(),
  notes: z
    .array(noteSchema.superRefine(requireSourcesForResearch))
    .max(100)
    .optional(),
  links: z.array(recipeLinkSchema).max(50).optional(),
  originNote: z.string().max(2000).nullish(),
  heroImageUrl: z.url().nullish(),
  heroImageAlt: z.string().max(300).nullish(),
};

/**
 * Split a `uses` reference that names a component: "To serve: Glutinous
 * rice" → `{ component: 'To serve', name: 'Glutinous rice' }`. Null when the
 * string is a bare name, which is the fast path and the common one.
 *
 * **The split is on the LAST colon**, and the data says why. The left half
 * is free-text prose an agent writes as a heading; the right half is an
 * ingredient name drawn from a curated list of nouns. No ingredient name and
 * no alias in the archive holds a colon, while the prose archive already
 * holds hand-written headings that end in one — "For the boil:". So
 * "Day 1: Cure: Salt" under a component "Day 1: Cure" is a payload to
 * expect, and an ingredient literally named "Salt: kosher" is not. Trying
 * every split point instead would replace one guess with a worse ambiguity:
 * two splits that both resolve have no sentence that could refuse them.
 *
 * The space after the colon is optional and both halves are trimmed.
 * Requiring the space would turn a one-character typo into a refusal for
 * nothing, and trimming is what makes a component that itself ends in a
 * colon writable with no escape: "For the boil:: Water" splits into
 * "For the boil:" and "Water".
 *
 * Pure, and it stays here rather than in the write layer because the
 * spelling of a `uses` string is part of the submission contract. Both
 * halves of the system have to agree on the split or a name that parses
 * would fail to bind.
 */
export function splitQualifiedUse(
  used: string,
): { component: string; name: string } | null {
  const trimmed = used.trim();
  const colon = trimmed.lastIndexOf(':');
  if (colon < 0) return null;
  const component = trimmed.slice(0, colon).trim();
  const name = trimmed.slice(colon + 1).trim();
  // ":Salt" and "To serve:" name no pair. They are bare names, and they fail
  // the ordinary way rather than through a message about components.
  if (!component || !name) return null;
  return { component, name };
}

/**
 * Map key for one qualified reference, matched case-insensitively on both
 * halves exactly as the bare index is.
 *
 * NUL and not a colon as the joiner, because a component may contain a colon
 * and two different pairs must never collide on one key.
 */
export function qualifiedUseKey(component: string, name: string): string {
  return `${component.trim().toLowerCase()}\u0000${name.trim().toLowerCase()}`;
}

/**
 * Name one ingredient line the way a reader would point at it on the page.
 *
 * The component heading is what actually separates two lines of the same
 * ingredient — "Khao khua" against "To serve" — so it leads. The amount
 * follows it, because two lines under one heading are told apart by the
 * number. A line with neither is named by its place in the list, which is
 * the only handle left.
 */
function describeLine(line: IngredientLineInput, position: number): string {
  const amount =
    line.quantity == null
      ? null
      : [
          line.quantityMax == null
            ? `${line.quantity}`
            : `${line.quantity}–${line.quantityMax}`,
          line.unit ?? '',
        ]
          .join(' ')
          .trim();
  const heading = line.component?.trim() || null;
  if (heading && amount) return `${heading} (${amount})`;
  return heading ?? amount ?? `line ${position + 1}`;
}

/**
 * Say that one `uses` name points at more than one ingredient line.
 *
 * Exported because two paths enforce the same rule and must say the same
 * thing: this one, at the parse boundary, and `reviseRecipe` in the write
 * layer, which cross-checks a steps-only revision against the lines it
 * carried forward. A caller that meets the rule on one path and a different
 * sentence on the other has to learn it twice.
 */
export function ambiguousUseMessage(
  stepNumber: number,
  used: string,
  matches: { line: IngredientLineInput; position: number }[],
): string {
  // Two lines under one heading with one amount describe identically, and
  // that pair is exactly the one a component cannot separate — so the
  // caller has to be able to tell them apart in the sentence at least. Only
  // a repeated description takes a position; "Khao khua (40 g)" and
  // "To serve (400 g)" are left where they were.
  const described = matches.map(({ line, position }) =>
    describeLine(line, position),
  );
  const howMany = new Map<string, number>();
  for (const text of described) howMany.set(text, (howMany.get(text) ?? 0) + 1);
  const named = described
    .map((text, index) =>
      (howMany.get(text) ?? 0) > 1
        ? `${text} (line ${matches[index]!.position + 1})`
        : text,
    )
    .join(', ');
  // The example is built from a heading this recipe already uses, so the
  // caller is shown a name that fits its own dish rather than a generic one.
  // A line with no heading gives nothing to build from, and an invented
  // example would be worse than none.
  //
  // The remedy names the alias route and not a bare rename, because a bare
  // rename is not safe. `resolveIngredient` inserts on a name it cannot
  // match, so "Glutinous rice, to serve" mints a second canonical
  // ingredient: `build_shopping_list` then reports 40 g and 400 g as two
  // rows that can never sum, `list_ingredients` carries a row that describes
  // nothing, and no write path in this repository can delete either. The
  // alias keeps one ingredient and still gives the line a name of its own.
  const heading = matches[matches.length - 1]!.line.component?.trim();
  // The alias example is built from the bare name, never from a qualified
  // reference. A carried `uses` reaches this message already spelling a
  // component the caller has just renamed, and "To serve: Glutinous rice,
  // at the table" is not an alias anyone should register — an alias is a
  // second name for the ingredient, and a heading is not part of one.
  //
  // Unless the whole string IS a line's name. An ingredient may be called
  // "Chilli: bird's eye", and cutting it at its own colon would offer an
  // alias of a name that no line here carries.
  const wroteBare = matches.some(
    ({ line }) => line.name.trim().toLowerCase() === used.trim().toLowerCase(),
  );
  const bare = wroteBare
    ? used.trim()
    : (splitQualifiedUse(used)?.name ?? used.trim());
  const spelling = heading
    ? `, such as "${bare}, ${heading.toLowerCase()}"`
    : '';
  // "lines of that ingredient" and not "lines with that name", because the
  // two write-layer callers count lines by resolved ingredient. Two lines
  // written under two spellings would be named by a spelling neither of them
  // carries, and a caller cannot act on a sentence that describes no line it
  // can see. Every line counted here is a line of one ingredient on all
  // three paths, so this wording is true on all three.
  // A line is separable by its heading only when it has one AND no other
  // candidate shares it. Offering a spelling that resolves to two lines
  // would be a second refusal dressed as a remedy, so this filter is the
  // whole of what makes the paragraph safe to print. Two lines under one
  // heading produce no spelling at all and fall through to the alias route,
  // which is the only thing that separates them.
  //
  // `line.name` and not `used`: a line's written name is claimed in the
  // first pass of the qualified index at every site, so it is the one
  // spelling guaranteed to resolve there. `used` may be an alias, which is
  // claimed only in the second pass and may already be taken.
  //
  // A name that itself holds a colon is dropped for the same reason. The
  // split takes the LAST colon, so "Dressing: Chilli: bird's eye" reads as
  // the component "Dressing: Chilli" and reaches no line at all. There is no
  // qualified spelling of such a line, and the alias route is what serves it.
  const separable = matches.filter(({ line }) => {
    const heading = line.component?.trim().toLowerCase();
    if (!heading) return false;
    if (line.name.includes(':')) return false;
    return (
      matches.filter(
        (other) => other.line.component?.trim().toLowerCase() === heading,
      ).length === 1
    );
  });
  const spellings = separable
    .map(({ line }) => `"${line.component!.trim()}: ${line.name.trim()}"`)
    .join(' or ');
  // The component route leads because it is the cheaper of the two: one
  // call, no invented name, and no second write to the ingredient list.
  //
  // And it says when it does not reach every line. The paragraph is an
  // imperative and it comes first, so a caller that means a line with no
  // heading would otherwise follow it, write the one spelling on offer and
  // bind the step to the other line — the laab-ped defect, written back by
  // the message that exists to prevent it.
  const shortfall =
    separable.length < matches.length
      ? ' This does not give a spelling for every line. A line with no ' +
        'spelling needs the second way.'
      : '';
  const byComponent = spellings
    ? "\n\nPut the line's `component` in front of the name. Write " +
      `${spellings}. A colon separates the two. This needs one call and no ` +
      `new name.${shortfall}`
    : '';
  return (
    `Step ${stepNumber} uses "${used}". The ingredient list has ` +
    `${matches.length} lines of that ingredient: ${named}. A step must point ` +
    `to one line.${byComponent}\n\n` +
    `${byComponent ? 'Or give' : 'Give'} one line a second ` +
    `spelling${spelling}. Call upsert_ingredient first and put that ` +
    'spelling in `aliases`, so both lines stay one ingredient. Then write ' +
    'the line and its `uses` with the new spelling. A spelling that is not ' +
    'an alias makes a second ingredient, and a shopping list stops adding ' +
    'the two amounts together.'
  );
}

/**
 * Say that a `uses` reference names a component no line carries.
 *
 * A qualifier is information the caller volunteered, so falling back to the
 * bare tail would bind the step to a line the caller did not name — in
 * exactly the class of recipe where the wrong line costs a real number.
 * Either the heading is wrong or the caller's model of the recipe is, and
 * both are worth one round trip.
 *
 * The message names both halves separately, because the caller cannot see
 * which one it got wrong from a sentence that quotes only the whole string.
 * Listing the components it could have written turns the refusal into the
 * answer.
 *
 * Exported for the same reason `ambiguousUseMessage` is: the parse boundary
 * and the write layer enforce one rule and must say one thing.
 */
export function qualifierMessage(
  stepNumber: number,
  used: string,
  qualifier: { component: string; name: string },
  lines: IngredientLineInput[],
): string {
  const seen = new Set<string>();
  const components: string[] = [];
  for (const line of lines) {
    const heading = line.component?.trim();
    if (!heading || seen.has(heading.toLowerCase())) continue;
    seen.add(heading.toLowerCase());
    components.push(heading);
  }
  // The closing sentence follows the list, because a list with no components
  // makes one half of the two-option sentence impossible: "No line in this
  // list has a component. Write a component this list has" told a caller to
  // do the one thing the sentence before it had ruled out. That is the
  // commonest recipe shape in the archive, and the message it gets is the
  // one an ordinary typo produces when the name holds a colon.
  const known =
    components.length === 0
      ? 'No line in this list has a component. Write the name with no ' +
        'component.'
      : `The components in this list are: ${components.join(', ')}. Write a ` +
        'component this list has, or write the name with no component.';
  return (
    `Step ${stepNumber} uses "${used}". This reads as a component and a ` +
    `name. No line has the component "${qualifier.component}" with the ` +
    `name "${qualifier.name}". ${known}`
  );
}

/**
 * A step may only reference ingredients the recipe actually lists, and the
 * name it writes must point at exactly one of them. Catching this at the
 * boundary keeps `recipe_step_ingredients` honest — the alternative is a
 * silently dropped link that makes "which step uses the tandoori masala"
 * quietly wrong.
 *
 * The second half of that rule is newer and cost a reader a real number.
 * One dish legitimately lists the same ingredient twice: laab ped writes
 * 40 g of glutinous rice under "Khao khua" for the toasted powder and 400 g
 * under "To serve". Both lines are right and both are accepted. What was
 * wrong is where a step naming "Glutinous rice" landed — `writeRevisionBody`
 * indexes lines by name and keeps the first, so every such step bound to the
 * 40 g line and the 400 g line was reachable from no step at all. The page
 * then told a cook to soak 40 g of rice for the table.
 *
 * There are now two ways through that tie, and the message names both. A
 * step may write the line's heading in front of the name — "To serve:
 * Glutinous rice" — which is one call and invents nothing. Or one line may
 * be given a second spelling registered as an alias, which is the only way
 * through when two lines share a heading as well as a name.
 *
 * The qualified form is legal ALWAYS, not only when the bare name is
 * ambiguous. Making the legal spelling of a step depend on how many lines
 * another part of the payload holds would mean that adding a rice line
 * retroactively broke every step already written, and that deleting one
 * broke every qualified step — a revision that only drops a line would have
 * to rewrite steps it did not otherwise change. It costs nothing to allow:
 * the bare name is tried first and returns before the string is scanned for
 * a colon. A qualified name that would also have resolved bare is accepted
 * in silence, because `WriteResult` has no warning channel and a line on
 * every explicit write would dilute `needsDescription`, which is the one
 * field the guide tells an agent to read.
 *
 * Two lines written under two spellings of one ingredient are NOT this
 * case, and are not refused. They name themselves apart, so the caller has
 * already said which line it means. `writeRevisionBody` claims every written
 * name before any canonical one, which is what makes that promise true.
 */
function checkStepReferences(
  value: { ingredients?: IngredientLineInput[]; steps?: StepInput[] },
  ctx: z.RefinementCtx,
) {
  type Match = { line: IngredientLineInput; position: number };
  const linesByName = new Map<string, Match[]>();
  // A separate map and a separate key space. Merging the two would let a
  // qualified reference be shadowed by a line whose written name happens to
  // equal it, which is the one way this feature could move an existing
  // binding. Nothing is indexed here for a line with no heading: there is
  // no spelling for "the line with no component", and the alias route is
  // what covers that line when its name is shared.
  const linesByQualified = new Map<string, Match[]>();
  const push = (map: Map<string, Match[]>, key: string, match: Match) => {
    const found = map.get(key);
    if (found) found.push(match);
    else map.set(key, [match]);
  };
  (value.ingredients ?? []).forEach((line, position) => {
    push(linesByName, line.name.trim().toLowerCase(), { line, position });
    const heading = line.component?.trim();
    if (heading)
      push(linesByQualified, qualifiedUseKey(heading, line.name), {
        line,
        position,
      });
  });

  (value.steps ?? []).forEach((step, stepIndex) => {
    (step.uses ?? []).forEach((used, usedIndex) => {
      // Bare first, and it returns before the string is scanned for a
      // colon. That is what guarantees structurally — not by testing — that
      // every name resolving today resolves to the same line, including a
      // written name that itself contains a colon.
      const bare = linesByName.get(used.trim().toLowerCase()) ?? [];
      if (bare.length === 1) return;
      // And an EMPTY bare result is the only one that falls through. Two
      // lines answering to the string as written is a real ambiguity, and
      // `writeRevisionBody` takes any bare hit as authoritative: approving
      // such a string here through the qualified index would validate it
      // against one line and write it against another, which is a wrong
      // amount rather than a missing one. It costs nothing to refuse,
      // because the qualified form of a name that fits two lines bare is a
      // longer string that fits none of them bare.
      const qualifier = bare.length === 0 ? splitQualifiedUse(used) : null;
      const qualified = qualifier
        ? (linesByQualified.get(
            qualifiedUseKey(qualifier.component, qualifier.name),
          ) ?? [])
        : [];
      if (qualified.length === 1) return;
      // What the caller wrote decides which sentence it gets back. A bare
      // name that fits nothing is the ordinary typo and keeps the ordinary
      // words. A qualified name that fits nothing is a wrong heading, and
      // saying "not in the ingredient list" would send the caller to look
      // at the wrong half of its own string. Two matches under one heading
      // is an ambiguity the qualifier carries no further information to
      // break, so it gets the ambiguity message — whose filter drops the
      // component paragraph on its own, since both lines share a heading.
      //
      // `qualifier` is null whenever the bare lookup found more than one,
      // so `matches` is those lines and the ambiguity message names them.
      // A name holding a colon is refused as the ambiguity it is, and not
      // as a component nobody wrote.
      const matches = qualifier ? qualified : bare;
      ctx.addIssue({
        code: 'custom',
        path: ['steps', stepIndex, 'uses', usedIndex],
        message:
          matches.length > 1
            ? ambiguousUseMessage(stepIndex + 1, used, matches)
            : qualifier
              ? qualifierMessage(
                  stepIndex + 1,
                  used,
                  qualifier,
                  value.ingredients ?? [],
                )
              : `Step ${stepIndex + 1} uses "${used}", which is not in the ` +
                'ingredient list. Add it to `ingredients` or remove it from `uses`.',
      });
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
  .superRefine(checkStepReferences)
  .superRefine((value, ctx) =>
    checkMassFlowStages(value.massFlow?.stages, ctx, ['massFlow', 'stages']),
  );

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
  categories: recipeBodyShape.categories,
  yieldQuantity: recipeBodyShape.yieldQuantity,
  yieldUnit: recipeBodyShape.yieldUnit,
  servings: recipeBodyShape.servings,
  totalTimeMinutes: recipeBodyShape.totalTimeMinutes,
  activeTimeMinutes: recipeBodyShape.activeTimeMinutes,
  ingredients: recipeBodyShape.ingredients,
  steps: recipeBodyShape.steps,
  massFlow: recipeBodyShape.massFlow,
  notes: recipeBodyShape.notes,
  links: recipeBodyShape.links,
  heroImageUrl: recipeBodyShape.heroImageUrl,
  heroImageAlt: recipeBodyShape.heroImageAlt,
};

export const reviseRecipeSchema = z
  .object(reviseRecipeShape)
  .superRefine((value, ctx) => {
    // Only cross-check here when both lists are replaced together, because
    // only then does this schema hold both. A revision that sends one list
    // is checked at write time instead, in BOTH directions: a steps-only
    // revision against the carried-forward ingredients, and an
    // ingredients-only revision against the carried-forward steps. See
    // `checkCarriedUses` in `src/lib/queries/write.ts`, which has the
    // previous revision in hand and can name the lines a step could mean.
    if (value.ingredients && value.steps) checkStepReferences(value, ctx);
    checkMassFlowStages(value.massFlow?.stages, ctx, ['massFlow', 'stages']);
  });
export type ReviseRecipeArgs = z.input<typeof reviseRecipeSchema>;
export type ReviseRecipeInput = z.infer<typeof reviseRecipeSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Backfilling history
// ─────────────────────────────────────────────────────────────────────────

/**
 * Record a version of a recipe that existed before the ones already stored.
 *
 * This is not an edit. It adds a revision the way `revise_recipe` does, and
 * differs in exactly two ways: the recipe's current revision does not move,
 * and `occurredAt` says where in the history the new revision belongs.
 *
 * `ingredients` and `steps` are required rather than optional. A revise
 * that omits them carries them forward from the revision it supersedes,
 * which is right going forwards and wrong going backwards: carrying a later
 * version's ingredients into an earlier one would invent a history that
 * never happened. An old version has to be stated, not inherited.
 */
export const backfillRevisionShape = {
  slug: z.string().min(1).max(120),
  occurredAt: z
    .string()
    .describe(
      'When this version existed, as an ISO 8601 date or date-time. Must ' +
        'be earlier than every revision already recorded for this recipe.',
    ),
  rationale: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      'What this version was, and how you know. Required — a revision ' +
        'without it is a version with no story.',
    ),
  title: recipeBodyShape.title.optional(),
  summary: recipeBodyShape.summary,
  yieldQuantity: recipeBodyShape.yieldQuantity,
  yieldUnit: recipeBodyShape.yieldUnit,
  servings: recipeBodyShape.servings,
  totalTimeMinutes: recipeBodyShape.totalTimeMinutes,
  activeTimeMinutes: recipeBodyShape.activeTimeMinutes,
  ingredients: recipeBodyShape.ingredients,
  steps: recipeBodyShape.steps,
  massFlow: recipeBodyShape.massFlow,
  notes: recipeBodyShape.notes,
};

export const backfillRevisionSchema = z
  .object(backfillRevisionShape)
  .superRefine((value, ctx) => {
    if (Number.isNaN(Date.parse(value.occurredAt))) {
      ctx.addIssue({
        code: 'custom',
        path: ['occurredAt'],
        message: `"${value.occurredAt}" is not a date this can read. Use ISO 8601, such as 2024-03-17.`,
      });
    }
    if (!value.ingredients?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['ingredients'],
        message:
          'An earlier version has to state its own ingredients. Omitting ' +
          'them would copy a later version backwards.',
      });
    }
    if (value.ingredients && value.steps) checkStepReferences(value, ctx);
    checkMassFlowStages(value.massFlow?.stages, ctx, ['massFlow', 'stages']);
  });
export type BackfillRevisionArgs = z.input<typeof backfillRevisionSchema>;
export type BackfillRevisionInput = z.infer<typeof backfillRevisionSchema>;

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
    requireSourcesForResearch(value, ctx);
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

/**
 * Give a revision that was written before this field existed its mass flow.
 *
 * Every recipe in the archive was stored before the figure had anywhere to
 * live, and no write path reaches back into a stored revision: a revise
 * makes a new version, and a version whose only change is a diagram is a
 * version with no story. So this names a revision that already exists and
 * adds the figure to it.
 *
 * That is an addition, never an edit. R-SCR-39 makes the figure optional,
 * so a revision without one is already drawn correctly; this turns absent
 * into present. A revision that has one is refused, and the refusal says
 * what is stored.
 */
export const addMassFlowShape = {
  slug: z.string().min(1).max(120),
  /*
   * `.describe()` and not a comment, and this is the field that most needed
   * it. The write is add-once — `writeMassFlow` and `uq_mass_flow_revision`
   * both refuse a second figure — so a caller that omits this, silently
   * lands on the current version and meant an older one has no way back.
   */
  revisionNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Which version the figure describes. The current one by default. ' +
        'Give a number when the batch you weighed was an older version. ' +
        'get_recipe lists every revision number.',
    ),
  ...massFlowSchema.shape,
};

export const addMassFlowSchema = z
  .object(addMassFlowShape)
  .superRefine((value, ctx) =>
    checkMassFlowStages(value.stages, ctx, ['stages']),
  );
export type AddMassFlowArgs = z.input<typeof addMassFlowSchema>;
export type AddMassFlowInput = z.infer<typeof addMassFlowSchema>;

/**
 * Give a science note that was written before this field existed its
 * conditions.
 *
 * The same shape of problem as `addMassFlow`, one level down. A note is
 * append-only — the model's answer to a wrong note is a `correction`, not
 * an edit — so this adds the one field the note could not carry when it was
 * written, and refuses a note that already has conditions.
 */
export const describeMechanismShape = {
  /**
   * `z.guid()` and not `z.uuid()`. The strict form also checks the version
   * and variant nibbles, and this is an id that was READ from the
   * repository, not one the caller invents — refusing a value the database
   * gave out would be a fault in the tool, not in the caller.
   */
  noteId: z
    .guid()
    .describe(
      'The id of the note. get_recipe gives it for every note on a recipe.',
    ),
  conditions: conditionsField.min(1),
};

export const describeMechanismSchema = z.object(describeMechanismShape);
export type DescribeMechanismArgs = z.input<typeof describeMechanismSchema>;
export type DescribeMechanismInput = z.infer<typeof describeMechanismSchema>;

/**
 * Move a note to a different record.
 *
 * This is NOT an edit, and the distinction is the whole argument for the
 * tool. A note's text is fixed — the answer to a wrong note is a
 * `correction`, never a rewrite — but a note's LOCATION being fixed does
 * not follow from that. Moving a note changes nothing about what it says or
 * when it was written, and the choice of parent is frequently forced: a
 * note about a dish gets attached to a batch because no recipe for the dish
 * exists yet. `logExperiment` already re-homes a run the same way.
 *
 * No `revisionNumber`. A note pinned to one version is a statement about
 * that version, and moving it would make the version say something it never
 * said — that IS the immutability rule, so a revision note is refused
 * rather than moved.
 */
export const reattachNoteShape = {
  /** `z.guid()` for the same reason `describeMechanismShape` uses it. */
  noteId: z
    .guid()
    .describe(
      'The id of the note. get_recipe, get_ingredient and get_experiment ' +
        'give it for every note they return, and so does search_notes.',
    ),
  recipeSlug: z.string().max(120).optional(),
  ingredientSlug: z.string().max(120).optional(),
  experimentSlug: z.string().max(120).optional(),
};

export const reattachNoteSchema = z
  .object(reattachNoteShape)
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
  });
export type ReattachNoteArgs = z.input<typeof reattachNoteSchema>;
export type ReattachNoteInput = z.infer<typeof reattachNoteSchema>;

export const upsertIngredientShape = {
  name: plainName(z.string().min(1).max(200), 'name'),
  slug: z.string().max(120).optional(),
  plural: plainName(z.string().max(200), 'plural').nullish(),
  category: z.enum(INGREDIENT_CATEGORIES).optional(),
  description: z.string().max(4000).nullish(),
  densityGPerMl: z.number().positive().max(25).nullish(),
  defaultUnit: z.string().max(40).nullish(),
  aliases: z
    .array(plainName(z.string().min(1).max(120), 'aliases'))
    .max(50)
    .optional(),
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
  /**
   * Free text here, unlike an ingredient line, and deliberately so.
   *
   * An ingredient line's unit has to belong to a closed set because those
   * amounts get summed into a shopping list and compared across batches. An
   * observation measures whatever was actually measured about a batch —
   * days hanging, °C, %, EUR spent — and a cooking vocabulary has no
   * business constraining that. Applying the ingredient rule here rejected
   * the existing biltong logs, which is how the difference surfaced.
   */
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
  title: plainName(z.string().min(1).max(200), 'title'),
  /**
   * `.nullish()`, not `.optional()`. An omitted slug carries the stored link
   * forward, which is right for a re-log that adds one number — but it left
   * "this run belongs to no recipe" unreachable, so a run linked to the
   * wrong recipe could be moved and never unlinked.
   */
  recipeSlug: z
    .string()
    .max(120)
    .nullish()
    .describe(
      'Leave it out to keep the recipe that is stored. Send null to unlink ' +
        'the run from every recipe.',
    ),
  revisionNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Which version was cooked. Send it together with recipeSlug. The run ' +
        'keeps the version it recorded, so send this only to correct it.',
    ),
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
        label: plainName(z.string().min(1).max(120), 'label'),
        note: z.string().max(1000).nullish(),
      }),
    )
    .max(500)
    .optional(),
  observations: z.array(observationSchema).max(5000).optional(),
  notes: z
    .array(noteSchema.superRefine(requireSourcesForResearch))
    .max(100)
    .optional(),
};

export const logExperimentSchema = z
  .object(logExperimentShape)
  .superRefine((value, ctx) => {
    // The same cross-field rule `addNoteSchema` states, for the same reason.
    // A revision number is resolved against the recipe, so without one it
    // named nothing and was dropped without a word.
    if (value.revisionNumber != null && !value.recipeSlug) {
      ctx.addIssue({
        code: 'custom',
        path: ['revisionNumber'],
        message:
          'revisionNumber only applies together with recipeSlug. Send the ' +
          'recipe slug beside it.',
      });
    }
  });
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
  categories: categoryFilterSchema,
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

/**
 * Finding a note.
 *
 * THE SLUGS ARE NOT `plainName()`. They look like the write-side fields and
 * they must not borrow their validation. `plainName` appends a rule about
 * how a name may be minted and, through `RESERVED_TAG_SLUGS`, refuses
 * 'null', 'undefined' and 'none'. `search_recipes` once shared the write's
 * category schema and so refused a query that named a reserved tag —
 * blocking the only tool that could have found the junk tag in the first
 * place. `e2e/mcp-boundary.spec.ts` records it. A filter is a lookup key,
 * not a name being minted.
 *
 * `query` is optional, so the tool degrades to plain enumeration. That is
 * deliberate: a second `list_notes` would be one more name to learn for a
 * strictly smaller behaviour.
 */
export const searchNotesShape = {
  query: z
    .string()
    .max(300)
    .optional()
    .describe(
      'Free text. It matches the title and the body of a note. Leave it ' +
        'out to list notes without searching.',
    ),
  kind: z
    .enum(NOTE_KINDS)
    .optional()
    .describe('Return only notes of this kind.'),
  recipeSlug: z
    .string()
    .max(120)
    .optional()
    .describe(
      'Return only notes on this recipe. This includes notes on every ' +
        'version of it, not only the current one. It does not include ' +
        'notes on a run of it.',
    ),
  ingredientSlug: z
    .string()
    .max(120)
    .optional()
    .describe('Return only notes on this ingredient.'),
  experimentSlug: z
    .string()
    .max(120)
    .optional()
    .describe('Return only notes on this run.'),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).max(10000).default(0),
};

export const searchNotesSchema = z
  .object(searchNotesShape)
  .superRefine((value, ctx) => {
    const targets = [
      value.recipeSlug,
      value.ingredientSlug,
      value.experimentSlug,
    ].filter(Boolean);
    /* `> 1`, not `!== 1`: none is the common case and means "everywhere". */
    if (targets.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Give at most one of `recipeSlug`, `ingredientSlug` or ' +
          '`experimentSlug`. A note hangs off one record, so two filters ' +
          'can never both hold. Leave all three out to search everywhere.',
      });
    }
  });
export type SearchNotesInput = z.infer<typeof searchNotesSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Reporting a fault in the connector
// ─────────────────────────────────────────────────────────────────────────

/**
 * The four kinds a report can be.
 *
 * `bug`, `unclear-docs` and `idea` is the obvious set, and it is missing the
 * one that matters. Two of the six claims in the incident that created this
 * tool called things missing that had been fixed weeks earlier. That failure
 * has its own shape: the agent wanted to do something and did not find it.
 * It is not a bug — the server behaved as built. It is not `unclear-docs` —
 * the guide may be silent rather than wrong. It is not `idea` — the agent
 * wanted a capability that exists. Choosing between those three needs the
 * answer the agent does not have, so it guesses, and the guess is the error.
 *
 * `missing-capability` lets an agent state what it knows and leaves the
 * classification to a person who can check.
 *
 * Hyphenated lower case, so a value maps straight to a label with no
 * translation table.
 */
export const REPORT_KINDS = [
  'bug',
  'unclear-docs',
  'missing-capability',
  'idea',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * `title`, `body` and `kind` are always required. `toolName`, `payload` and
 * `response` are required only for a bug — and that rule is why the
 * shape/schema split is load-bearing here rather than ceremonial. JSON
 * Schema cannot express it, so it lives in the assembled schema and is
 * stated again in the advertised text.
 *
 * Demanding evidence from every report would be wrong: two of the four kinds
 * have no tool call in them at all, and forcing `toolName: "none"` teaches
 * an agent that the field is decoration. Demanding it from none reproduces
 * the report that started this.
 */
export const reportIssueShape = {
  title: z
    .string()
    .min(8)
    .max(120)
    .describe(
      'One short line that names the fault. This is the key the tool uses ' +
        'to find a report that is already filed. Write the same title for ' +
        'the same fault. Name the tool and what went wrong: "get_recipe ' +
        'returns 500 for a slug that exists". Do not write "bug" or "it ' +
        'does not work".',
    ),

  body: z
    .string()
    .min(20)
    .max(4000)
    .describe(
      'What happened, and what you expected. Write what you saw. Do not ' +
        'write what you remember. Say the step you took before the fault. ' +
        'Say what a correct answer would have been. Plain text or Markdown.',
    ),

  kind: z
    .enum(REPORT_KINDS)
    .describe(
      'bug: the server did the wrong thing. unclear-docs: a tool ' +
        'description or the guide said too little, or said something ' +
        'untrue. missing-capability: you wanted to do something and found ' +
        'no tool for it. Use this when you do not know if the tool exists. ' +
        'idea: a change you suggest.\n\n' +
        'A report of kind "bug" MUST carry toolName, payload and response. ' +
        'The tool refuses a bug report without all three. The other kinds ' +
        'do not need them.',
    ),

  toolName: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe(
      'The tool that misbehaved, exactly as tools/list names it: ' +
        '"search_recipes", "revise_recipe". Write "tools/list", ' +
        '"initialize" or "transport" when the fault was not inside a tool. ' +
        'Required for a bug.',
    ),

  payload: z
    .string()
    .min(1)
    .max(8000)
    .optional()
    .describe(
      'The arguments you sent, copied exactly. Send the JSON you put on ' +
        'the wire, not a description of it. Copy it now, while you have ' +
        'it. Required for a bug. The tool removes values that match a known ' +
        'credential pattern before it files the report. It cannot find ' +
        'every credential.',
    ),

  response: z
    .string()
    .min(1)
    .max(8000)
    .optional()
    .describe(
      'What came back, copied exactly. Send the whole text of the result ' +
        'or the error. If nothing came back, write the status line or the ' +
        'message your client showed. Required for a bug.',
    ),
};

/**
 * There is deliberately no `repo`, `owner` or `repository` field. The
 * repository is hardcoded in `src/lib/github/config.ts`, and `z.object`
 * strips an unknown key, so an argument naming one reaches nothing.
 *
 * There is no `severity` either — an agent's severity is a memory — and no
 * `stepsToReproduce` or `expected`, both of which are `body`. Splitting them
 * out invites two half-filled fields.
 */
export const reportIssueSchema = z
  .object(reportIssueShape)
  .superRefine((value, ctx) => {
    if (value.kind !== 'bug') return;
    for (const field of ['toolName', 'payload', 'response'] as const) {
      if (!value[field]?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message:
            `A report of kind "bug" must carry ${field}. Three fields ` +
            'settle a bug report: the tool that was called, the payload ' +
            'that was sent, and the response that came back. Send all ' +
            'three, copied exactly. If you do not have them, file the ' +
            'report with the kind "unclear-docs", "missing-capability" or ' +
            '"idea" instead.',
        });
      }
    }
  });
export type ReportIssueArgs = z.input<typeof reportIssueSchema>;
export type ReportIssueInput = z.infer<typeof reportIssueSchema>;
