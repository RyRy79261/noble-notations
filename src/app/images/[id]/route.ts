import { NextResponse } from 'next/server';
import { isDatabaseConfigured } from '@/db/client';
import { getImage } from '@/lib/queries/read';

/**
 * The address every picture this repository stores is written down as.
 *
 * `upload_image` puts the bytes in the blob store and writes `/images/<id>`
 * into `recipes.hero_image_url`, into a step, into an ingredient, a tag or a
 * run. Nothing stores the blob address, and `src/db/schema.ts` § `images`
 * argues out why: the reference from a recipe to a picture is a TEXT column
 * and not a foreign key, so deleting the image row can do nothing about the
 * recipes that name it. Serving the picture from here instead makes a soft
 * delete work everywhere at once — this reads `images_live`, so a deleted
 * row is a 404 on every page that referenced it, and a restore brings all of
 * them back without a single stored revision being rewritten.
 *
 * It is a REDIRECT and not a proxy. Streaming the bytes through a function
 * would put every image on a recipe page through a serverless invocation,
 * for bandwidth that is already paid for once at the CDN. The cost of the
 * redirect is honest and stated in the schema: a Vercel blob is public — the
 * SDK has no other access mode — so somebody who kept the blob address can
 * still fetch a deleted picture. "Deleted" here means it leaves the site and
 * the tools, which is what it means for every other record too.
 */
export const dynamic = 'force-dynamic';

/**
 * `?w=<pixels>` asks for a copy at least that wide. The answer is the
 * narrowest stored copy that is, or the largest copy when none is — so a
 * picture stored before copies existed answers every width with the one
 * file it has, and a width larger than the picture never scales it up.
 * `srcset` on the site names these addresses and the browser picks.
 */
function pickBlob(
  image: NonNullable<Awaited<ReturnType<typeof getImage>>>,
  width: number | null,
): string {
  if (!width) return image.blobUrl;
  const fit = [...image.renditions]
    .sort((a, b) => a.width - b.width)
    .find((r) => r.width >= width);
  return fit && fit.width < image.width ? fit.url : image.blobUrl;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Next 16: route params are a Promise.
  const { id } = await params;

  // Every database-backed page on this site degrades to an explanatory
  // notice rather than a stack trace when `DATABASE_URL` is unset, so the
  // build and the archive work without one. The same rule, in the shape a
  // route handler has: 404, not 500.
  if (!isDatabaseConfigured()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const image = await getImage(id);
  if (!image) {
    return new NextResponse('Not found', { status: 404 });
  }

  // The bytes at a blob address never change — the address is derived from a
  // hash of them — but THIS address can start 404ing, because the row can be
  // deleted. So the redirect itself is only briefly cacheable while the
  // bytes it points at are cacheable for a year. `stale-while-revalidate`
  // keeps that cheap: a page that already has the picture does not wait.
  const w = Number(new URL(request.url).searchParams.get('w'));
  const target = pickBlob(image, Number.isFinite(w) && w > 0 ? w : null);

  return NextResponse.redirect(target, {
    status: 307,
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
    },
  });
}
