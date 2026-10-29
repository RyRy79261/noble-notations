import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

/**
 * Agents that read for a person, named one by one.
 *
 * This site is for people who ask an agent about a recipe. An agent that
 * fetches a page because a person asked, or that indexes pages to answer a
 * person's search, is welcome. `User-agent: *` already allows these, so
 * the named rules add no permission. They are a statement of intent, and
 * the one thing an operator can point at if the default ever turns into a
 * default-deny. Each gets the same rules as everyone else.
 */
const PERSON_AGENTS = [
  // Fetch one page when a person asks.
  'Claude-User',
  'ChatGPT-User',
  'Perplexity-User',
  'MistralAI-User',
  // Index pages for AI search answers.
  'Claude-SearchBot',
  'OAI-SearchBot',
  'PerplexityBot',
  'DuckAssistBot',
];

/**
 * Crawlers that collect pages to train models. Not wanted: each is
 * refused the whole site.
 *
 * `Google-Extended` and `Applebot-Extended` are opt-out tokens, not
 * crawlers. Refusing them stops AI training use only; Googlebot and
 * Applebot still fetch for search under `User-agent: *`. `Amazonbot`
 * serves Alexa answers as well as training, and is refused for the
 * training. robots.txt is a request, not a wall — a crawler that ignores
 * it (Bytespider is reported to) needs a firewall rule instead.
 */
const TRAINING_CRAWLERS = [
  'ClaudeBot',
  'GPTBot',
  'CCBot',
  'Bytespider',
  'meta-externalagent',
  'cohere-ai',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
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
      ...PERSON_AGENTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW,
      })),
      ...TRAINING_CRAWLERS.map((userAgent) => ({
        userAgent,
        disallow: '/',
      })),
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
