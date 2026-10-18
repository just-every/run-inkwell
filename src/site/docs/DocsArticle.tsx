import { DocsFrame } from './DocsFrame'
import { DocsMenu, DocsSidebar } from './DocsNav'
import { DocsPager } from './DocsPager'
import { DocsToc } from './DocsToc'
import { docsNeighbours, getDocsPage } from './pages'

/** One docs page: the section sidebar, the article rendered from Markdown at build time, and "On this page". */
export function DocsArticle({ slug }: { slug: string }) {
  const page = getDocsPage(slug)
  if (!page) throw new Error(`No docs page ${slug}`)
  const { previous, next } = docsNeighbours(slug)
  return (
    <DocsFrame>
      <DocsSidebar current={slug} />
      <main className="docs-main">
        <DocsMenu current={slug} label={page.title} />
        <article aria-labelledby="docs-title">
          <header className="docs-page-head">
            <p className="ik-eyebrow">{page.section}</p>
            <h1 className="docs-title" id="docs-title">{page.title}</h1>
          </header>
          <div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        </article>
        <DocsPager previous={previous} next={next} />
      </main>
      <DocsToc toc={page.toc} />
    </DocsFrame>
  )
}
