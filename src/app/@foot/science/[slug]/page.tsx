import { PageFoot } from '@/components/f/page-foot';

/**
 * One study's foot. `science-1280.html:1545`.
 *
 * The design draws `NN-SC-02` here — a document number, which is the shape
 * the right slot takes on the recipe, science and home family, rather than
 * the slash path an index or a utility screen takes. There is no study
 * numbering in the data, so the slug identifies the document instead.
 *
 * A slot route is a route: it takes the segment's own `params`, which is the
 * whole reason C-04 is composed here rather than in the layout. It reads no
 * database, so it costs nothing beyond the render.
 */
export default async function ScienceStudyFoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <PageFoot
      left="Effectivity: sixth revision and on"
      right={`NN-SC · ${slug}`}
    />
  );
}
