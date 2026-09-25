import type { Metadata } from 'next';

import { isDatabaseConfigured } from '@/db/client';
import { isConfigured as blobConfigured } from '@/lib/images/blob';
import { MAX_INPUT_BYTES } from '@/lib/images/process';
import { closedLinkMessage, findImageUpload } from '@/lib/queries/uploads';
import { Mark } from '@/components/f/mark';
import { Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';

import { UploadForm } from './upload-form';

/**
 * The page an upload link opens. Issues #56 and #58.
 *
 * An agent called `request_image_upload`, and the person was handed this
 * address. They open it on the phone that took the photograph, pick the
 * file, and the browser sends it to this site's own upload route. The
 * model never sees a byte of it, which is the whole point: a photograph as
 * base64 is millions of tokens, and no chat can send one.
 *
 * Nobody signs in here. The token in the address is the permission — it was
 * minted by a connector that already holds the write scope, it names one
 * record, it lasts an hour and it takes one picture. See `image_uploads` in
 * `src/db/schema.ts`.
 *
 * Kept out of search engines and out of the referrer: the address is a
 * credential until it is spent.
 */
export const metadata: Metadata = {
  title: 'Upload a picture',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function UploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const upload =
    isDatabaseConfigured() && blobConfigured()
      ? await findImageUpload(token)
      : null;

  return (
    <>
      <PageHead left="NN · Upload" right="One picture" />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:items-center shell:gap-10 shell:px-15 shell:pt-24 shell:pb-30">
        <div className="flex w-full flex-col items-start gap-7 shell:w-155">
          {!upload ? (
            <>
              <Mark>Upload</Mark>
              <PageHero
                title="This link does not work"
                lede="There is no upload link at this address. Ask Claude for a new one."
              />
            </>
          ) : upload.state !== 'open' ? (
            <>
              <Mark>Upload</Mark>
              <PageHero
                title={
                  upload.state === 'used'
                    ? 'This link is used'
                    : 'This link has expired'
                }
                lede={closedLinkMessage(upload.state)}
              />
            </>
          ) : (
            <>
              <Mark>Upload</Mark>
              <PageHero
                title="Add a picture"
                lede={`This puts one picture on ${upload.target}. Pick the photograph on this device. A photo over 4 MB is made smaller on this device before it is sent.`}
              />
              <UploadForm
                token={token}
                target={upload.target}
                initialAlt={upload.alt ?? ''}
                caption={upload.caption}
                maxBytes={MAX_INPUT_BYTES}
              />
              <Notice tone="neutral" title="What happens to the file">
                The server keeps a copy at most 2400 pixels on its longest edge,
                as WebP, and smaller copies for small screens. It does not keep
                the original. The link works one time and stops working after
                one hour.
              </Notice>
            </>
          )}
        </div>
      </div>
    </>
  );
}
