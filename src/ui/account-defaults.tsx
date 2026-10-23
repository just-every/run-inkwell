// DELIV-007: how completed copies reach every party, chosen by an owner or admin for the whole account. RECORD-005: how
// many years completed envelopes are kept.
import { useState } from 'react'
import { command, dateTime, type Retention, type Workspace } from './types'
import { ErrorNotice, useAction } from './feedback'

export function CompletedCopies({ settings, refresh }: { settings: NonNullable<Workspace['settings']>; refresh: () => Promise<void> }) {
  const [delivery, setDelivery] = useState(settings.completedCopies)
  const action = useAction()
  return <section className="iw-panel iw-stack"><h2>Completed copies</h2>
    <p className="iw-muted">When everyone has signed, each signer and copy recipient receives the executed PDF and certificate.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('account.completed_copies', { delivery }); await refresh() }) }}>
      <label className="iw-check"><input type="radio" name="completed-copies" checked={delivery === 'link'} onChange={() => setDelivery('link')} />A secure link; each person enters a code sent to their mailbox before downloading</label>
      <label className="iw-check"><input type="radio" name="completed-copies" checked={delivery === 'attachment'} onChange={() => setDelivery('attachment')} />Attached to the email; files over 10 MB together go as a secure link</label>
      <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy || delivery === settings.completedCopies}>{action.busy ? 'Saving…' : 'Save'}</button>
    </form>
  </section>
}

export function RetentionRule({ retention, refresh }: { retention: Retention; refresh: () => Promise<void> }) {
  const [years, setYears] = useState(retention.rule ? String(retention.rule.years) : '')
  const action = useAction(), chosen = years === '' ? null : Number(years)
  return <section className="iw-panel iw-stack"><h2>Retention</h2>
    <p className="iw-muted">Envelopes that have ended (completed, declined, voided or expired) are kept this many years, then permanently erased. Owners and admins are warned {retention.warningDays} days before; a legal hold keeps an envelope until it is lifted. Leave empty to keep everything.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('account.retention', { years: chosen }); await refresh() }) }}>
      <label>Years to keep ended envelopes<input type="number" inputMode="numeric" min={1} max={99} step={1} value={years} onChange={event => setYears(event.target.value)} /></label>
      <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy || chosen === (retention.rule?.years ?? null)}>{action.busy ? 'Saving…' : 'Save'}</button>
    </form>
    {retention.purged.length > 0 && <details><summary>Purged ({retention.purged.length})</summary><ul>{retention.purged.map(p => <li key={p.envelopeId}>{p.envelopeId} · {p.ended} {dateTime(p.endedAt)} · warned {dateTime(p.warnedAt)} · purged {dateTime(p.purgedAt)} under {p.years} years</li>)}</ul></details>}
  </section>
}

/** ADMIN-004: initial values for new envelopes and templates; existing records keep their own choices. */
export function EnvelopeDefaultsSettings({ defaults, refresh }: { defaults: import('./types').EnvelopeDefaults; refresh: () => Promise<void> }) {
  const [disclosureText, setDisclosureText] = useState(defaults.disclosureText ?? '')
  const [adoptionMethods, setAdoptionMethods] = useState<import('../inkwell/model').AdoptionMethod[]>(defaults.adoptionMethods ?? ['typed','drawn','uploaded'])
  const [authentication, setAuthentication] = useState(defaults.authentication ?? 'email')
  const [allowReassignment, setAllowReassignment] = useState(Boolean(defaults.allowReassignment))
  const [hideDocumentsWithoutFields,setHideDocumentsWithoutFields]=useState(Boolean(defaults.hideDocumentsWithoutFields))
  const [expiryDays, setExpiryDays] = useState(defaults.expiryDays), [remind, setRemind] = useState(Boolean(defaults.reminders))
  const [afterDays, setAfterDays] = useState(defaults.reminders?.afterDays ?? 2), [everyDays, setEveryDays] = useState(defaults.reminders?.everyDays ?? 2)
  const action = useAction()
  return <section className="iw-panel iw-stack" aria-label="Envelope defaults"><h2>Envelope defaults</h2>
    <p>New envelopes and templates start with these choices. A template or an envelope can override them; existing envelopes and saved templates keep their settings.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('account.envelope_defaults', { disclosureText, adoptionMethods, authentication, allowReassignment, hideDocumentsWithoutFields, expiryDays, reminders: remind ? { afterDays, everyDays } : null, expectedVersion: defaults.version }); await refresh() }) }}>
      <label>Additional consumer disclosure<textarea aria-label="Additional consumer disclosure" rows={5} maxLength={4000} value={disclosureText} disabled={action.busy} onChange={event => setDisclosureText(event.target.value)} /></label>
      <p>This text is added to the built-in electronic records disclosure; it cannot replace the paper-copy, withdrawal, contact or technical requirements. New drafts and templates keep this version through signing and export. Leave empty to use the built-in disclosure alone.</p>
      <fieldset className="iw-stack"><legend>Allowed signature adoption methods for new requests</legend>{(['typed','drawn','uploaded'] as const).map(method => <label className="iw-check" key={method}><input type="checkbox" checked={adoptionMethods.includes(method)} disabled={action.busy} onChange={event => setAdoptionMethods(current => event.target.checked ? [...current, method] : current.filter(m => m !== method))} />{method === 'typed' ? 'Typed name' : method === 'drawn' ? 'Drawn signature' : 'Uploaded signature'}</label>)}<p>Allow at least one method. Existing drafts and sent requests keep their choices. New requests from a saved template also obey these account limits.</p></fieldset>
      <label>Default recipient authentication<select value={authentication} disabled={action.busy} onChange={event => setAuthentication(event.target.value as 'email' | 'link')}><option value="email">Email code</option><option value="link">Link only</option></select></label>
      {authentication === 'link' && <p role="note">Anyone with an invitation link can sign as its recipient. New recipients start with this choice; the sender can choose a stronger method before sending. Link-only signing is refused until email delivery is configured.</p>}
      <label className="iw-check"><input type="checkbox" checked={allowReassignment} disabled={action.busy} onChange={event => setAllowReassignment(event.target.checked)} />Allow recipient reassignment by default</label>
      <label className="iw-check"><input type="checkbox" checked={hideDocumentsWithoutFields} disabled={action.busy} onChange={event=>setHideDocumentsWithoutFields(event.target.checked)}/>Hide documents without a recipient’s fields when saving new drafts or templates</label>
      <p>Document visibility is saved with each draft. This policy can only narrow the selected recipients; copies with no fields receive only the certificate. Sent envelopes keep their approved visibility.</p>
      <label>Default expiry (days)<input type="number" required min={1} max={365} step={1} value={expiryDays} disabled={action.busy} onChange={event => setExpiryDays(Number(event.target.value))} /></label>
      <label className="iw-check"><input type="checkbox" checked={remind} disabled={action.busy} onChange={event => setRemind(event.target.checked)} />Enable automatic reminders by default</label>
      {remind && <div className="iw-two"><label>Default first reminder (business days)<input type="number" required min={1} max={30} step={1} value={afterDays} disabled={action.busy} onChange={event => setAfterDays(Number(event.target.value))} /></label><label>Default repeat reminder (business days)<input type="number" required min={1} max={30} step={1} value={everyDays} disabled={action.busy} onChange={event => setEveryDays(Number(event.target.value))} /></label></div>}
      <p className="iw-muted">Business days are Monday to Friday, Eastern time; reminders go out from 9 am and stop once the recipient signs.</p>
      <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save envelope defaults'}</button>
    </form>
  </section>
}
