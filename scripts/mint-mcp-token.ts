/**
 * Mint an MCP access token without going through the consent screen.
 *
 *   pnpm mcp:token                                  # read + write
 *   pnpm mcp:token --scope noble-notations:read     # read only
 *   pnpm mcp:token --name "curl debugging"
 *
 * The interactive half of OAuth needs a browser, a Neon Auth session and a
 * human clicking Approve. That is the right gate for a real connector and
 * the wrong one for a test run or a five-second curl check, so this
 * registers a client and issues a token directly against the same functions
 * the token endpoint uses. Everything downstream — transport, tool
 * registry, scope enforcement — is unchanged.
 *
 * Prints JSON on stdout so it can be piped into `jq`.
 */
import { loadEnv } from './env';

loadEnv();

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const { registerClient, issueAccessToken } = await import('@/lib/mcp/oauth');
  const { READ_SCOPE, WRITE_SCOPE } = await import('@/lib/mcp/scopes');

  const scope = flag('scope') ?? `${READ_SCOPE} ${WRITE_SCOPE}`;
  const clientName = flag('name') ?? 'local token';

  const client = await registerClient({
    clientName,
    redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    tokenEndpointAuthMethod: 'none',
  });

  const tokens = await issueAccessToken({
    clientId: client.clientId,
    userId: flag('user') ?? 'local',
    scope,
  });

  console.log(
    JSON.stringify(
      {
        clientId: client.clientId,
        scope,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.accessExpiresIn,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
