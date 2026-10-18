import { Actions } from '../../shell/Actions'
import { MiniEnvelope, PaperPlane } from '../art/Doodles'
import { PeekMascot } from '../art/Mascot'
import { Heading, Sparks } from '../parts'

/** 13: the sign-off. The call to action, the checked envelopes riding down the left, the signed plane looping away, and
 *  the mark's character peeking over the footer rule. */
export function Closing() {
  return (
    <section className="ik-closing" aria-labelledby="closing-title">
      <div className="ik-closing-art" aria-hidden="true">
        <svg className="ik-closing-path" viewBox="0 0 300 820"><path d="M140 168C152 200 152 232 136 262M118 354C92 388 72 410 68 440M84 548C108 640 226 700 250 830" /></svg>
        <MiniEnvelope tone="white" className="ik-env-mini ik-env-mini--1" />
        <MiniEnvelope tone="blue" className="ik-env-mini ik-env-mini--2" />
        <MiniEnvelope tone="green" className="ik-env-mini ik-env-mini--3" />
        <Sparks tone="blue" className="ik-cl-spark ik-cl-spark--1" />
        <PaperPlane className="ik-plane" />
        <Sparks tone="blue" className="ik-cl-spark ik-cl-spark--2" />
        <Sparks className="ik-cl-spark ik-cl-spark--3" />
        <Sparks className="ik-cl-spark ik-cl-spark--4" />
      </div>
      <div className="ik-closing-copy">
        <Heading id="closing-title" first="Let the envelope" second="do the chasing." />
        <p className="ik-closing-sub">100% free and open source. MIT licensed.</p>
        <Actions demoLink={false} />
      </div>
      <div className="ik-peek">
        <PeekMascot className="ik-peek-mark" />
      </div>
    </section>
  )
}
