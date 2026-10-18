import { EyeIcon, ClockIcon, SheetIcon } from '../icons'
import { CheckDot, Cursor, Eyebrow, Heading, Sparks, Sticky, Tick } from '../parts'

type Status = 'Signed' | 'Viewed' | 'Waiting'
const vendors: [string, Status, string][] = [
  ['Scioto Paper Supply', 'Signed', 'Tue Oct 6'],
  ['Maple Ridge Uniforms', 'Signed', 'Wed Oct 7'],
  ['Buckeye Floor Care', 'Signed', 'Fri Oct 9'],
  ['Olentangy Linen Service', 'Viewed', 'Wed Oct 14'],
  ['Central Ohio Chemical', 'Waiting', 'reminder Fri Oct 16'],
]
const statusIcon = { Signed: <Tick />, Viewed: <EyeIcon />, Waiting: <ClockIcon /> }

/** 10: vendor-renewals.csv checked row by row, then the batch: 57 of 64 signed after ten days. Cards on the left, copy on
 *  the right, so the three sections before the move-in no longer all put the copy first. */
export function Bulk() {
  return (
    <section className="ik-section ik-split ik-split--flip ik-bulk" aria-labelledby="bulk-title">
      <div className="ik-wrap ik-split-grid">
        <div className="ik-stage ik-bulk-stage">
          <article className="ik-card ik-preview">
            <header><span className="ik-doc-tile ik-doc-tile--sm"><SheetIcon /></span><div><h3><strong>Preview</strong> · vendor-renewals.csv</h3><p>64 rows</p></div></header>
            <ul>
              <li><i className="ik-dot-red" /><span><b>Row 12</b> · email missing @ → <em>fixed</em> <Tick /></span></li>
              <li><i className="ik-dot-red" /><span><b>Row 41</b> · email missing @ → <em>fixed</em> <Tick /></span></li>
            </ul>
            <p className="ik-ready"><CheckDot />64 of 64 ready</p>
          </article>
          <article className="ik-card ik-batch">
            <header className="ik-batch-head">
              <span className="ik-doc-tile ik-doc-tile--sm ik-doc-tile--slate"><SheetIcon /></span>
              <div><h3>2027 vendor renewals</h3><p>Vendor Agreement 2027 · sent Mon Oct 5, 10:02 am by Rosa Delgado</p></div>
            </header>
            <div className="ik-progress" role="img" aria-label="57 of 64 signed"><span style={{ width: `${(57 / 64) * 100}%` }} /></div>
            <p className="ik-batch-count"><b>57 signed</b> · 7 waiting <span>· as of Thu Oct 15, 8:30 am</span></p>
            <p className="ik-filters" aria-hidden="true"><span>All <b>64</b></span><span className="is-signed">Signed <b>57</b></span><span className="is-waiting">Waiting <b>7</b></span></p>
            <div className="ik-vendors" role="table" aria-label="Vendors">
              <div role="row" className="ik-vendors-head"><span role="columnheader">Vendor</span><span role="columnheader">Status</span><span role="columnheader">Updated</span></div>
              {vendors.map(([name, status, when]) => (
                <div role="row" key={name}><span role="cell">{name}</span><span role="cell"><span className={`ik-status ik-status--${status.toLowerCase()}`}>{statusIcon[status]}{status}</span></span><span role="cell">{when}</span></div>
              ))}
            </div>
            <p className="ik-show-all" aria-hidden="true">Show all 64 ›</p>
            <p className="ik-saved">Saved list · Vendors 2027</p>
            <Sticky className="ik-bulk-sticky">57 back in 10 days!</Sticky>
            <Cursor name="Rosa" className="ik-bulk-rosa" />
            <Sparks className="ik-bk-spark" />
          </article>
        </div>
        <div className="ik-copy">
          <Eyebrow>Bulk send · Oct 5 – 15</Eyebrow>
          <Heading id="bulk-title" first="64 renewals," second="one upload." />
          <p className="ik-body">Upload the vendor list once. Inkwell checks every row, sends 64 envelopes and tracks each one.</p>
        </div>
      </div>
    </section>
  )
}
