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

/**
 * The same answer from the bare headers an MCP tool handler is given. A tool
 * has no `Request`, only `extra.requestInfo.headers`, and the upload link
 * `request_image_upload` returns has to name the host the connector reached
 * — a preview deployment's link must open the preview.
 */
export function getPublicOriginFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string {
  const get = (name: string): string | undefined => {
    const value = headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const override = process.env.MCP_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/$/, '');
  const fwdHost = get('x-forwarded-host');
  const fwdProto = get('x-forwarded-proto');
  // No request URL to read a scheme from, so a bare host is taken as http:
  // that is the local server. Vercel always sets x-forwarded-proto.
  if (fwdHost) return `${fwdProto ?? 'https'}://${fwdHost}`;
  const host = get('host');
  if (host) return `${fwdProto ?? 'http'}://${host}`;
  return getPublicOrigin();
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
