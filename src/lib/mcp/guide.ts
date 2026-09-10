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

A write can still replace a list. The categories field holds all the tags
of a recipe, in every category type. A write that sends this field replaces
them all. A write that leaves it out changes no tag. An empty categories
object removes every tag. So send back each tag that you want to keep. Two
other lists replace in the same way: the other names of an ingredient, and
the items and observations of a run.

You can add an older version that you find later. Call backfill_revision.
This adds history. It does not change the recipe that people read.

Two fields were added after the store was full, so two tools fill them on
a record that is already stored. Call add_mass_flow to say what a dish
weighs at each stage. Call describe_mechanism to give a science note its
conditions. Each field is written once. Neither tool changes a value.

Units come from a fixed list. A unit outside it is refused.

After a write, read needsDescription in the result. It names the tags and
ingredients that are still bare. Describe them in the same session.

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
    'Call add_mass_flow or describe_mechanism only for a record that is already stored.',
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
    'no explanation, so call upsert_category to add one.\n\n' +
    'The categories field holds all the tags of a recipe. create_recipe and ' +
    'revise_recipe replace them all. A category type that you do not send ' +
    'loses its tags. An empty categories object removes every tag. A ' +
    'revision that leaves the field out changes no tag. Read the recipe ' +
    'with get_recipe first. Then send back each tag that you want to ' +
    'keep.\n\n' +
    'In each category type, the first tag in the list becomes the primary ' +
    'one. get_recipe and search_recipes report it as isPrimary. There is no ' +
    'field for it. The order of the list is the only control: put a tag ' +
    'first to make it the primary one. Each category type has one primary ' +
    'tag.',

  ingredients:
    'Each ingredient is one record. It is not free text. Other names for ' +
    'the same ingredient make search work: a search for "cilantro" finds ' +
    'coriander. The category of an ingredient puts it in the correct part ' +
    'of a shopping list. A new recipe makes simple ingredient records. Call ' +
    'upsert_ingredient to give a record the other names, the density, the ' +
    'category and the possible replacements.\n\n' +
    'A field that you leave out keeps the value the store holds. The name ' +
    'is the exception: it is required, so every call writes it. Send the ' +
    'stored name unless you mean to change it. The other names replace the ' +
    'stored list, so send them all each time. The possible replacements ' +
    'only add: the tool never removes one. A replacement that is not an ' +
    'ingredient makes a new ingredient record.\n\n' +
    'One recipe can list one ingredient twice, such as rice for a powder ' +
    'and rice for the table. A step must point to one line, so give the ' +
    'second line its own spelling. Put that spelling in the other names of ' +
    'the ingredient first. Do not invent a new ingredient for it: two ' +
    'records for one thing split the shopping list, and nothing can join ' +
    'them again.',

  /**
   * D-02. The conditions are a list because R-SCR-41 requires them to stay
   * separate values, and the one instruction the model gets is this text —
   * so it names the two mistakes: joining them into a sentence, and
   * splitting a range that is one condition.
   */
  mechanismConditions:
    'The site draws a science note as a mechanism. A mechanism can carry ' +
    'conditions: the values that it holds under. Examples: a temperature, ' +
    'a time, a depth of layer.\n\n' +
    'Write each condition as a separate value: ["232 °C", "45 min", ' +
    '"single layer on a rack"]. Do not write them into a sentence. Do not ' +
    'join them with a comma or a dot. The page draws the separators. Keep ' +
    'a range in one value: "4 °C → 71 °C" is one condition, not two.\n\n' +
    'Send conditions to add_note when you write the note. If the note is ' +
    'already stored, call describe_mechanism. A note states its ' +
    'conditions once. If they are wrong, add a note of kind "correction".',

  /**
   * D-12, R-SCR-39. The figure is optional by requirement, so the text has
   * to say when NOT to send one as clearly as it says how — a mass flow on
   * every recipe is worse than none, because it stops meaning anything.
   */
  massFlow:
    'A dish can lose or gain a lot of weight while it is made. Biltong of ' +
    '10 kg raw becomes 4.5 kg dried. The mass flow figure shows what the ' +
    'food weighs at each stage, so a cook can plan the batch.\n\n' +
    'Send massFlow only for a dish like that. Most dishes do not need it.\n\n' +
    'Give the stages in order, first to last. Give two stages at least. ' +
    'Each stage has a label and one figure. The figure is a weight, a ' +
    'count or a wait. Write a wait in minutes: 1440 is one day. Do not ' +
    'give a weight and a wait in the same stage.\n\n' +
    'The figure belongs to one version, because it records one batch. It ' +
    'is not copied into the next version. Send it again only when you ' +
    'weighed that version. To give a stored version its figure, call ' +
    'add_mass_flow. A version takes one figure and then refuses another.',

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

  /**
   * The count was "six" and the registry held seven, because
   * `backfill_revision` was added and this line was not. It is nine now —
   * `add_mass_flow` and `describe_mechanism` — and the number is worth
   * keeping true: an agent that reads "six" and counts nine has no way to
   * tell which three it must not trust.
   */
  scopes:
    'The read tools need the scope noble-notations:read. The nine write ' +
    'tools also need noble-notations:write. The system checks the scope on ' +
    'each call.',

  rules: [
    'Write a reason that says what you changed and why. Do not write "updated recipe".',
    'Do not invent a measurement. If nobody recorded it, say this in a note.',
    'Do not make a version that only changes the text format.',
  ],

  /**
   * The old rule said "Use grams" and the server accepted ml without a
   * word, so the guide and the code disagreed and the code won silently.
   * This is what the code actually does.
   */
  units:
    'Units come from a fixed list. Common spellings are folded onto one ' +
    'spelling: "pieces" and "pc" both become "piece". A unit outside the ' +
    'list is refused, and the error names the list. A unit that nobody can ' +
    'convert cannot be added into a shopping list.\n\n' +
    'Mass is best. Only mass lets you compare two batches of different ' +
    'size. Volume and count are allowed, and they are kept as written: ' +
    '"2 tbsp" stays "2 tbsp", because that is how a person cooks.\n\n' +
    'If you write a volume unit for an ingredient that has no ' +
    'densityGPerMl, the write succeeds and the result tells you. That ' +
    'amount cannot be turned into grams. Fix it in one of two ways: set ' +
    'densityGPerMl with upsert_ingredient, or write the line in grams.',

  /**
   * The result of a write says what is still missing. This is here so the
   * agent knows to read it, but the mechanism does not depend on the agent
   * remembering: `create_recipe` and `revise_recipe` return the list.
   */
  afterYouWrite:
    'A name that does not exist yet is created. This is on purpose: a ' +
    'recipe should not be refused because a tag is new. But a new tag has ' +
    'no explanation and a new ingredient has no category, and the write ' +
    'result lists both under needsDescription. Call upsert_category and ' +
    'upsert_ingredient for everything it names. Do this in the same ' +
    'session, while you still know what the words mean.',
} as const;
