import { test, expect } from '@playwright/test';

/**
 * What an agent finds when it arrives without a connector.
 *
 * The MCP tests cover the connected path. This covers the other one: a
 * crawler or a fetching agent that only speaks HTTP. It has to be able to
 * discover what is here (llms.txt, the sitemap), be allowed to read it
 * (robots.txt), and get the recipe itself rather than the page around it
 * (the Markdown twin).
 */

test('robots.txt allows agent crawlers and points at the sitemap', async ({
  request,
}) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  const body = await response.text();

  expect(body).toContain('User-Agent: ClaudeBot');
  expect(body).toContain('User-Agent: GPTBot');
  expect(body).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);

  // The Markdown twins must stay fetchable — they are the point.
  expect(body).not.toContain('Disallow: /recipes/*.md');
});

test('llms.txt lists the recipes and the connector', async ({ request }) => {
  const response = await request.get('/llms.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');

  const body = await response.text();
  expect(body).toContain('# Noble Notations');
  // A recipe from the seed archive, linked at its Markdown address.
  expect(body).toMatch(/\/recipes\/baumy-biltong\.md\)/);
  expect(body).toContain('/api/mcp/mcp');
  expect(body).toContain('get_started');
});

test('a recipe URL with .md returns the recipe as Markdown', async ({
  request,
}) => {
  const response = await request.get('/recipes/baumy-biltong.md');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/markdown');
  // Says which page it mirrors, so indexing it twice is not a risk.
  expect(response.headers()['link']).toContain('rel="canonical"');

  const body = await response.text();
  expect(body).toContain('# Baumy Biltong');
  expect(body).toContain('## Ingredients');
  expect(body).toContain('## Method');
  // The word the vocabulary dropped must not come back through the export.
  expect(body).not.toContain('## Classification');
  // Front matter names the revision, so a reader knows what it is holding.
  expect(body).toMatch(/^---\n[\s\S]*revision: \d+/);
});

test('the .md suffix and the /md path are the same document', async ({
  request,
}) => {
  const [suffix, path] = await Promise.all([
    request.get('/recipes/demi-glace.md'),
    request.get('/recipes/demi-glace/md'),
  ]);
  expect(suffix.status()).toBe(200);
  expect(path.status()).toBe(200);
  expect(await suffix.text()).toBe(await path.text());
});

test('an unknown recipe .md is a 404, not a rewrite loop', async ({
  request,
}) => {
  const response = await request.get('/recipes/not-a-real-recipe.md');
  expect(response.status()).toBe(404);
});

test('the recipe page still renders through the proxy matcher', async ({
  page,
}) => {
  // The matcher now covers /recipes/:slug. Anything without the suffix has
  // to pass through untouched — a rewrite here would break every recipe.
  const response = await page.goto('/recipes/baumy-biltong');
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('the recipe page advertises its Markdown twin', async ({ page }) => {
  await page.goto('/recipes/baumy-biltong');
  const href = await page
    .locator('link[rel="alternate"][type="text/markdown"]')
    .getAttribute('href');
  expect(href).toContain('/recipes/baumy-biltong.md');
});
