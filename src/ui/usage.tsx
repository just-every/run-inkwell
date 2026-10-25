import { useEffect, useState } from 'react'
import { request, command } from './types'
import { ErrorNotice, useAction } from './feedback'
import type { usageView } from '../inkwell/usage'
type Usage = Awaited<ReturnType<typeof usageView>>
const usd = (micros: number) => (micros / 1_000_000).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })
export function UsageSettings() {
  const [data, setData] = useState<Usage>(), [cap, setCap] = useState(''), [reserve, setReserve] = useState('0'), [consent, setConsent] = useState(false)
  const action = useAction()
  async function load() { const next = await request<Usage>('/api/inkwell/usage'); setData(next); setCap(next.policy.capMicros === null ? '' : String(next.policy.capMicros / 1_000_000)); setReserve(String(next.policy.reserveMicros / 1_000_000)) }
  useEffect(() => { void action.run(load) }, [])
  return <section className="iw-panel iw-stack" aria-label="Usage and cost"><h2>Usage and cost</h2><ErrorNotice error={action.error} />
    {!data ? <p role="status">Loading usage…</p> : <>
      <p>{data.month} · UTC calendar month. Inkwell has no envelope quotas or seat fees.</p>
      <dl className="iw-account"><dt>Envelopes sent</dt><dd>{data.envelopesSent}</dd><dt>SMS attempts</dt><dd>{data.sms.attempts}</dd><dt>SMS provider-reported charges</dt><dd>{usd(data.sms.chargedMicros)} USD</dd><dt>SMS committed allowance</dt><dd>{usd(data.sms.committedMicros)} USD</dd><dt>Awaiting provider price</dt><dd>{data.sms.unpriced}</dd><dt>Monthly SMS cap</dt><dd>{data.policy.capMicros === null ? 'No cap' : usd(data.policy.capMicros) + ' USD'}</dd></dl>
      {data.sms.warning && <p role="status">{data.sms.stopped ? 'SMS stopped: the next allowance would exceed the monthly cap.' : 'SMS warning: at least 80% of the monthly cap is committed.'} Email verification continues for email recipients.</p>}
      <p>Allowances cover each network attempt, including uncertain results, and do not promise a final provider invoice. Unpriced attempts remain reserved. Historical SMS before usage tracking has no recorded cost. Identity checks and AI are not connected; storage and email billing are not measured here.</p>
      <form className="iw-stack" onSubmit={e => { e.preventDefault(); void action.run(async () => { await command('account.usage', { capUsd: cap === '' ? null : cap, reserveUsd: reserve, expectedVersion: data.policy.version, consent }); setConsent(false); await load() }) }}>
        <label>Monthly SMS cap in USD (blank for no cap)<input inputMode="decimal" value={cap} onChange={e => { setCap(e.target.value); setConsent(false) }} /></label>
        <label>SMS allowance per attempt in USD<input inputMode="decimal" value={reserve} onChange={e => { setReserve(e.target.value); setConsent(false) }} /></label>
        <label className="iw-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I approve this allowance, including provider fees, and the monthly cap.</label>
        <div className="iw-actions"><button disabled={action.busy || !consent}>Save usage settings</button><button type="button" disabled={action.busy} onClick={() => void action.run(load)}>Refresh usage</button></div>
      </form>
    </>}
  </section>
}
