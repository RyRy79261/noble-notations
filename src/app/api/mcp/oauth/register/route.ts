/**
 * POST /api/mcp/oauth/register — RFC 7591 Dynamic Client Registration.
 *
 * Unauthenticated by design. Hardened by allow-listing redirect URIs to
 * claude.ai / anthropic.com / loopback, capping the client name, and
 * restricting the auth method — see isAllowedRedirectUri.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAllowedRedirectUri, registerClient } from '@/lib/mcp/oauth';
import { corsPreflight, withCors } from '@/lib/mcp/cors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  client_name: z.string().min(1).max(200).default('claude.ai'),
  redirect_uris: z.array(z.url()).min(1).max(10),
  token_endpoint_auth_method: z
    .enum(['none', 'client_secret_basic', 'client_secret_post'])
    .default('none'),
  scope: z.string().max(500).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return withCors(
      NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'Body must be JSON',
        },
        { status: 400 },
      ),
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: z.prettifyError(parsed.error),
        },
        { status: 400 },
      ),
    );
  }

  for (const uri of parsed.data.redirect_uris) {
    if (!isAllowedRedirectUri(uri)) {
      return withCors(
        NextResponse.json(
          {
            error: 'invalid_redirect_uri',
            error_description: `redirect_uri not allowed: ${uri}`,
          },
          { status: 400 },
        ),
      );
    }
  }

  try {
    const client = await registerClient({
      clientName: parsed.data.client_name,
      redirectUris: parsed.data.redirect_uris,
      tokenEndpointAuthMethod: parsed.data.token_endpoint_auth_method,
      scope: parsed.data.scope,
    });

    return withCors(
      NextResponse.json(
        {
          client_id: client.clientId,
          ...(client.clientSecret
            ? { client_secret: client.clientSecret }
            : {}),
          client_name: client.clientName,
          redirect_uris: client.redirectUris,
          token_endpoint_auth_method: client.tokenEndpointAuthMethod,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          ...(client.scope ? { scope: client.scope } : {}),
          client_id_issued_at: Math.floor(client.createdAt / 1000),
        },
        { status: 201 },
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[mcp/register]', message);
    return withCors(
      NextResponse.json(
        { error: 'server_error', error_description: message },
        { status: 500 },
      ),
    );
  }
}
