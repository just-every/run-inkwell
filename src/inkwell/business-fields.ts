import { insist, type Field } from './model'

/** PREP-003: one catalog for preparation and signing. Validation checks syntax, never identity or tax registration. */
export const fieldTypes = [
  ['signature', 'Signature'], ['initials', 'Initials'], ['date_signed', 'Date signed'],
  ['full_name', 'Full name'], ['email', 'Email'], ['company', 'Company'], ['title', 'Title'],
  ['text', 'Text'], ['date', 'Date'], ['checkbox', 'Checkbox'], ['number', 'Number (USD)'],
] as const
export const markField = (field: Field) => field.type === 'signature' || field.type === 'initials'
export const generatedField = (field: Field) => markField(field) || field.type === 'date_signed'
export const patterns = { zip: 'US ZIP', phone: 'US phone', ssn: 'SSN', ein: 'EIN', email: 'Email', date: 'Date (YYYY-MM-DD)' } as const
export const signingZones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
export function signingDay(instant: string, timeZone: string) {
  insist(signingZones.includes(timeZone), 'Choose a US signing time zone.')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant)).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function validateBusinessValue(field: Field, value: string) {
  if (!value) return
  const pattern = field.type === 'email' ? 'email' : field.type === 'date' || field.type === 'date_signed' ? 'date' : field.pattern
  const valid = pattern === 'zip' ? /^\d{5}(?:-?\d{4})?$/.test(value)
    : pattern === 'phone' ? /^(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}$/.test(value)
    : pattern === 'ssn' ? /^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(value)
    : pattern === 'ein' ? /^(?:\d{9}|\d{2}-\d{7})$/.test(value)
    : pattern === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    : pattern === 'date' ? /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value : true
  insist(valid, `Enter a valid ${pattern ? patterns[pattern] : 'value'} for ${field.label}.`)
}
export const maskedField = (field: Field) => Boolean(field.masked || field.pattern === 'ssn' || field.pattern === 'ein')
export const displayFieldValue = (field: Field, value: string) => value && maskedField(field) ? '••••••••' : value

export function displayReferencedValue(fields: Field[], id: string, value: string) {
  const field = fields.find(field => field.id === id)
  return field ? displayFieldValue(field, value) : value
}
