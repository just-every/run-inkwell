import { demo } from './links'

const Arrow = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>

/** Run Inkwell → to /run, then the text links: the hero adds Try the demo, the closing only Read the docs. */
export function Actions({ demoLink = true }: { demoLink?: boolean }) {
  return (
    <div className="ik-actions">
      <a className="ik-run" href="/run">Run Inkwell <Arrow /></a>
      {demoLink && <a className="ik-text-link" href={demo}>Try the demo</a>}
      <a className="ik-text-link" href="/docs">Read the docs</a>
    </div>
  )
}
