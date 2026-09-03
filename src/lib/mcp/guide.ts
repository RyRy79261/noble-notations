import 'server-only';

/**
 * The onboarding guide an agent reads before touching anything.
 *
 * Tool descriptions explain one tool each; nothing explained how the pieces
 * fit, and an agent that does not know the repository is revision-first
 * will reach for `create_recipe` when it should be revising. This is the
 * missing paragraph, kept in one place so the `get_started` tool and the
 * server `instructions` cannot drift apart.
 */
export const SERVER_INSTRUCTIONS = `
Noble Notations is a versioned cooking repository, not a recipe box.

The rule that matters: a recipe is a stable identity, and its ingredients
and steps belong to an immutable revision. Refining a dish means calling
revise_recipe with a rationale — never creating a second recipe. There is
no delete and no in-place edit; that is deliberate.

Before creating anything, search_recipes. If the dish already exists,
revise it.

Call get_started for the full guide.
`.trim();

export const GUIDE = {
  premise:
    'A versioned cooking repository. The same dish kept being re-derived ' +
    'from scratch in every conversation; here it accumulates instead.',

  theOneRule:
    'A recipe is a stable identity. Its ingredients and steps belong to an ' +
    'immutable revision, and every revision records why it exists. To ' +
    'change a recipe, call revise_recipe with a rationale — do not create a ' +
    'second recipe for the same dish. There is no delete and no in-place ' +
    'edit of ingredients or steps.',

  workflow: [
    'search_recipes first — always. Check whether the dish is already here.',
    'If it exists: revise_recipe, with a rationale saying what changed and why.',
    'If it does not: create_recipe.',
    'Then upsert_taxonomy_term for any tag you introduced, so it is not left as a bare label.',
    'Then add_note for anything learned that is not an instruction.',
    'log_experiment when an actual batch was cooked and measured.',
  ],

  noteKinds: {
    science:
      'What is physically or chemically happening in the dish, and why a ' +
      'technique works. "Duxelles is a moisture barrier, not a flavour ' +
      'layer." Surfaced in its own section on the recipe page.',
    research:
      'What was learned around the dish afterwards: alternatives, hacks, ' +
      'sourcing, background. "Where to buy crayfish in Berlin." Attach ' +
      'sources where you have them.',
    observation: 'What was noticed during a specific cook.',
    result: 'How it actually turned out.',
    substitution: 'What was swapped for what, and why.',
    warning: 'A trap worth flagging before someone hits it.',
    idea: 'Something untried, recorded so it is not lost.',
    correction: 'Fixes an earlier claim that turned out to be wrong.',
  },

  taxonomy:
    'Faceted, not a single tree: a dish is Sichuan AND a main AND braised. ' +
    'Terms never cross facets, so "air-drying" the technique and ' +
    '"air-drying" the preservation method are two different terms with ' +
    'different explanations. Facets: cuisine, course, technique, diet, ' +
    'season, equipment, occasion, preservation, texture, ingredient_class. ' +
    'Tagging auto-creates unknown terms, which is why you should describe ' +
    'them afterwards.',

  ingredients:
    'Ingredients are canonical rows, not free text. Aliases are what make ' +
    'search work across vocabularies (cilantro / coriander), and category ' +
    'is what orders a shopping list by aisle. Recipes auto-create bare ' +
    'stubs; upsert_ingredient is how a stub gains its aliases, density, ' +
    'category and substitutes.',

  images:
    'Optional, and referenced by URL rather than uploaded — this stores ' +
    'notes, not binaries. A recipe takes heroImageUrl/heroImageAlt; each ' +
    'step takes its own imageUrl/imageAlt for what that stage should look ' +
    'like. Always write alt text.',

  shoppingList:
    'build_shopping_list combines several recipes into one list grouped by ' +
    'aisle. Amounts sum only within compatible units: 800 g + 1 kg = ' +
    '1.8 kg, but three cloves and two heads stay separate lines. Report ' +
    'unquantified entries as-is rather than inventing an amount.',

  scopes:
    'Read tools need noble-notations:read. The six write tools additionally ' +
    'need noble-notations:write, checked on every call.',

  conventions: [
    'Write rationales that say what changed and why, not "updated recipe".',
    'Prefer grams. The repository is weight-first so ratios stay comparable across batches.',
    'Never invent a measurement. If something was not recorded, say so in a note.',
    'A revision that only reformats text is noise; do not create one.',
  ],
} as const;
