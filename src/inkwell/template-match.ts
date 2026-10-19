// TMPL-005: an uploaded PDF is compared with the documents of the templates this person may use. A template is offered
// when the upload is the same file (its SHA-256 fingerprint, confidence 100%) or, when it has the same number of pages at
// the same sizes (within one point, so every field lands where the template put it), when their page text is similar:
// the share of distinct three-word runs the two have in common (Jaccard), offered from 80% and shown rounded down. Both
// documents need at least 20 words to compare by text, so a scan with no text matches only by fingerprint. Nothing is
// placed here: the prepare screen offers the match and applies it only when the sender chooses to.
import { fromBase64 } from './blobs'
import { parsePdf } from './pdf'
import { documentWords } from './pdf-text'
import { sha256, type Actor, type Env } from './model'
import { templateBytes, visibleTemplates, type Template } from './templates'

export const textThreshold = .8
const minimumWords = 20, maxOffers = 5

function shingles(words: string[]) { const runs = new Set<string>(); for (let i = 0; i + 2 < words.length; i++) runs.add(words.slice(i, i + 3).join(' ')); return runs }
function similarity(a: Set<string>, b: Set<string>) { let shared = 0; for (const run of a) if (b.has(run)) shared++; return shared / (a.size + b.size - shared) }
const sameGeometry = (a: Template['pageSizes'], b: Template['pageSizes']) => a.length === b.length && a.every((size, i) => Math.abs(size.width - b[i].width) <= 1 && Math.abs(size.height - b[i].height) <= 1)

/** `POST /api/inkwell/templates/match`: the templates whose document this upload matches, best first. */
export async function matchTemplates(env: Env, actor: Actor, input: Record<string, unknown>) {
  const bytes = fromBase64(input.pdfBase64), { document, pageSizes } = await parsePdf(bytes), fingerprint = await sha256(bytes)
  let upload: Set<string> | undefined
  const matches: { template: { id: string; title: string; version: number }; method: 'fingerprint' | 'text'; confidence: number }[] = []
  for (const template of await visibleTemplates(env, actor)) {
    const named = { id: template.id, title: template.title, version: template.version ?? 1 }
    if (template.originalSha256 === fingerprint) { matches.push({ template: named, method: 'fingerprint', confidence: 100 }); continue }
    if (!sameGeometry(template.pageSizes, pageSizes)) continue
    if (!upload) { const words = documentWords(document); upload = shingles(words.length >= minimumWords ? words : []) }
    if (!upload.size) continue
    const words = documentWords((await parsePdf(await templateBytes(env, template))).document)
    if (words.length < minimumWords) continue
    const score = similarity(upload, shingles(words))
    if (score >= textThreshold) matches.push({ template: named, method: 'text', confidence: Math.floor(score * 100) })
  }
  return { matches: matches.sort((a, b) => b.confidence - a.confidence).slice(0, maxOffers) }
}
