import { Actions } from '../../shell/Actions'
import { HeroMascot } from '../art/Mascot'
import { Qr } from '../art/Qr'
import { BuildingIcon, SheetIcon } from '../icons'
import { Cursor, Heading, Pill, Sparks, Sticky, Tick } from '../parts'

/** 01: the approved hero. Copy on the left; on the right the collage of the Brightwater envelope's week around the mascot. */
export function Hero() {
  return (
    <section className="ik-hero" aria-labelledby="hero-title">
      <div className="ik-hero-copy">
        <Heading level={1} id="hero-title" first="Send it once." second="Get it signed." />
        <p className="ik-hero-sub">Inkwell builds each envelope from your templates, routes every signer, sends the reminders, catches bounced emails and files the sealed record in your CRM.</p>
        <p className="ik-hero-alt">100% free, open source alternative to <strong>Docusign</strong>, <strong>Adobe Acrobat Sign</strong> and <strong>Dropbox Sign</strong></p>
        <Actions />
      </div>
      <div className="ik-hero-art">
        <svg className="ik-hero-links" viewBox="0 0 800 940" aria-hidden="true">
          <path d="M346 112C392 124 402 160 398 196M560 150C552 166 540 176 530 190M352 254C366 266 374 280 376 296M470 360C452 396 444 430 444 458M598 548C584 588 568 616 560 660M716 552C680 580 640 604 624 650M186 474C196 488 200 494 204 504M338 452C350 466 358 478 362 492M282 640C298 656 314 676 330 700M390 646L396 690M444 640L450 676" />
        </svg>
        <article className="ik-card ik-hc ik-hc--template">
          <span className="ik-doc-tile"><SheetIcon /></span>
          <div><h3>Service Agreement v3</h3><p>roles: Client, Finance Director, Company Signer</p></div>
        </article>
        <article className="ik-card ik-hc ik-hc--form">
          <div><h3>Website NDA form</h3><p>23 signed in October</p></div>
          <Qr className="ik-qr" />
        </article>
        <article className="ik-card ik-hc ik-hc--envelope">
          <header>
            <span className="ik-round-tile"><BuildingIcon /></span>
            <div><h3>Brightwater Medical</h3><p>Service Agreement + W-9</p><p className="ik-hc-money">$4,050/mo × 12 = $48,600</p><p className="ik-hc-small">sent Tue Oct 13, 9:12 am</p></div>
          </header>
          <ol className="ik-route-mini">
            <li><span className="ik-step ik-step--done">1</span><div><strong>Dr. Amy Chen</strong> · Client<span className="ik-green">signed Tue Oct 13 <Tick /></span></div></li>
            <li><span className="ik-step">2</span><div><strong>Mark Ellis</strong> · Finance Director<span>added by rule: over $10,000</span></div></li>
            <li><span className="ik-step">3</span><div><strong>Rosa Delgado</strong> · Company Signer</div></li>
          </ol>
        </article>
        <article className="ik-card ik-hc ik-hc--bounce">
          <Pill tone="red"><s>Bounced: mellis@brightwatermed.co</s></Pill>
          <p>→ corrected to .com · resent Wed Oct 14, 9:06 am <Tick /></p>
          <Pill tone="green"><strong>Mark Ellis signed on iPhone</strong> · Thu Oct 15, 11:20 am <Tick /></Pill>
        </article>
        <article className="ik-card ik-hc ik-hc--crm">
          <div className="ik-hc-crm-top"><span className="ik-brand-tile ik-brand-tile--orange" aria-hidden="true">H</span><p><strong>HubSpot</strong> · Brightwater Medical<span>→ Closed won · PDF attached <Tick /></span></p></div>
          <p className="ik-hc-crm-file">Filed to Chest / Clients / Brightwater <Tick /></p>
        </article>
        <article className="ik-card ik-hc ik-hc--cert">
          <svg className="ik-seal" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2l4.6 3.6 5.8-.6 2.2 5.4 5.4 2.2-.6 5.8L45 24l-3.6 4.6.6 5.8-5.4 2.2-2.2 5.4-5.8-.6L24 46l-4.6-3.6-5.8.6-2.2-5.4-5.4-2.2.6-5.8L3 24l3.6-4.6-.6-5.8 5.4-2.2 2.2-5.4 5.8.6z" /><path d="M15.5 24.5l5.5 5.5 11.5-12" /></svg>
          <div><h3>Certificate of completion</h3><p>3 of 3 signed</p><Pill tone="green">sealed PDF <Tick /></Pill><p>Thu Oct 15, 2:41 pm ET</p><p className="ik-mono">SHA-256 4f9a…c21e</p></div>
        </article>
        <HeroMascot className="ik-hero-mascot" />
        <Sticky className="ik-hero-sticky">Brightwater signed before Friday!</Sticky>
        <Cursor name="Jamal" className="ik-hero-jamal" />
        <Cursor name="Rosa" className="ik-hero-rosa" />
        <Sparks className="ik-hs ik-hs--1" />
        <Sparks tone="blue" className="ik-hs ik-hs--2" />
        <Sparks tone="blue" className="ik-hs ik-hs--3" />
        <Sparks className="ik-hs ik-hs--4" />
        <Sparks className="ik-hs ik-hs--5" />
        <Sparks className="ik-hs ik-hs--6" />
        <Sparks className="ik-hs ik-hs--7" />
        <span className="ik-sr">Dr. Amy Chen signed first, Mark Ellis was added by rule, and the sealed record was filed.</span>
      </div>
    </section>
  )
}
