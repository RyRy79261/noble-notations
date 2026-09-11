import { cn } from '@/lib/utils';
import { Notice } from '@/components/f/notice';
import { PageFoot } from '@/components/f/page-foot';
import { PageHead, PageHero } from '@/components/f/page-head';
import { IndexCard } from '@/components/f/recipe-card';
import { SectionHead } from '@/components/f/section-label';

/**
 * The 404. `access-1280.html:810`, at 360 in
 * `m360-access-science.html:1229`, in the dark theme in `dark-screens.html`.
 * The pictures are `design/exports/png/kuF97.png`, `UknTh.png` and
 * `cCfRl.png`.
 *
 * R-SCR-26: low traffic, and it must not look unfinished. The design gives
 * this screen more air than any other — `p-[ 52px 60px 96px 60px ]` — and
 * four blocks: the hero, a recessed address band, three places to try under
 * a numbered head, and the notice that says nothing here is ever deleted.
 *
 * THE ADDRESS BAND DOES NOT NAME THE ADDRESS, and it cannot. The design
 * draws `YOU ASKED FOR /recipes/baumy-biltong/v3`. A `not-found.tsx` is
 * rendered by the App Router with no request in scope: it takes no `params`
 * and no `searchParams`, and the two ways to reach the path from here are a
 * client component with `usePathname` — §9.3 fixes the count of those at
 * nine — or `headers()` behind a proxy matcher widened over the whole site,
 * which `src/proxy.ts` documents at length why it will not do. So the band
 * keeps its geometry and carries the fact that is true without the request:
 * the shape a revision address has now. That is the design's own `Hint`
 * line, promoted to the slot above it.
 *
 * THE THREE CARDS ARE NOT THE DESIGN'S THREE. The design offers a recipe, a
 * revision of it and the search — all three derived from the address it
 * knows. With no address to derive from, the three are the three indexes a
 * reader who has lost a page can start from, which is what the pre-M6 404
 * already offered in one sentence.
 *
 * THE PAGE FOOT IS RENDERED HERE, WHICH IT IS ON NO OTHER SCREEN. M6 moved
 * C-04 into the `@foot` parallel slot (see `src/app/layout.tsx`), and the
 * slot does not reach a root `not-found.tsx`: measured on a production
 * build, `/nope` came back with no page foot in the document at all,
 * where before M6 the layout drew one on every page. `foot ?? <PageFoot />`
 * in the layout does not help — `foot` is an outlet element that renders
 * nothing rather than `undefined`.
 *
 * So this screen draws its own, and the cost is one landmark: `<main>`
 * wraps `{children}`, and a `<footer>` inside `<main>` is not `contentinfo`
 * (HTML-AAM). That is the smaller loss. The foot carries C-04's three links
 * and `/connect` is deliberately absent from the sitemap, so the footer link
 * is its only address — a 404 with no footer takes the connector, the
 * repository and `/llms.txt` off the one page a lost reader is most likely
 * to be standing on. Rendering it here also buys back the design's own
 * `NN/404`, which a slot could not have supplied.
 *
 * A `global-not-found.tsx` would let this screen compose its own shell and
 * put the foot back outside the landmark. That is a shell decision and it
 * belongs with whoever owns the shell, at M7.
 *
 * A server component, and deliberately not `force-dynamic`: it renders the
 * same page for every missing address.
 */
export default function NotFound() {
  return (
    <>
      <PageHead left="NN · 404" right="No page at this address" />

      {/* The 404's own frame: 52/60/96/60 and `gap-[ 40px ]` at 1280, the
          ordinary 22/16/48/16 and `gap-[ 28px ]` at 360. */}
      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-10 shell:px-15 shell:pt-13 shell:pb-24">
        <PageHero
          kicker="Section VII · Not found"
          kickerForm="mark"
          title="No page at this address"
          /* 860px — `access-1280.html`, `data-pencil-name="Lede"`. */
          ledeClassName="shell:max-w-215"
          lede="There is nothing at the address you asked for. Nothing here is deleted, so what you want is almost certainly still here at another address."
        />

        {/* The recessed address band. `f-desk`, no rule and no radius: 18/20
            of padding at 1280 and 14 all round at 360. */}
        <div className="flex w-full shrink-0 flex-col items-start gap-2 bg-desk p-3.5 shell:px-5 shell:py-4.5">
          <span className="text-09 leading-normal font-mono tracking-label uppercase text-accent">
            A revision now reads
          </span>
          <code className="w-full text-16 leading-130 font-mono break-all text-ink shell:text-19 shell:leading-normal">
            /recipes/&lt;recipe&gt;/revisions/&lt;number&gt;
          </code>
          <span className="w-full text-09 leading-150 font-mono tracking-label uppercase text-ink-3">
            Until issue 01 a revision was /v1 /v2 /v3 · /taxonomy, /categories,
            /experiments and /shopping-list all answer at their new addresses on
            their own
          </span>
        </div>

        <section className="flex w-full shrink-0 flex-col items-start gap-section-360 shell:gap-5">
          {/* Rule 2 of the 360 fold: the roman ordinal and the serif title
              become one accent mono label. `F/Section head` draws both from
              one heading, so the words are in the accessibility tree once. */}
          <SectionHead
            ordinal="I"
            title="Where it went"
            meta={
              <>
                <span className="shell:hidden">Three places</span>
                <span className="hidden shell:inline">Three places to try</span>
              </>
            }
          />

          {/* Three cells at 1280, 44px apart. At 360 they stack and the
              design puts a quiet `f-hair-2` rule between them — which is the
              row rule and not the band rule, so it is `border-t-hair-2` and
              only from the second card down. */}
          <div className="flex w-full flex-col items-start gap-4 shell:flex-row shell:items-start shell:gap-11">
            {PLACES.map((place, index) => (
              <div
                key={place.href}
                className={cn(
                  'flex w-full flex-col items-start shell:flex-1',
                  index > 0
                    ? cn(
                        'pt-4 shell:pt-0',
                        '[border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair-2',
                        'shell:[border-width:0px_0px_0px_0px]',
                      )
                    : null,
                )}
              >
                <IndexCard
                  kicker={place.kicker}
                  title={place.title}
                  href={place.href}
                  description={place.description}
                  /* The design draws this slot as a 10px untracked path in
                     lower case, where F/Index card's meta is a 9px tracked
                     label in capitals. A path is not a label, so the three
                     that make it one are turned off here rather than in the
                     component. */
                  meta={
                    <span className="text-10 tracking-flat normal-case">
                      {place.href}
                    </span>
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <Notice title="Nothing here is ever deleted">
          A recipe keeps its name for as long as this site exists, and every
          revision ever recorded on it stays where it was recorded. A page that
          has gone has changed address, not stopped existing. The archived notes
          are kept in the same way, exactly as they were written.
        </Notice>
      </div>

      {/* C-04, drawn here rather than by the `@foot` slot. See the note
          above. `access-1280.html:1188` is the design's own foot for this
          screen: the generic issue line, and `NN/404` on the right. */}
      <PageFoot right="NN/404" />
    </>
  );
}

/** The three indexes a reader who has lost a page can start from. */
const PLACES = [
  {
    kicker: 'Recipes',
    title: 'Every recipe',
    href: '/recipes',
    description:
      'Each dish under the name it keeps for good, with all of its revisions and the current one at the top.',
  },
  {
    kicker: 'Search',
    title: 'Look for it by hand',
    href: '/search',
    description:
      'Free text, ingredients that must be in or out, cuisine, technique and kind, across every recipe.',
  },
  {
    kicker: 'Archive',
    title: 'The Markdown archive',
    href: '/archive',
    description:
      'The source notes this repository was built from, frozen exactly as they were written.',
  },
];
