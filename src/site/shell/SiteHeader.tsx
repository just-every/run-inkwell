import { Lockup } from './Lockup'
import { repository } from './links'

/** Mark and wordmark on the left; Docs, Contract and Source on the right, over the page's grid. */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="ik-header">
      <Lockup />
      <nav aria-label="Site">
        <a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
        <a href="/contract">Contract</a>
        <a href={repository}>Source</a>
      </nav>
    </header>
  )
}
