import { displayFieldValue, displayReferencedValue } from '../inkwell/business-fields'
import { routingRuleText } from './routing-rules'
import { useId, useState } from 'react'
import { command, request, type Field } from './types'
import type { Role } from '../inkwell/templates'
import { ErrorNotice, useAction } from './feedback'

type Snapshot = { fields: Field[]; roles: Role[]; originalSha256: string }
type Proposal = {
  id: string
  templateVersion: number
  reasons: string[]
  changes: { before: Snapshot; after: Snapshot }
  examples: { id: string; title: string; eventHash: string; at: string }[]
}
type MaintenanceProps = { templateId: string; onPublished: () => Promise<void> }

function SnapshotReview({ label, snapshot }: { label: string; snapshot: Snapshot }) {
  return <section className="iw-stack" aria-label={label}>
    <h4>{label}</h4>
    <p><strong>Role routing</strong> · Roles with the same order sign at the same time.</p>
    {snapshot.roles.length ? <div role="list">{snapshot.roles.map((role, index) => <div role="listitem" key={index}>Role {index + 1}: {role.role} · routing order {role.order} · {role.linkOnly ? 'Link only' : 'Email code'}{role.accessCode ? ' + sender access code' : ''}{role.message && <p>Private invitation message: {role.message}</p>}{role.includeWhen && <p>Include when {routingRuleText(role.includeWhen, snapshot.fields)}</p>}</div>)}</div> : <p>No roles.</p>}
    <p><strong>Fields</strong> · Positions and dimensions are fractions of the PDF page.</p>
    {snapshot.fields.length ? <div role="list" className="iw-stack">{snapshot.fields.map(field => <div role="listitem" key={field.id}>
      <strong>{field.label}</strong> · {field.type}
      <p>Assigned to role {field.signer + 1}{snapshot.roles[field.signer] ? `: ${snapshot.roles[field.signer].role}` : ' (unassigned)'} · page {field.page + 1}</p>
      <p>Position: x {field.x}, y {field.y} · size: {field.width} × {field.height}</p>
      <p>{field.prefill ? <>Prefill: <q style={{ whiteSpace: 'pre-wrap' }}>{displayFieldValue(field, field.prefill.value)}</q> · source (reported by sender/API): {field.prefill.source}</> : 'No prefill.'} · {field.readOnly ? 'Read-only' : 'Editable'} · {field.required ?? field.type !== 'checkbox' ? 'Required' : 'Optional'}</p>
      {field.requiredWhen && <p>Required when field {field.requiredWhen.field} equals <q>{displayReferencedValue(snapshot.fields, field.requiredWhen.field, field.requiredWhen.equals)}</q>.</p>}
      {field.condition && <p>Shown when field {field.condition.field} equals <q>{displayReferencedValue(snapshot.fields, field.condition.field, field.condition.equals)}</q>.</p>}
      {field.calculation && <p>Calculation: {field.calculation.operation} of fields {field.calculation.fields.join(', ')}.</p>}
    </div>)}</div> : <p>No fields.</p>}
    <p><strong>PDF fingerprint (SHA-256)</strong><br /><span>{snapshot.originalSha256}</span></p>
  </section>
}

function ProposalReview({ proposal, busy, onPublish }: { proposal: Proposal; busy: boolean; onPublish: () => Promise<void> }) {
  const [reviewed, setReviewed] = useState(false)
  const headingId = useId()
  const lastExample = proposal.examples[proposal.examples.length - 1]
  const pdfChanged = proposal.changes.before.originalSha256 !== proposal.changes.after.originalSha256
  return <article className="iw-callout iw-stack" aria-labelledby={headingId}>
    <h3 id={headingId}>Suggested changes to version {proposal.templateVersion}</h3>
    <div role="list" aria-label="Reasons for this suggestion">{proposal.reasons.map((reason, index) => <div role="listitem" key={index}>{reason}</div>)}</div>
    <SnapshotReview label="Before" snapshot={proposal.changes.before} />
    <SnapshotReview label="After" snapshot={proposal.changes.after} />
    <p>{pdfChanged ? 'The PDF fingerprint changes.' : 'The PDF fingerprint is unchanged.'} {pdfChanged && lastExample && <a href={`/api/inkwell/envelopes/${encodeURIComponent(lastExample.id)}/artifacts/original`} target="_blank" rel="noopener noreferrer">Review suggested PDF (opens in a new tab)</a>}</p>
    <section className="iw-stack" aria-label="Supporting examples">
      <h4>Supporting examples</h4>
      <div role="list" className="iw-stack">{proposal.examples.map((example, index) => <div role="listitem" key={`${example.id}:${example.eventHash}:${index}`}>
        <a href={`/api/inkwell/envelopes/${encodeURIComponent(example.id)}/artifacts/audit`} target="_blank" rel="noopener noreferrer">{example.title} · audit evidence (opens in a new tab)</a>
        <p>Event hash: {example.eventHash}<br />Recorded at: <time dateTime={example.at}>{example.at}</time></p>
      </div>)}</div>
    </section>
    <form className="iw-stack" onSubmit={event => {
      event.preventDefault()
      if (!reviewed || busy) return
      setReviewed(false)
      void onPublish()
    }}>
      <label className="iw-check"><input type="checkbox" required checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />I reviewed the suggested changes, PDF fingerprint and supporting examples, and approve publishing this template version.</label>
      <div className="iw-actions"><button type="submit" className="iw-primary" disabled={busy || !reviewed}>Publish suggested version</button></div>
    </form>
  </article>
}

function MaintenanceReview({ templateId, onPublished }: MaintenanceProps) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [published, setPublished] = useState(false)
  const action = useAction()
  const regionId = useId()
  async function load() {
    const result = await request<{ proposals: Proposal[] }>(`/api/inkwell/templates/${encodeURIComponent(templateId)}/proposals`)
    setProposals(result.proposals)
    setRevision(current => current + 1)
  }
  return <section className="iw-stack" aria-label="Template suggestions" style={{ flexBasis: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
    <div className="iw-actions"><button type="button" disabled={action.busy} aria-controls={regionId} aria-expanded={proposals !== null} onClick={() => void action.run(load)}>Review template suggestions</button></div>
    <ErrorNotice error={action.error} />
    {published && <p role="status">Suggested template version published.</p>}
    <div id={regionId} className="iw-stack" aria-busy={action.busy}>
      {proposals?.length === 0 && <p role="status">No repeated changes suggest a new template version.</p>}
      {proposals?.map(proposal => <ProposalReview key={`${revision}:${proposal.id}`} proposal={proposal} busy={action.busy} onPublish={() => action.run(async () => {
        await command('template.apply_proposal', { id: templateId, proposalId: proposal.id, version: proposal.templateVersion })
        setPublished(true)
        setProposals(current => current?.filter(item => item.id !== proposal.id) ?? null)
        await onPublished()
        await load()
      })} />)}
    </div>
  </section>
}

// The parent renders maintenance only for the template maker.
export function TemplateMaintenance(props: MaintenanceProps) {
  return <MaintenanceReview key={props.templateId} {...props} />
}
