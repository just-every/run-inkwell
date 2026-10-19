import type { Envelope } from './model'

export const missingTerminalTime = 'terminal time not in the source'
/** Imported evidence has its own terminal clock; its source creation date is never an import clock. */
export function importedEnding(envelope:Envelope): {ended:string;at:string;basis?:string} | undefined {
 if (!envelope.imported && envelope.status!=='imported') return undefined
 const source = envelope.source && typeof envelope.source === 'object' ? envelope.source as Record<string,unknown> : {}
 const valid = (value:unknown):value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
 const terminal = [source.terminalAt,source.completedAt,source.completed_at,source.declinedAt,source.declined_at,source.voidedAt,source.voided_at,source.expiredAt,source.expired_at].find(valid)
 const events = [...envelope.events].reverse()
 const end = terminal ?? events.find(e=>['envelope.completed','signer.declined','signer.consent_withdrawn','envelope.voided'].includes(e.action))?.at
 const imported = source.importedAt ?? (envelope as Envelope & {importedAt?:string}).importedAt ?? events.find(e=>e.action==='envelope.imported')?.at
 const at = valid(end) ? end : valid(imported) ? imported : undefined
 return at ? {ended:'imported',at:new Date(at).toISOString(),...(!end?{basis:missingTerminalTime}:{})} : undefined
}
