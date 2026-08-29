/**
 * Emit a JSON-LD block.
 *
 * The payload is built from our own database rows rather than from user
 * HTML, but `<` is still escaped so a stray `</script>` inside a recipe
 * title cannot break out of the element.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
