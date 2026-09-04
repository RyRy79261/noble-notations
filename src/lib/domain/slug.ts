/**
 * Slugs are the public identity of everything in the repository — they end up
 * in URLs, in MCP tool arguments, and in exported Markdown filenames. Keep the
 * rules in one place so all three agree.
 */

/** Lowercase, ASCII-folded, hyphen-separated. Never empty. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    // Strip combining marks so "jalapeño" → "jalapeno".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base || 'untitled';
}

/**
 * Append `-2`, `-3`, … until the slug is not in `taken`. Used when a title
 * collides with an existing recipe rather than failing the write.
 */
export function uniqueSlug(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(desired);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
