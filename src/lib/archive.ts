import 'server-only';

/**
 * The frozen Markdown archive under content/.
 *
 * These files predate the database and are the provenance record the
 * structured rows were derived from, so they are served straight off disk
 * rather than through Postgres — the archive stays readable even when the
 * database is unreachable, which is much of its point.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const ROOT = path.join(process.cwd(), 'content');

/** Directories that make up the archive, in the order they are presented. */
const SECTIONS = ['biltong', 'recipes', 'research'] as const;

export const SECTION_LABELS: Record<string, string> = {
  biltong: 'Biltong logs',
  recipes: 'Recipes',
  research: 'Research',
};

export interface ArchiveEntry {
  section: string;
  slug: string;
  /** URL path segments under /archive. */
  segments: string[];
  title: string;
  kind: string;
  summary: string;
  archivedFrom: string;
}

export interface ArchiveDocument extends ArchiveEntry {
  body: string;
}

function parseEntry(section: string, file: string, raw: string): ArchiveEntry {
  const { data } = matter(raw);
  const slug = file.replace(/\.md$/, '');
  return {
    section,
    slug,
    segments: [section, slug],
    title: typeof data.title === 'string' ? data.title : slug,
    kind: typeof data.kind === 'string' ? data.kind : 'note',
    summary: typeof data.summary === 'string' ? data.summary : '',
    archivedFrom:
      typeof data.archived_from === 'string' ? data.archived_from : '',
  };
}

export async function listArchive(): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = [];

  for (const section of SECTIONS) {
    let files: string[];
    try {
      files = await readdir(path.join(ROOT, section));
    } catch {
      continue;
    }
    for (const file of files.sort()) {
      if (!file.endsWith('.md')) continue;
      const raw = await readFile(path.join(ROOT, section, file), 'utf8');
      entries.push(parseEntry(section, file, raw));
    }
  }

  return entries;
}

export async function getArchiveDocument(
  segments: string[],
): Promise<ArchiveDocument | null> {
  // Path traversal guard: the resolved file must stay inside content/, and
  // only the two-segment section/slug shape is ever valid.
  if (segments.length !== 2) return null;
  const [section, slug] = segments as [string, string];
  if (!(SECTIONS as readonly string[]).includes(section)) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  const file = path.join(ROOT, section, `${slug}.md`);
  if (!file.startsWith(ROOT + path.sep)) return null;

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return null;
  }

  const { content } = matter(raw);
  return { ...parseEntry(section, `${slug}.md`, raw), body: content };
}
