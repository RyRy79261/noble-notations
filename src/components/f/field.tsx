/**
 * F/Field and F/Filter — the two recessed controls.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.6:
 * `data-pencil-name="F/Field"` at line 2872 and `data-pencil-name="F/Filter"`
 * at line 2894. The select form of F/Field is not on the plate; it is drawn
 * on `list-search-archive-1280.html:3135`, where a `Chevron` child reading
 * `▾` joins the same `justify-between` box.
 *
 * They are two components and not one with a size prop. They differ in three
 * measured ways: padding (`10px 12px` against `11px 13px`), type (14px Geist
 * `f-ink` against 10px Geist Mono `f-ink-3` at 1.5px tracking) and layout
 * (`justify-between` for the chevron against a flex-start row with a
 * growing placeholder).
 *
 * `justify-between` on the field box is load-bearing. It is the reason the
 * chevron sits at the right edge. Keep it in the text form too.
 *
 * TWO DEPARTURES FROM THE DESIGN FILE, both deliberate, both recorded in the
 * M3 report:
 *
 * 1. THE BOUNDARY. The design draws none. The `Input` shape appears 23 times
 *    across five exports at exactly one class string, and F/Filter 7 times,
 *    and not one of them carries a `border`, an `outline`, a `border-width`
 *    or a radius of any kind. The whole boundary is an `f-desk` fill on an
 *    `f-paper` page, which measures 1.12:1 light and 1.06:1 dark against
 *    WCAG 1.4.11's 3:1. TOKEN-MAP.md §5 item 5 already made this call and
 *    put the value in the palette: `input` is `f-ink-3`, 5.25:1 light and
 *    5.60:1 dark, and it invents no colour. This file spends that token.
 *    Delete `border border-solid border-input` from the two constants below
 *    to go back to the drawn treatment.
 *
 * 2. THE FOCUS RING. The design draws no focus state on any control. See the
 *    long note on `FOCUS_RING` in `button.tsx`.
 *
 * `appearance-none`, `rounded-none`, `border-0` and the explicit ground,
 * colour and padding are not decoration either. Tailwind's preflight is OFF
 * until M7, and `globals.css` still carries a rule for
 * `input[type='text'], input[type='search'], input[type='password'], select`
 * that sets a ground, a border, a radius, a padding and a width. Every one
 * of those has to be answered by a utility, or the old rule draws it.
 *
 * Server components. A field that has to react to what a reader types is
 * C-17 `FilterableGroups`, which is one of the eight in §9.3 and is not this
 * milestone's.
 */

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING, FOCUS_RING_WITHIN } from './button';

/** A stable DOM id from the visible label, so the `<label>` can point at it. */
function controlId(label: string, given?: string): string {
  if (given) return given;
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `f-field-${slug || 'control'}`;
}

/**
 * The label. 9px Geist Mono at `tracking-spine`, which is 1.5px — NOT the
 * 1.2px `tracking-label` that the rest of the 9px mono micro-labels use. The
 * design is consistent about this across all five drawn fields.
 */
const FIELD_LABEL = 'text-09 font-mono tracking-spine uppercase text-ink-3';

/* `px-3` is 12px, on the scale. The 10px on the block axis is not; see
   the note in `mark.tsx` on off-scale padding. */
const FIELD_BOX = cn(
  'w-full appearance-none rounded-none bg-desk',
  'border border-solid border-input',
  'px-3 py-2.5',
  'text-14 font-sans text-ink placeholder:text-ink-3',
);

type FieldBase = {
  /** The visible label. Also the source of the control's id. */
  label: string;
  /** Classes for the outer column. */
  className?: string;
  /** Classes for the control itself. */
  controlClassName?: string;
};

type FieldAsInput = FieldBase &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    as?: 'input';
  };

type FieldAsSelect = FieldBase &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
    as: 'select';
    /** The `<option>` list. */
    children: ReactNode;
  };

export type FieldProps = FieldAsInput | FieldAsSelect;

/**
 * F/Field — a label over a recessed control.
 *
 * `as="select"` draws the chevron the design puts in the same box. The
 * native arrow is turned off, because it is drawn by the platform and would
 * sit beside ours.
 */
export function Field(props: FieldProps) {
  if (props.as === 'select') {
    const {
      as: _as,
      label,
      className,
      controlClassName,
      children,
      id,
      ...rest
    } = props;
    const forId = controlId(label, id);

    return (
      <div
        className={cn(
          'flex h-fit w-full shrink-0 flex-col items-start gap-2',
          className,
        )}
      >
        <label htmlFor={forId} className={FIELD_LABEL}>
          {label}
        </label>
        <div
          className={cn(
            FIELD_BOX,
            'flex flex-row items-center justify-between',
            FOCUS_RING_WITHIN,
            controlClassName,
          )}
        >
          <select
            id={forId}
            className={cn(
              'min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent p-0',
              'text-14 font-sans text-ink outline-none',
            )}
            {...rest}
          >
            {children}
          </select>
          {/* The design's own glyph. Decorative: the `<select>` announces
              itself. */}
          <span aria-hidden="true" className="text-11 font-mono text-ink-3">
            ▾
          </span>
        </div>
      </div>
    );
  }

  const { as: _as, label, className, controlClassName, id, ...rest } = props;
  const forId = controlId(label, id);

  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-2',
        className,
      )}
    >
      <label htmlFor={forId} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={forId}
        className={cn(FIELD_BOX, FOCUS_RING, controlClassName)}
        {...rest}
      />
    </div>
  );
}

/* ── F/Filter ──────────────────────────────────────────────────────────── */

/* 13px and 11px — both off the gap scale. */
const FILTER_BOX = cn(
  'flex h-fit w-full shrink-0 flex-row items-center gap-3',
  'rounded-none bg-desk',
  'border border-solid border-input',
  'px-3.25 py-2.75',
);

export type FilterProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'placeholder'
> & {
  /**
   * The placeholder IS the label. The design draws no separate one, so this
   * also becomes the accessible name unless `aria-label` overrides it.
   */
  placeholder: string;
  /**
   * The readout at the right edge. The design draws it two ways: a bare
   * total (`214`) and an `n of m` (`6 OF 6`).
   */
  count?: ReactNode;
  className?: string;
  inputClassName?: string;
};

/**
 * F/Filter — one recessed bar, a placeholder and a count.
 *
 * The typed value is `f-ink` where the design only ever drew the
 * placeholder, which is `f-ink-3`. Ten-pixel `f-ink-3` text is 5.25:1 and
 * legal, and it is still the quietest thing on the page; what a reader has
 * just typed should not be the quietest thing on the page.
 */
export function Filter({
  placeholder,
  count,
  className,
  inputClassName,
  ...props
}: FilterProps) {
  return (
    <div className={cn(FILTER_BOX, FOCUS_RING_WITHIN, className)}>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={props['aria-label'] ?? placeholder}
        className={cn(
          'min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent p-0',
          'text-10 font-mono tracking-spine text-ink outline-none',
          'placeholder:text-ink-3',
          inputClassName,
        )}
        {...props}
      />
      {count === undefined || count === null ? null : (
        <span className="text-10 font-mono tabular-nums text-ink-3 whitespace-nowrap">
          {count}
        </span>
      )}
    </div>
  );
}
