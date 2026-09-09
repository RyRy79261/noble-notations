import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

/**
 * The agent crawlers, named one by one.
 *
 * `User-agent: *` already allows them, so these rules add no permission
 * that was missing. They are here as a statement of intent: this is a
 * repository meant to be read by machines, and a named allow is the only
 * thing a crawler operator can point at when the default later turns into
 * a default-deny. Each gets the same rules as everyone else.
 */
const AGENT_CRAWLERS = [
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'cohere-ai',
  'DuckAssistBot',
  'MistralAI-User',
];

/**
 * Paths no crawler should spend a request on.
 *
 * The OAuth endpoints and the admin gate are not content, and superseded
 * revisions are near-duplicates of the live recipe.
 *
 * The Markdown twins at `/recipes/<slug>.md` are deliberately *not* listed.
 * They are the same recipe as the page, but blocking them would block the
 * one address an agent most wants, to solve a duplicate-content problem
 * the response already solves: it carries a canonical link back to the
 * page it mirrors.
 */
const DISALLOW = [
  '/api/',
  '/sign-in',
  '/connect/done',
  // The addresses those two were renamed from. Both still answer with a
  // 308 — R-NAV-07 keeps them alive — so a crawler that already knows them
  // would otherwise spend a request on every pass to be sent somewhere it
  // is not allowed to go. They come out when the redirects do.
  '/auth',
  '/oauth-return',
  '/recipes/*/revisions/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      ...AGENT_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
