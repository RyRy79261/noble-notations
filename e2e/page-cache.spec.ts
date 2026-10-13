import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

import { mcpClient, tokens, type McpClient } from './helpers';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE PAGE CACHE: a public page is rendered once, and a write expires it.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `src/lib/page-cache.ts` turns the cache on at BUILD time, and only where
 * the read cache is on — on Vercel. The suite's own server is built with it
 * off, because other specs write to the database directly and start a
 * second server with no database on the same build. So this file makes a
 * build of its own, with `NOBLE_READ_CACHE=on`, into `.next/page-cache`,
 * and starts it beside the suite's server on the same database.
 *
 * What is asserted is what the cache must never break:
 *
 * - **The build says so.** Each public read page is ○ or ● in the build
 *   output, and each page that reads the request is still ƒ.
 * - **A page is kept.** The second load is a cache HIT.
 * - **A write shows on the next load.** Through the connector, on this
 *   server: a new recipe, a corrected title, the sitemap, `/llms.txt`, and
 *   an address that said "not found" before the recipe existed.
 * - **The connector does not read the cache.** An agent reads back what it
 *   wrote, so `src/lib/mcp/tools.ts` imports `read.ts`, never `cached.ts`.
 */

const DIST_DIR = path.join('.next', 'page-cache');

/** Read pages a crawler reaches. Each must be ○ (static) or ● (SSG). */
const CACHED_ROUTES = [
  '/',
  '/recipes/[slug]',
  '/recipes/[slug]/revisions/[number]',
  '/recipes/[slug]/batch-logs',
  '/recipes/[slug]/batch-logs/[log]',
  '/ingredients',
  '/ingredients/[slug]',
  '/cuisines',
  '/cuisines/[slug]',
  '/classes',
  '/classes/[type]/[slug]',
  '/science',
  '/science/[slug]',
  '/archive/[...slug]',
  '/batch-logs',
  '/batch-logs/[log]',
  '/sitemap.xml',
  '/llms.txt',
];

/** Pages that read the request or serve one person. Each must stay ƒ. */
const DYNAMIC_ROUTES = [
  '/search',
  '/recipes',
  '/list',
  '/sign-in',
  '/connect/done',
  '/upload/[token]',
  '/api/mcp/[transport]',
];

let server: ChildProcess | undefined;
let origin = '';
let buildOutput = '';

/** A port nothing holds right now, chosen by the kernel. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (typeof address === 'string' || address === null) {
        probe.close();
        reject(new Error('no port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

const env = {
  ...process.env,
  NOBLE_READ_CACHE: 'on',
  NOBLE_DIST_DIR: DIST_DIR,
};
const next = path.join(process.cwd(), 'node_modules', '.bin', 'next');

test.beforeAll(async () => {
  // A whole production build, then a server start.
  test.setTimeout(420_000);

  buildOutput = await new Promise<string>((resolve, reject) => {
    const build = spawn(next, ['build'], { env, stdio: 'pipe' });
    let out = '';
    build.stdout?.on('data', (chunk) => (out += String(chunk)));
    build.stderr?.on('data', (chunk) => (out += String(chunk)));
    build.on('error', reject);
    build.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`next build exited ${code}:\n${out}`)),
    );
  });

  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn(next, ['start', '-p', String(port)], {
    env,
    stdio: 'pipe',
    detached: true,
  });
  // Drained rather than ignored: an unread pipe fills and stops the child.
  server.stdout?.resume();
  server.stderr?.resume();

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`no server on ${origin}`);
    try {
      const response = await fetch(`${origin}/connect`);
      if (response.ok) break;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

test.afterAll(async () => {
  // By process group: `next start` holds the port in a child of its own.
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
});

function rw(): McpClient {
  return mcpClient(origin, tokens().readWrite);
}

let counter = 0;
function stamp(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

/** The symbol the build prints before a route: ○, ● or ƒ. */
function symbolFor(route: string): string | undefined {
  for (const line of buildOutput.split('\n')) {
    const match = /^[┌├└]\s+(\S)\s+(\S+)/.exec(line);
    if (match && match[2] === route) return match[1];
  }
  return undefined;
}

async function load(address: string) {
  const response = await fetch(`${origin}${address}`, { redirect: 'manual' });
  return {
    status: response.status,
    cache: response.headers.get('x-nextjs-cache'),
    control: response.headers.get('cache-control') ?? '',
    body: await response.text(),
  };
}

test('the build serves the public read pages from the cache, and only those', () => {
  for (const route of CACHED_ROUTES) {
    expect(['○', '●'], `${route} in the build output`).toContain(
      symbolFor(route),
    );
  }
  for (const route of DYNAMIC_ROUTES) {
    expect(symbolFor(route), `${route} in the build output`).toBe('ƒ');
  }
});

test('a public page is rendered once and then served from the cache', async () => {
  const mcp = rw();
  const slug = `cache-${stamp()}`;
  await mcp.call('create_recipe', {
    title: `CACHE ${slug}`,
    slug,
    rationale: 'Written by e2e/page-cache.spec.ts.',
    ingredients: [{ name: `CACHE salt ${slug}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt the meat.' }],
  });

  const first = await load(`/recipes/${slug}`);
  expect(first.status).toBe(200);
  expect(first.control).toContain('s-maxage=86400');

  const second = await load(`/recipes/${slug}`);
  expect(second.status).toBe(200);
  expect(second.cache).toBe('HIT');
});

test('a write through the connector shows on the next load of every page it changes', async () => {
  const mcp = rw();
  const slug = `cache-${stamp()}`;
  const cuisine = `Cache cuisine ${slug}`;

  // Asked for before it exists: a "not found" that is kept, too.
  expect((await load(`/recipes/${slug}`)).status).toBe(404);
  expect((await load(`/recipes/${slug}`)).status).toBe(404);
  // Warm the pages the new recipe will appear on.
  for (const address of ['/sitemap.xml', '/llms.txt', '/cuisines']) {
    const warm = await load(address);
    expect(warm.body).not.toContain(slug);
  }

  await mcp.call('create_recipe', {
    title: `CACHE ${slug}`,
    slug,
    rationale: 'Written by e2e/page-cache.spec.ts.',
    categories: { cuisine: [cuisine] },
    ingredients: [{ name: `CACHE salt ${slug}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt the meat.' }],
  });

  const made = await load(`/recipes/${slug}`);
  expect(made.status).toBe(200);
  expect(made.body).toContain(`CACHE ${slug}`);
  expect((await load('/sitemap.xml')).body).toContain(`/recipes/${slug}`);
  expect((await load('/llms.txt')).body).toContain(`/recipes/${slug}`);
  expect((await load('/cuisines')).body).toContain(cuisine);

  // Kept again, then a correction expires it.
  expect((await load(`/recipes/${slug}`)).cache).toBe('HIT');
  await mcp.call('update_recipe', { slug, title: `CACHE ${slug} corrected` });
  const corrected = await load(`/recipes/${slug}`);
  expect(corrected.body).toContain(`CACHE ${slug} corrected`);
});

test('the connector reads the database, not the cache', () => {
  // An agent writes and then reads back what it wrote. A cached read would
  // hand it the record from before its own write.
  const tools = readFileSync('src/lib/mcp/tools.ts', 'utf8');
  expect(tools).toMatch(/from '@\/lib\/queries\/read'/);
  expect(tools).not.toMatch(/queries\/cached/);
});
