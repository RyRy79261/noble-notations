import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { site } from '@/lib/site';
import { cn } from '@/lib/utils';
import { numberWord } from '@/components/f/band';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { Footnote, Warning } from '@/components/f/note';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';

export const metadata: Metadata = {
  title: 'MCP connector',
  description:
    'Connect a Claude project to this repository so it can search recipes and append revisions directly.',
  alternates: { canonical: '/connect' },
  // Reachable, but not advertised. `ALLOWED_EMAILS` means one person can
  // approve a connector, so a search result for this page can only ever
  // send someone to a 403. It stays linked from the footer for that person.
  robots: { index: false, follow: true },
};

/**
 * `/connect` — the agent page. `access-1280.html:29`, at 360 in
 * `m360-access-science.html:29`. The pictures are
 * `design/exports/png/U3IDmN.png` and `W2VaE.png`.
 *
 * R-SCR-26: this screen has low traffic and must not look unfinished. It is
 * a prose screen on the ordinary skeleton — a breadcrumb, a hero, a recessed
 * endpoint band, three numbered sections and a warning — and every part of
 * it is a component the design already draws.
 *
 * THE COPY ADDRESS BUTTON IS NOT BUILT, and this is the one thing on the
 * screen the design draws and this does not. Copying to the clipboard needs
 * `navigator.clipboard` and therefore a client component, and R-CON-01 and
 * §9.3 fix the count of those at nine — a tenth is not a thing a screen may
 * add for one button. What replaces it is `select-all` on the address: one
 * click selects the whole of it, which is the same two keystrokes without
 * the JavaScript, and it degrades to ordinary selectable text where
 * `user-select` is not honoured. Recorded for the designer rather than
 * papered over.
 *
 * THE TOOL LISTS ARE THE REAL ONES. The design draws four read tools and
 * three write tools with invented names — `search_entries`, `add_state`.
 * This list is the one a person reads before approving write access, so it
 * names every tool the scope grants and not a sample: eleven, ten and the one
 * that is in neither scope, from `src/lib/mcp/tools.ts`.
 * `docs/mcp-connector.md` §Tools and that file are the other two places the
 * set is written down; all three move together, and `TOOLS` in
 * `e2e/mcp-contract.spec.ts` is the line that says so.
 */
export default function ConnectPage() {
  const endpoint = `${site.url}/api/mcp/mcp`;

  return (
    <>
      <PageHead left="NN · Connect" right="Model Context Protocol · HTTP" />

      {/* `Main`, the screen WITH a breadcrumb: `p-[ 34px 60px 72px 60px ]`
          and `gap-[ 40px ]` at 1280, 22/16/48/16 and `gap-[ 28px ]` at 360. */}
      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-10 shell:px-15 shell:pt-8.5 shell:pb-18">
        {/* At 360 the design deletes the breadcrumb and puts the same words
            in the hero as a chip. Both are in the DOM and one is always
            `display:none`, so neither is announced twice. */}
        <Breadcrumb
          className="hidden shell:block"
          items={[{ label: 'Connect' }, { label: 'For agents' }]}
        />

        <PageHero
          kicker="Section VII · Connect"
          kickerForm="mark"
          title="Connect an agent"
          /* 860px — `access-1280.html`, `data-pencil-name="Lede"`. Without
             it the lede runs the full 1160px column and wraps to two lines
             where the design wraps to three. */
          ledeClassName="shell:max-w-215"
          lede="Noble Notations answers the Model Context Protocol. Give an agent the address below and it can read every recipe, every revision, every tag and every run in the catalogue. Reading is open to anyone. Writing asks you to sign in first, and even then it can only add."
        />

        {/* The endpoint band. `f-desk`, no rule, no radius: 20/22 of padding
            at 1280 and 14 all round at 360, where it becomes a column. */}
        <div className="flex w-full shrink-0 flex-col items-start gap-2 bg-desk p-3.5 shell:flex-row shell:items-center shell:justify-between shell:gap-6 shell:px-5.5 shell:py-5">
          <div className="flex w-full min-w-0 flex-col items-start gap-2 shell:w-auto">
            <span className="text-09 leading-normal font-mono tracking-label uppercase text-accent">
              Endpoint
            </span>
            {/* `break-all` rather than a scroller: the address is longer than
                a 360 screen and R-STA-09 says the page body must not scroll
                sideways. `select-all` is the copy affordance — see the note
                above. */}
            <code className="w-full text-16 leading-130 font-mono break-all text-ink select-all shell:text-19 shell:leading-normal">
              {endpoint}
            </code>
          </div>
          <span className="text-09 leading-normal font-mono tracking-label uppercase text-ink-3 shell:shrink-0">
            Transport HTTP · no key to read
          </span>
        </div>

        <Section
          ordinal="I"
          title="Three steps"
          meta="Five minutes · nothing to install"
          narrowMeta="Five minutes"
          bodyClassName="gap-4 shell:gap-1"
        >
          <Step
            number="1"
            kind="Step one"
            title="Add the address to your agent"
          >
            In the agent&rsquo;s configuration add a server whose transport is
            HTTP and whose address is the one above. Nothing else is required
            and no key is issued: the whole catalogue is readable by anyone who
            asks for it. In claude.ai that is Settings, then Connectors, then
            Add custom connector; Claude registers itself with RFC 7591 dynamic
            client registration.
          </Step>
          <Step
            number="2"
            kind="Step two"
            title="Sign in, but only if it will write"
          >
            The first call that adds anything sends you to this site to sign in
            as the administrator, and then to a consent screen that names
            exactly what is being granted. Reading never asks. If you only want
            the agent to read the catalogue you can skip this step entirely.
          </Step>
          <Step number="3" kind="Step three" title="Ask it for something">
            &ldquo;Add tonight&rsquo;s batch to Baumy Biltong as a new revision,
            and say why it changed.&rdquo; The agent reads the current revision
            first, writes a new one after, and the revision you had before is
            still there when it is finished.
          </Step>
        </Section>

        <Section
          ordinal="II"
          title="What an agent may read"
          meta={`${numberWord(READ_TOOLS.length)} tools · no sign in`}
          narrowMeta="No sign in"
        >
          <ToolList tools={READ_TOOLS} prefix="R" scope="Read" />
        </Section>

        <Section
          ordinal="III"
          title="What an agent may add"
          meta={`${numberWord(WRITE_TOOLS.length)} tools · sign in first`}
          narrowMeta="Sign in first"
        >
          <ToolList tools={WRITE_TOOLS} prefix="W" scope="Adds" />
        </Section>

        <Section
          ordinal="IV"
          title="What an agent may report"
          meta={`${numberWord(REPORT_TOOLS.length)} tool · both scopes`}
          narrowMeta="Both scopes"
        >
          <ToolList tools={REPORT_TOOLS} prefix="X" scope="Reports" />
        </Section>

        <Warning title="The report goes to GitHub, and it is public">
          <code className="[font-size:inherit] font-mono">report_issue</code> is
          the one tool whose effect lands outside this system. It opens an issue
          on this project&rsquo;s public GitHub repository, so a fault an agent
          hits reaches a person instead of ending with the conversation. It is
          in <strong>both</strong> scopes: a read-only connector can file one,
          because a read-only agent is exactly the one that meets a read
          tool&rsquo;s bug. The repository is fixed in the code and no argument
          names it. The tool removes values that match a known credential
          pattern, tells the agent how many it removed, and refuses to file more
          than ten open reports at a time. It is not registered at all unless{' '}
          <code className="[font-size:inherit] font-mono">
            GITHUB_ISSUE_TOKEN
          </code>{' '}
          is set.
        </Warning>

        {/*
         * The claim used to read "Nothing is ever deleted or edited in
         * place". That is the rule for the thing it matters for and it was
         * never true of the whole connector: `upsert_ingredient` and
         * `upsert_category` have always written over a stored label, and
         * `describe_mechanism` fills a field on a stored note, and
         * `reattach_note` moves a note to another record. The scoped
         * form is the one `src/lib/queries/write.ts` states at the top of the
         * file, and it is the sentence that is actually load-bearing — a
         * reader approving write access needs to know what CAN change, not a
         * promise that is wider than the code.
         */}
        <Warning title="The write path only ever adds">
          There is no tool here that edits a recipe and none that deletes.{' '}
          <code className="[font-size:inherit] font-mono">revise_recipe</code>{' '}
          writes a new revision and leaves every earlier one exactly where it
          was, so a revision that has been recorded can never be removed — not
          by an agent, not by the administrator, not by mistake. Four things can
          change. An ingredient and a tag can be improved in place, because they
          describe a name and not a version. A stored science note can be given
          the conditions it was written without; that can be done once, and
          after it the tool refuses. And a note can be moved to another record —
          the text of the note does not change, and the store keeps each record
          it was on before. The answer to a wrong value is a note of kind{' '}
          <code className="[font-size:inherit] font-mono">correction</code>.
          Every tool call is written to an audit log.
        </Warning>

        {/*
         * D-14. A person approving write access is handing a model the copy
         * of this site, and the reader at the other end is a cook holding a
         * phone. The rule an agent is given is stated here so that the
         * person can see what was asked for, and hold the result to it.
         */}
        <Warning title="An agent is asked to write in plain English">
          Every recipe here is written in ASD Simplified Technical English:
          short sentences, one idea in each, active voice, and the same word for
          the same thing. A step reads as one instruction —{' '}
          <em>Cut the beef into strips of 10 mm</em> — and every amount, time
          and temperature carries a number and a unit. The connector states this
          rule in its instructions, in{' '}
          <code className="[font-size:inherit] font-mono">get_started</code> and
          on every tool that stores text a reader sees. It is not enforced by
          the schema, because no schema can tell good prose from bad.
        </Warning>
      </div>
    </>
  );
}

/* ── The tools ─────────────────────────────────────────────────────────── */

type Tool = { name: string; text: string };

/**
 * The eleven tools the read scope grants, in the order `registerTools`
 * declares them (`src/lib/mcp/tools.ts`).
 */
const READ_TOOLS: Tool[] = [
  {
    name: 'get_started',
    text: 'The full guide to how this repository works. An agent reads this one first.',
  },
  {
    name: 'search_recipes',
    text: 'Free text, categories, and ingredients that must be in or out — the same six fields the search page has.',
  },
  {
    name: 'get_recipe',
    text: 'One recipe with its current revision, or any earlier revision asked for by number.',
  },
  {
    name: 'list_categories',
    text: 'Every cuisine, course, technique and kind held, with the number of recipes carrying each.',
  },
  {
    name: 'list_ingredients',
    text: 'The canonical ingredient list, with aliases and the recipes that use each one.',
  },
  {
    name: 'get_ingredient',
    text: 'One ingredient: its aliases, its density, its substitutes and the notes on it.',
  },
  {
    name: 'list_experiments',
    text: 'Every recorded run, whether or not it names a recipe.',
  },
  {
    name: 'get_experiment',
    text: 'One run: the date, the weights, what it cost and what happened.',
  },
  {
    name: 'search_notes',
    text: 'Every note, wherever it hangs: on a recipe, an ingredient or a run. Searchable by text and by kind.',
  },
  {
    name: 'build_shopping_list',
    text: 'The consolidated list for any set of recipes, combined by aisle and by unit.',
  },
  {
    name: 'get_repository_stats',
    text: 'How much is held: recipes, revisions, ingredients, tags and runs.',
  },
];

/** The ten the write scope grants. Approving it grants all of them. */
const WRITE_TOOLS: Tool[] = [
  { name: 'create_recipe', text: 'A genuinely new dish. Search first.' },
  {
    name: 'revise_recipe',
    text: 'The usual case: append a revision with the reason it was made. The recipe keeps its name.',
  },
  {
    name: 'backfill_revision',
    text: 'A version found later that existed before everything stored. It never moves the current revision.',
  },
  {
    name: 'add_note',
    text: 'An observation, a correction, research with sources, a substitution or a warning.',
  },
  {
    name: 'add_mass_flow',
    text: 'What a batch weighed at each stage, for a stored version that has no figure yet.',
  },
  {
    name: 'describe_mechanism',
    text: 'The conditions a stored science note holds under. Once only.',
  },
  {
    name: 'reattach_note',
    text: 'Moves a note to another record. The note itself does not change, and the store keeps where it was.',
  },
  {
    name: 'upsert_ingredient',
    text: 'An ingredient’s categories, aliases, densities and substitutes.',
  },
  {
    name: 'upsert_category',
    text: 'A tag’s label, its explanation and its parent.',
  },
  {
    name: 'log_experiment',
    text: 'A batch that was actually cooked, with its measurements.',
  },
];

/**
 * The twenty-second tool, and the only one in neither scope.
 *
 * It is listed on its own because neither of the two lists above is true of
 * it: it needs no scope, and its effect lands outside this system. Reading
 * it as a write tool would be wrong in the direction that matters — a person
 * who declines write access would think this one was declined with it.
 */
const REPORT_TOOLS: Tool[] = [
  {
    name: 'report_issue',
    text: 'A fault in this connector, filed as an issue on the public GitHub repository of this project.',
  },
];

/**
 * The tool table. `access-1280.html:495` draws it as the ruled four-column
 * row `/ingredients` uses — a reference, a name, a description and a
 * right-aligned scope — and `m360-access-science.html:359` folds it into
 * F/Mechanism's geometry: the code in the gutter and the other three
 * stacked beside it.
 *
 * It is a `<ul>` and not `F/Table row`. Three of the four cells carry a
 * different type from that component's — the name is 13px mono where the
 * ingredient name is 14px Geist, the description is Geist where the alias is
 * serif italic, the scope is a 9px tracked label where the count is 12px
 * mono — so reusing it would mean three new props on a shared component for
 * one screen. A list is also the truer shape: this is ten or eleven things of
 * one kind, not a record with four fields, and a screen reader announces the
 * count.
 *
 * `shell:contents` on the column is what lets one DOM draw both: at 360 the
 * three cells are a flex column beside the code, and at 1280 the wrapper
 * stops generating a box and they become cells of the row.
 */
function ToolList({
  tools,
  prefix,
  scope,
}: {
  tools: Tool[];
  prefix: string;
  scope: string;
}) {
  return (
    <ul className="m-0 flex w-full list-none flex-col gap-4 p-0 shell:gap-0">
      {tools.map((tool, index) => (
        <li
          key={tool.name}
          className={cn(
            'flex w-full flex-row items-start gap-3',
            'shell:items-center shell:gap-5 shell:py-2.75',
            /* The quiet row rule, `f-hair-2`, and only at 1280: at 360 the
               design separates the rows with 16px of air and no rule. One
               four-value declaration and an explicit style, the form the
               export draws — see the long note in `f/table-row.tsx`. */
            'shell:[border-style:solid] shell:[border-width:0px_0px_1px_0px] shell:border-b-hair-2',
          )}
        >
          <span className="w-6.5 shrink-0 text-10 leading-170 font-mono tracking-micro tabular-nums text-accent shell:w-8.5 shell:tracking-flat shell:text-ink-3">
            {prefix}
            {index + 1}
          </span>{' '}
          <div className="flex min-w-0 flex-1 basis-0 flex-col items-start gap-2 shell:contents">
            <span className="w-full text-14 leading-150 font-mono text-ink shell:w-65 shell:shrink-0 shell:text-13 shell:leading-normal">
              {tool.name}
            </span>{' '}
            <span className="w-full text-14 leading-170 font-sans text-ink-2 shell:flex-1 shell:leading-normal">
              {tool.text}
            </span>{' '}
            <span className="w-full text-09 leading-normal font-mono tracking-label uppercase text-ink-3 shell:w-15 shell:shrink-0 shell:text-right">
              {scope}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── The page's own two shapes ─────────────────────────────────────────── */

/**
 * One numbered step. `access-1280.html:335` is F/Footnote exactly — a 26px
 * gutter, a 16px gap, a `KIND · Title` head and a 14/24 body — with the
 * marker in the accent rather than in `f-ink`. The colour rides on the node
 * passed as the marker, so F/Footnote is not restyled for this screen.
 *
 * `py-0 shell:py-2.5` undoes the component's own vertical padding at 360,
 * where the design gives the steps 16px of container gap and no padding at
 * all.
 */
function Step({
  number,
  kind,
  title,
  children,
}: {
  number: string;
  kind: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Footnote
      className="py-0 shell:py-2.5"
      marker={<span className="text-accent">{number}</span>}
      kind={kind}
      title={title}
    >
      {children}
    </Footnote>
  );
}

/**
 * A numbered section. `F/Section head` is the fold — rule 2 of the 360 fold,
 * where the roman ordinal and the 26px serif title become one 9px accent
 * mono label — and it draws both widths from ONE heading, so nothing is in
 * the accessibility tree twice.
 *
 * The meta is the one string that shortens: the design writes
 * `FOUR TOOLS · NO SIGN IN` at 1280 and `NO SIGN IN` at 360, where the label
 * beside it is already 22 characters in a 328px row. Two spans, one always
 * `display:none` — the construct `page-head.tsx` uses for its two wordings.
 */
function Section({
  ordinal,
  title,
  meta,
  narrowMeta,
  bodyClassName,
  children,
}: {
  ordinal: string;
  title: string;
  meta: string;
  narrowMeta: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex w-full shrink-0 flex-col items-start gap-section-360 shell:gap-2">
      <SectionHead
        ordinal={ordinal}
        title={title}
        meta={
          <>
            <span className="shell:hidden">{narrowMeta}</span>
            <span className="hidden shell:inline">{meta}</span>
          </>
        }
      />
      <div
        className={cn(
          'flex w-full flex-col items-start gap-4',
          bodyClassName ?? 'shell:gap-0',
        )}
      >
        {children}
      </div>
    </section>
  );
}
