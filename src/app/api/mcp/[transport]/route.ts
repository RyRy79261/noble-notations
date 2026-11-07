/**
 * The MCP endpoint — Streamable HTTP transport.
 *
 * Served at `/api/mcp/mcp`. The doubled "mcp" is correct and not a typo:
 * this file is `api/mcp/[transport]/route.ts` and the segment is "mcp".
 * That full URL is what goes into claude.ai's custom-connector dialog.
 * mcp-handler 2 does not read the path, so `isMcpPath` below is what keeps
 * every other segment a 404, as it was under 1.x.
 *
 * Auth is a bearer token minted by the OAuth flow in ../oauth/. On failure
 * `withMcpAuth` returns 401 with a `WWW-Authenticate: Bearer
 * resource_metadata="…"` header, which is how a client discovers where to
 * authorise.
 */
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { NextResponse } from 'next/server';
import { lookupAccessToken } from '@/lib/mcp/oauth';
import { registerTools } from '@/lib/mcp/tools';
import { registerResources } from '@/lib/mcp/resources';
import { serverInstructions } from '@/lib/mcp/guide';
import { withCors } from '@/lib/mcp/cors';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const baseHandler = createMcpHandler(
  (server) => {
    registerTools(server);
    // The readable documents. `resources/list` advertises them and
    // `resources/read` serves them; a client offers them as something to
    // load rather than as an action to take. See `src/lib/mcp/resources.ts`.
    registerResources(server);
  },
  {
    serverInfo: { name: 'noble-notations', version: '1.0.0' },
    // Surfaced by clients that read `instructions`, so the revision rule
    // lands before the first tool call rather than after the first mistake.
    // The full guide is behind `get_started`; this is the short version.
    //
    // The paragraph about `report_issue` is in this text only where that
    // tool is registered, so the instructions cannot advertise a tool that
    // `tools/list` does not carry. This object is built when the module
    // loads rather than per request, which is enough: the environment of a
    // running instance does not change under it, and a change to
    // `GITHUB_ISSUE_TOKEN` redeploys.
    instructions: serverInstructions(),
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
    // Carried through to every tool handler via `ctx.http.authInfo.extra`.
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

/** Only `/api/mcp/mcp` is the endpoint. */
function isMcpPath(request: Request): boolean {
  return new URL(request.url).pathname.replace(/\/$/, '') === '/api/mcp/mcp';
}

const notFound = () => withCors(new NextResponse(null, { status: 404 }));

async function handle(request: Request) {
  if (!isMcpPath(request)) return notFound();
  const res = await authedHandler(request);
  // claude.ai calls this from another origin, so the CORS headers have to be
  // layered on after mcp-handler has produced its response.
  return withCors(
    new NextResponse(res.body, { status: res.status, headers: res.headers }),
  );
}

/**
 * A POST carries one tool call, and its answer is read to the end before
 * this handler returns.
 *
 * mcp-handler answers with a stream and runs the tool while that stream is
 * read, which is after a plain `handle` has returned. Next.js applies the
 * cache expiry a write asks for (`withTransaction` → `revalidateTag`) when
 * the handler returns, so an expiry that came later was dropped, and the
 * site went on showing the page from before the write. Reading the body
 * here keeps the tool inside the handler. A POST answer is one JSON-RPC
 * message, so nothing is lost by holding it. GET never streams: see
 * `handleGet`.
 */
async function handlePost(request: Request) {
  if (!isMcpPath(request)) return notFound();
  const res = await authedHandler(request);
  const body = res.body ? await res.arrayBuffer() : null;
  return withCors(
    new NextResponse(body, { status: res.status, headers: res.headers }),
  );
}

/**
 * GET is refused at once, never held open as a stream.
 *
 * In Streamable HTTP a GET opens a standalone server-to-client SSE stream
 * for notifications the server sends unprompted. This server sends none:
 * every answer rides on the POST that asked for it. mcp-handler 1.x
 * answered GET with 405 itself; 2.x hands it to the SDK, which opens the
 * stream and leaves it open. A connected client then held a function idle
 * until `maxDuration` cut it off, reconnected, and did it again, every
 * minute, for as long as the connector was loaded anywhere. Fluid compute
 * bills that idle time, and each reconnect looked the bearer token up in
 * Neon. Across this app and intake-tracker it exhausted the Hobby plan's
 * monthly allowance in a week, and the deployment was paused (Nov 2026).
 *
 * The spec makes 405 the answer for a server that offers no GET stream,
 * and clients carry on with POST alone. No auth check first: there is
 * nothing here to protect, and a 401 would invite the client to authorise
 * and try again.
 */
function handleGet(request: Request) {
  if (!isMcpPath(request)) return notFound();
  return withCors(
    new NextResponse(null, {
      status: 405,
      headers: { Allow: 'POST, DELETE, OPTIONS' },
    }),
  );
}

export const GET = handleGet;
export const POST = handlePost;
export const DELETE = handle;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
