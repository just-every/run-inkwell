import { repository } from './links'

/** Mark and name on the left; Docs and Source on the right, over one hairline. */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="ik-header">
      <a className="ik-brand" href="/"><img src="/brand/mark.svg" width={28} height={28} alt="" />Inkwell</a>
      <nav aria-label="Site">
        <a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
        <a href={repository}>Source</a>
      </nav>
    </header>
  )
}
