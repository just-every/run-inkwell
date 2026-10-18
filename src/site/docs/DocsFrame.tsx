import type { ReactNode } from 'react'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import '../styles/site.css'
import '../styles/docs.css'

/** Every docs page: the site header and footer around the sidebar, the page and its contents list. */
export function DocsFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ik-site ik-docs">
      <SiteHeader current="docs" />
      <div className="docs-shell">{children}</div>
      <SiteFooter />
    </div>
  )
}
