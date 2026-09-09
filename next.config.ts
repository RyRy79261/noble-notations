import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * `form-action 'self'` is deliberate and interacts with the MCP consent
 * screen: CSP3 §6.1.18 applies form-action to *redirects* that follow a form
 * POST, not just the initial submission. A 302 from the consent POST to
 * claude.ai would therefore be dropped silently by the browser. The authorize
 * route returns an HTML document-level redirect instead — see
 * `htmlRedirect()` in src/app/api/mcp/oauth/authorize/route.ts.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.neon.tech",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `next dev` otherwise appends a generated block to AGENTS.md on every
  // run. That file is hand-written and is this repository's source of
  // truth, so the advice it wanted to add lives there in our own words
  // instead.
  agentRules: false,

  // The archive is read off disk at request time. Vercel traces only the
  // modules a function imports, so the Markdown itself has to be named
  // explicitly or /archive renders empty in production.
  outputFileTracingIncludes: {
    '/archive': ['./content/**/*.md'],
    '/archive/[...slug]': ['./content/**/*.md'],
    '/sitemap.xml': ['./content/**/*.md'],
  },

  async redirects() {
    // The design renamed seven public addresses. This site is indexed and
    // its URLs are pasted into agent transcripts, so none of them may
    // simply stop answering — R-NAV-07 and K-02. Each rule is permanent
    // (308) so a crawler moves the ranking across instead of keeping two
    // addresses alive, and Next.js carries the query string over, which is
    // what lets the auth return trip below keep its verifier.
    return [
      // /taxonomy became /categories, and /categories has now become
      // /classes. The old rule is repointed at the final address rather
      // than left to chain: a link written two names ago should still
      // cost one hop, not two.
      { source: '/taxonomy', destination: '/classes', permanent: true },
      {
        source: '/taxonomy/:type/:slug',
        destination: '/classes/:type/:slug',
        permanent: true,
      },

      // "Category" is the database's word. A reader is shown a class, and
      // the design names the route after what the reader sees.
      { source: '/categories', destination: '/classes', permanent: true },
      {
        source: '/categories/:type/:slug',
        destination: '/classes/:type/:slug',
        permanent: true,
      },

      // The interface has always called this the list; only the URL still
      // said "shopping list".
      { source: '/shopping-list', destination: '/list', permanent: true },

      // A recorded run is a batch log to a reader and an experiment to the
      // database. The URL now follows the reader.
      { source: '/experiments', destination: '/batch-logs', permanent: true },
      // This one lands on the top level detail page even when the run has
      // a recipe, because only a database read can tell. That page makes
      // the second hop to the nested address itself — see D-01.
      {
        source: '/experiments/:slug',
        destination: '/batch-logs/:slug',
        permanent: true,
      },

      // /auth said what the code does. /sign-in says what the visitor does.
      { source: '/auth', destination: '/sign-in', permanent: true },
      // The hosted sign-in return trip. An old redirect_uri still in
      // flight arrives here with ?neon_auth_session_verifier= attached,
      // and the query string survives the redirect, so the exchange in
      // src/proxy.ts still runs on the new path.
      {
        source: '/oauth-return',
        destination: '/connect/done',
        permanent: true,
      },
    ];
  },

  async rewrites() {
    // RFC 8414 and RFC 9728 require these documents to live under
    // /.well-known/. The App Router will not route a dot-prefixed folder, so
    // the canonical paths are rewritten onto ordinary route segments.
    return [
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/mcp/well-known/oauth-authorization-server',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/mcp/well-known/oauth-protected-resource',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
