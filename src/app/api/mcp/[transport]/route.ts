/**
 * The MCP endpoint — Streamable HTTP transport.
 *
 * Served at `/api/mcp/mcp`. The doubled "mcp" is correct and not a typo:
 * `basePath: '/api/mcp'` plus the `[transport]` segment resolving to "mcp".
 * That full URL is what goes into claude.ai's custom-connector dialog.
 *
 * Auth is a bearer token minted by the OAuth flow in ../oauth/. On failure
 * `withMcpAuth` returns 401 with a `WWW-Authenticate: Bearer
 * resource_metadata="…"` header, which is how a client discovers where to
 * authorise.
 */
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { NextResponse } from 'next/server';
import { lookupAccessToken } from '@/lib/mcp/oauth';
import { registerTools } from '@/lib/mcp/tools';
import { withCors } from '@/lib/mcp/cors';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const baseHandler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: 'noble-notations', version: '1.0.0' } },
  {
    basePath: '/api/mcp',
    disableSse: true,
    verboseLogs: process.env.NODE_ENV !== 'production',
  },
);

async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const lookup = await lookupAccessToken(bearerToken);
  if (!lookup) return undefined;

  return {
    token: bearerToken,
    clientId: lookup.clientId,
    scopes: lookup.scope.split(/\s+/).filter(Boolean),
    expiresAt: Math.floor(lookup.expiresAt / 1000),
    // Carried through to every tool handler via `extra.authInfo.extra`.
    extra: {
      userId: lookup.userId,
      clientId: lookup.clientId,
      scope: lookup.scope,
    },
  };
}

const authedHandler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

async function handle(request: Request) {
  const res = await authedHandler(request);
  // claude.ai calls this from another origin, so the CORS headers have to be
  // layered on after mcp-handler has produced its response.
  return withCors(
    new NextResponse(res.body, { status: res.status, headers: res.headers }),
  );
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
