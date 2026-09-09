import type { Metadata } from 'next';
import { site } from '@/lib/site';

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

export default function ConnectPage() {
  const endpoint = `${site.url}/api/mcp/mcp`;

  return (
    <div className="prose-page">
      <header className="hero">
        <h1>MCP connector</h1>
        <p className="lede">
          This repository speaks the Model Context Protocol. Connect it to a
          Claude project and a conversation can search what is already here and
          append revisions to it, instead of re-deriving the same recipe every
          time.
        </p>
      </header>

      <section>
        <h2>Endpoint</h2>
        <pre>
          <code>{endpoint}</code>
        </pre>
        <p className="faint">
          The doubled <code>mcp</code> is correct — it is the base path plus the
          transport segment.
        </p>
      </section>

      <section>
        <h2>Adding it to claude.ai</h2>
        <ol>
          <li>Settings → Connectors → Add custom connector.</li>
          <li>
            Paste the endpoint above and connect. Claude registers itself
            automatically (RFC 7591 dynamic client registration).
          </li>
          <li>
            You are sent to this site to sign in as the administrator, then
            shown a consent screen naming exactly what is being granted.
          </li>
          <li>Approve, and the tools appear in your project.</li>
        </ol>
        <p>
          Claude Code and Claude Desktop can use the same endpoint. A Claude
          Free account cannot add custom connectors.
        </p>
      </section>

      {/* THIS LIST IS THE ONE A PERSON READS BEFORE APPROVING WRITE ACCESS,
          so it names every tool the scope grants and not a sample of them.
          There is one write scope: approving it grants all of these, and a
          list that is short by four reads as a smaller grant than it is.
          `docs/mcp-connector.md` §Tools and `src/lib/mcp/tools.ts` are the
          other two places the set is written down; all three move together.

          M6 rebuilds this screen. The names are data, not layout, so they
          are corrected here rather than waiting for it. */}
      <section>
        <h2>What it can do</h2>
        <h3>Reading</h3>
        <ul>
          <li>
            <code>get_started</code> — the full guide to how this repository
            works
          </li>
          <li>
            <code>search_recipes</code> — text, categories, must-include and
            must-exclude ingredients
          </li>
          <li>
            <code>get_recipe</code> — the full structured recipe including every
            revision and its rationale
          </li>
          <li>
            <code>list_categories</code>, <code>list_ingredients</code>,{' '}
            <code>get_ingredient</code>
          </li>
          <li>
            <code>list_experiments</code>, <code>get_experiment</code>,{' '}
            <code>build_shopping_list</code>, <code>get_repository_stats</code>
          </li>
        </ul>
        <h3>Writing</h3>
        <ul>
          <li>
            <code>create_recipe</code> — a genuinely new dish
          </li>
          <li>
            <code>revise_recipe</code> — the usual case: append a revision with
            a rationale
          </li>
          <li>
            <code>backfill_revision</code> — a version found later that existed
            before everything stored
          </li>
          <li>
            <code>add_note</code> — observations, research with sources,
            substitutions, warnings
          </li>
          <li>
            <code>add_mass_flow</code> — what a batch weighed at each stage, for
            a stored version that has no figure yet
          </li>
          <li>
            <code>describe_mechanism</code> — the conditions a stored science
            note holds under
          </li>
          <li>
            <code>upsert_ingredient</code> — categories, aliases, densities,
            substitutes
          </li>
          <li>
            <code>upsert_category</code> — a tag&rsquo;s label, explanation and
            parent
          </li>
          <li>
            <code>log_experiment</code> — a batch that was actually cooked, with
            measurements
          </li>
        </ul>
      </section>

      {/* The claim used to read "Nothing is ever deleted or edited in place".
          That is the rule for the thing it matters for and it was never true
          of the whole connector: `upsert_ingredient` and `upsert_category`
          have always written over a stored label, and `describe_mechanism`
          fills a field on a stored note. The scoped form is the one
          `src/lib/queries/write.ts` states at the top of the file, and it is
          the sentence that is actually load-bearing — a reader approving
          write access needs to know what CAN change, not a promise that is
          wider than the code. */}
      <section>
        <h2>Safety</h2>
        <p>
          Read and write are separate scopes. The consent screen says which one
          is being granted. Nothing is ever deleted. A recipe&rsquo;s
          ingredients and steps are never edited in place: a revision is
          appended and the pointer moves, so every earlier version stays
          readable at its own URL.
        </p>
        <p>
          Three things can change. An ingredient and a tag can be improved in
          place, because they describe a name and not a version. A stored
          science note can be given the conditions it was written without. That
          last one can be done once. After that the tool refuses, and the answer
          to a wrong value is a note of kind <code>correction</code>. Every tool
          call is written to an audit log.
        </p>
      </section>
    </div>
  );
}
