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
 * THE SPLIT, AND WHAT DECIDES WHICH HALF A THING GOES IN.
 * `INSTRUCTIONS_HEAD` is read by a client before its first tool call, and it
 * is paid for in every conversation whether or not it is used — so it holds
 * only what an agent must know BEFORE it calls anything, and it holds each
 * of those as one sentence. `GUIDE` is behind `get_started` and is paid for
 * once, by an agent that asked, so it holds the explanation.
 *
 * The four things the CRUD surface added are split on that rule. The
 * question that decides between a revision and a correction is in BOTH,
 * because an agent that never calls `get_started` still has to answer it
 * before it writes — that is the sentence whose absence costs a history.
 * The names of the three correction tools, `restore_record` and
 * `list_deleted` are in the instructions, because a capability an agent does
 * not know exists is one it works around. Everything else — which tool owns
 * which record, what a delete takes with it, why a restore is refused, why a
 * number is never given again — is in `GUIDE.correctingARecord` and
 * `GUIDE.deletingARecord`, where it costs a call that the agent chose.
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
/**
 * The second conditional capability, and it works exactly like the first.
 *
 * `upload_image` is registered only when `BLOB_READ_WRITE_TOKEN` is set —
 * Production and Preview have it, a developer's machine and CI do not. So
 * every sentence of this guide that tells an agent to call it is included by
 * the same predicate the registration uses, for the reason the header gives
 * about `report_issue`: teaching a tool the registry does not carry sends an
 * agent to a tool-not-found error.
 *
 * It also moves a COUNT, which `report_issue` does not: `upload_image` is a
 * write tool, so the sentence naming how many write tools there are is
 * sixteen or seventeen depending on this. `e2e/auth-guide.spec.ts` measures
 * that against the live registry and fails on a mismatch, which is how the
 * number was caught being wrong before.
 */
import { isConfigured as imageUploadConfigured } from '@/lib/images/blob';

const INSTRUCTIONS_HEAD = `
Noble Notations is a cooking store that keeps versions.

The most important rule: a recipe has a name that does not change. Its
ingredients and steps belong to a version. To improve a dish, call
revise_recipe and give a reason. The old version stays and people can still
read it. Do not make a second recipe for the same dish.

You can correct a record and you can delete one. A delete is not
destruction: the record stops being visible, and restore_record brings it
back. Call list_deleted to see the bin.

Ask one question first: did the food change, or is the record wrong? If the
food changed, call revise_recipe. If the record is wrong, call
update_recipe, update_revision or update_note.

A dish can also go a different way. Dan dan noodles with shiitake instead of
pork is not a better dan dan noodles. It is a variation. Call create_variant.
It makes a recipe of its own, with its own versions, and it changes nothing
about the dish it came from. Every variation of one dish is a sibling of the
others, and get_recipe reports the whole family as variantFamily.

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
conditions. Each of these two tools writes its field one time. Neither
replaces a value. To correct a value that is already stored, call
update_revision or update_note.

A note can move to another record. Call reattach_note. The text of the
note does not change. Only the record that holds it changes. Use it when
you wrote a note before the record it belongs to existed.

Units come from a fixed list. A unit outside it is refused.

After a write, read needsDescription in the result. It names the tags and
ingredients that are still bare. Describe them in the same session.

Write every word that a person reads in simple technical English. Use
short sentences. Put one idea in each sentence. Use the active voice.
Write a step as an instruction to the cook. Use the same word for the
same thing each time. A cook reads this text, and many cooks do not read
English as a first language. Call get_started for the full rule.
`.trim();

const INSTRUCTIONS_IMAGES = `
You can put a picture in this store. Call upload_image. Send the bytes
base64 encoded and write the alt text. The tool gives back an address. Every
image field takes that address. Give attachTo to put the picture on a record
in the same call.
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

Before you write a note, call search_notes. It finds notes on every record.

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
  uploadConfigured = imageUploadConfigured(),
): string {
  return [
    INSTRUCTIONS_HEAD,
    ...(uploadConfigured ? [INSTRUCTIONS_IMAGES] : []),
    ...(reportingConfigured ? [INSTRUCTIONS_REPORTING] : []),
    INSTRUCTIONS_TAIL,
  ].join('\n\n');
}

/**
 * The write-tool count, in the two states it has.
 *
 * `upload_image` is a write tool and is registered only where the blob store
 * is configured, so this number is not a constant. That is new: the count
 * used to be one, then `create_variant` made it sixteen, and a CONDITIONAL
 * write tool makes it a pair. It is spelled out rather than computed because
 * the registry is built in `tools.ts` and importing it here would make the
 * guide depend on the thing that documents it; `e2e/auth-guide.spec.ts`
 * counts the live registry and asserts the word, which is the check that
 * matters and the one that has caught this sentence being wrong before.
 */
function writeToolCountWord(uploadConfigured: boolean): string {
  return uploadConfigured ? 'seventeen' : 'sixteen';
}

function scopesParagraph(
  uploadConfigured: boolean,
  reportingConfigured: boolean,
): string {
  const head =
    'The read tools need the scope noble-notations:read. The ' +
    `${writeToolCountWord(uploadConfigured)} write tools also need ` +
    'noble-notations:write.';
  return reportingConfigured
    ? `${head} list_deleted is a read tool, so it needs the read scope ` +
        'only. The system checks the scope on each call. report_issue needs ' +
        'no extra scope. Each connector can file a report.'
    : `${head} The system checks the scope on each call.`;
}

const GUIDE = {
  whatThisIs:
    'A cooking store that keeps versions. Before this store, the same dish ' +
    'was made again from the start in each conversation. Now the dish ' +
    'becomes better in steps.',

  /**
   * The rule, and the sentence that keeps it a rule now that a stored
   * version can be corrected.
   *
   * The old text said "you cannot change a version" and "you cannot delete a
   * recipe", and both are now false. The danger the old text was defending
   * against did not go away with it: an agent that corrects a version when
   * the dish changed overwrites what a person cooked from, and that is the
   * loss this whole repository exists to prevent. So the defence moves from
   * a prohibition to a question, and the question is about the FOOD — the
   * one thing the caller reliably knows.
   */
  theOneRule:
    'A recipe has a name that does not change. Its ingredients and steps ' +
    'belong to a version. Each version records why you made it. To improve ' +
    'a dish, call revise_recipe and give a reason. The old version stays, ' +
    'and people can still read it. Do not make a second recipe for the same ' +
    'dish.\n\n' +
    'Ask one question before you write: did the food change, or is the ' +
    'record wrong?\n\n' +
    'If the food changed, call revise_recipe. It adds a version. This is ' +
    'almost always the answer.\n\n' +
    'If the record is wrong, correct it. A typo, a wrong number, a version ' +
    'that two chats wrote twice: these are not new versions of the dish. ' +
    'They are mistakes in the record. Call update_recipe, update_revision ' +
    'or update_note.\n\n' +
    'Do not correct a version because the dish changed. The correction ' +
    'writes over the version that a person cooked from, and the history of ' +
    'the dish is gone.\n\n' +
    'One more answer is possible, and it is the one that is easy to miss. ' +
    'The dish did not get better and the record is not wrong: the dish went ' +
    'a different way. That is a variation. Call create_variant. See ' +
    'variations below.',

  /**
   * Variations, and the one mistake this section exists to stop.
   *
   * An agent asked for "dan dan noodles but with shiitake" reaches for
   * `revise_recipe`, because that is the tool the guide spends the most
   * words on and because a variation LOOKS like a change to the dish. It is
   * the most expensive wrong answer available: a revision moves
   * `current_revision_id`, so the pork version stops being what people read,
   * and nobody finds out until they open the page looking for it.
   *
   * So the fork is stated as three sentences with three tools, in the same
   * shape as the question that separates a revision from a correction. That
   * question works because it is about the FOOD rather than about the
   * database, and this one is written to match: got better, went a
   * different way, was written down wrong.
   */
  variations:
    'A dish can go a different way. Dan dan noodles with shiitake instead ' +
    'of pork is not a better dan dan noodles. It is a second dish, beside ' +
    'the first.\n\n' +
    'That is a variation, and it is not a version. Call create_variant. ' +
    'Give it the slug of the dish it varies, and one line in variantNote ' +
    'for what makes it different.\n\n' +
    'Ask which of three things happened:\n' +
    'The dish got better. Call revise_recipe.\n' +
    'The dish went a different way. Call create_variant.\n' +
    'The dish is fine and the record is wrong. Call update_recipe.\n\n' +
    'Do not call revise_recipe for a variation. A version becomes the one ' +
    'that people read, so the dish you started from stops being on its own ' +
    'page. A variation changes nothing about that dish.\n\n' +
    'A variation is a recipe. It has its own address, its own versions and ' +
    'its own batch logs. You can revise it. It can have variations of its ' +
    'own.\n\n' +
    'Every variation of one dish is a sibling of the others. get_recipe ' +
    'reports them all as variantFamily: the dish they came from, the ones ' +
    'beside them, and the ones below them. Read it before you add one. The ' +
    'variation that you are about to write may be there.\n\n' +
    'Nothing is copied from the dish that a variation varies. Send the ' +
    'whole ingredient list and the whole method. The part that differs is ' +
    'the reason the variation exists, so it must be written.\n\n' +
    'update_recipe moves a recipe into a family, or out of one. Send ' +
    'variantOf with a slug to move it in. Send variantOf as null to make it ' +
    'a dish of its own. Use this to correct a wrong parent. To make a new ' +
    'variation, call create_variant.',

  /**
   * The three correction tools, and which record each one owns.
   *
   * It says what is NOT here as plainly as what is: an agent looking for
   * `update_experiment` must find out in one read that `log_experiment` is
   * that tool, rather than filing a missing-capability report.
   */
  correctingARecord:
    'Six kinds of record can be corrected, and three tools do it.\n\n' +
    'update_recipe corrects the name, the summary, the tags, the links, the ' +
    'kind and the status of a recipe. It also moves a recipe into a family ' +
    'of variations, or out of one, with variantOf. It touches no version. ' +
    'You cannot change the slug: it is the public address of the ' +
    'recipe.\n\n' +
    'update_revision corrects a stored version in place. It makes no new ' +
    'version and it moves no number. Send ingredients, steps or massFlow to ' +
    'replace a whole list. A list that you leave out stays as it is.\n\n' +
    'update_note corrects a note, and it can move the note to another ' +
    'recipe, version, ingredient or run.\n\n' +
    'The other three records need no new tool. log_experiment, ' +
    'upsert_ingredient and upsert_category each write the keys that you ' +
    'send onto the record that is stored. They are already the way to ' +
    'correct a run, an ingredient and a tag.\n\n' +
    'No correction asks for a reason. A reason records why a dish changed, ' +
    'and a correction is the statement that the dish did not change.\n\n' +
    'A note of kind "correction" is a different thing, and it is still ' +
    'there. Add one when the old claim must stay readable. Correct the note ' +
    'itself when the note was never true.',

  /**
   * Delete, restore and the bin.
   *
   * Why the rule changed is worth one sentence here as well as in AGENTS.md:
   * an agent that believes a delete is final will leave a duplicate in
   * place, and a duplicate revision is exactly what two chats working in
   * parallel produce.
   */
  deletingARecord:
    'You can delete a recipe, a version, a note, a run, an ingredient, a ' +
    'tag and an image. Call delete_record. Name the kind, then say which ' +
    'record.\n\n' +
    'An image is named by its id and nothing else. Deleting one takes it ' +
    'off every record that shows it, at once. Nothing else changes, and no ' +
    'version is rewritten.\n\n' +
    'A delete is not destruction. The record stops being visible: the site ' +
    'does not show it and the read tools do not return it. The record ' +
    'itself stays. Call restore_record to bring it back, with the same ' +
    'arguments.\n\n' +
    'Delete a duplicate. Delete a record that somebody wrote by mistake. Do ' +
    'not delete a version because the dish changed: call revise_recipe for ' +
    'that, and the old version stays where it is.\n\n' +
    'Give a reason. The bin shows it. It is the only thing that tells the ' +
    'next reader why the record went.\n\n' +
    'Some records take others with them. A recipe takes its versions, its ' +
    'notes and its runs. A version takes its notes. A run takes its notes. ' +
    'The result names what went with it. One restore brings back the same ' +
    'set.\n\n' +
    'A record that somebody deleted on its own, before the record above it ' +
    'went, keeps its own date and its own reason. It does not come back ' +
    'with the one above it. Restore it on its own.\n\n' +
    'You cannot restore a record while the record it belongs to is still ' +
    'deleted. The refusal names what to restore first.\n\n' +
    'Call list_deleted to see the bin. Each row gives the kind, a name that ' +
    'you can read, the date, who deleted it and the reason. Each row also ' +
    'gives the arguments for restore_record, ready to send.\n\n' +
    'Two rules keep a number safe. A number is never given again: a deleted ' +
    'version keeps the number it had, so the address of that version stays ' +
    'an address that nothing else can take. And a restore does not decide ' +
    'which version people read. Call update_recipe with ' +
    'currentRevisionNumber for that.\n\n' +
    'You cannot delete the only version of a recipe. A recipe with no ' +
    'version cannot be read. Delete the recipe.',

  /**
   * WHY THE GUIDE TELLS AN AGENT HOW TO WRITE.
   *
   * A model writes the way it was asked to write, and asked for a recipe it
   * writes food prose: a step that carries three actions and a metaphor, a
   * rationale that reads as a paragraph of praise. A cook reading that on a
   * phone, with wet hands, has to decode it before doing anything — and a
   * reader who does not have English as a first language may not decode it
   * at all. The site's own copy has followed ASD Simplified Technical
   * English since M2; everything an agent writes THROUGH the connector is
   * the same reader-facing text and was governed by nothing.
   *
   * This is a writing rule and not a schema rule on purpose. Sentence
   * length is not something the write layer can refuse without refusing
   * good text with the bad, so it is stated where an agent reads it and
   * left to the agent. AGENTS.md § Words and writing style is the same rule
   * for the humans.
   */
  howToWrite:
    'Write every word that a person reads in simple technical English. ' +
    'This is the ASD Simplified Technical English style. A cook reads this ' +
    'store, often while cooking. Many cooks do not read English as a first ' +
    'language.\n\n' +
    'Use short sentences. Keep a step to 20 words or fewer. Put one idea ' +
    'in each sentence, and one action in each step. Use the active voice: ' +
    'write "Cut the beef into strips of 10 mm", not "the beef is then cut ' +
    'into strips".\n\n' +
    'Use the simple word. Write "cut", not "butterfly". Write "add", not ' +
    '"incorporate". Use the same word for the same thing each time: a pan ' +
    'that becomes a skillet in the next step reads as a second pan. If a ' +
    'technical word is the only correct word, use it and explain it one ' +
    'time in plain words.\n\n' +
    'Give a number and a unit for each amount, each time and each ' +
    'temperature. Do not write "a good glug" or "until it looks right". If ' +
    'nobody measured it, say so in a note.\n\n' +
    'Do not write a metaphor, a joke, or a sentence that praises the dish. ' +
    'A rationale says what changed and why, in the words a cook can act ' +
    'on.\n\n' +
    'This rule holds for the title, the subtitle, the summary, every step, ' +
    'every note, every rationale, and the explanation of a tag or an ' +
    'ingredient. It does not hold for a quotation from a source: copy that ' +
    'exactly, and say who wrote it.',

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
    'If the dish is here and the food changed, call revise_recipe. Give a reason that says what you changed.',
    'If the dish is not here, call create_recipe.',
    'If the dish is here and it went a different way, call create_variant. A variation is not a version.',
    'If you find a version that is older than every stored version, call backfill_revision.',
    'Call upsert_category for each new tag. This gives the tag an explanation.',
    'Call search_notes before you write a note. Find out if the store already says it.',
    'Call add_note for each thing that you learned that is not an instruction.',
    'Call log_experiment after you cook a batch and measure it.',
    'Call add_mass_flow or describe_mechanism only for a record that is already stored.',
    'If a note sits on the wrong record, call reattach_note. Do not write the note again.',
    'If the record is wrong and the food did not change, call update_recipe, update_revision or update_note.',
    'If a record is a duplicate or a mistake, call delete_record and give a reason. Call restore_record if you were wrong.',
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
    'already stored, call describe_mechanism. That tool writes the ' +
    'conditions one time and refuses a second set. If they are wrong, call ' +
    'update_note. To leave the old claim readable, add a note of kind ' +
    '"correction".',

  /**
   * D-12, R-SCR-39. The figure is optional by requirement, so the text has
   * to say when NOT to send one as clearly as it says how — a mass flow on
   * every recipe is worse than none, because it stops meaning anything.
   */
  movingANote:
    'A note hangs off one record. You choose the record when you write the ' +
    'note. Sometimes the right record does not exist yet. A note about a ' +
    'dish goes on a run, because nobody wrote the recipe. Call ' +
    'reattach_note to move the note later. Give the id of the note and one ' +
    'record. The text of the note does not change. The kind, the title, ' +
    'the body, the sources and the date stay the same. Only the record ' +
    'changes.\n\n' +
    'Do not write the note a second time. Two copies of one note become ' +
    'different over time, and no reader can tell which one is right.\n\n' +
    'The store keeps each record that the note was on before. A note on a ' +
    'version of a recipe cannot move. That note says something about that ' +
    'version. Write a new note where it belongs.',

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
    'add_mass_flow. A version takes one figure and then refuses another. ' +
    'To correct a figure that is wrong, call update_revision.',

  /**
   * Replaced when `upload_image` is registered — see `IMAGES_WITH_UPLOAD`.
   *
   * This is the text for a deployment with no blob store, and it is the
   * text this section held for the whole life of the project before issue
   * #54: give an address, because there is nothing here that can make one.
   */
  images:
    'Images are not necessary. Give a web address for each image. This ' +
    'deployment cannot store an image file, so the address must already ' +
    'exist on the web. A recipe can have heroImageUrl and heroImageAlt. ' +
    'Each step can have imageUrl and imageAlt for the correct appearance ' +
    'at that stage. An ingredient, a tag and a run can each have ' +
    'heroImageUrl and heroImageAlt. Always write the alt text.',

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
   * `backfill_revision` was added and this line was not. It is seventeen now
   * — nine, plus `reattach_note`, the three corrections, the delete, the
   * restore, `create_variant` and `upload_image` — and the number is worth
   * keeping true: an agent that reads "six" and counts seventeen has no way
   * to tell which nine it must not trust.
   *
   * `list_deleted` is a READ and is counted as one. It reports rows the site
   * does not show, which is why that looks wrong at first glance — but the
   * read scope already grants an archived recipe, and `ALLOWED_EMAILS`
   * means one administrator approved every connector that can ask.
   *
   * SIX OTHER PLACES STATE A COUNT and must move together: `scopesParagraph`
   * above, four docs in `src/app/connect/page.tsx` and the total in
   * `docs/mcp-connector.md`. The registry holds thirty tools: twelve read,
   * seventeen write, and `report_issue` in neither scope.
   *
   * TWO OF THOSE ARE CONDITIONAL, so the count is a range and not a number.
   * `report_issue` needs `GITHUB_ISSUE_TOKEN` and is in neither scope, so it
   * moves the total and no scope count. `upload_image` needs
   * `BLOB_READ_WRITE_TOKEN` and IS a write tool, so it moves both — which is
   * why the sentence below is built rather than written out.
   */
  scopes: scopesParagraph(true, true),

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
    'Write in simple technical English. Short sentences. One idea in each sentence. Active voice.',
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

/**
 * What the `images` section says once there is somewhere to put the bytes.
 *
 * Issue #54 is the whole reason this variant exists. The old text told an
 * agent to give a web address for a picture it was holding as bytes, which
 * is advice it could not follow — so the field went unused and most pictures
 * were never added. This says what to call instead.
 */
const IMAGES_WITH_UPLOAD =
  'You can put a picture in this store. Call upload_image. Send the bytes ' +
  'base64 encoded in data, say what they are in mimeType, and write the alt ' +
  'text. The tool gives back an address. Every image field in this store ' +
  'takes that address.\n\n' +
  'Always write the alt text. Say what the picture shows, for a reader who ' +
  'cannot see it. Write "Sliced biltong, dark red with a white fat seam", ' +
  'not "a photo of biltong".\n\n' +
  'Give attachTo to put the picture on a record in the same call. Name one ' +
  'record: {recipeSlug} for the hero image of a recipe, {recipeSlug, ' +
  'stepPosition} for one step, {ingredientSlug} for an ingredient, ' +
  '{experimentSlug} for a run, {experimentSlug, gallery: true} to add to ' +
  'the pictures of a run, or {tagSlug, categoryType} for a tag. Leave ' +
  'attachTo out to store the picture and use the address later.\n\n' +
  'The first step is stepPosition 1. get_recipe reports the position of a ' +
  'step counting from 0. Add 1 to that number.\n\n' +
  'A run takes several pictures. Every other record takes one. A second ' +
  'upload to the same record replaces the picture that is there. A second ' +
  'upload to the pictures of a run adds to them.\n\n' +
  'A hero image belongs to the recipe and not to a version, so it makes no ' +
  'version. A step picture is inside a stored version, so writing one ' +
  'changes what every reader of that version sees. This is allowed. A ' +
  'picture is not a change to the food. Be sure the picture is of that ' +
  'version.\n\n' +
  'The tool makes the picture smaller and stores it as WebP. The longest ' +
  'edge becomes 2000 pixels. A photograph from a phone is fine as it is. ' +
  'The limit is 15 MB after decoding.\n\n' +
  'The same picture sent twice gives the same address back. Nothing is ' +
  'stored a second time.\n\n' +
  'To take a picture down, call delete_record with kind "image" and the id. ' +
  'It stops being visible on every record that shows it. restore_record ' +
  'brings it back. There is no delete_image. This store has one delete and ' +
  'it is soft.';

export type AgentGuide = Omit<
  typeof GUIDE,
  'reportingAFault' | 'workflow' | 'scopes'
> & {
  reportingAFault?: string;
  workflow: readonly string[];
  scopes: string;
};

/**
 * The full guide, as `get_started` returns it.
 *
 * TWO CAPABILITIES ARE CONDITIONAL and both are handled the same way. The
 * three places that name `report_issue` go together when
 * `GITHUB_ISSUE_TOKEN` is missing, and the `images` section and the write
 * count go together when `BLOB_READ_WRITE_TOKEN` is. A guide that teaches a
 * tool the registry does not carry sends an agent to a tool-not-found error
 * at the moment it most needs to be believed.
 */
export function agentGuide(
  reportingConfigured = issueReportingConfigured(),
  uploadConfigured = imageUploadConfigured(),
): AgentGuide {
  const { reportingAFault, ...rest } = GUIDE;
  return {
    ...rest,
    ...(reportingConfigured ? { reportingAFault } : {}),
    workflow: reportingConfigured
      ? GUIDE.workflow
      : GUIDE.workflow.filter((step) => !step.includes('report_issue')),
    images: uploadConfigured ? IMAGES_WITH_UPLOAD : GUIDE.images,
    scopes: scopesParagraph(uploadConfigured, reportingConfigured),
  };
}
