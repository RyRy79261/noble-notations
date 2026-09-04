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

      <section>
        <h2>What it can do</h2>
        <h3>Reading</h3>
        <ul>
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
            <code>get_repository_stats</code>
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
            <code>add_note</code> — observations, research with sources,
            substitutions, warnings
          </li>
          <li>
            <code>upsert_ingredient</code> — categories, aliases, densities,
            substitutes
          </li>
          <li>
            <code>log_experiment</code> — a batch that was actually cooked, with
            measurements
          </li>
        </ul>
      </section>

      <section>
        <h2>Safety</h2>
        <p>
          Read and write are separate scopes and the consent screen says which
          is being granted. Nothing is ever deleted or edited in place: a
          revision is appended and the pointer moves, so every earlier version
          stays readable at its own URL. Every tool call is written to an audit
          log.
        </p>
      </section>
    </div>
  );
}
