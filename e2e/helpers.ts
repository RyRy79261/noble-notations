import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Talk to the MCP endpoint the way a real client does.
 *
 * The interactive half of OAuth (sign in, read the consent screen, click
 * Approve) needs a human and a Neon Auth session, so `global-setup` mints
 * bearer tokens up front via `pnpm mcp:token` and drops them here.
 * Everything downstream of that is the real thing: real Streamable HTTP,
 * real session negotiation, real tool registry, real scope checks.
 *
 * Tokens arrive through a file rather than the environment because
 * Playwright workers are separate processes, and a token minted in
 * global-setup would otherwise have to rely on env inheritance holding.
 */
export interface McpClient {
  call<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T>;
  listTools(): Promise<string[]>;
  raw(body: unknown): Promise<Response>;
}

interface JsonRpcResponse {
  result?: {
    content?: { type: string; text: string }[];
    isError?: boolean;
    tools?: { name: string }[];
  };
  error?: { code: number; message: string };
}

export const TOKEN_FILE = path.join(
  process.cwd(),
  'e2e',
  '.results',
  'tokens.json',
);

export interface E2ETokens {
  readWrite: string;
  readOnly: string;
}

export function tokens(): E2ETokens {
  return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as E2ETokens;
}

/**
 * Streamable HTTP replies with SSE framing. Pull the one JSON-RPC payload
 * out of it rather than pulling in a full MCP client for two assertions.
 */
function parseBody(text: string): JsonRpcResponse {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as JsonRpcResponse;
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('data:')) {
      return JSON.parse(line.slice(5).trim()) as JsonRpcResponse;
    }
  }
  throw new Error(`Unparseable MCP response: ${text.slice(0, 400)}`);
}

export function mcpClient(baseURL: string, token: string): McpClient {
  const endpoint = `${baseURL}/api/mcp/mcp`;
  let sessionId: string | null = null;
  let nextId = 1;

  async function post(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    return fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  async function ensureSession(): Promise<void> {
    if (sessionId) return;
    const res = await post({
      jsonrpc: '2.0',
      id: nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'noble-notations-e2e', version: '0' },
      },
    });
    if (!res.ok) {
      throw new Error(`initialize failed: ${res.status} ${await res.text()}`);
    }
    sessionId = res.headers.get('mcp-session-id');
    await res.text();
  }

  return {
    async raw(body) {
      await ensureSession();
      return post(body);
    },

    async listTools() {
      await ensureSession();
      const res = await post({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/list',
        params: {},
      });
      const parsed = parseBody(await res.text());
      return (parsed.result?.tools ?? []).map((t) => t.name);
    },

    async call<T>(tool: string, args: Record<string, unknown>) {
      await ensureSession();
      const res = await post({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: { name: tool, arguments: args },
      });
      const parsed = parseBody(await res.text());
      if (parsed.error) {
        throw new Error(`${tool} failed: ${parsed.error.message}`);
      }
      const text = parsed.result?.content?.[0]?.text ?? '';
      if (parsed.result?.isError) {
        throw new Error(`${tool} returned an error: ${text}`);
      }
      return JSON.parse(text) as T;
    },
  };
}
