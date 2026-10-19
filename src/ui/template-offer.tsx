import { request } from './types'
import type { Template } from './templates'

// TMPL-005: the templates an uploaded PDF matches, best first, with how it matched. The sender applies one (its fields
// and roles) or ignores the offer; nothing is placed until they choose.
export type Match = { template: { id: string; title: string; version: number }; method: 'fingerprint' | 'text'; confidence: number }

export const findMatches = async (pdfBase64: string) => (await request<{ matches: Match[] }>('/api/inkwell/templates/match', { pdfBase64 })).matches
/** The full template behind an offer, as the template list gives it to this person. */
export async function offeredTemplate(id: string) {
  const template = (await request<{ templates: Template[] }>('/api/inkwell/templates')).templates.find(item => item.id === id)
  if (!template) throw new Error('That template is no longer available to you.')
  return template
}

export function TemplateOffer({ matches, busy, onApply, onIgnore }: { matches: Match[]; busy: boolean; onApply: (id: string) => void; onIgnore: () => void }) {
  return <div className="iw-callout iw-stack" role="region" aria-label="Matching templates">
    <p><strong>This PDF matches {matches.length === 1 ? 'a template' : `${matches.length} templates`}.</strong> Apply one to place its fields and roles, or ignore it and place your own.</p>
    <ul className="iw-stack">{matches.map(match => <li key={match.template.id} className="iw-actions"><span>{match.template.title} · version {match.template.version} · {match.method === 'fingerprint' ? 'the same file (100%)' : `${match.confidence}% of its text matches`}</span><button type="button" className="iw-primary" disabled={busy} aria-label={`Apply ${match.template.title}`} onClick={() => onApply(match.template.id)}>Apply fields and roles</button></li>)}</ul>
    <button type="button" className="iw-fit" disabled={busy} onClick={onIgnore}>Ignore</button>
  </div>
}
