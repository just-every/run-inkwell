import { OrderedDocuments, uploadDocument, type DocumentFile } from './ordered-documents'
import { useEffect, useState, type FormEvent } from 'react'
import { command, fileBase64, request, type Envelope, type EnvelopeDefaults, type Field, type Signer } from './types'
import type { Template } from './templates'
import type { TemplateFolder } from './template-sharing'
import type { RoutingRule } from '../inkwell/model'
import { currentSigners } from './envelope-view'
import { RoutingRuleEditor, RoutingPreview } from './routing-rules'
import { RuleFields, ruleDraft, ruleInput } from './internal-approval'
import { GroupChoice, groupSummary, useSigningGroups } from './signing-groups'

// IDV-003: an optional access code per recipient, shared out of band and entered before the document opens.
// ROUTE-002: each recipient's routing order; recipients who share a number sign at the same time.
// PREP-009: a private message per recipient; `keep` holds an access code already set on a saved draft.
// DELIV-006: when correcting a sent envelope, `locked` marks a recipient who has acted (fixed for good) and `removed` one
// the correction takes off; both keep their place so every field and audit event still names the right recipient.
// TMPL-001: in a template a recipient is a role: `name` is the role's name, there is no email, and `needsCode` asks the
// sender for that person's access code at each send.
// TMPL-005: `role` names the template role a recipient fills after a matching template is applied.
// ROUTE-005: `group` is the signing group's ID when a group fills the place; `groupLabel` describes its members.
type Recipient = { group?: string; groupLabel?: string; values?: Signer['values']; routeResult?: Signer['routeResult']; signedAt?: string; activatedAt?: string; removedAt?: string; includeWhen?: RoutingRule; routingLocked?: boolean; name: string; email: string; accessCode: string; order: number; keep?: boolean; message?: string; locked?: string; removed?: boolean; existing?: boolean; needsCode?: boolean; role?: string; linkOnly?: boolean; inPerson?: boolean }
// DELIV-007 / ROUTE-001: people who only receive the completed copy, with no action link.
type Copy = { name: string; email: string; includeWhen?: RoutingRule }
import { ErrorNotice, useAction } from './feedback'
import { FieldEditor } from './field-editor'
import { Icon } from './icons'
import { ContactPicker, type Contact } from './contacts'
import { TemplateOffer, findMatches, offeredTemplate, type Match } from './template-offer'

/** A new envelope, or with `draft` a saved draft reopened with everything editable until it is approved (PREP-009), or
 * with `correcting` a sent envelope corrected in flight (DELIV-006): the PDF and title stay fixed, recipients who have
 * acted and their fields are locked, and only what the correction changes is sent. With `asTemplate` it saves a template
 * (TMPL-001): roles in place of people, and no copy recipients; with `template` too it saves that template's next
 * version (TMPL-003). A template is saved with its tags and in a folder this person may edit (TMPL-002). */
export function PrepareEnvelope({ draft, correcting, asTemplate, template, folders = [], defaultFolder = '', onSaved, onCancel }: { draft?: Envelope; correcting?: Envelope; asTemplate?: boolean; template?: Template; folders?: TemplateFolder[]; defaultFolder?: string; onSaved: (id: string) => Promise<void>; onCancel: () => void }) {
  const [documents,setDocuments]=useState<DocumentFile[]>([])
  const [matchingDocument,setMatchingDocument]=useState<string>()
  const [freeForm, setFreeForm] = useState(Boolean(draft?.freeForm || correcting?.freeForm))
  const [freeFormAllowed, setFreeFormAllowed] = useState(false)
  const [tags, setTags] = useState(template?.tags?.join(', ') ?? '')
  // ROUTE-004: the template's internal approval rule.
  const [approval, setApproval] = useState(ruleDraft(template?.approval))
  const [folderId, setFolderId] = useState(template ? template.folder?.id ?? '' : defaultFolder)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('')
  const [expiryDays, setExpiryDays] = useState(120)
  const [expiryChanged, setExpiryChanged] = useState(false)
  const [allowPaper, setAllowPaper] = useState(false)
  // ROUTE-006: recipients may reassign their signing to someone else only when the sender allows it.
  const [allowReassign, setAllowReassign] = useState(false)
  // DELIV-003: optional reminders in business days, first after the invitation, then repeating.
  const [remind, setRemind] = useState(false)
  const [afterDays, setAfterDays] = useState(2)
  const [everyDays, setEveryDays] = useState(2)
  const [file, setFile] = useState<File>()
  const [pdf, setPdf] = useState<Uint8Array>()
  const [signers, setSigners] = useState<Recipient[]>([{ name: '', email: '', accessCode: '', order: 1 }, { name: '', email: '', accessCode: '', order: 2 }])
  const [copies, setCopies] = useState<Copy[]>([])
  const [fields, setFields] = useState<Field[]>([])
  // PREP-007: how many fields the uploaded document carried itself (text tags and PDF form fields) and placed here.
  const [carried, setCarried] = useState(0)
  const [signer, setSigner] = useState(0)
  const [matches, setMatches] = useState<Match[]>([])
  const action = useAction()
  const groups = useSigningGroups()
  const source = draft ?? correcting
  useEffect(() => { void action.run(async () => { const [result, settings] = await Promise.all([request<{ policy: { enabled: boolean } }>('/api/inkwell/freeform-policy'), request<{ defaults: EnvelopeDefaults }>('/api/inkwell/envelope-defaults')]); setFreeFormAllowed(result.policy.enabled); if (!source && !template) { setExpiryDays(settings.defaults.expiryDays); setRemind(Boolean(settings.defaults.reminders)); setAfterDays(settings.defaults.reminders?.afterDays ?? 2); setEveryDays(settings.defaults.reminders?.everyDays ?? 2) } }) }, [])
  useEffect(() => {
    if (!template) return
    void action.run(async () => {
      const response = await fetch(`/api/inkwell/templates/${encodeURIComponent(template.id)}/document`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('Could not load the template’s PDF.')
      const bytes = new Uint8Array(await response.arrayBuffer())
      setFile(new File([bytes], template.filename, { type: 'application/pdf' })); setPdf(bytes); setTitle(template.title)
      setSigners(template.roles.map(role => ({ name: role.role, email: '', accessCode: '', order: role.order, needsCode: Boolean(role.accessCode), linkOnly: Boolean(role.linkOnly), includeWhen: role.includeWhen, message: role.message ?? '' })))
      if(template.documents) setDocuments(await Promise.all(template.documents.map(async(d,i)=>{const response=await fetch(`/api/inkwell/templates/${template.id}/documents/${i}`,{credentials:'same-origin'});if(!response.ok)throw new Error('Could not load a template document.');return{key:crypto.randomUUID(),file:new File([await response.blob()],d.filename,{type:'application/pdf'}),mode:d.mode,pages:d.pages,visibleTo:d.visibleTo}})))
      setFields(template.fields); setAllowPaper(Boolean(template.allowPaper)); setAllowReassign(Boolean(template.allowReassign)); setSubject(template.subject ?? ''); setMessage(template.message ?? ''); setExpiryDays(template.expiryDays)
      setRemind(Boolean(template.reminders)); if (template.reminders) { setRemind(true); setAfterDays(template.reminders.afterDays); setEveryDays(template.reminders.everyDays) }
    })
  }, [template?.id])
  useEffect(() => {
    if (!source) return
    const draft = source
    void action.run(async () => {
      const response = await fetch(`/api/inkwell/envelopes/${encodeURIComponent(draft.id)}/artifacts/original`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('Could not load the draft’s PDF.')
      const bytes = new Uint8Array(await response.arrayBuffer())
      setFile(new File([bytes], draft.filename ?? 'document.pdf', { type: 'application/pdf' })); setPdf(bytes); setTitle(draft.title)
      setSigners(draft.signers.map((signer, index) => ({ name: signer.name, email: signer.group ? '' : signer.email, ...(signer.group ? { group: signer.group.id, groupLabel: groupSummary(signer.group) } : {}), accessCode: '', order: signer.order ?? index + 1, keep: Boolean(signer.accessCode), linkOnly: Boolean(signer.linkOnly), inPerson: Boolean(signer.inPerson), message: signer.message ?? '', includeWhen: signer.includeWhen, ...(correcting ? { values: signer.values, routeResult: signer.routeResult, signedAt: signer.signedAt, activatedAt: signer.activatedAt, removedAt: signer.removedAt } : {}), routingLocked: Boolean(correcting && (signer.activatedAt || signer.signedAt || signer.removedAt || signer.routeResult?.state === 'skipped' || currentSigners(draft).includes(index))), ...(correcting ? { existing: true, ...(signer.removedAt ? { removed: true } : {}), ...(signer.routeResult?.state === 'skipped' ? { locked: 'Skipped' } : signer.signedAt ? { locked: 'Signed' } : signer.paper?.status === 'pending' ? { locked: 'Signed on paper' } : {}) } : {}) })))
      if (correcting) setSigner(Math.max(0, draft.signers.findIndex(signer => !signer.signedAt && !signer.removedAt && signer.routeResult?.state !== 'skipped' && signer.paper?.status !== 'pending')))
      if(draft.documents) setDocuments(await Promise.all(draft.documents.map(async(d,i)=>{const response=await fetch(`/api/inkwell/envelopes/${draft.id}/artifacts/document-${i}`,{credentials:'same-origin'});if(!response.ok)throw new Error('Could not load a draft document.');return{key:crypto.randomUUID(),file:new File([await response.blob()],d.filename,{type:'application/pdf'}),mode:d.mode,pages:d.pages,visibleTo:d.visibleTo}})))
      setFreeForm(Boolean(draft.freeForm)); setFields(draft.fields); setCopies((draft.copies ?? []).map(({ name, email, includeWhen }) => ({ name, email, ...(includeWhen ? { includeWhen } : {}) }))); setAllowPaper(Boolean(draft.allowPaper)); setAllowReassign(Boolean(draft.allowReassign)); setSubject(draft.subject ?? ''); setMessage(draft.message ?? '')
      setExpiryDays(Math.min(365, Math.max(1, Math.round((Date.parse(draft.expiresAt) - Date.now()) / 86_400_000))))
      if (draft.reminders) { setRemind(true); setAfterDays(draft.reminders.afterDays); setEveryDays(draft.reminders.everyDays) }
    })
  }, [source?.id])
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      if (!file || !pdf) throw new Error('Choose a PDF before saving.')
      const documentInput=documents.length?{documents:await Promise.all(documents.map(async d=>({uploadId:await uploadDocument(d.file),mode:d.mode,...(d.visibleTo?{visibleTo:d.visibleTo}:{})})))}:{}
      if (!freeForm && signers.some((recipient, index) => !recipient.removed && !fields.some(field => field.signer === index && field.type === 'signature'))) throw new Error('Place at least one signature field for every recipient.')
      if (correcting) {
        const correction = { id: correcting.id, signers: signers.map(({ group, name, email, order, accessCode, linkOnly, inPerson, includeWhen, message: note, removed }) => removed ? { remove: true } : group ? { group } : { name, email, order, includeWhen: includeWhen ?? null, message: note ?? '', ...(linkOnly ? { linkOnly: true } : {}), inPerson: Boolean(inPerson), ...(accessCode ? { accessCode } : {}) }), fields, copies, subject, message, ...(expiryChanged ? { expiresAt: new Date(Date.now() + expiryDays * 86_400_000).toISOString() } : {}) }
        await command('envelope.correct', correction)
        return onSaved(correcting.id)
      }
      if (asTemplate) {
        const saved = await command<{ id: string }>(template ? 'template.update' : 'template.save', { ...(template ? { id: template.id } : {}), ...documentInput, title, filename: file.name, ...(documents.length?{}:{pdfBase64:await fileBase64(file)}), roles: signers.map(({ name, order, needsCode, linkOnly, includeWhen, message: note }) => ({ role: name, order, ...(includeWhen ? { includeWhen } : {}), ...(needsCode ? { accessCode: true } : {}), ...(linkOnly ? { linkOnly: true } : {}), ...(note?.trim() ? { message: note } : {}) })), fields, ...(subject.trim() ? { subject } : {}), ...(message.trim() ? { message } : {}), expiryDays, ...(allowPaper ? { allowPaperSigning: true } : {}), ...(allowReassign ? { allowReassignment: true } : {}), reminders: remind ? { afterDays, everyDays } : null, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean), folderId: folderId || null, approval: ruleInput(approval) })
        return onSaved(saved.id)
      }
      const input = { ...(freeForm ? { freeForm: true } : {}), ...documentInput, title, filename: file.name, ...(documents.length?{}:{pdfBase64:await fileBase64(file)}), signers: signers.map(({ accessCode, keep, message: note, role: _role, needsCode: _needsCode, routingLocked: _routingLocked, values: _values, routeResult: _routeResult, signedAt: _signedAt, activatedAt: _activatedAt, removedAt: _removedAt, linkOnly, group, groupLabel: _label, ...recipient }) => ({ ...(group ? { group, order: recipient.order, ...(recipient.includeWhen ? { includeWhen: recipient.includeWhen } : {}) } : recipient), ...(linkOnly ? { linkOnly: true } : {}), ...(accessCode ? { accessCode } : keep ? { keepAccessCode: true } : {}), ...(note?.trim() ? { message: note } : {}) })), fields, ...(subject.trim() ? { subject } : {}), ...(message.trim() ? { message } : {}), expiresAt: new Date(Date.now() + expiryDays * 86_400_000).toISOString(), ...(copies.length ? { copies } : {}), ...(allowPaper ? { allowPaperSigning: true } : {}), ...(allowReassign ? { allowReassignment: true } : {}), reminders: remind ? { afterDays, everyDays } : null }
      const result = draft ? await command<{ id: string }>('envelope.update', { id: draft.id, ...input }) : await command<{ id: string }>('envelope.prepare', input)
      await onSaved(result.id)
    })
  }
  // ROUTE-008: a picked contact fills the first empty recipient (or a new one), or joins the copy recipients.
  function pick(contact: Contact, as: 'signer' | 'copy') {
    const person = { name: contact.name, email: contact.email }
    if (as === 'copy') { action.setError(copies.length >= 20 ? 'An envelope has at most 20 copy recipients.' : ''); if (copies.length < 20) setCopies(current => [...current, person]); return }
    const empty = signers.findIndex(recipient => !recipient.name.trim() && !recipient.email.trim())
    if (empty >= 0) { setSigners(current => current.map((recipient, i) => i === empty ? { ...recipient, ...person } : recipient)); return }
    action.setError(signers.length >= 5 ? 'An envelope has at most five signers.' : '')
    if (signers.length < 5) setSigners(current => [...current, { ...person, accessCode: '', order: Math.max(...current.map(recipient => recipient.order)) + 1 }])
  }
  // TMPL-005: applying a matching template sets one recipient per role, in its routing order with its private message
  // and access-code need, keeping any name and email already typed in that place, and places every template field.
  async function applyTemplate(id: string) {
    const template = await offeredTemplate(id),matched=matches.find(m=>m.template.id===id)?.template.document,source=matched===undefined?undefined:template.documents?.[matched],matchedFields=source?template.fields.filter(f=>f.page>=source.pageStart&&f.page<source.pageStart+source.pages).map(f=>({...f,page:f.page-source.pageStart})):template.fields
    setSigners(current => template.roles.map((role, index) => ({ name: current[index]?.name ?? '', email: current[index]?.email ?? '', accessCode: '', order: role.order, role: role.role, needsCode: Boolean(role.accessCode), linkOnly: Boolean(role.linkOnly), includeWhen: role.includeWhen, message: role.message ?? '' })))
    const index=documents.findIndex(d=>d.key===matchingDocument),start=index<0?0:documents.slice(0,index).reduce((n,d)=>n+d.pages,0),end=index<0?Infinity:start+documents[index].pages
    setFields(current=>[...(index<0?[]:current.filter(f=>f.page<start||f.page>=end)),...matchedFields.map(field=>({...field,id:index<0?field.id:`d${index}-${field.id}`,page:field.page+start,document:undefined,documentPage:undefined}))]);setSigner(0);setMatches([])
  }
  async function changeDocuments(next:DocumentFile[]) {
    if(next.length>20||next.reduce((n,d)=>n+d.file.size,0)>100*1024*1024)throw new Error('Use at most 20 PDFs and 100 MiB in total.')
    const {PDFDocument}=await import('pdf-lib'),combined=await PDFDocument.create()
    const old=documents.length?documents:file?[{key:'primary',file,mode:'sign' as const,pages:(await PDFDocument.load(pdf!)).getPageCount()}]:[]
    const oldStarts=old.map((_,i)=>old.slice(0,i).reduce((n,d)=>n+d.pages,0)),starts=next.map((_,i)=>next.slice(0,i).reduce((n,d)=>n+d.pages,0))
    for(const d of next){const source=await PDFDocument.load(await d.file.arrayBuffer());for(const page of await combined.copyPages(source,source.getPageIndices()))combined.addPage(page)}
    const bytes=new Uint8Array(await combined.save());setDocuments(next);setPdf(bytes);setFile(new File([bytes],'combined.pdf',{type:'application/pdf'}))
    setFields(current=>current.flatMap(f=>{const before=old.findIndex((d,i)=>f.page>=oldStarts[i]&&f.page<oldStarts[i]+d.pages),after=next.findIndex(d=>d.key===old[before]?.key);return after<0||next[after].mode==='view'?[]:[{...f,page:starts[after]+f.page-oldStarts[before],document:undefined,documentPage:undefined,...(next[after].mode==='optional'?{required:false}:{})}]}))
  }
  async function addDocument(selected:File) {
    const {PDFDocument}=await import('pdf-lib'),source=await PDFDocument.load(await selected.arrayBuffer()),key=crypto.randomUUID(),primary=documents.length?documents:[{key:'primary',file:file!,mode:'sign' as const,pages:(await PDFDocument.load(pdf!)).getPageCount()}]
    await changeDocuments([...primary,{key,file:selected,mode:'sign',pages:source.getPageCount()}]);setMatchingDocument(key)
    if(!freeForm)setMatches(await findMatches(selected.size>2*1024*1024?{uploadId:await uploadDocument(selected)}:{pdfBase64:await fileBase64(selected)}))
  }
  function updateSigner(index: number, key: keyof Recipient, value: string | number) { setSigners(current => current.map((recipient, i) => i === index ? { ...recipient, [key]: value } : recipient)) }
  return <section className="iw-panel iw-prepare"><div className="iw-section-head"><div><h1>{template ? 'Edit template' : asTemplate ? 'New template' : correcting ? 'Correct envelope' : draft ? 'Edit draft' : 'Prepare an envelope'}</h1><p>{asTemplate ? 'Upload the PDF, name each role in routing order, then place fields. Sending from it asks only for each role’s person.' : correcting ? 'Signatures already given stay. A corrected or removed recipient’s old link stops working; whoever’s turn it is gets a new invitation.' : 'Upload the final PDF, set the routing order, then place fields.'}</p></div><button type="button" onClick={onCancel} disabled={action.busy}>Cancel</button></div>
    <form onSubmit={submit} className="iw-stack">
      <div className="iw-two"><label>{asTemplate ? 'Template name' : 'Envelope title'}<input required maxLength={200} disabled={Boolean(correcting)} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Fixed PDF document<input type="file" required={!file} hidden={Boolean(correcting)} accept="application/pdf,.pdf" disabled={action.busy} onChange={event => { const selected = event.target.files?.[0]; setFile(undefined); setPdf(undefined); setDocuments([]);setMatchingDocument(undefined); setFields([]); setMatches([]); setCarried(0); if (selected) void action.run(async () => { const bytes = new Uint8Array(await selected.arrayBuffer()), uploadInput=selected.size>2*1024*1024?{uploadId:await uploadDocument(selected)}:{pdfBase64:await fileBase64(selected)}; setFile(selected); setPdf(bytes);{const {PDFDocument}=await import('pdf-lib');setDocuments([{key:'primary',file:selected,mode:'sign',pages:(await PDFDocument.load(bytes)).getPageCount()}])} if (!title) setTitle(selected.name.replace(/\.pdf$/i, '')); const found = (await request<{ fields: Field[] }>('/api/inkwell/documents/fields', uploadInput)).fields; if (found.length) { const needed = Math.min(5, Math.max(...found.map(field => field.signer)) + 1); if (!freeForm) setFields(found); setSigners(current => current.length >= needed ? current : [...current, ...Array.from({ length: needed - current.length }, (_, k) => ({ name: '', email: '', accessCode: '', order: current.length + k + 1 }))]) } setCarried(freeForm ? 0 : found.length); if (!asTemplate && !freeForm) setMatches(await findMatches(uploadInput)) }) }} /></label></div>
      {file&&pdf&&!correcting&&<OrderedDocuments signers={signers} copies={copies} documents={documents} busy={action.busy} onChange={next=>void action.run(()=>changeDocuments(next))} onAdd={selected=>void action.run(()=>addDocument(selected))}/>}
      {carried > 0 && <p className="iw-muted" role="status">Placed {carried} {carried === 1 ? 'field' : 'fields'} from the document’s own text tags and form fields. Check each one below; you can move, change or remove any of them.</p>}
      {matches.length > 0 && <TemplateOffer matches={matches} busy={action.busy} onApply={id => void action.run(() => applyTemplate(id))} onIgnore={() => setMatches([])} />}
      <fieldset disabled={action.busy}><legend>{asTemplate ? 'Roles' : 'Recipients'} <span>· in routing order; the same number signs at the same time</span></legend><div className="iw-stack">{!asTemplate && <ContactPicker onPick={pick} />}{signers.map((recipient, index) => recipient.removed ? null : <div key={index} className="iw-recipient"><input className="iw-order" disabled={Boolean(recipient.locked)} aria-label={`Recipient ${index + 1} routing order`} type="number" required min={1} max={100} step={1} value={recipient.order} onChange={event => updateSigner(index, 'order', Math.round(Number(event.target.value)))} />{!asTemplate && <GroupChoice label={`Recipient ${index + 1}`} groups={groups} value={recipient.group} disabled={Boolean(recipient.locked || recipient.existing && correcting)} onChange={group => setSigners(current => current.map((r, k) => k === index ? group ? { ...r, group: group.id, groupLabel: groupSummary(group), name: group.name, email: '', accessCode: '', keep: false, inPerson: false } : { ...r, group: undefined, groupLabel: undefined, name: '', email: '' } : r))} />}{recipient.group ? <span className="iw-muted">{recipient.groupLabel}</span> : <label><span className="iw-sr">Name</span><input aria-label={`${asTemplate ? 'Role' : 'Recipient'} ${index + 1} name`} disabled={Boolean(recipient.locked)} placeholder={asTemplate ? 'Role, for example Client' : recipient.role ? `${recipient.role}: full name` : 'Full name'} required value={recipient.name} maxLength={160} onChange={event => updateSigner(index, 'name', event.target.value)} /></label>}{asTemplate ? <label className="iw-check"><input type="checkbox" aria-label={`Role ${index + 1} needs an access code`} checked={Boolean(recipient.needsCode)} onChange={event => setSigners(current => current.map((r, i) => i === index ? { ...r, needsCode: event.target.checked } : r))} />Access code at each send</label> : recipient.group ? null : <><label><span className="iw-sr">Email</span><input aria-label={`Recipient ${index + 1} email`} disabled={Boolean(recipient.locked)} placeholder="Email" type="email" required value={recipient.email} onChange={event => updateSigner(index, 'email', event.target.value)} /></label><label><span className="iw-sr">Access code</span><input aria-label={`Recipient ${index + 1} access code`} disabled={Boolean(recipient.locked)} required={recipient.needsCode} placeholder={recipient.keep ? 'Keep current code' : 'Access code'} autoComplete="off" pattern="\S{4,32}" title="4–32 characters, no spaces" maxLength={32} value={recipient.accessCode} onChange={event => updateSigner(index, 'accessCode', event.target.value)} /></label></>}<label style={recipient.inPerson ? { gridColumn: '2 / -1' } : undefined}><span className="iw-sr">Authentication</span><select aria-label={`${asTemplate ? 'Role' : 'Recipient'} ${index + 1} authentication`} disabled={Boolean(recipient.locked)} value={recipient.inPerson ? 'person' : recipient.linkOnly ? 'link' : 'email'} onChange={event => setSigners(current => current.map((r, i) => i === index ? { ...r, linkOnly: event.target.value === 'link', inPerson: event.target.value === 'person' } : r))}><option value="email">Email code</option><option value="link">Link only</option>{!asTemplate && !recipient.group && <option value="person">In person (host attests)</option>}</select></label>{recipient.inPerson && <span className="iw-muted" style={{ gridColumn: '1 / -1' }}>In person · a host must confirm their identity; no signing invitation is emailed.</span>}{recipient.linkOnly && !recipient.locked && <span className="iw-muted" role="note">Anyone with this link can sign as {recipient.name || (asTemplate ? 'this role' : 'this recipient')}.</span>}{recipient.locked && <span className="iw-muted">{recipient.locked} · cannot change</span>}{signers.filter(r => !r.removed).length > 1 && !recipient.locked && <button className="iw-text-button" type="button" aria-label={`Remove recipient ${index + 1}`} onClick={() => { if (recipient.existing) { setSigners(current => current.map((r, i) => i === index ? { ...r, removed: true } : r)); setFields(current => current.filter(field => field.signer !== index)); return } setDocuments(current=>current.map(d=>({...d,...(d.visibleTo?{visibleTo:{...d.visibleTo,signers:d.visibleTo.signers.filter(n=>n!==index).map(n=>n>index?n-1:n)}}:{})}))); setSigners(current => current.filter((_, i) => i !== index)); setFields(current => current.filter(field => field.signer !== index).map(field => ({ ...field, signer: field.signer > index ? field.signer - 1 : field.signer }))); setSigner(0) }}>Remove</button>}</div>)}{signers.filter(r => !r.removed).length < 5 && signers.length < 10 && <button className="iw-fit" type="button" onClick={() => setSigners(current => [...current, { name: '', email: '', accessCode: '', order: Math.max(...current.map(recipient => recipient.order)) + 1 }])}>{asTemplate ? 'Add role' : 'Add recipient'}</button>}</div></fieldset>
      {asTemplate && <div className="iw-two"><label>Tags<input placeholder="Comma-separated, for example W-9, vendors" value={tags} onChange={event => setTags(event.target.value)} /></label><label>Template folder<select value={folderId} disabled={Boolean(template && template.access !== 'manage')} onChange={event => setFolderId(event.target.value)}><option value="">My templates</option>{template?.folder && !folders.some(f => f.id === template.folder?.id) && <option value={template.folder.id}>{template.folder.name}</option>}{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>}
      {asTemplate && <RuleFields legend="Internal approval" value={approval} onChange={setApproval} />}
      {!asTemplate && <fieldset disabled={action.busy}><legend>Receive a copy <span>· the executed PDF and certificate when everyone has signed</span></legend><div className="iw-stack">{copies.map((copy, index) => <div key={index} className="iw-recipient"><span className="iw-order" aria-hidden="true"><Icon name="envelope" /></span><label><span className="iw-sr">Name</span><input aria-label={`Copy recipient ${index + 1} name`} placeholder="Full name" required value={copy.name} maxLength={100} onChange={event => setCopies(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label><span className="iw-sr">Email</span><input aria-label={`Copy recipient ${index + 1} email`} placeholder="Email" type="email" required value={copy.email} onChange={event => setCopies(current => current.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></label><button className="iw-text-button" type="button" aria-label={`Remove copy recipient ${index + 1}`} onClick={() => {setDocuments(current=>current.map(d=>({...d,...(d.visibleTo?{visibleTo:{...d.visibleTo,copies:d.visibleTo.copies.filter(n=>n!==index).map(n=>n>index?n-1:n)}}:{})})));setCopies(current => current.filter((_, i) => i !== index))}}>Remove</button><RoutingRuleEditor copy label={`Copy recipient ${index + 1}${copy.name ? `: ${copy.name}` : ''}`} value={copy.includeWhen} fields={fields} onChange={includeWhen => setCopies(current => current.map((item, i) => i === index ? { name: item.name, email: item.email, ...(includeWhen ? { includeWhen } : {}) } : item))} /></div>)}{copies.length < 20 && <button className="iw-fit" type="button" onClick={() => setCopies(current => [...current, { name: '', email: '' }])}>Add copy recipient</button>}</div></fieldset>}
      <fieldset disabled={action.busy}><legend>Message <span>· in each invitation; a private message goes only to its recipient</span></legend><div className="iw-stack"><label>Email subject<input maxLength={200} placeholder={`Please sign: ${title || 'your document'}`} value={subject} onChange={event => setSubject(event.target.value)} /></label><label>Message to everyone<textarea maxLength={2000} rows={3} value={message} onChange={event => setMessage(event.target.value)} /></label>{signers.map((recipient, index) => recipient.removed ? null : <label key={index}>Private message for {recipient.name || `recipient ${index + 1}`}<textarea maxLength={1000} rows={2} disabled={Boolean(recipient.locked)} value={recipient.message ?? ''} onChange={event => updateSigner(index, 'message', event.target.value)} /></label>)}</div></fieldset>
      <label className="iw-fit">Expires after (days)<input type="number" required min={1} max={365} step={1} disabled={action.busy} value={expiryDays} onChange={event => { setExpiryChanged(true); setExpiryDays(Math.round(Number(event.target.value))) }} /><small className="iw-muted">Recipients and you are warned three days before. You can extend it later.</small></label>
      {!correcting && <><label className="iw-check"><input type="checkbox" disabled={action.busy} checked={allowPaper} onChange={event => setAllowPaper(event.target.checked)} />Allow recipients to sign on paper and upload a scan for you to review</label>
      <label className="iw-check"><input type="checkbox" disabled={action.busy} checked={allowReassign} onChange={event => setAllowReassign(event.target.checked)} />Allow recipients to reassign their signing to someone else, with a reason</label>
      <label className="iw-check"><input type="checkbox" disabled={action.busy} checked={remind} onChange={event => setRemind(event.target.checked)} />Remind the recipients whose turn it is by email</label>
      {remind && <div className="iw-two"><label>First reminder after (business days)<input type="number" required min={1} max={30} step={1} disabled={action.busy} value={afterDays} onChange={event => setAfterDays(Math.round(Number(event.target.value)))} /></label><label>Then every (business days)<input type="number" required min={1} max={30} step={1} disabled={action.busy} value={everyDays} onChange={event => setEveryDays(Math.round(Number(event.target.value)))} /></label><small className="iw-muted">Business days are Monday to Friday, Eastern time; reminders go out from 9 am and stop once they sign.</small></div>}</>}
      {!asTemplate && !correcting && <div className="iw-stack"><label className="iw-check"><input type="checkbox" checked={freeForm} disabled={action.busy || !freeFormAllowed && !freeForm} onChange={event => { setFreeForm(event.target.checked); setFields([]); setMatches([]); setCarried(0) }} />Let each signer place their own fields (free-form)</label>{!freeFormAllowed && <p className="iw-muted">Free-form signing is off. An owner or admin can allow it in Settings; a free-form draft cannot be sent while it is off.</p>}{freeForm && <p className="iw-muted">No fields are placed by the sender. Each signer adds their own signature and any date, initials, name or text fields.</p>}</div>}
      {pdf && <FieldEditor pdf={pdf} readOnly={freeForm} fields={freeForm && !correcting ? [] : fields} setFields={setFields} signer={signer} setSigner={setSigner} recipients={signers.map(recipient => ({ name: recipient.name, locked: Boolean(recipient.locked || recipient.removed) }))} asTemplate={asTemplate} busy={action.busy} />}
      <fieldset disabled={action.busy} className="iw-stack"><legend>Conditional routing</legend>{signers.map((recipient, index) => recipient.removed ? null : <RoutingRuleEditor key={index} label={`${asTemplate ? 'Role' : 'Recipient'} ${index + 1}${recipient.name ? `: ${recipient.name}` : ''}`} value={recipient.includeWhen} fields={fields} disabled={Boolean(recipient.routingLocked || recipient.locked)} onChange={includeWhen => setSigners(current => current.map((item, i) => i === index ? { ...item, includeWhen, routeResult: undefined } : item))} />)}{correcting && <p className="iw-muted">Routing conditions for activated, signed, skipped or removed recipients cannot change.</p>}</fieldset>
      <RoutingPreview signers={signers} fields={fields} copies={asTemplate ? [] : copies} />
      <ErrorNotice error={action.error} /><div className="iw-actions iw-submit"><button className="iw-primary" disabled={action.busy || !file} type="submit">{action.busy ? 'Saving…' : template ? 'Save new version' : asTemplate ? 'Save template' : correcting ? 'Save correction' : draft ? 'Save draft' : 'Save prepared envelope'}</button><p className="iw-muted">{asTemplate ? 'Each envelope sent from it is approved like any other before its first invitation.' : correcting ? 'Every change is recorded in the audit trail with its before and after values.' : 'A human must approve eligibility before the first invitation is sent.'}</p></div>
    </form>
  </section>
}
