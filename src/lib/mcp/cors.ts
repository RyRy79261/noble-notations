/**
 * CORS for the MCP endpoints — claude.ai calls all of them cross-origin.
 * Tokens travel in the Authorization header rather than cookies, so a
 * wildcard origin carries no ambient-authority risk here.
 */
import { NextResponse } from 'next/server';

export const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  // DELETE is MCP Streamable HTTP session termination. Omitting it from the
  // preflight allow-list makes browsers block the request before it lands.
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, mcp-protocol-version, mcp-session-id',
  // The 401's `WWW-Authenticate: Bearer resource_metadata="…"` hint is how a
  // browser-based client discovers where to authorise. Unexposed, it cannot
  // be read across origins and the connector dead-ends.
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
  'Access-Control-Max-Age': '86400',
} as const;

export function withCors(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

export function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}
