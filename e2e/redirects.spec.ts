import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The design renamed seven public addresses. This site is indexed and its
 * URLs are pasted into agent transcripts, so none of them may simply stop
 * answering — R-NAV-07 and K-02.
 *
 * A rename with no test is a rename that breaks silently: every old link
 * still "works" the day it is written, and the day the rule is dropped from
 * `next.config.ts` nothing fails except somebody's bookmark. So these
 * assertions are on the wire, not on the rendered page. Following the
 * redirect and checking the heading would pass just as well against a
 * temporary redirect, against a chain three hops long, or against a rule
 * that dropped the query string on the way — and each of those is a
 * different defect.
 *
 * Three things are checked for each rule:
 *
 *   1. the status is 308, not 301, 302 or 307. A crawler moves the ranking
 *      across on a permanent redirect and keeps both addresses alive on a
 *      temporary one;
 *   2. the `Location` is the address the design named;
 *   3. that address answers directly, so no reader pays for two hops.
 */

interface Hop {
  status: number;
  to: string;
}

/**
 * One request, no following. `maxRedirects: 0` hands back the 3xx itself.
 *
 * Next writes a relative `Location` for a relative destination, but a proxy
 * in front of the app may rewrite it to an absolute URL, so compare paths
 * rather than whole strings.
 */
async function hop(request: APIRequestContext, from: string): Promise<Hop> {
  const response = await request.get(from, { maxRedirects: 0 });
  const location = response.headers()['location'] ?? '';
  if (!location.startsWith('http')) {
    return { status: response.status(), to: location };
  }
  const url = new URL(location);
  return { status: response.status(), to: `${url.pathname}${url.search}` };
}

/** The seven renames in §8.1, in the order `next.config.ts` declares them. */
const RENAMES = [
  { from: '/shopping-list', to: '/list' },
  { from: '/categories', to: '/classes' },
  {
    from: '/categories/technique/air-drying',
    to: '/classes/technique/air-drying',
  },
  { from: '/experiments', to: '/batch-logs' },
  { from: '/experiments/biltong-batch-3', to: '/batch-logs/biltong-batch-3' },
  { from: '/auth', to: '/sign-in' },
  { from: '/oauth-return', to: '/connect/done' },
];

for (const rename of RENAMES) {
  test(`${rename.from} is permanently at ${rename.to}`, async ({ request }) => {
    const { status, to } = await hop(request, rename.from);

    expect(status).toBe(308);
    expect(to).toBe(rename.to);
  });
}

/**
 * `/taxonomy` was renamed to `/categories` before the design renamed
 * `/categories` to `/classes`. Both rules point at the final address. A
 * link written two names ago should still cost one hop, not two — a chain
 * loses a little ranking at each step and doubles the latency of a cold
 * request for no gain.
 */
const OLDER = [
  { from: '/taxonomy', to: '/classes' },
  {
    from: '/taxonomy/technique/air-drying',
    to: '/classes/technique/air-drying',
  },
];

for (const older of OLDER) {
  test(`${older.from} goes straight to ${older.to}, not through /categories`, async ({
    request,
  }) => {
    const { status, to } = await hop(request, older.from);

    expect(status).toBe(308);
    expect(to).toBe(older.to);
  });
}

test('no rename lands on another redirect', async ({ request }) => {
  // The third check, made once over every destination that is an ordinary
  // page. Two exclusions, both deliberate:
  //
  //   /connect/done answers 307 to /sign-in for a visitor with no session.
  //     That is the auth proxy protecting the route, not a rename chaining,
  //     and it is what the page is for.
  //   /batch-logs/biltong-batch-3 makes D-01's second hop, which the next
  //     test covers on its own terms.
  const destinations = [
    '/list',
    '/classes',
    '/classes/technique/air-drying',
    '/batch-logs',
    '/sign-in',
  ];

  for (const destination of destinations) {
    const { status } = await hop(request, destination);
    expect(status, `${destination} should answer, not redirect`).toBe(200);
  }
});

test('a run with a recipe hops on to its nested address, temporarily', async ({
  request,
}) => {
  // D-01. Which address a run lives at depends on whether it names a
  // recipe, and only a database read can tell, so `next.config.ts` sends
  // /experiments/<slug> to the top level and the page makes the second hop.
  //
  // 307, not 308, and the distinction is the decision: the top level
  // address stays a stable thing to link to — a run is often logged before
  // its recipe exists — and the recipe it points at can change. A permanent
  // redirect would tell a crawler to forget the entry address.
  const { status, to } = await hop(request, '/batch-logs/biltong-batch-3');

  expect(status).toBe(307);
  expect(to).toBe('/recipes/baumy-biltong/batch-logs/biltong-batch-3');
});

test('the query string survives the rename', async ({ request }) => {
  // The list keeps its selection in the URL, so a shared link is the list.
  // A redirect that dropped `?r=` would land the reader on an empty page
  // and look like the list was lost rather than like the link was broken.
  const list = await hop(
    request,
    '/shopping-list?r=baumy-biltong&r=pickled-jalapenos',
  );

  expect(list.status).toBe(308);
  expect(list.to).toBe('/list?r=baumy-biltong&r=pickled-jalapenos');
});

test('the sign-in return trip keeps its verifier', async ({ request }) => {
  // This one is load-bearing rather than tidy. A hosted sign-in that was
  // already in flight when the rename shipped comes back to the old
  // redirect_uri with `?neon_auth_session_verifier=` attached, and
  // `src/proxy.ts` exchanges that for a session on the new path. Lose the
  // query here and the exchange has nothing to exchange.
  const { status, to } = await hop(
    request,
    '/oauth-return?neon_auth_session_verifier=test-verifier&next=%2Frecipes',
  );

  expect(status).toBe(308);
  expect(to).toContain('/connect/done');
  expect(to).toContain('neon_auth_session_verifier=test-verifier');
  expect(to).toContain('next=%2Frecipes');
});

test('the sitemap lists no address that redirects', async ({ request }) => {
  // A sitemap full of redirects is a crawl error, and it is the easiest way
  // for a rename to be half-done: the rule is added, the sitemap is not.
  const body = await (await request.get('/sitemap.xml')).text();

  for (const old of [
    '/categories',
    '/experiments',
    '/shopping-list',
    '/taxonomy',
    '/auth',
    '/oauth-return',
  ]) {
    expect(
      body,
      `${old} is a redirect and must not be in the sitemap`,
    ).not.toContain(old);
  }

  // And the new names are there, so this cannot pass by listing nothing.
  expect(body).toContain('/classes');
  expect(body).toContain('/batch-logs');
});
