import { Marble } from '../shell/Marble'

/** The closing band: the marbled endpaper again, full bleed, behind one centred white card. */
export function Closing() {
  return (
    <section className="ik-closing" id="run" aria-labelledby="run-title">
      <Marble className="ik-marble--closing" />
      <div className="ik-closing-card">
        <h2 id="run-title">Agreements, signed.</h2>
        <p>Run it yourself, free.</p>
        <a className="ik-pill" href="/run">Run Inkwell <span aria-hidden="true">→</span></a>
        <a className="ik-link" href="/docs">Read the docs</a>
      </div>
    </section>
  )
}
