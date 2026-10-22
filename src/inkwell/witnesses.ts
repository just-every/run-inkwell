import { recipientPdf, visibleDocumentIndexes } from './document-visibility'
import { accessGate, disclosureGate, liveGuard, recipientOf, sessionGuard, type SigningContext } from './signing'
import { witnessNames } from './recipient-roles'
import { active, appendEvent, canonical, currentSigners, insist, now, routingOrder, secret, sha256, text, type Envelope, type Env, type Field } from './model'
import { commandWrite, commitEnvelope, previousCommand } from './storage'
import { dispatchMail, invitationWrite, noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { readBlob } from './blobs'
import { signedPdf, validatePdfText } from './pdf'
import { sealLink } from './links'
import { markKind } from './marks'

export function witnessView(context: SigningContext) {
  const s = recipientOf(context), parent = s.witnessFor === undefined ? undefined : context.envelope.signers[s.witnessFor]
  return { role: s.role ?? 'signer', completedAt: s.completedAt, ...(parent ? { witnessedSigner: { name: parent.name, email: parent.email } } : {}),
    ...(s.witnesses && context.verified ? { witnesses: { ...s.witnesses, nominees: s.witnessReturnRequired ? [] : s.witnessNominees ?? s.witnesses.named ?? [], ...(s.witnessReturnRequired?{minimum:1,maximum:s.witnesses.maximum-context.envelope.signers.filter(w=>w.witnessFor===context.recipient.signer&&!w.removedAt).length}:{}), returnRequired: Boolean(s.witnessReturnRequired) } } : {}) }
}

/** Nomination is a verified recipient action, never a sender authority to change a signed principal's evidence. */
export async function nominateWitnesses(env: Env, context: SigningContext, input: Record<string, unknown>) {
  insist(context.verified, 'Verify your email before nominating a witness.', 401)
  const commandId = text(input.commandId, 'a command ID', 100), nominees = witnessNames(input.nominees), fingerprint = await sha256(canonical({ nominees })), key = `witness:${context.envelope.id}:${context.recipient.row}`
  const previous = await previousCommand(env.DB, key, commandId, fingerprint)
  if (previous) { await dispatchMail(env, context.envelope.id); return previous }
  active(context.envelope); accessGate(context); disclosureGate(recipientOf(context), 'nominating witnesses')
  const before = context.envelope, index = context.recipient.signer, principal = before.signers[index], rule = principal.witnesses
  insist(rule && currentSigners(before).includes(index) && (!principal.signedAt || principal.witnessReturnRequired), 'Only the signer whose witness step is open may nominate witnesses.', 409)
  const count = principal.signedAt ? before.signers.filter(s => s.witnessFor === index && !s.removedAt).length : 0
  const needed = principal.signedAt ? before.signers.filter(s => s.witnessFor === index && s.removedAt).length - before.events.filter(e => e.action === 'witness.replaced' && e.detail.signer === index).reduce((n,e) => n + Number(e.detail.count), 0) : rule.minimum
  insist(nominees.length >= needed && nominees.length + count <= rule.maximum, `Nominate ${needed}–${rule.maximum - count} witnesses.`)
  const addresses = [...before.signers.flatMap(s => s.group ? s.group.members.map(m => m.email) : [s.email]), ...(before.copies ?? []).map(c => c.email), ...before.signers.flatMap((s,i) => i === index ? [] : (s.witnessNominees ?? s.witnesses?.named ?? []).map(n => n.email))]
  insist(nominees.every(n => !addresses.includes(n.email)), 'A witness cannot be the signer or another recipient of this envelope.')
  await validatePdfText(nominees.flatMap(n => [n.name, n.email]))
  const after = structuredClone(before), s = after.signers[index], at = now()
  s.witnessNominees = nominees
  await appendEvent(after, 'witness.nominated', `signer:${index + 1}`, { signer: index, nominees, ...context.client }, at)
  const writes: D1PreparedStatement[] = []
  if (principal.signedAt) {
    delete s.witnessReturnRequired
    writes.push(...await activateWitnesses(env, after, index))
    await appendEvent(after, 'witness.replaced', `signer:${index + 1}`, { signer: index, count: nominees.length }, at)
  }
  const result = { id: after.id, nominees }
  await commitEnvelope(env, before, after, null, [...writes, commandWrite(env.DB, key, commandId, fingerprint, result)], [liveGuard(context), sessionGuard(context)])
  await dispatchMail(env, after.id)
  return result
}

/** A witness occupies their signer's routing order, so every higher order waits. Only signed documents are granted. */
export async function activateWitnesses(env: Env, after: Envelope, index: number) {
  const parent = after.signers[index], rule = parent.witnesses
  if (!rule) return []
  const nominees = parent.witnessNominees ?? rule.named ?? []
  insist(nominees.length >= rule.minimum && nominees.length <= rule.maximum, 'Nominate the required witnesses before signing.')
  const documents = after.documents ? visibleDocumentIndexes(after, index).filter(d => parent.paper?.status === 'accepted' ? after.documents![d].mode !== 'view' : after.fields.some(f => f.signer === index && f.document === d && f.type === 'signature' && parent.values?.[f.id])) : undefined
  insist(!documents || documents.length > 0, 'A witness must witness a signed document.')
  const writes: D1PreparedStatement[] = []
  for (const nominee of nominees) {
    const place = after.signers.length, at = now(), token = secret()
    insist(place < 1000, 'This envelope has reached its recipient replacement limit.', 409)
    insist(!after.signers.some(s => s.email === nominee.email), 'A witness cannot be another recipient.')
    after.signers.push({ ...nominee, role: 'witness', witnessFor: index, ...(parent.includeWhen?{includeWhen:structuredClone(parent.includeWhen),routeResult:structuredClone(parent.routeResult)}:{}), ...(documents ? { witnessDocuments: documents } : {}), order: routingOrder(after, index), ...(rule.linkOnly ? { linkOnly: true } : {}), activatedAt: at })
    const fields = after.freeForm ? [] : witnessFields(after, place, documents, Boolean(rule.address))
    after.fields.push(...fields)
    await appendEvent(after, 'witness.activated', `signer:${index + 1}`, { signer: index, witness: place, recipient: after.signers[place], fields }, at)
    writes.push(env.DB.prepare('INSERT INTO iw_signers(envelope_id,signer,token_hash,link_sealed) VALUES(?,?,?,?)').bind(after.id, place, await sha256(token), await sealLink(env, after.id, place, token)), ...(mailSuppressed(env) ? [] : [invitationWrite(env, after, place, token)]))
  }
  return writes
}

function witnessFields(e: Envelope, signer: number, documents: number[] | undefined, address: boolean): Field[] {
  const fields: Field[] = []
  for (const document of documents ?? [undefined]) {
    const pages = document === undefined ? e.pageSizes.map((_,i) => i) : Array.from({ length: e.documents![document].pages }, (_,i) => e.documents![document].pageStart + i)
    const kinds = ['signature', 'full_name', 'date_signed', ...(address ? ['text'] : [])] as Field['type'][]
    for (const [k,type] of kinds.entries()) {
      let chosen: Field | undefined
      for (const page of pages.toReversed()) {
        for (let row = 18; row >= 1 && !chosen; row--) for (const x of [.05,.52]) {
          const f: Field = { id: `witness-${signer}-${document ?? 0}-${k}`, label: type === 'text' ? 'Witness address' : type === 'signature' ? 'Witness signature' : type === 'full_name' ? 'Witness printed name' : 'Witness date', type, signer, page, x, y: row * .05, width: .42, height: .04, required: true, ...(document === undefined ? {} : { document, documentPage: page - e.documents![document].pageStart }) }
          if (![...e.fields,...fields].some(b => b.page === page && f.x < b.x + b.width && f.x + f.width > b.x && f.y < b.y + b.height && f.y + f.height > b.y)) { chosen = f; break }
        }
        if (chosen) break
      }
      insist(chosen, 'There is no room for witness fields. Ask the sender for a new envelope with room for the witnesses.', 409)
      fields.push(chosen)
    }
  }
  return fields
}

/** A decline revokes this witness only; the signed principal keeps their evidence and must name a replacement. */
export async function declineWitness(env: Env, context: SigningContext, input: Record<string, unknown>) {
  insist(context.verified, 'Verify your email before declining.', 401)
  const before = context.envelope, index = context.recipient.signer, witness = before.signers[index]
  insist(witness.witnessFor !== undefined, 'This is not a witness step.', 409)
  active(before); accessGate(context)
  insist(currentSigners(before).includes(index) && !witness.signedAt, 'This witness step is already closed.', 409)
  const commandId = text(input.commandId, 'a command ID', 100), reason = text(input.reason, 'a reason for declining', 500).replace(/\s+/g, ' ')
  insist(reason.length >= 3, 'Give a reason for declining (at least 3 characters).')
  await validatePdfText([reason])
  const after = structuredClone(before), at = now(), parent = after.signers[witness.witnessFor]
  after.signers[index] = { ...witness, declinedAt: at, declineReason: reason, removedAt: at }
  after.fields = after.fields.filter(f => f.signer !== index)
  parent.witnessReturnRequired = true
  await appendEvent(after, 'witness.declined', `signer:${index + 1}`, { signer: witness.witnessFor, witness: index, reason, ...context.client }, at)
  const result = { id: after.id, status: after.status, returnedToSigner: witness.witnessFor }
  await commitEnvelope(env, before, after, null, [env.DB.prepare('UPDATE iw_signers SET token_hash=?,session_hash=NULL,code_hash=NULL,link_sealed=NULL,progress=NULL WHERE envelope_id=? AND signer=?').bind(await sha256(secret()), after.id, index), env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id,index), ...(mailSuppressed(env) ? [] : [noticeWrite(env.DB, after, witness.witnessFor, parent.email, `Choose a replacement witness: ${after.title}`, `${parent.name},\n\n${witness.name} declined to witness ${after.title}. Return to your original signing link to nominate another witness. Later recipients are waiting.`)]), commandWrite(env.DB, `witness-decline:${after.id}:${index}`, commandId, await sha256(canonical({ reason })), result)], [liveGuard(context), sessionGuard(context)])
  await dispatchMail(env, after.id)
  return result
}

/** Render existing signatures without persisting an executed artifact or including unsigned recipients' fields. */
export async function witnessDocument(env: Env, e: Envelope, signer: number, component?: number) {
  const partial = { ...e, fields: e.fields.filter(f => Boolean(e.signers[f.signer].signedAt)) }, marks = new Map<string, Uint8Array>()
  for (const [i,s] of e.signers.entries()) for (const initials of [false,true]) {
    const adoption = initials ? s.initialsAdoption : s.adoption
    if (s.signedAt && adoption?.sha256) marks.set(markKind(i,initials), await readBlob(env.DB,e.id,markKind(i,initials),adoption.sha256))
  }
  const scans = await Promise.all(e.signers.flatMap((s,i) => s.paper?.status === 'accepted' ? [readBlob(env.DB,e.id,`paper-${i}`,s.paper.sha256).then(bytes => ({bytes,mediaType:s.paper!.mediaType}))] : []))
  const bytes = new Uint8Array(await signedPdf(await readBlob(env.DB,e.id,'original',e.originalSha256),partial,scans,marks))
  return recipientPdf(env,e,signer,false,{bytes,component,withScans:true})
}
