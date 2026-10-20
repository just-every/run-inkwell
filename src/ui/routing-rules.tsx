import { markField, maskedField, displayReferencedValue } from '../inkwell/business-fields'
import { useId } from 'react'
import type { RoutingRule } from '../inkwell/model'
import { copyPreview, routingPreview } from '../inkwell/routing'
import type { Field, Signer } from './types'

const operators: [RoutingRule['operator'], string][] = [
  ['equals', 'equals'], ['not_equals', 'does not equal'], ['greater_than', 'is greater than (USD)'],
  ['less_than', 'is less than (USD)'], ['at_least', 'is at least (USD)'], ['at_most', 'is at most (USD)'],
]

/** The rule stays editable until its recipient's turn is activated. Source validity is checked by shared routing. */
export function RoutingRuleEditor({ label, value, fields, disabled, copy, onChange }: { label: string; value?: RoutingRule; fields: Field[]; disabled?: boolean; copy?: boolean; onChange: (rule?: RoutingRule) => void }) {
  const hint = useId()
  const sources = fields.filter(field => !markField(field))
  return <fieldset disabled={disabled} className="iw-stack"><legend>Include {label}</legend>
    <label>Include when<select aria-label={`${label} include when`} aria-describedby={hint} value={value?.field ?? ''} onChange={event => onChange(event.target.value ? { field: event.target.value, operator: value?.operator ?? 'equals', value: value?.value ?? '' } : undefined)}>
      <option value="">{copy ? 'Always gets the copy' : 'Always included'}</option>
      {value && !sources.some(field => field.id === value.field) && <option value={value.field}>Missing source field</option>}
      {sources.map(field => <option key={field.id} value={field.id}>{field.label} · recipient {field.signer + 1} · page {field.page + 1}</option>)}
    </select></label>
    {value && <div className="iw-two"><label>Comparison<select aria-label={`${label} routing comparison`} value={value.operator} onChange={event => onChange({ ...value, operator: event.target.value as RoutingRule['operator'] })}>{operators.map(([operator, text]) => <option key={operator} value={operator}>{text}</option>)}</select></label>
      <label>Compare with<input aria-label={`${label} routing value`} type={fields.some(f => f.id === value.field && maskedField(f)) ? 'password' : 'text'} required maxLength={500} value={value.value} onChange={event => onChange({ ...value, value: event.target.value })} /></label></div>}
    <small id={hint} className="iw-muted">{copy ? 'Decided once at completion from locked prefills and every completed field. USD comparisons use exact amounts. If the answer is missing or hidden, the copy is still sent and the certificate says so.' : 'Use a locked sender/API prefill or a field completed by a recipient at a lower routing order. USD comparisons use exact amounts. Missing or hidden answers stop routing for correction.'}</small>
  </fieldset>
}

type PreviewSigner = Partial<Pick<Signer, 'values' | 'name' | 'order' | 'includeWhen' | 'routeResult' | 'activatedAt' | 'signedAt' | 'removedAt'>> & { role?: string; removed?: boolean }
type PreviewCopy = { name: string; email?: string; includeWhen?: RoutingRule; routeResult?: Signer['routeResult'] }
export function RoutingPreview({ signers, fields, copies = [] }: { signers: PreviewSigner[]; fields: Field[]; copies?: PreviewCopy[] }) {
  try {
    const preview = routingPreview(signers, fields).sort((a, b) => (signers[a.signer]?.order ?? a.signer + 1) - (signers[b.signer]?.order ?? b.signer + 1))
    const copyRows = copyPreview(copies, signers, fields).filter(row => copies[row.index].includeWhen)
    return <section className="iw-stack iw-callout" aria-label="Routing preview"><h3>Routing preview</h3>
      <p className="iw-muted">Locked values determine inclusion now. Conditional recipients wait for an earlier recipient’s answer; unresolved conditions require correction before their turn can proceed.</p>
      <ol className="iw-signers">{preview.map(row => {
        const signer = signers[row.signer]
        if (!signer || signer.removed || signer.removedAt) return null
        return <li key={row.signer}><span className="iw-order">{signer.order ?? row.signer + 1}</span><div><strong>{signer.name || signer.role || `Recipient ${row.signer + 1}`}</strong><small>{row.state === 'included' ? 'Included' : row.state === 'skipped' ? 'Skipped' : row.state === 'conditional' ? 'Conditional on an earlier answer' : 'Unresolved'} · {row.reason}</small>{signer.includeWhen && <small>{routingRuleText(signer.includeWhen, fields)}</small>}</div></li>
      })}</ol>
      {copyRows.length ? <ul className="iw-signers" aria-label="Copy recipients with a rule">{copyRows.map(row => <li key={row.index}><span className="iw-order" aria-hidden="true">·</span><div><strong>{copies[row.index].name || `Copy recipient ${row.index + 1}`}</strong><small>Copy {row.state === 'included' ? 'included' : row.state === 'skipped' ? 'skipped' : row.state === 'conditional' ? 'conditional on the final answers' : 'unresolved: copy sent'} · {row.reason}</small></div></li>)}</ul> : null}
    </section>
  } catch (error) {
    return <div className="iw-callout" role="alert"><h3>Routing preview unavailable</h3><p>{error instanceof Error ? error.message : 'Could not evaluate the routing conditions. Correct the rules before sending.'}</p></div>
  }
}

export function routingRuleText(rule: RoutingRule, fields: Field[]) {
  return `${fields.find(field => field.id === rule.field)?.label ?? 'Missing source field'} ${operators.find(([operator]) => operator === rule.operator)?.[1] ?? rule.operator} “${displayReferencedValue(fields, rule.field, rule.value)}”`
}
