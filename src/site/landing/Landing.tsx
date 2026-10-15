import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Agents } from './Agents'
import { Closing } from './Closing'
import { Free } from './Free'
import { Hero } from './Hero'
import { History } from './History'
import { Included } from './Included'
import { MoveIn } from './MoveIn'
import { Signers } from './Signers'
import { Verify } from './Verify'
import '../shell/styles.css'
import './styles.css'

/** The run site's homepage, in the order the style spec sets: hero, six sections, Also included, the closing band. */
export function Landing() {
  return (
    <div className="ik-site">
      <SiteHeader />
      <main>
        <Hero />
        <div className="ik-features">
          <Verify />
          <Free />
          <Signers />
          <History />
          <Agents />
          <MoveIn />
        </div>
        <Included />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
