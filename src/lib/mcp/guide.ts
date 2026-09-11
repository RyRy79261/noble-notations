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
 *
 * ONE PARAGRAPH IS CONDITIONAL. `report_issue` is registered only when
 * `GITHUB_ISSUE_TOKEN` is set, so on a deployment without it — local
 * development, a preview, a fork — instructions that tell an agent to call
 * that tool advertise a tool that is not in `tools/list`. An agent that
 * follows them meets a tool-not-found error, which is the same "told a
 * capability exists, found it absent" failure this whole branch exists to
 * reduce, and it cannot file a report about that either. So the reporting
 * text is included by the same predicate the registration uses.
 * `src/lib/github/config.ts` imports nothing by design, so reading the
 * predicate here costs this module nothing.
 */
import { issueReportingConfigured } from '@/lib/github/config';

const INSTRUCTIONS_HEAD = `
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
`.trim();

const INSTRUCTIONS_REPORTING = `
If a tool does the wrong thing, call report_issue. Give the tool name, the
payload that you sent, and the response that came back. Copy each one
exactly. A report that you write from memory is usually wrong. A refusal
that tells you what to send instead is not a fault.
`.trim();

const INSTRUCTIONS_TAIL = `
Before you make anything, call search_recipes.

The website calls a run a batch log. Every run is at /batch-logs.

Call get_started to read the full guide.
`.trim();

/**
 * The short version, surfaced by clients that read `instructions`.
 *
 * A function, not a constant, for the same reason the token is read inside
 * one: the route is `force-dynamic` so it can answer from the live
 * environment, and a module-scope constant would freeze the value the build
 * saw.
 */
export function serverInstructions(
  reportingConfigured = issueReportingConfigured(),
): string {
  return [
    INSTRUCTIONS_HEAD,
    ...(reportingConfigured ? [INSTRUCTIONS_REPORTING] : []),
    INSTRUCTIONS_TAIL,
  ].join('\n\n');
}

const SCOPES_WITHOUT_REPORTING =
  'The read tools need the scope noble-notations:read. The nine write ' +
  'tools also need noble-notations:write. The system checks the scope on ' +
  'each call.';

const GUIDE = {
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
    'If a tool does the wrong thing, call report_issue. Send the payload and the response, copied exactly.',
  ],

  noteKinds: {
    science:
      'What happens in the dish, and why a technique works. Example: ' +
      '"Duxelles is a moisture barrier. It is not a flavour layer." The ' +
      'recipe page shows these notes in their own section.',
    research:
      'What you learned about the dish after you made it. Other methods, ' +
      'small improvements, where to buy things, background. Example: ' +
      '"Where to buy crayfish in Berlin." A research note must have at ' +
      'least one source. Research records where a fact came from. If you ' +
      'have no source, write the note as an observation or an idea. The ' +
      'other kinds can have sources, but they do not need them.',
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
    'tag.\n\n' +
    'A tag can sit under a broader tag of the same type: "cajun" sits ' +
    'under "american". Set this with parentSlug in upsert_category. To ' +
    'remove a parent, send parentSlug as JSON null. Do not send the word ' +
    '"null" as text: the tool reads text as the name of a tag. The result ' +
    'of upsert_category gives the parent, and list_categories gives the ' +
    'parent of every tag. Read one of them to check what you wrote.\n\n' +
    'A tag cannot be named after an empty value. The names null, ' +
    'undefined, none, true, false and object-object are refused. A program ' +
    'prints these words when a value is missing, so a tag with one of them ' +
    'is an accident. This rule holds on all three fields that make a tag: ' +
    'the label in upsert_category, the categories of a recipe, and the ' +
    'technique of a step. A search is not a write, so search_recipes ' +
    'accepts these names and finds the recipes that carry such a tag.',

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
    'and rice for the table. A step must point to one line. You can say ' +
    'which line you mean in two ways.\n\n' +
    'The first way is the component. A line can carry a component: the ' +
    'heading above it, such as "Khao khua" or "To serve". In a step, write ' +
    'the component, then a colon, then the name: "To serve: Glutinous ' +
    'rice". This needs one call and no new name. You can write a name this ' +
    'way at any time, even when only one line answers to it. When two ' +
    'lines answer to a name, you must use one of the two ways, because the ' +
    'tool refuses a bare name that fits two lines. The component and the ' +
    'name must fit one line together. The tool refuses a pair that fits no ' +
    'line, and the error names the components of the list. The name comes ' +
    'after the last colon, so a component that holds a colon still ' +
    'works.\n\n' +
    'The second way is another name. Give the second line its own ' +
    'spelling, such as "Glutinous rice, to serve". Put that spelling in ' +
    'the other names of the ingredient first. Then write the line and its ' +
    'step with the new spelling. Use this way when the two lines must read ' +
    'differently: the page shows the spelling that you write. Both lines ' +
    'stay one ingredient, so a shopping list still adds the two amounts. ' +
    'Do not invent a new ingredient for it: two records for one thing ' +
    'split the shopping list, and nothing can join them again.',

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
   * WHY THE GUIDE NAMES THE WEBSITE AT ALL.
   *
   * The tools say "experiment". The website says "batch log". They are the
   * same record — the reader's word won the URL and the database kept its
   * own — and nothing told an agent so. One then wrote a run, could not
   * find it on the site, and reported the page as missing. It had existed
   * since the rename, seventh in the navigation.
   *
   * The addresses are relative on purpose. `NEXT_PUBLIC_SITE_URL` is set
   * nowhere in this repository, so `site.url` falls back to the production
   * host — which on a preview deployment or in the e2e suite would be a
   * lie. `getPublicOrigin()` is no better here: `registerTools` has no
   * request to read an origin from.
   */
  theWebsite:
    'This store is also a website. The website calls a run a batch log. ' +
    'Every run is on the page /batch-logs. This includes a run that names ' +
    'no recipe. One run is at /batch-logs/<slug>. A run that names a ' +
    'recipe is also at /recipes/<recipe>/batch-logs/<slug>. The address ' +
    '/batch-logs/<slug> always answers. It sends you on when the run has ' +
    'a recipe.',

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
    'each call. report_issue needs no extra scope. Each connector can file ' +
    'a report.',

  /**
   * The short version of this is in SERVER_INSTRUCTIONS too, and that
   * duplication is deliberate. An agent meets a fault in the middle of a
   * task. It will not spend a call on get_started at that moment, and the
   * payload and the response leave its context when the turn ends. A tool
   * that is only documented here is therefore only ever called by an agent
   * that read the guide first and remembered — which is the population whose
   * reports were already good. The detail stays here; the pointer is in the
   * instructions, the same split add_mass_flow and describe_mechanism use.
   *
   * The numbers are real. The report that prompted this tool made six claims
   * and three of them did not survive being reproduced, because it carried a
   * memory of the session rather than the request and the response.
   */
  reportingAFault:
    'This connector can take a bug report. Call report_issue. The report ' +
    'becomes an issue on the public GitHub repository of this project. A ' +
    'person reads it.\n\n' +
    'A report needs evidence. Name the tool that you called in toolName. ' +
    'Put the arguments that you sent in payload. Put the result or the ' +
    'error that came back in response. Copy both exactly. The server writes ' +
    'the commit that is deployed, so you do not send it. These four things ' +
    'settle a report.\n\n' +
    'Copy the payload and the response while you still hold them. Your turn ' +
    'ends and they are gone. A report that you write from memory is usually ' +
    'wrong. One agent reported six faults from memory. Three of the six ' +
    'were wrong. One of the three blamed this server for a fault in the ' +
    'client that wrote the report. Two named a thing as missing that was ' +
    'built weeks before.\n\n' +
    'Each report has a kind. A report of kind "bug" must carry the tool ' +
    'name, the payload and the response. The tool refuses a bug report ' +
    'without all three. If you do not hold them, send the report with the ' +
    'kind "unclear-docs", "missing-capability" or "idea". Those kinds need ' +
    'no evidence.\n\n' +
    'File a report when this server does the wrong thing. File one when a ' +
    'tool description or this guide says too little, or says something ' +
    'untrue. File one when you wanted to do a thing and found no tool for ' +
    'it.\n\n' +
    'Do not file a report for a refusal that names what to send instead. ' +
    'That refusal is the system working. Do not file a report for a call ' +
    'that failed one time and then worked.\n\n' +
    'Write a title that names the fault: "get_recipe returns an error for a ' +
    'slug that exists". Use the same title if the fault happens again. The ' +
    'tool finds the issue that is already open and adds your evidence to it ' +
    'as a comment. It does not open a second issue. So a second report of ' +
    'the same fault is safe.\n\n' +
    'The tool adds three comments for one fault. Then it refuses and names ' +
    'the issue that holds your evidence. Stop there. A fourth report of one ' +
    'fault tells a person nothing new.',

  rules: [
    'Write a reason that says what you changed and why. Do not write "updated recipe".',
    'Do not invent a measurement. If nobody recorded it, say this in a note.',
    'Do not make a version that only changes the text format.',
    'Send text as characters. A title with \\u2014 or \\" in it is refused. Encode the message as JSON one time only.',
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

export type AgentGuide =
  | typeof GUIDE
  | (Omit<typeof GUIDE, 'reportingAFault' | 'workflow' | 'scopes'> & {
      workflow: string[];
      scopes: string;
    });

/**
 * The full guide, as `get_started` returns it.
 *
 * The three places that name `report_issue` go together when the tool is not
 * registered. A guide that teaches a tool the registry does not carry sends
 * an agent to a tool-not-found error at the moment it most needs to be
 * believed.
 */
export function agentGuide(
  reportingConfigured = issueReportingConfigured(),
): AgentGuide {
  if (reportingConfigured) return GUIDE;
  const { reportingAFault: _reportingAFault, ...rest } = GUIDE;
  return {
    ...rest,
    workflow: GUIDE.workflow.filter((step) => !step.includes('report_issue')),
    scopes: SCOPES_WITHOUT_REPORTING,
  };
}
