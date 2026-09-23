/**
 * The widths of the smaller copies of every stored picture, and the one
 * helper that turns a stored address into a `srcset`.
 *
 * Its own module, with no imports, because two worlds need it: the upload
 * pipeline in `process.ts` (server-only, and it loads `sharp`) makes the
 * copies, and the components that draw a picture name them. A component
 * that imported `process.ts` for one array would drag `sharp` toward the
 * client bundle.
 */

/**
 * 480 is a phone at 1×, 960 a phone at 2× or a column on a laptop, 1600 a
 * laptop at 2×. Above that the largest copy serves. Changing this list
 * changes new uploads only; `/images/<id>?w=` falls back to the largest copy
 * for a width a picture has no copy of, so an old picture still answers.
 */
export const RENDITION_WIDTHS = [480, 960, 1600] as const;

/** The longest edge of the largest copy. See `process.ts`. */
export const MAX_STORED_EDGE = 2400;

const STORED = /^\/images\/[0-9a-fA-F-]{36}$/;

/**
 * A `srcset` for an address this repository stored, or undefined for any
 * other address. A recipe may still point at a picture on somebody else's
 * site, and that site has no `?w=`.
 */
export function storedImageSrcSet(url: string): string | undefined {
  if (!STORED.test(url)) return undefined;
  return [
    ...RENDITION_WIDTHS.map((w) => `${url}?w=${w} ${w}w`),
    `${url} ${MAX_STORED_EDGE}w`,
  ].join(', ');
}

/**
 * How wide a picture is drawn: the full column, which stops growing at the
 * shell's widest. The browser multiplies by the screen density itself.
 */
export const RECORD_IMAGE_SIZES = '(min-width: 1280px) 1200px, 100vw';
