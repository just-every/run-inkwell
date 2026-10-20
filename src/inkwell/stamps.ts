import { parseAdoption } from './marks'
import { Refusal } from './model'
import { stampParts } from './stamp-value'

/** Reuse actual image parsing, magic-byte checks and the existing image size bound; no stamp certification is claimed. */
export async function parseStamp(value: string, label: string) {
  try { return await parseAdoption({ method: 'uploaded', ...stampParts(value, label) }) }
  catch (error) { if (error instanceof Refusal) throw new Refusal(`${label}: ${error.message.replace(/signature/g, 'stamp')}`, error.status); throw error }
}
