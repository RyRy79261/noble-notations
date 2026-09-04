/**
 * Drive every page at several widths and report what is measurably wrong.
 *
 *   pnpm audit:ui                     # against http://127.0.0.1:3000
 *   pnpm audit:ui http://host:3210    # against a running build
 *   pnpm audit:ui --json out.json     # machine-readable, for a review pass
 *
 * This exists because the end-to-end suite could not see the class of bug
 * that kept shipping. Playwright's `toBeVisible()` is true of an element
 * parked 400px off the side of a phone screen, and no assertion anybody
 * writes by hand covers "every nav link on every page at every width".
 * These are geometric facts, checked by measurement, on every route.
 *
 * The check that matters most is UNREACHABLE. A flex row with
 * `justify-content: flex-end` and `overflow-x: auto` puts its overflow off
 * the *start* edge, where no scroll can reach it: `scrollWidth` equals
 * `clientWidth`, so the browser reports nothing to scroll, and the first
 * items are simply gone. That shipped, and it took four nav links with it.
 *
 * Every finding is a measurement with numbers attached. Nothing here is a
 * matter of taste — taste is reviewed by looking at the screenshots.
 */
import { chromium, type Page, type Browser } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE =
  process.argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:3000';
const JSON_OUT = (() => {
  const i = process.argv.indexOf('--json');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const SHOT_DIR = (() => {
  const i = process.argv.indexOf('--shots');
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Widths worth checking: a small phone, a large phone, a tablet, a desktop. */
const VIEWPORTS = [
  { name: 'phone-360', width: 360, height: 780, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'desktop-1280', width: 1280, height: 900, touch: false },
];

const ROUTES = [
  '/',
  '/recipes',
  '/recipes/baumy-biltong',
  '/recipes/baumy-biltong/revisions/1',
  '/cuisines',
  '/cuisines/south-african',
  '/categories',
  '/categories/technique/air-drying',
  '/ingredients',
  '/ingredients/salt',
  '/experiments',
  '/experiments/biltong-batch-3',
  '/shopping-list',
  '/search?q=biltong',
  '/archive',
  '/connect',
  '/auth',
  '/this-page-does-not-exist',
];

/**
 * States a page can be in that change its layout.
 *
 * The basket one is not hypothetical: adding a recipe is what made the
 * header wrap differently, and that is what hid half the navigation.
 */
const STATES = [
  { name: 'clean', setup: null as null | ((page: Page) => Promise<void>) },
  {
    name: 'basket-full',
    setup: async (page: Page) => {
      await page.evaluate(() => {
        window.localStorage.setItem(
          'nn:basket',
          JSON.stringify([
            { slug: 'baumy-biltong', title: 'Baumy Biltong' },
            { slug: 'berlin-crayfish-boil', title: 'Berlin Boil' },
            { slug: 'pickled-jalapenos', title: 'Pickled Jalapeños' },
          ]),
        );
      });
    },
  },
];

interface Finding {
  route: string;
  viewport: string;
  state: string;
  check: string;
  severity: 'blocker' | 'major' | 'minor';
  detail: string;
}

/** Runs inside the page. Returns raw measurements, no judgement. */
function collect() {
  const vw = window.innerWidth;
  const out: {
    check: string;
    severity: 'blocker' | 'major' | 'minor';
    detail: string;
  }[] = [];

  /**
   * Is this element actually painted for a sighted user?
   *
   * Three things are deliberately invisible and must not be reported:
   * a skip link parked at -9999px, a tooltip held at `visibility: hidden`
   * until hover, and anything under an `opacity: 0` ancestor. Counting
   * those buried the real findings under 200 false ones on the first run.
   */
  const isPainted = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') {
        return false;
      }
      if (Number(style.opacity) === 0) return false;
      // The visually-hidden idiom: absolutely positioned far off-canvas.
      if (style.position === 'absolute' || style.position === 'fixed') {
        if (parseFloat(style.left) <= -1000) return false;
      }
      if (style.clipPath === 'inset(50%)') return false;
    }
    return true;
  };

  /** Is this element inside something that scrolls sideways? */
  const inHorizontalScroller = (el: Element): boolean => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const cls =
      el.className && typeof el.className === 'string'
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    const text = (el.textContent ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    return `${tag}${cls}${text ? ` "${text}"` : ''}`;
  };

  // ── Content that cannot be scrolled to ─────────────────────────────────
  // A scroll container whose children start at a negative offset has put
  // them past the start edge. `scrollWidth === clientWidth` means the
  // browser sees nothing to scroll, so they are gone for good.
  for (const el of document.querySelectorAll<HTMLElement>('*')) {
    const style = getComputedStyle(el);
    const scrolls = /auto|scroll/.test(style.overflowX);
    if (!scrolls) continue;
    const box = el.getBoundingClientRect();
    const stranded = [...el.children]
      .map((child) => ({ child, rect: child.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right <= box.left + 1);
    if (stranded.length === 0) continue;
    const canScrollBack = el.scrollLeft > 0;
    if (canScrollBack) continue;
    out.push({
      check: 'unreachable',
      severity: 'blocker',
      detail:
        `${describe(el)} has ${stranded.length} child element(s) past its start edge ` +
        `with no way to scroll back (scrollLeft=${el.scrollLeft}, ` +
        `scrollWidth=${el.scrollWidth}, clientWidth=${el.clientWidth}): ` +
        stranded.map(({ child }) => describe(child)).join(' | '),
    });
  }

  // ── The page itself scrolling sideways ─────────────────────────────────
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    const culprits = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > doc.clientWidth + 1;
      })
      // A child of a sideways scroller is supposed to stick out — that is
      // what the scroller is for. Blaming those hid the real culprit
      // behind a list of nav links on the first run.
      .filter((el) => !inHorizontalScroller(el))
      .filter((el) => isPainted(el))
      .filter((el) => {
        // Only blame the outermost offender, not every descendant of it.
        const parent = el.parentElement;
        if (!parent) return true;
        return parent.getBoundingClientRect().right <= doc.clientWidth + 1;
      })
      .slice(0, 5);
    out.push({
      check: 'page-overflow',
      severity: 'major',
      detail:
        `document scrolls sideways (${doc.scrollWidth}px of content in ${doc.clientWidth}px). ` +
        `Widest offenders: ${culprits.map(describe).join(' | ') || 'unknown'}`,
    });
  }

  // ── Interactive things off the side of the screen ──────────────────────
  for (const el of document.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [role="button"], [role="tab"]',
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (!isPainted(el)) continue;
    // Inside a scroll container it is reachable by scrolling; that case is
    // covered by the unreachable check above.
    if (inHorizontalScroller(el)) continue;
    if (r.right > vw + 1 || r.left < -1) {
      out.push({
        check: 'offscreen-control',
        severity: 'major',
        detail: `${describe(el)} sits at x ${Math.round(r.left)}–${Math.round(r.right)} in a ${vw}px viewport`,
      });
    }
  }

  // ── Tap targets too small to hit ───────────────────────────────────────
  if (vw <= 500) {
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      'a[href], button, input[type="checkbox"], [role="button"]',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!isPainted(el)) continue;
      // A link sitting inside a sentence is exempt. WCAG carves this out
      // for good reason: you cannot give a word in a paragraph a 44px box
      // without wrecking the paragraph. Only standalone controls count.
      const parent = el.parentElement;
      const inSentence =
        parent !== null &&
        /^(p|li|td|span|div)$/.test(parent.tagName.toLowerCase()) &&
        (parent.textContent ?? '').trim().length >
          (el.textContent ?? '').trim().length + 12;
      if (inSentence) continue;
      // A checkbox's real target is its wrapping label, if it has one.
      const target = el.closest('label') ?? el;
      const t = target.getBoundingClientRect();
      if (t.height < 24 || t.width < 24) {
        small.push(
          `${describe(el)} ${Math.round(t.width)}×${Math.round(t.height)}`,
        );
      }
    }
    if (small.length > 0) {
      out.push({
        check: 'small-tap-target',
        severity: 'minor',
        detail: `${small.length} control(s) under 24×24: ${small.slice(0, 6).join(' | ')}`,
      });
    }
  }

  // ── Text sitting on top of other text ──────────────────────────────────
  const textEls = [
    ...document.querySelectorAll<HTMLElement>(
      'p, li, h1, h2, h3, h4, span, a, td',
    ),
  ]
    .filter((el) => {
      const t = (el.textContent ?? '').trim();
      if (!t) return false;
      // Leaf text only, so a container is not compared against its child.
      return ![...el.children].some((c) => (c.textContent ?? '').trim());
    })
    .filter((el) => isPainted(el))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0);

  const overlaps: string[] = [];
  for (let i = 0; i < textEls.length; i += 1) {
    for (let j = i + 1; j < textEls.length; j += 1) {
      const a = textEls[i]!;
      const b = textEls[j]!;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // Cheap union-box test first, to skip pairs that cannot touch.
      if (
        Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) <= 4 ||
        Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) <= 4
      ) {
        continue;
      }
      // Then compare LINE boxes, not union boxes. An inline span wrapping
      // over four lines has a union box enclosing the whole paragraph, so
      // it "overlaps" every sibling sharing its first line without a pixel
      // of text touching. That difference was 72 reported collisions
      // against a true count of zero.
      let collides = false;
      for (const ra of a.el.getClientRects()) {
        for (const rb of b.el.getClientRects()) {
          const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (x > 4 && y > 4) collides = true;
        }
      }
      if (collides) {
        overlaps.push(`${describe(a.el)} over ${describe(b.el)}`);
      }
    }
  }
  if (overlaps.length > 0) {
    out.push({
      check: 'text-overlap',
      severity: 'major',
      detail: `${overlaps.length} overlapping text pair(s): ${overlaps.slice(0, 4).join(' | ')}`,
    });
  }

  // ── Controls a screen reader cannot name ───────────────────────────────
  const unnamed = [...document.querySelectorAll<HTMLElement>('a[href], button')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      if (!isPainted(el)) return false;
      const name =
        (el.getAttribute('aria-label') ?? '') +
        (el.getAttribute('title') ?? '') +
        (el.textContent ?? '');
      return name.trim() === '';
    })
    .map(describe);
  if (unnamed.length > 0) {
    out.push({
      check: 'unnamed-control',
      severity: 'minor',
      detail: `${unnamed.length} control(s) with no accessible name: ${unnamed.slice(0, 4).join(' | ')}`,
    });
  }

  // ── Images with no alternative text ────────────────────────────────────
  const noAlt = [...document.querySelectorAll('img')].filter(
    (img) => img.getAttribute('alt') === null,
  );
  if (noAlt.length > 0) {
    out.push({
      check: 'img-no-alt',
      severity: 'minor',
      detail: `${noAlt.length} <img> without an alt attribute`,
    });
  }

  // ── Duplicate ids ──────────────────────────────────────────────────────
  const ids = new Map<string, number>();
  for (const el of document.querySelectorAll('[id]')) {
    const id = el.id;
    ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const dupes = [...ids.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    out.push({
      check: 'duplicate-id',
      severity: 'minor',
      detail: dupes.map(([id, n]) => `#${id} ×${n}`).join(', '),
    });
  }

  return out;
}

async function auditPage(
  browser: Browser,
  route: string,
  viewport: (typeof VIEWPORTS)[number],
  state: (typeof STATES)[number],
): Promise<Finding[]> {
  // `hasTouch` is not cosmetic: it flips `@media (hover: none)`, and rules
  // hidden behind that query are the difference between what a phone shows
  // and what a desktop browser shrunk to 390px shows. Auditing a narrow
  // desktop and calling it a phone reports bugs a phone never has, and
  // misses the ones it does.
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.touch,
    isMobile: viewport.touch,
  });
  const page = await context.newPage();

  // esbuild (via tsx) rewrites every function to call a `__name` helper for
  // stack-trace names. That helper lives in the Node module scope, not in
  // the page, so a serialised collector throws "__name is not defined" the
  // moment it lands in the browser. Supplying an identity stand-in is the
  // whole fix and costs nothing.
  await page.addInitScript(() => {
    (globalThis as unknown as { __name: unknown }).__name = (fn: unknown) => fn;
  });

  const findings: Finding[] = [];
  const add = (
    check: string,
    severity: Finding['severity'],
    detail: string,
  ) => {
    findings.push({
      route,
      viewport: viewport.name,
      state: state.name,
      check,
      severity,
      detail,
    });
  };

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) =>
    consoleErrors.push(`uncaught: ${error.message}`),
  );

  try {
    if (state.setup) {
      // localStorage needs an origin, so land somewhere first.
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await state.setup(page);
    }
    const response = await page.goto(`${BASE}${route}`, {
      waitUntil: 'networkidle',
    });
    const status = response?.status() ?? 0;
    const expected404 = route === '/this-page-does-not-exist';
    if (expected404 ? status !== 404 : status >= 400) {
      add('http-status', 'blocker', `HTTP ${status}`);
    }

    // Let hydration settle: several controls only exist after it.
    await page.waitForTimeout(400);

    for (const item of await page.evaluate(collect)) {
      add(item.check, item.severity, item.detail);
    }

    // The deliberately-missing route logs its own 404 response. That is the
    // check passing, not a defect, so it must not be reported as one.
    const noise = expected404
      ? consoleErrors.filter((line) => !/status of 404/.test(line))
      : consoleErrors;
    if (noise.length > 0) {
      add(
        'console-error',
        'major',
        `${noise.length}: ${[...new Set(noise)].slice(0, 3).join(' | ')}`,
      );
    }

    if (SHOT_DIR) {
      const slug =
        route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(
          SHOT_DIR,
          `${slug}__${viewport.name}__${state.name}.png`,
        ),
        fullPage: true,
      });
    }
  } catch (error) {
    add(
      'crashed',
      'blocker',
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await context.close();
  }

  return findings;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });

  const findings: Finding[] = [];
  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      for (const state of STATES) {
        findings.push(...(await auditPage(browser, route, viewport, state)));
      }
    }
  }
  await browser.close();

  const order = { blocker: 0, major: 1, minor: 2 };
  findings.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      a.check.localeCompare(b.check) ||
      a.route.localeCompare(b.route),
  );

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `\n${ROUTES.length} routes × ${VIEWPORTS.length} widths × ${STATES.length} states ` +
      `= ${ROUTES.length * VIEWPORTS.length * STATES.length} page loads\n`,
  );
  for (const severity of ['blocker', 'major', 'minor'] as const) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    console.log(`\n${severity.toUpperCase()} (${group.length})`);
    for (const f of group) {
      console.log(`  [${f.check}] ${f.route} @ ${f.viewport} (${f.state})`);
      console.log(`      ${f.detail}`);
    }
  }
  console.log(
    `\nTotals: ${counts.blocker ?? 0} blocker, ${counts.major ?? 0} major, ${counts.minor ?? 0} minor.`,
  );

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify(findings, null, 2));
    console.log(`Wrote ${findings.length} findings to ${JSON_OUT}`);
  }

  // Blockers fail the run so this can gate a build if it ever needs to.
  process.exit((counts.blocker ?? 0) > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
