import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="prose-page">
      <h1>Not here</h1>
      <p className="lede">
        That page does not exist. It may have been a Docusaurus URL from before
        the rebuild.
      </p>
      <p>
        Try <Link href="/search">search</Link>, the{' '}
        <Link href="/recipes">recipe index</Link>, or the{' '}
        <Link href="/archive">Markdown archive</Link>.
      </p>
    </div>
  );
}
