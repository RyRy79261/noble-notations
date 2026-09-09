'use client';

/*
 * The primary navigation, at both widths.
 *
 * WHY THIS IS A CLIENT COMPONENT — the ninth in `src/components/`, and a
 * deliberate deviation from R-CON-01 and §9.3, which name eight.
 *
 * Two things here need the address of the current page. The design marks
 * the active destination by filling the header item with `f-accent` and
 * flipping its label to `f-on-accent`, and it marks the current section in
 * the 360 drawer by turning the row title `f-accent`. A Server Component in
 * the root layout cannot read the pathname — Next gives a layout no access
 * to it — so `usePathname` is the only route to either mark. The drawer
 * additionally needs open state, a focus trap and an Escape handler, which
 * is `Sheet` (C-02 names it), and `Sheet` is a client component in turn.
 *
 * Both live in one file so the boundary is one file. Everything in it still
 * renders to HTML on the server, and only the accent mark and the drawer
 * need the browser.
 *
 * With JavaScript off the two widths differ. At 1080px and above the nine
 * links are in the served markup and every destination works. Below that
 * the row is `display: none` and the drawer cannot open, so no destination
 * is reachable from the header. R-NAV-03 mandates the drawer, so this is
 * the cost of the rule and not a fault. A reader can still reach every
 * screen from a link in the page body.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * R-ACC-05. `globals.css` carried a global `:focus-visible` rule that M3's
 * palette bridge pointed at `f-accent`. M7 deleted that file, and this
 * class is why the shell did not lose its focus ring with it. `--color-ring`
 * is `f-accent`: 8.06:1 on the light page, 6.92:1 on the dark one.
 */
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * A `<button>` arrives with the platform's own fill, border, padding and
 * font, and these four utilities take it back to the bare text run the
 * design draws. Tailwind's preflight was off until M7 and every one of them
 * was load-bearing then. Since M7 the preflight answers the fill, the
 * border and the padding on its own; `appearance-none` is still the only
 * writer, because the preflight sets `appearance: button` on a `<button>`
 * rather than clearing it.
 */
const BARE_BUTTON =
  'cursor-pointer appearance-none border-0 bg-transparent p-0';

/*
 * THE SHELL'S ONE BREAKPOINT — `shell:`, which is `--breakpoint-shell` in
 * `src/app/theme.css` and resolves to 1080px. The design does not draw it;
 * the note beside the token says why 1080 and not Tailwind's `lg` or `xl`,
 * and moving the value is one edit there.
 *
 * IT MUST BE WRITTEN AS A WHOLE CLASS NAME, EVERY TIME. Tailwind scans the
 * source for complete candidates and never evaluates the code. A tidy
 * `${PREFIX}flex` compiles, type-checks, lints and builds, and emits no
 * rule at all — the utility silently does not exist. That cost one build to
 * find.
 */

interface Destination {
  href: string;
  /** §8.2's label. The header sets it in capitals with `uppercase`. */
  label: string;
  /** The drawer's own wording where the design differs: LIST → The list. */
  drawerLabel?: string;
  /** The drawer's description line. */
  blurb: string;
}

/**
 * The 9 destinations of §8.2, in the order the design draws them.
 *
 * The drawer in the design has eight rows and no Science (G-2). That is a
 * straight R-NAV-01 breach — all 9 must be reachable at 360 — so Science is
 * inserted at II, where the header already puts it, and the drawn numerals
 * shift down by one. Appending it at IX would have preserved the numerals
 * and broken the order; the order is the thing a reader uses.
 *
 * Two of the drawn descriptions are not shippable (G-12). "All ten types
 * and thirty-eight tags" contradicts the same design's `/classes` page head
 * ("TEN TYPES · FIFTY TAGS"), and "Five batches actually cooked" is a fact
 * about Baumy Biltong sitting in a drawer that opens on every screen. Both
 * are replaced with the general statement the row is actually making. The
 * other six are the design's own words.
 */
const NAV: readonly Destination[] = [
  {
    href: '/recipes',
    label: 'Recipes',
    blurb: 'Every recipe, grouped by kind',
  },
  {
    href: '/science',
    label: 'Science',
    blurb: 'Why things work, kept apart from what to do',
  },
  {
    href: '/cuisines',
    label: 'Cuisines',
    blurb: 'The one classification with its own section',
  },
  {
    href: '/classes',
    label: 'Classes',
    blurb: 'Every type of tag, and every tag',
  },
  {
    href: '/ingredients',
    label: 'Ingredients',
    blurb: 'The index, with aliases and densities',
  },
  {
    href: '/list',
    label: 'List',
    drawerLabel: 'The list',
    blurb: 'Your consolidated ingredients list',
  },
  {
    href: '/batch-logs',
    label: 'Batch logs',
    blurb: 'Every run, linked or not',
  },
  {
    href: '/archive',
    label: 'Archive',
    blurb: 'The frozen source notes',
  },
  {
    href: '/search',
    label: 'Search',
    blurb: 'By text, ingredient, cuisine or class',
  },
];

const ORDINALS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
] as const;

/**
 * Which of the nine the reader is inside, or none.
 *
 * The design marks none on `/`, `/connect`, `/sign-in` and 404, because
 * none of those is a nav destination, and none on `/science` either — but
 * that one is an omission and not a rule (G-1): all 58 references to the
 * header component in the design file override the same two nodes, and the
 * Science pair is simply never one of them. It is marked here.
 *
 * Batch logs is tested first and Recipes skipped for it, because
 * `/recipes/baumy-biltong/batch-logs` is drawn with BATCH LOGS filled, not
 * RECIPES. A plain prefix scan would answer Recipes for that screen.
 */
function activeHref(pathname: string): string | null {
  if (/\/batch-logs(\/|$)/.test(pathname)) return '/batch-logs';
  for (const item of NAV) {
    if (item.href === '/batch-logs') continue;
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      return item.href;
    }
  }
  return null;
}

/**
 * `F/Site header > Navigation` — the nine items at 1280. The export names
 * the node `Navigation`, and R-CMP-16 says the build uses the design's
 * names, so this is `Navigation` and not `PrimaryNav`.
 *
 * The design draws a 4px gap, a 6/9 item box and a 10px mono label at
 * `f-ink-3`; the active item takes a solid `f-accent` fill and its label
 * flips to `f-on-accent`. There is no underline, no weight change and no
 * border in any of the 58 drawn states.
 *
 * It is `display: none` below 1080 rather than absent, so the served HTML
 * always carries the nine addresses.
 */
export function Navigation() {
  const active = activeHref(usePathname());

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'hidden w-fit shrink-0 flex-row items-center gap-1',
        'shell:flex',
      )}
    >
      {NAV.map((item) => {
        const current = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex w-fit shrink-0 flex-row items-center px-2.25 py-1.5 text-10 leading-normal font-mono tracking-label whitespace-nowrap uppercase no-underline',
              current ? 'bg-accent text-on-accent' : 'text-ink-3',
              FOCUS,
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * `Contents — 360` — the 360 drawer (R-NAV-03). Named after the design's
 * own frame, which is what R-CMP-16 asks for; a `—` is not an identifier,
 * so the em dash is dropped and nothing else is.
 *
 * It is a full screen and not a side panel: the design draws it as its own
 * artboard on its own canvas row, 360 wide, filled `f-paper`, clipped, with
 * its own copy of the site header. There is no scrim anywhere in the
 * eighteen exports and no partial-width sheet. The vendored `SheetContent`
 * already drops shadcn/ui's three-quarter-width, small-screen-capped panel
 * for exactly this, so
 * its default side is taken as drawn; the overlay `Sheet` puts underneath
 * is invisible behind an opaque full-screen panel, and still catches the
 * click that dismisses it.
 *
 * The list control is NOT in here. R-CMP-02 forbids it and R-NAV-06 says it
 * stays outside; the design agrees and switches the node off explicitly.
 * See the note on `SiteHeader` for what that costs while the drawer is
 * open.
 *
 * `brand` is passed in as rendered JSX rather than imported, so the header's
 * `Brand` stays a Server Component and this file does not import the file
 * that imports it.
 */
export function Contents360({ brand }: { brand: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = activeHref(pathname);

  /*
   * A navigation does not unmount the root layout, so the panel would still
   * be open on the screen it opened. Each row is a `SheetClose`, which
   * covers a click on a row; this covers Back, Forward, and a link followed
   * from anywhere else while the drawer is up.
   */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/*
       * The design draws the control as a bare `≡` text run — 15.1 × 23px,
       * no padding, no box (G-5). That fails WCAG 2.5.8, and it is the only
       * route to the whole navigation at 360, so R-NAV-02 is at stake. The
       * glyph keeps its drawn position to within half a pixel: the box is
       * 28 × 28 and the negative margins give back 12 of the horizontal and
       * 8 of the vertical, so the layout box stays the glyph's own size and
       * only the hit area grows.
       */}
      <SheetTrigger
        aria-label="Open the contents"
        className={cn(
          BARE_BUTTON,
          '-mx-1.5 -my-1 flex size-7 shrink-0 items-center justify-center text-18 leading-normal font-mono tracking-flat text-ink',
          'shell:hidden',
          FOCUS,
        )}
      >
        <span aria-hidden>≡</span>
      </SheetTrigger>

      {/*
       * The vendored `SheetContent` already draws the design's frame: full
       * width, full height, `f-paper`, square, no shadow. Three things are
       * left to say. The rule the primitive puts on the panel's inner edge
       * is not in the drawing — the drawer is a whole screen, and a screen
       * has no edge to rule — so its width goes to zero. `overflow-x` is
       * pinned to `hidden` because `overflow-y: auto` alone would compute
       * the other axis to `auto` and quietly make this a sideways scroller,
       * which is the shape of fault `pnpm audit:ui` exists to catch. And
       * the design draws no description under the title, so Radix is told
       * there is none rather than warning about it.
       */}
      <SheetContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="border-r-0 p-0 overflow-x-hidden"
      >
        {/* `F/Site header 360`, as the drawer redraws it: the same 16px box
            and hairline, the glyph swapped ≡ → ×. */}
        <div className="flex w-full shrink-0 flex-row items-center justify-between border-b border-hair p-4">
          {brand}
          <div className="flex w-fit shrink-0 flex-row items-center gap-3">
            <SheetClose
              aria-label="Close the contents"
              className={cn(
                BARE_BUTTON,
                '-mx-1.5 -my-1 flex size-7 shrink-0 items-center justify-center text-18 leading-normal font-mono tracking-flat text-ink',
                FOCUS,
              )}
            >
              <span aria-hidden>×</span>
            </SheetClose>
          </div>
        </div>

        <nav
          aria-label="Contents"
          className="flex w-full flex-col items-start gap-0 px-4 pt-6.5 pb-11"
        >
          <SheetTitle className="m-0 text-09 leading-normal font-normal font-mono tracking-spine text-ink-3 uppercase">
            Contents
          </SheetTitle>

          {NAV.map((item, index) => {
            const current = item.href === active;
            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  /* Radix's `DialogClose` sets `type="button"` on its own
                     primitive and `Slot` merges it onto whatever it wraps.
                     On an `<a>`, `type` is a MIME-type hint, so `"button"`
                     is not a valid value and the markup does not validate.
                     The child's props win the merge, so naming it undefined
                     here drops the attribute. */
                  type={undefined}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex w-full shrink-0 flex-row items-start gap-4 py-4 no-underline',
                    /* The design gives row I a stroke colour and no stroke
                       width, so it draws no rule. Rows II onward carry a 1px
                       top rule in `f-hair-2`. */
                    index > 0 && 'border-t border-hair-2',
                    FOCUS,
                  )}
                >
                  <span className="w-8 shrink-0 text-09 leading-180 font-mono tracking-label text-ink-3">
                    {ORDINALS[index]}
                  </span>
                  <span className="flex flex-1 flex-col items-start gap-1">
                    <span
                      className={cn(
                        'text-24 leading-115 font-serif font-medium tracking-flat',
                        current ? 'text-accent' : 'text-ink',
                      )}
                    >
                      {item.drawerLabel ?? item.label}
                    </span>
                    <span className="w-full text-13 leading-170 font-sans tracking-flat text-ink-3">
                      {item.blurb}
                    </span>
                  </span>
                </Link>
              </SheetClose>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
