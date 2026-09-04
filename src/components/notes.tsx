import { NOTE_KIND_LABELS } from '@/lib/site';
import type { NoteView } from '@/lib/queries/read';
import { Markdown } from './markdown';

export function NoteBlock({ note }: { note: NoteView }) {
  return (
    <article className="note" data-kind={note.kind}>
      <header className="note-head">
        <span className="badge">
          {NOTE_KIND_LABELS[note.kind] ?? note.kind}
        </span>
        {note.title ? <strong>{note.title}</strong> : null}
      </header>
      <Markdown>{note.body}</Markdown>
      {note.sources.length > 0 ? (
        <ul className="note-sources">
          {note.sources.map((source, index) => (
            <li key={index}>
              {source.url ? (
                <a href={source.url} rel="noreferrer nofollow" target="_blank">
                  {source.title ?? source.url}
                </a>
              ) : (
                (source.title ?? source.citation)
              )}
              {source.accessedAt ? (
                <span className="faint"> · {source.accessedAt}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function NoteList({ notes }: { notes: NoteView[] }) {
  if (notes.length === 0) return null;
  return (
    <div>
      {notes.map((note) => (
        <NoteBlock key={note.id} note={note} />
      ))}
    </div>
  );
}
