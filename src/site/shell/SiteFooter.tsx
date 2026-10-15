import { licence, repository } from './links'

export function SiteFooter() {
  return (
    <footer className="ik-footer">
      <p className="ik-footer-brand"><img src="/brand/mark.svg" width={28} height={28} alt="" /><span>Inkwell</span><span className="ik-footer-line">Documents, signatures, and a verifiable record.</span></p>
      <nav aria-label="Footer">
        <a href="/docs">Docs</a>
        <a href={repository}>Source</a>
        <a href={licence}>MIT License</a>
      </nav>
    </footer>
  )
}
