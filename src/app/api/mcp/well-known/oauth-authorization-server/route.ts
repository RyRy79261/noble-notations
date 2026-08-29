/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 * Reached through the rewrite from /.well-known/oauth-authorization-server.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildOAuthUrls, getPublicOrigin } from '@/lib/mcp/origin';
import { SUPPORTED_SCOPES } from '@/lib/mcp/scopes';
import { corsPreflight, withCors } from '@/lib/mcp/cors';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

export function GET(req: NextRequest) {
  const urls = buildOAuthUrls(getPublicOrigin(req));

  return withCors(
    NextResponse.json({
      issuer: urls.issuer,
      authorization_endpoint: urls.authorizationEndpoint,
      token_endpoint: urls.tokenEndpoint,
      registration_endpoint: urls.registrationEndpoint,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: [
        'none',
        'client_secret_basic',
        'client_secret_post',
      ],
      code_challenge_methods_supported: ['S256'],
      service_documentation:
        'https://github.com/RyRy79261/noble-notations/blob/main/docs/mcp-connector.md',
    }),
  );
}
