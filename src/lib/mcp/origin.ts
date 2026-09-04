/**
 * Resolve the public origin of this app for OAuth metadata and redirects.
 *
 * Priority — request headers deliberately beat VERCEL_URL:
 *   1. MCP_PUBLIC_URL          explicit override
 *   2. x-forwarded-host/proto  the host the user actually hit
 *   3. host header
 *   4. VERCEL_URL              no-request contexts only
 *   5. localhost
 *
 * VERCEL_URL is the deployment-hash domain, which on a production deployment
 * is behind Vercel SSO. Advertising it as the OAuth issuer makes claude.ai
 * follow a URL that answers 403, and the connector fails with no useful
 * error. The custom domain is what belongs in every OAuth document.
 */
import type { NextRequest } from 'next/server';

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function getPublicOrigin(req?: NextRequest | Request): string {
  const override = process.env.MCP_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/$/, '');

  if (req) {
    const headers = req.headers;
    const fwdHost = headers.get('x-forwarded-host');
    const fwdProto = headers.get('x-forwarded-proto');
    const requestProto = parseUrl(req.url)?.protocol.replace(/:$/, '');

    if (fwdHost) return `${fwdProto ?? requestProto ?? 'https'}://${fwdHost}`;
    const host = headers.get('host');
    if (host) return `${fwdProto ?? requestProto ?? 'http'}://${host}`;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;

  return 'http://localhost:3000';
}

export const MCP_BASE_PATH = '/api/mcp';

export function buildOAuthUrls(origin: string) {
  return {
    issuer: origin,
    authorizationEndpoint: `${origin}${MCP_BASE_PATH}/oauth/authorize`,
    tokenEndpoint: `${origin}${MCP_BASE_PATH}/oauth/token`,
    registrationEndpoint: `${origin}${MCP_BASE_PATH}/oauth/register`,
    resource: `${origin}${MCP_BASE_PATH}`,
    authServerMetadata: `${origin}/.well-known/oauth-authorization-server`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource`,
    // basePath + the [transport] segment value; the doubled "mcp" is correct.
    mcpEndpoint: `${origin}${MCP_BASE_PATH}/mcp`,
  };
}
