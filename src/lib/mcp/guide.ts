import 'server-only';

/**
 * The onboarding guide that an agent reads before it changes anything.
 *
 * Tool descriptions explain one tool each. Nothing explained how the parts
 * work together, and an agent that does not know that this store keeps
 * versions will use create_recipe when it must use revise_recipe. This is
 * that missing text. It is in one place, so the get_started tool and the
 * server instructions cannot become different.
 *
 * The text follows ASD Simplified Technical English: short sentences, one
 * idea in each sentence, active voice, and no words that need other words
 * to explain them.
 */
export const SERVER_INSTRUCTIONS = `
Noble Notations is a cooking store that keeps versions.

The most important rule: a recipe has a name that does not change. Its
ingredients and steps belong to a version. You cannot change a version
after you make it. To improve a dish, call revise_recipe and give a
reason. Do not make a second recipe for the same dish.

You cannot delete anything. You cannot edit ingredients or steps. This is
correct behaviour, not a fault.

You can add an older version that you find later. Call backfill_revision.
This adds history. It does not change the recipe that people read.

Before you make anything, call search_recipes.

Call get_started to read the full guide.
`.trim();

export const GUIDE = {
  whatThisIs:
    'A cooking store that keeps versions. Before this store, the same dish ' +
    'was made again from the start in each conversation. Now the dish ' +
    'becomes better in steps.',

  theOneRule:
    'A recipe has a name that does not change. Its ingredients and steps ' +
    'belong to a version. You cannot change a version after you make it. ' +
    'Each version records why you made it. To change a recipe, call ' +
    'revise_recipe and give a reason. Do not make a second recipe for the ' +
    'same dish. You cannot delete a recipe. You cannot edit ingredients or ' +
    'steps.',

  olderVersions:
    'You can add a version that is older than every version in the store. ' +
    'Call backfill_revision. Use it when you find an old version later: in ' +
    'a notebook, in a photo, or in an earlier conversation. Give the date ' +
    'that the version existed. The date must be earlier than every version ' +
    'that is already stored. The recipe that people read does not change: ' +
    'the current version stays where it is. Send the full ingredients. ' +
    'Nothing is copied from a later version, because that would make a ' +
    'history that never happened. To add a version that comes after the ' +
    'stored versions, call revise_recipe instead.',

  workflow: [
    'Call search_recipes first. Always. Find out if the dish is here.',
    'If the dish is here, call revise_recipe. Give a reason that says what you changed.',
    'If the dish is not here, call create_recipe.',
    'If you find a version that is older than every stored version, call backfill_revision.',
    'Call upsert_category for each new tag. This gives the tag an explanation.',
    'Call add_note for each thing that you learned that is not an instruction.',
    'Call log_experiment after you cook a batch and measure it.',
  ],

  noteKinds: {
    science:
      'What happens in the dish, and why a technique works. Example: ' +
      '"Duxelles is a moisture barrier. It is not a flavour layer." The ' +
      'recipe page shows these notes in their own section.',
    research:
      'What you learned about the dish after you made it. Other methods, ' +
      'small improvements, where to buy things, background. Example: ' +
      '"Where to buy crayfish in Berlin." Add sources if you have them.',
    observation: 'What you saw during one cook.',
    result: 'How the dish was at the end.',
    substitution: 'What you used in place of something, and why.',
    warning: 'A problem that other people must know about first.',
    idea: 'Something that you did not try yet. Record it so you keep it.',
    correction: 'A correction to an earlier note that was wrong.',
  },

  categories:
    'A recipe has many tags at the same time. A dish can be Sichuan, and a ' +
    'main, and braised. Each tag belongs to one type of category. The same ' +
    'word can be in two types: "air-drying" is a technique, and it is also ' +
    'a preservation method. These are two different tags. The types are: ' +
    'cuisine, course, technique, diet, season, equipment, occasion, ' +
    'preservation, texture and ingredient_class. When you add a tag to a ' +
    'recipe, the system makes the tag if it does not exist. The new tag has ' +
    'no explanation, so call upsert_category to add one.',

  ingredients:
    'Each ingredient is one record. It is not free text. Other names for ' +
    'the same ingredient make search work: a search for "cilantro" finds ' +
    'coriander. The category of an ingredient puts it in the correct part ' +
    'of a shopping list. A new recipe makes simple ingredient records. Call ' +
    'upsert_ingredient to add the other names, the density, the category ' +
    'and the possible replacements.',

  images:
    'Images are not necessary. Give a web address for each image. This ' +
    'store keeps notes, not image files. A recipe can have heroImageUrl ' +
    'and heroImageAlt. Each step can have imageUrl and imageAlt for the ' +
    'correct appearance at that stage. Always write the alt text.',

  shoppingList:
    'build_shopping_list joins two or more recipes into one list. The list ' +
    'follows the order of a shop. The tool adds two amounts only if their ' +
    'units agree: 800 g and 1 kg become 1.8 kg. Three cloves and two heads ' +
    'stay on two lines. If an amount is not given, report this. Do not ' +
    'invent an amount.',

  scopes:
    'The read tools need the scope noble-notations:read. The six write ' +
    'tools also need noble-notations:write. The system checks the scope on ' +
    'each call.',

  rules: [
    'Write a reason that says what you changed and why. Do not write "updated recipe".',
    'Use grams. Then you can compare the quantities in different batches.',
    'Do not invent a measurement. If nobody recorded it, say this in a note.',
    'Do not make a version that only changes the text format.',
  ],
} as const;
