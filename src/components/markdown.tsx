import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown rendering for note bodies and the archive.
 *
 * GFM is on because the archive is full of pipe tables — the batch logs are
 * mostly tables, and without GFM they render as unreadable pipe soup.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
