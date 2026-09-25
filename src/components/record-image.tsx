import { RECORD_IMAGE_SIZES, storedImageSrcSet } from '@/lib/images/widths';

/**
 * One stored picture, drawn the way the recipe hero has always been drawn.
 *
 * Issue #54 added a picture to three more records — an ingredient, a tag and
 * a run — and a run also takes a list of them. Copying the recipe hero's
 * figure into four more files would be four places for the caption rule to
 * drift, so the markup moves here and `recipe-detail.tsx` keeps its own: that
 * one sits inside a header whose geometry the design specifies item by item,
 * and pulling it out would mean passing that geometry in as props.
 *
 * `<img>` and not `next/image`, which is the same decision the recipe hero
 * made. The address is `/images/<id>`, a route handler that redirects to the
 * blob store; the optimiser would have to be told that host is allowed and
 * would then re-fetch and re-encode a file this repository already resized
 * and re-encoded to WebP on the way in. The smaller sizes it would make are
 * made once instead, at upload, and `srcset` names them: `/images/<id>?w=`
 * redirects to the right one. See `src/lib/images/widths.ts`.
 *
 * THE ALT TEXT IS ALSO THE CAPTION, and that is deliberate rather than lazy.
 * `upload_image` requires alt text and the guide tells an agent to describe
 * the food rather than the photograph, so the string is a sentence worth
 * reading. A picture with no alt text is still drawn — rows written before
 * the tool existed have none — and then carries no caption at all, which is
 * correct: an empty `alt` on a decorative image is what a screen reader
 * wants, and a blank caption is furniture.
 */
export function RecordImage({
  url,
  alt,
  caption,
  className,
}: {
  url: string;
  alt: string | null;
  caption?: string | null;
  className?: string;
}) {
  const text = caption ?? alt;
  return (
    <figure
      data-record-image=""
      className={`flex w-full flex-col items-start gap-2 ${className ?? ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        srcSet={storedImageSrcSet(url)}
        sizes={storedImageSrcSet(url) ? RECORD_IMAGE_SIZES : undefined}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        className="h-auto w-full"
      />
      {text ? (
        <figcaption className="m-0 text-13 leading-150 font-serif italic text-ink-3">
          {text}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * The pictures of a run, which is the one record that takes several.
 *
 * A run is the account of what was actually seen, and one run produces the
 * meat going in, the box on day three and the slice on day nine. A single
 * hero would throw away the two that carry the argument.
 *
 * A two-column grid from the recipe breakpoint up and one column below it,
 * because these are read on a phone beside the batch they describe. Nothing
 * is drawn at all when the list is empty — an empty grid still takes its
 * gap, and a heading over nothing reads as a picture that failed to load.
 */
export function RecordImageGallery({
  images,
}: {
  images: { url: string; alt: string | null; caption: string | null }[];
}) {
  if (images.length === 0) return null;
  return (
    <div
      data-record-image-gallery=""
      className="grid grid-cols-1 gap-6 recipe:grid-cols-2"
    >
      {images.map((image) => (
        <RecordImage
          key={image.url}
          url={image.url}
          alt={image.alt}
          caption={image.caption}
        />
      ))}
    </div>
  );
}
