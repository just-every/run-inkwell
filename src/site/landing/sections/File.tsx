import { SealedMascot } from '../art/Mascot'
import { CalendarIcon, ChatIcon, DocIcon, FolderIcon, MailIcon } from '../icons'
import { Avatar, CheckDot, Cursor, Eyebrow, Heading, Sparks, Sticky, Tick } from '../parts'

/** 08: the mascot moment. The sealed envelope hops among the five places the record lands at 2:42 pm. */
export function File() {
  return (
    <section className="ik-section ik-file" aria-labelledby="file-title">
      <div className="ik-wrap">
        <header className="ik-center-head">
          <Eyebrow>File · Thu Oct 15, 2:42 pm</Eyebrow>
          <Heading id="file-title" first="Filed where" second="your team looks." />
          <p className="ik-lead">One minute after the last signature, every copy and every record is where it belongs.</p>
        </header>
        <div className="ik-file-stage">
          <svg className="ik-file-links" viewBox="0 0 1300 500" preserveAspectRatio="none" aria-hidden="true">
            <path d="M404 128C440 128 446 160 476 168M410 300C442 300 452 252 482 242M866 78C830 82 830 130 798 140M866 250C840 250 830 226 802 222M866 420C830 410 820 322 790 298" />
          </svg>
          <div className="ik-file-col">
            <article className="ik-card ik-file-card">
              <span className="ik-line-icon"><DocIcon /></span>
              <div><h3>HubSpot · Brightwater Medical</h3><p>→ Closed won · PDF attached <CheckDot size={18} /></p></div>
            </article>
            <article className="ik-card ik-file-card ik-file-card--chest">
              <span className="ik-line-icon"><FolderIcon /></span>
              <div><h3>Chest / Clients / Brightwater</h3>
                <ul>{['Service Agreement signed.pdf', 'W-9 Harborline.pdf', 'Certificate.pdf'].map(file => <li key={file}>{file}<CheckDot size={18} /></li>)}</ul>
              </div>
              <Cursor name="Rosa" className="ik-file-rosa" />
            </article>
          </div>
          <div className="ik-file-center">
            <Sparks className="ik-fl-spark ik-fl-spark--1" />
            <Sparks tone="blue" className="ik-fl-spark ik-fl-spark--2" />
            <SealedMascot className="ik-sealed" />
            <Sticky className="ik-file-sticky">Filed. Nobody chased anyone.</Sticky>
          </div>
          <div className="ik-file-col">
            <article className="ik-card ik-file-card">
              <span className="ik-line-icon"><MailIcon /></span>
              <div><h3>Completed copies · 4 of 4 sent <CheckDot size={18} /></h3>
                <p className="ik-avatars"><Avatar initials="AC" tone="green" /><Avatar initials="ME" tone="blue" /><Avatar initials="RD" tone="violet" /><Avatar initials="AP" tone="rose" /></p>
              </div>
            </article>
            <article className="ik-card ik-file-card">
              <span className="ik-line-icon"><CalendarIcon /></span>
              <div><h3>Next task · Jamal Price</h3><p>First clean · Mon Nov 2 · 3 clinics</p></div>
            </article>
            <article className="ik-card ik-file-card">
              <span className="ik-line-icon"><ChatIcon /></span>
              <div><h3>Nook #sales</h3><p>Brightwater Medical completed · $48,600</p></div>
              <Cursor name="Jamal" className="ik-file-jamal" />
            </article>
          </div>
        </div>
        <p className="ik-sr">All four parties got their completed copy <Tick /></p>
      </div>
    </section>
  )
}
