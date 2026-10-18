import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Bounce } from './sections/Bounce'
import { Bulk } from './sections/Bulk'
import { Closing } from './sections/Closing'
import { File } from './sections/File'
import { Hero } from './sections/Hero'
import { MoveIn } from './sections/MoveIn'
import { Overview } from './sections/Overview'
import { Prepare } from './sections/Prepare'
import { Remind } from './sections/Remind'
import { Route } from './sections/Route'
import { Seal } from './sections/Seal'
import { Sign } from './sections/Sign'
import { WebForm } from './sections/WebForm'
import '../styles/site.css'
import '../styles/cards.css'
import '../styles/landing.css'
import '../styles/landing-sections.css'
import '../styles/responsive.css'

/** The run site's homepage, the desk's page-s1 in order: one envelope at Harborline from the deal to the filing
 *  cabinet, then the same fortnight's reminders, bulk send and web form, the move from Docusign, and the closing. */
export function Landing() {
  return (
    <div className="ik-site ik-home">
      <SiteHeader />
      <main>
        <Hero />
        <Overview />
        <Prepare />
        <Route />
        <Bounce />
        <Sign />
        <Seal />
        <File />
        <Remind />
        <Bulk />
        <WebForm />
        <MoveIn />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
