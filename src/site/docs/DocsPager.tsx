import { docsPath } from '../shell/links'
import type { DocsPageMeta } from './types'

/** The previous and next pages in reading order, as two cards. */
export function DocsPager({ previous, next }: { previous?: DocsPageMeta; next?: DocsPageMeta }) {
  if (!previous && !next) return null
  return (
    <nav className="docs-pager" aria-label="Previous and next pages">
      {previous && <a className="docs-pager-card" href={docsPath(previous.slug)} rel="prev"><span>← Previous</span>{previous.title}</a>}
      {next && <a className="docs-pager-card docs-pager-card--next" href={docsPath(next.slug)} rel="next"><span>Next →</span>{next.title}</a>}
    </nav>
  )
}
