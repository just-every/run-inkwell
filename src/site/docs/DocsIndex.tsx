import { docsPath } from '../shell/links'
import { DocsFrame } from './DocsFrame'
import { DocsSidebar } from './DocsNav'
import { docsLead, docsSections } from './pages'

/** The docs home at /docs: the title, a short lead and each section's pages as cards in reading order. */
export function DocsIndex() {
  return (
    <DocsFrame>
      <DocsSidebar />
      <main className="docs-main docs-main--index">
        <header className="docs-page-head">
          <p className="ik-eyebrow">Inkwell docs</p>
          <h1 className="docs-title">Docs</h1>
          <p className="docs-lead">{docsLead}</p>
        </header>
        {docsSections.map((section, index) => (
          <section className="docs-index-section" key={section.title} aria-labelledby={`docs-section-${index}`}>
            <h2 className="ik-eyebrow" id={`docs-section-${index}`}>{section.title}</h2>
            <ul className="docs-index-grid">
              {section.pages.map(page => <li key={page.slug}><a className="docs-card" href={docsPath(page.slug)}><h3>{page.title} <span aria-hidden="true">→</span></h3><p>{page.summary}</p></a></li>)}
            </ul>
          </section>
        ))}
      </main>
    </DocsFrame>
  )
}
