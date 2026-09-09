/*
 * shadcn/ui Tooltip, new-york style, restyled onto the DOSSIER tokens.
 *
 * Vendored with `pnpm dlx shadcn@latest add tooltip`, then rewritten. See
 * the note at the top of `button.tsx`; TOKEN-MAP.md §11 lists each
 * conversion.
 *
 * THE DESIGN DRAWS NO TOOLTIP. Grep the eighteen exports for one and there
 * is nothing. The treatment below is therefore derived, and it is derived
 * from the one the old stylesheet already draws at `.tag-tooltip` so the two
 * agree while both are on the site: an opaque page-ground fill with a single
 * strong rule. The rule is `f-ink-3`, which is what the M3 palette bridge
 * points `--border-strong` at, and it is 5.25:1 on the light page and 5.60:1
 * on the dark one — well past the 3:1 WCAG 1.4.11 asks of a boundary.
 *
 * The fill must be fully opaque. This floats over body text, and the old
 * stylesheet carries the same warning at that rule for the same reason. The
 * regression test at `e2e/classes.spec.ts` asserts an alpha of exactly 1.
 *
 * NO ARROW, AND NO SHADOW. Stock draws a rotated square filled with
 * the foreground colour; that works only on a fill with no border, and this
 * tooltip is a ruled block. TOKEN-MAP.md §4.5 also records that the design
 * has no shadow, no blur and no opacity anywhere, so the stock shadow is not
 * replaced, it is dropped. The 1px rule is the separation.
 *
 * R-ACC-02 and R-CMP-03 ask for hover AND keyboard focus; Radix's trigger
 * opens on both. R-ACC-03 asks for `aria-describedby`; Radix writes it on
 * the trigger, which is exactly why R-CMP-04 forbids the `title` attribute.
 *
 * "use client" is required: Radix's tooltip is a state machine built on
 * `useState` and `useEffect`. This is the browser half of C-07, the term
 * tag, in §9.3 of the specification.
 */
'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

/*
 * The provider is inside the root on purpose. shadcn/ui's install note asks
 * the caller to wrap the application in a `TooltipProvider`; nesting one per
 * tooltip is what shadcn/ui itself now ships, it costs nothing, and it keeps
 * `src/app/layout.tsx` free of a provider that only one component needs. The
 * named export is still here for a caller that wants to share a delay across
 * a group of tags.
 */
function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          [
            'z-50 w-fit max-w-88 origin-(--radix-tooltip-content-transform-origin)',
            /* 12px × 8px. `--spacing` is 4px, so both are on the design's
               own gap scale. Stock is `px-3 py-1.5`, and 6px is on no scale
               here. */
            'px-3 py-2',
            /* Square, like everything else. Stock is `rounded-md`, a name
               theme.css cleared, so it drew nothing at all. */
            'rounded-none border border-ink-3 bg-paper text-ink',
            /* Geist 13px. Size and leading in one argument — TOKEN-MAP.md
               §4.3. Stock is `text-xs`, which no longer resolves. */
            'font-sans text-13 leading-150 tracking-flat text-balance',
            'animate-in fade-in-0 zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          ],
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
