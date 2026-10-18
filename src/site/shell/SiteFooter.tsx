import { Lockup } from './Lockup'
import { licence, repository } from './links'

/** One line set in type: the lockup, what Inkwell is, and Docs, Source and the licence. */
export function SiteFooter() {
  return (
    <footer className="ik-footer">
      <div className="ik-footer-brand"><Lockup size="footer" /><span>Free, open source e-signature</span></div>
      <nav aria-label="Footer">
        <a href="/docs">Docs</a>
        <a href={repository}>Source</a>
        <a href={licence}>MIT licensed</a>
      </nav>
    </footer>
  )
}
