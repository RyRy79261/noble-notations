/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 * Tells an MCP client which authorization server guards this resource.
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
      resource: urls.resource,
      authorization_servers: [urls.issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: [...SUPPORTED_SCOPES],
      resource_documentation:
        'https://github.com/RyRy79261/noble-notations/blob/main/docs/mcp-connector.md',
    }),
  );
}
