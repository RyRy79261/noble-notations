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
