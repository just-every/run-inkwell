type Json = Record<string, unknown>
const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const string = (value: unknown) => typeof value === 'string' ? value : ''

/** Single mailbox only. Comments and a display name are not part of the normalized addr-spec. */
export function mailbox(value: string, caseSensitiveLocal = false): string | null {
  let cleaned = '', depth = 0, quoted = false, escaped = false
  for (const character of value.replace(/\r\n[ \t]+/g, ' ')) {
    if (escaped) { if (!depth) cleaned += character; escaped = false; continue }
    if (character === '\\' && (quoted || depth)) { if (!depth) cleaned += character; escaped = true; continue }
    if (!depth && character === '"') quoted = !quoted
    if (!quoted && character === '(') { depth++; continue }
    if (!quoted && character === ')' && depth) { depth--; continue }
    if (!depth) cleaned += character
  }
  if (depth || quoted || escaped || /[\r\n\0]/.test(cleaned)) return null
  const angle = cleaned.match(/^[^<>]*<([^<>]+)>\s*$/)
  if (cleaned.includes('<') && !angle) return null
  if (angle && /[,@;]/.test(cleaned.slice(0, cleaned.indexOf('<')).replace(/"(?:[^"\\]|\\.)*"/g, ''))) return null
  const address = (angle ? angle[1] : cleaned).trim()
  const match = address.match(/^("(?:[^"\\\r\n]|\\.)+"|[^\s<>(),;:"\\@]+)@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i)
  if (!match) return null
  const local = match[1].startsWith('"') ? match[1].slice(1, -1).replace(/\\(.)/g, '$1') : match[1]
  return caseSensitiveLocal ? `${local}@${match[2].toLowerCase()}` : `${local}@${match[2]}`.toLowerCase()
}

export function htmlText(html: string): string {
  // Render no HTML, execute nothing, fetch no image, and keep no script/style content.
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd'
    })
}
export function authFailed(message: Json, headers: Map<string, string>) {
  const authentication = record(message.authentication)
  return ['dkim', 'dmarc'].some(key => /^(?:fail|softfail|temperror|permerror)$/i.test(string(authentication[key]))) ||
    /\b(?:dkim|dmarc)\s*=\s*(?:fail|softfail|temperror|permerror)\b/i.test(headers.get('authentication-results') ?? '')
}

