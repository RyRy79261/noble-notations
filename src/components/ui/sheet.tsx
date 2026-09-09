/*
 * shadcn/ui Sheet, new-york style, restyled onto the DOSSIER tokens.
 *
 * Vendored with `pnpm dlx shadcn@latest add sheet`, then rewritten. See the
 * note at the top of `button.tsx`; TOKEN-MAP.md §11 lists each conversion.
 *
 * This is the 360 drawer. R-NAV-03 says the 360 navigation MUST be a drawer
 * opened by a `≡` control, and the design draws it as the frame
 * `Contents — 360` in `design/exports/recipe-360.html`:
 *
 *   width 360, absolute at the origin, filled `f-paper`, clipped.
 *
 * (The export's own class string is quoted here in prose and not verbatim.
 * Tailwind scans comments as well as code, so a complete candidate written
 * in a note compiles into the shipped stylesheet — a raw hex fill quoted
 * from an export is an R-BLD-02 breach in the bundle even when no element
 * ever carries it. Every quotation below is broken for the same reason.)
 *
 * Three things follow from that one line and each is a change to the stock
 * file. The drawer is the FULL width of the 360 screen, not stock's
 * three-quarter width with its small-screen max-width cap. It is the page
 * ground, `f-paper`, not a raised surface
 * — TOKEN-MAP.md §3.2 records that the design has no raised ground. And it
 * is square and flat: no radius and no `shadow-lg`, because §4.5 records
 * that there is no shadow, no blur and no opacity anywhere in the design.
 *
 * The overlay keeps `bg-black/50`. That is the one place `black` survives
 * theme.css's clearing of the colour namespace, and the comment there says
 * why: "shadcn/ui draws its overlay scrim with them". A full-width drawer
 * hides the scrim anyway, but the layer still has to catch the click that
 * dismisses it.
 *
 * R-NAV-06 keeps the list control OUTSIDE this drawer, and R-CMP-02 repeats
 * it. Nothing here enforces that — it is a rule for whoever composes
 * `F/Site header 360`.
 *
 * "use client" is required: Radix's dialog owns open state, a focus trap and
 * a portal. The drawer is part of C-02, the site header, in §9.1.
 */
'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';

import { cn } from '@/lib/utils';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'left',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          [
            'fixed z-50 flex flex-col gap-0 overflow-y-auto',
            /* `f-paper`, not a raised surface. Square, and no shadow. */
            'rounded-none bg-paper text-ink',
            'transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
          ],
          /* Full width, as the design draws it. Stock caps this at three
             quarters of the screen with a small-screen max-width; the
             design's drawer covers the whole 360 screen, and a cap would
             leave a strip of scrim the design does not draw. */
          side === 'right' &&
            'inset-y-0 right-0 h-full w-full border-l border-hair data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-full border-r border-hair data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
          side === 'top' &&
            'inset-x-0 top-0 h-auto border-b border-hair data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto border-t border-hair data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          /*
           * The design draws this control as a `×` set in Geist Mono at
           * 18px, in the drawer's own header row, where the `≡` was. Stock
           * draws a lucide `XIcon` at 16px at 70% opacity; both the icon
           * and the opacity are replaced — the glyph is the design's, and
           * TOKEN-MAP.md §4.5 rules out opacity.
           *
           * `size-7` is 28px. `scripts/audit-ui.ts` reports any control
           * under 24 × 24 as a fault, and 28px leaves margin.
           *
           * Pass `showCloseButton={false}` when `F/Site header 360` draws
           * its own `×`, so the drawer does not carry two.
           */
          <SheetPrimitive.Close
            className={cn(
              'absolute top-4 right-4 inline-flex size-7 items-center justify-center rounded-none',
              'font-mono text-18 leading-normal tracking-flat text-ink',
              'transition-colors hover:bg-accent-wash',
              'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              'disabled:pointer-events-none disabled:text-ink-3',
            )}
          >
            <span aria-hidden="true">&times;</span>
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

/*
 * The design's drawer header is a 16px box with a 1px `f-hair` rule under
 * it — `Contents — 360 > Site header`: padding 16px all round, and a border
 * of `0 0 1px 0` in `f-hair`.
 */
function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'flex flex-row items-center justify-between gap-2 border-b border-hair p-4',
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

/*
 * `Contents — 360 > Site header > Brand > W`: Newsreader 17px, weight 500,
 * in `f-ink`. Stock is semibold with no face and no size, which left
 * the title at whatever the parent set. TOKEN-MAP.md §4.1 records that the
 * design uses only 400 and 500 of Newsreader.
 *
 * Radix requires a title on every dialog. When the design's own header
 * supplies the visible one, wrap this in shadcn/ui's `sr-only` instead of
 * omitting it, or Radix logs an accessibility error.
 */
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        'font-serif text-17 leading-normal font-medium tracking-flat text-ink',
        className,
      )}
      {...props}
    />
  );
}

/*
 * The drawer's entry description, `Contents > … > D`: Geist 13px over 22px
 * in `f-ink-3`. 22 ÷ 13 is 1.69, which is `leading-170` to a tenth of a
 * pixel — TOKEN-MAP.md §4.3 has the table. Stock is
 * a small size on the muted foreground colour; that size no longer
 * resolves at all.
 */
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn(
        'font-sans text-13 leading-170 tracking-flat text-ink-3',
        className,
      )}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetPortal,
  SheetOverlay,
};
