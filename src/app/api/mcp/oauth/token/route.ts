/**
 * POST /api/mcp/oauth/token — RFC 6749 token endpoint.
 *
 * Grants: authorization_code (PKCE required) and refresh_token.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  consumeAuthCode,
  issueAccessToken,
  refreshAccessToken,
  verifyClientCredentials,
} from '@/lib/mcp/oauth';
import { corsPreflight, withCors } from '@/lib/mcp/cors';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

const codeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  redirect_uri: z.url(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  code_verifier: z.string().min(43).max(128),
});

const refreshGrantSchema = z.object({
  grant_type: z.literal('refresh_token'),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * RFC 6749 §5.1: token responses must not be cached. Applied to every
 * response, success and error alike, so no intermediary can replay a token.
 */
function applyNoStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

function err(error: string, description?: string, status = 400) {
  return withCors(
    applyNoStore(
      NextResponse.json(
        { error, ...(description ? { error_description: description } : {}) },
        { status },
      ),
    ),
  );
}

/**
 * Read a form-encoded or JSON body into flat string params.
 *
 * Wrapped in try/catch because an empty body sent with an
 * `application/json` content-type throws in `JSON.parse` — a real thing
 * clients do, and a 500 there looks like a server fault rather than a bad
 * request.
 */
async function readBody(
  request: NextRequest,
): Promise<Record<string, string> | { __error: string }> {
  const contentType = request.headers.get('content-type') ?? '';
  try {
    const out: Record<string, string> = {};
    if (contentType.includes('application/json')) {
      const text = await request.text();
      if (!text.trim()) return out;
      const json: unknown = JSON.parse(text);
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        for (const [k, v] of Object.entries(json)) {
          if (typeof v === 'string') out[k] = v;
        }
      }
      return out;
    }
    for (const [k, v] of (await request.formData()).entries()) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch (parseError) {
    return {
      __error:
        parseError instanceof Error
          ? parseError.message
          : 'could not parse body',
    };
  }
}

function readBasicAuth(
  request: NextRequest,
): { clientId: string; clientSecret: string } | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const parsedBody = await readBody(request);
  if ('__error' in parsedBody) {
    return err('invalid_request', parsedBody.__error);
  }
  const body = parsedBody;

  const basic = readBasicAuth(request);
  if (basic) {
    body.client_id ??= basic.clientId;
    body.client_secret ??= basic.clientSecret;
  }

  if (body.grant_type === 'authorization_code') {
    const parsed = codeGrantSchema.safeParse(body);
    if (!parsed.success) {
      return err('invalid_request', z.prettifyError(parsed.error));
    }

    const credentials = await verifyClientCredentials(
      parsed.data.client_id,
      parsed.data.client_secret,
    );
    if (!credentials.valid) {
      return err('invalid_client', 'client authentication failed', 401);
    }

    const consumed = await consumeAuthCode({
      code: parsed.data.code,
      clientId: parsed.data.client_id,
      redirectUri: parsed.data.redirect_uri,
      codeVerifier: parsed.data.code_verifier,
    });
    if (!consumed.ok) return err('invalid_grant', consumed.reason);

    const tokens = await issueAccessToken({
      clientId: parsed.data.client_id,
      userId: consumed.userId,
      scope: consumed.scope,
    });

    return withCors(
      applyNoStore(
        NextResponse.json({
          access_token: tokens.accessToken,
          token_type: 'Bearer',
          expires_in: tokens.accessExpiresIn,
          refresh_token: tokens.refreshToken,
          scope: consumed.scope,
        }),
      ),
    );
  }

  if (body.grant_type === 'refresh_token') {
    const parsed = refreshGrantSchema.safeParse(body);
    if (!parsed.success) {
      return err('invalid_request', z.prettifyError(parsed.error));
    }

    const credentials = await verifyClientCredentials(
      parsed.data.client_id,
      parsed.data.client_secret,
    );
    if (!credentials.valid) {
      return err('invalid_client', 'client authentication failed', 401);
    }

    const refreshed = await refreshAccessToken(
      parsed.data.refresh_token,
      parsed.data.client_id,
    );
    if (!refreshed.ok) return err('invalid_grant', refreshed.reason);

    return withCors(
      applyNoStore(
        NextResponse.json({
          access_token: refreshed.tokens.accessToken,
          token_type: 'Bearer',
          expires_in: refreshed.tokens.accessExpiresIn,
          refresh_token: refreshed.tokens.refreshToken,
          scope: refreshed.scope,
        }),
      ),
    );
  }

  return err(
    'unsupported_grant_type',
    `grant_type='${String(body.grant_type)}' not supported`,
  );
}
