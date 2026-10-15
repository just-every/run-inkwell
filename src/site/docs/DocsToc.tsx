import type { DocsTocEntry } from './types'

/** "On this page": the page's h2s, beside the article on wide screens. A page with fewer than two gets none. */
export function DocsToc({ toc }: { toc: DocsTocEntry[] }) {
  const headings = toc.filter(entry => entry.depth === 2)
  if (headings.length < 2) return null
  return (
    <nav className="docs-toc" aria-labelledby="docs-toc-title">
      <p className="docs-toc-title" id="docs-toc-title">On this page</p>
      <ul>{headings.map(entry => <li key={entry.id}><a href={`#${entry.id}`}>{entry.text}</a></li>)}</ul>
    </nav>
  )
}
