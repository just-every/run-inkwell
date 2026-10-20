import { appendEvent, canonical, currentSigners, insist, object, text, type Envelope, type Field, type RoutingRule, type RoutingResult } from './model'
import { resolveFieldValues, visibleFields, usdCents, usdDecimal } from './field-rules'

type Person = { name?: string; role?: string; order?: number; includeWhen?: RoutingRule; routeResult?: RoutingResult; activatedAt?: string; signedAt?: string; removedAt?: string; values?: Record<string,string> }
const operators = ['equals','not_equals','greater_than','less_than','at_least','at_most']
export const skipped = (person: Person) => person.routeResult?.state === 'skipped'
export const routeSettled = (person: Person) => Boolean(person.signedAt || person.removedAt || skipped(person))
const order = (people: Person[], index: number) => people[index].order ?? index + 1

export function normalizeRoutingRule(value: unknown): RoutingRule | undefined {
  if (value === undefined || value === null) return undefined
  const raw = object(value), field = text(raw.field,'a routing source field',80), comparison = text(raw.value,'a routing comparison value',500)
  insist(typeof raw.operator === 'string' && operators.includes(raw.operator),'Choose a routing comparison operator.')
  insist(!/[\x00-\x1f\x7f]/.test(comparison),'Use one line for the routing comparison.')
  return {field,operator:raw.operator as RoutingRule['operator'],value:comparison}
}

/** One rule's source: an existing business field; ordered comparisons need a USD number; numbers normalise to cents. */
function checkRule(rule: RoutingRule, fields: Field[]) {
  const source=fields.find(field=>field.id===rule.field)
  insist(source && source.type!=='signature','Choose an existing business field for the routing rule.')
  if (!['equals','not_equals'].includes(rule.operator)) insist(source.type==='number','Ordered routing comparisons need a USD number field.')
  if (source.type==='number') rule.value=usdDecimal(usdCents(rule.value,source.label))
  if (source.type==='checkbox') insist(['true','false'].includes(rule.value),'Compare a checkbox with true or false.')
  return source
}
/** A later signer may depend on a completed earlier order; only locked prefills may decide the route before signing. */
export function validateRouting(people: Person[], fields: Field[]) {
  people.forEach((person,index) => {
    const rule=person.includeWhen
    if (!rule || person.removedAt) return
    const source=checkRule(rule,fields)
    insist(source.readOnly && source.prefill || order(people,source.signer)<order(people,index),'A routing source must be a locked prefill or belong to a lower routing order.')
  })
}
/** A copy recipient's rule is decided at completion, so any locked prefill or any signer's field may be its source. */
export function validateCopyRouting(copies: { includeWhen?: RoutingRule }[], fields: Field[]) {
  for (const copy of copies) if (copy.includeWhen) checkRule(copy.includeWhen,fields)
}

type Source = { kind:'ready'; value:string; locked:boolean } | {kind:'pending'} | {kind:'missing';locked:boolean}
function sourceValue(people:Person[],fields:Field[],rule:RoutingRule):Source {
  const field=fields.find(f=>f.id===rule.field)
  if (!field) return {kind:'missing',locked:true}
  const person=people[field.signer],locked=Boolean(field.readOnly&&field.prefill)
  if (!locked&&!routeSettled(person)) return {kind:'pending'}
  if (!locked&&(!person.signedAt||!Object.hasOwn(person.values??{},field.id))) return {kind:'missing',locked:false}
  const assigned=fields.filter(f=>f.signer===field.signer),raw=locked?{}:person.values??{}
  const values=resolveFieldValues(assigned,raw)
  if (!visibleFields(assigned,raw).some(f=>f.id===field.id)||values[field.id]===undefined||values[field.id]==='') return {kind:'missing',locked}
  return {kind:'ready',value:values[field.id],locked}
}
function matches(rule:RoutingRule,value:string,fields:Field[]) {
  const field=fields.find(f=>f.id===rule.field)!
  const a=field.type==='number'?usdCents(value,field.label):value.trim(),b=field.type==='number'?usdCents(rule.value,field.label):rule.value.trim()
  return rule.operator==='equals'?a===b:rule.operator==='not_equals'?a!==b:rule.operator==='greater_than'?a>b:rule.operator==='less_than'?a<b:rule.operator==='at_least'?a>=b:a<=b
}
/** ROUTE-003 copies: before completion the preview shows the current locked value's outcome, or that a signer's answer
 * decides it; completion fixes the outcome. */
export function copyPreview(copies:{ includeWhen?: RoutingRule; routeResult?: RoutingResult }[],people:Person[],fields:Field[]) {
  return copies.map((copy,index)=>{
    const rule=copy.includeWhen
    if (!rule) return {index,state:'included' as const,reason:'Always gets the completed copy'}
    const describe=(value:string)=>`${fields.find(f=>f.id===rule.field)?.label??rule.field} ${rule.operator.replaceAll('_',' ')} ${value}`
    if (copy.routeResult) return {index,state:copy.routeResult.state,reason:describe(rule.value)}
    try {
      const checked={...rule};checkRule(checked,fields);const description=describe(checked.value)
      const source=sourceValue(people,fields,rule)
      if (source.kind==='ready'&&source.locked) return {index,state:matches(rule,source.value,fields)?'included' as const:'skipped' as const,reason:`${description}; decided at completion`}
      return {index,state:'conditional' as const,reason:`${description}; decided at completion from the final answers`}
    } catch(error) {return {index,state:'unresolved' as const,reason:error instanceof Error?error.message:'Check the routing source.'}}
  })
}
export function routingPreview(people:Person[],fields:Field[]) {
  return people.map((person,signer)=>{
    const rule=person.includeWhen
    if (!rule) return {signer,state:'included' as const,reason:'Always included'}
    const description=`${fields.find(f=>f.id===rule.field)?.label??rule.field} ${rule.operator.replaceAll('_',' ')} ${rule.value}`
    if (person.routeResult && person.routeResult.state!=='unresolved') return {signer,state:person.routeResult.state,reason:description}
    try {
      validateRouting(people.map(p=>({...p,...(p.includeWhen?{includeWhen:{...p.includeWhen}}:{})})),fields)
      const source=sourceValue(people,fields,rule)
      if (source.kind==='pending') return {signer,state:'conditional' as const,reason:`${description}; waiting for the earlier signer's answer`}
      if (source.kind==='missing') return {signer,state:'unresolved' as const,reason:`${description}; source is missing or hidden`}
      return {signer,state:matches(rule,source.value,fields)?'included' as const:'skipped' as const,reason:description}
    } catch(error) {return {signer,state:'unresolved' as const,reason:error instanceof Error?error.message:'Check the routing source.'}}
  })
}

/** ROUTE-003: decisions and activations join the same envelope commit as approval or the preceding signature. */
export async function resolveRouting(envelope:Envelope,at:string,initial=false) {
  for (const i of envelope.signers.map((_,i)=>i).sort((a,b)=>order(envelope.signers,a)-order(envelope.signers,b))) {
    const person=envelope.signers[i],rule=person.includeWhen
    if (!rule || person.removedAt || person.routeResult?.state==='included' || skipped(person)) continue
    const source=sourceValue(envelope.signers,envelope.fields,rule)
    if (source.kind==='pending') continue
    insist(!(initial&&source.kind==='missing'&&source.locked),`Routing condition for ${person.name} is unresolved: ${rule.field} is missing or hidden.`,409)
    const state=source.kind==='missing'?'unresolved':matches(rule,source.value,envelope.fields)?'included':'skipped'
    if (person.routeResult?.state===state) continue
    person.routeResult={state,at,...(source.kind==='ready'?{value:source.value}:{})}
    await appendEvent(envelope,`signer.route_${state}`,'inkwell',{signer:i,rule,result:state==='unresolved'?'unresolved':state==='included',...(source.kind==='ready'?{sourceValue:source.value}:{})},at)
  }
  insist(!initial || envelope.signers.some(person=>!routeSettled(person)),'Keep at least one included signer before sending.',409)
  for (const i of currentSigners(envelope)) if (!envelope.signers[i].activatedAt) {
    envelope.signers[i].activatedAt=at
    await appendEvent(envelope,'signer.route_activated','inkwell',{signer:i},at)
  }
}

/** Once used, the approved source and decision are fixed. A future, unactivated rule may be corrected and reevaluated. */
export function guardRoutingCorrection(before:Envelope,after:Envelope) {
  before.signers.forEach((person,i)=>{
    const changed=canonical(person.includeWhen??null)!==canonical(after.signers[i]?.includeWhen??null)
    const activated=person.activatedAt || currentSigners(before).includes(i) || person.signedAt || skipped(person)
    insist(!changed||!activated,`${person.name}'s routing rule is already activated or settled and cannot change.`,409)
    if (changed) delete after.signers[i].routeResult
    if (person.includeWhen && person.routeResult && person.routeResult.state!=='unresolved') {
      const previous=before.fields.find(f=>f.id===person.includeWhen!.field),next=after.fields.find(f=>f.id===person.includeWhen!.field)
      const basis=(field:Field|undefined)=>field?{id:field.id,type:field.type,signer:field.signer,readOnly:field.readOnly,prefill:field.prefill,condition:field.condition,calculation:field.calculation}:null
      insist(canonical(basis(previous))===canonical(basis(next)),'A field already used to decide conditional routing cannot change.',409)
    }
  })
}

/** ROUTE-003 copies: evaluated once, as the envelope completes, against the final immutable values (locked prefills and
 * every completed field). False: no completed-copy mail or link. A source still missing or hidden: the copy is sent,
 * since a copy carries no signing authority, and the certificate says "rule unresolved, copy sent". */
export async function resolveCopyRouting(envelope:Envelope,at:string) {
  for (const [index,copy] of (envelope.copies??[]).entries()) {
    const rule=copy.includeWhen
    if (!rule || copy.routeResult) continue
    const source=sourceValue(envelope.signers,envelope.fields,rule)
    const state=source.kind==='ready'?matches(rule,source.value,envelope.fields)?'included':'skipped':'unresolved'
    copy.routeResult={state,at,...(source.kind==='ready'?{value:source.value}:{})}
    await appendEvent(envelope,`copy.route_${state}`,'inkwell',{party:envelope.signers.length+index,email:copy.email,rule,result:state==='unresolved'?'unresolved':state==='included',...(source.kind==='ready'?{sourceValue:source.value}:{})},at)
  }
}
