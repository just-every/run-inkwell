import { DocIcon, InfoIcon, WarnIcon } from '../icons'
import { Cursor, Eyebrow, Heading, Sparks, Sticky, Tick } from '../parts'

const carried = [
  ['Completed envelopes', '1,846 of 1,846'],
  ['Certificates of completion', '1,846'],
  ['Templates with roles', '14'],
  ['Contacts', '212'],
  ['Senders', 'Rosa Delgado, Jamal Price'],
  ['PowerForms → web forms', '2 · old links listed'],
  ['Brand, disclosure, reminders', 'carried over'],
]

/** 12: the Docusign import Rosa reviewed on Thu Oct 1, and the one line that starts Inkwell on your own computer. */
export function MoveIn() {
  return (
    <section className="ik-section ik-split ik-movein" aria-labelledby="movein-title">
      <div className="ik-wrap ik-split-grid">
        <div className="ik-copy">
          <Eyebrow>Moving in · Fri Oct 2</Eyebrow>
          <Heading id="movein-title" first="Every Docusign envelope," second="carried over." />
          <p className="ik-body">Templates, completed envelopes, certificates and contacts arrive with their owners. Anything that did not map is listed by name.</p>
          <div className="ik-terminal">
            <span className="ik-terminal-dots" aria-hidden="true"><i /><i /><i /></span>
            <pre><code><span className="ik-prompt" aria-hidden="true">$ </span>npx -y @runeditrun/rer dev just-every/run-inkwell{'\n'}<span className="ik-comment"># clones, installs and starts Inkwell on your computer</span></code></pre>
          </div>
        </div>
        <div className="ik-stage ik-movein-stage">
          <article className="ik-card ik-import">
            <header><span className="ik-icon-square ik-icon-square--blue"><DocIcon /></span><h3>Docusign import · reviewed Thu Oct 1</h3></header>
            <dl className="ik-import-rows">
              {carried.map(([name, value]) => <div key={name}><dt>{name}</dt><dd><span className="ik-chip ik-chip--green">{value} <Tick /></span></dd></div>)}
            </dl>
            <p className="ik-import-note ik-import-note--amber"><WarnIcon /><span><b>Unmapped</b> · 1 · tlee@harborline.com (no member) → items to Rosa</span></p>
            <p className="ik-import-note ik-import-note--blue"><InfoIcon /><span><b>Still out in Docusign</b> · 6 · tracked until signed, then imported</span></p>
            <Sticky className="ik-movein-sticky">swap the old form link</Sticky>
            <Cursor name="Jamal" className="ik-movein-jamal" />
          </article>
          <span className="ik-mv-link ik-mv-link--1" aria-hidden="true" />
          <span className="ik-mv-link ik-mv-link--2" aria-hidden="true" />
          <Sparks className="ik-mv-spark ik-mv-spark--1" />
          <Sparks className="ik-mv-spark ik-mv-spark--2" />
          <Sparks className="ik-mv-spark ik-mv-spark--3" />
          <Sparks tone="blue" className="ik-mv-spark ik-mv-spark--4" />
        </div>
      </div>
    </section>
  )
}
