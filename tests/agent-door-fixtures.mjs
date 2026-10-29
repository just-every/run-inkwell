import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Test-owned bytes and native lifecycle only; no application authority is replaced.
export let latestLocalAgent
export default async function ({ phase, request, origin, cookie }) {
  const issued = await request(origin + '/api/inkwell/commands', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'agent.issue', commandId: crypto.randomUUID(), input: {} }) })
  assert.equal(issued.status, 200, 'native owner issues the narrow preparation credential')
  const { result: agent } = await issued.json()
  latestLocalAgent = agent.id
  const pdf = await PDFDocument.create(), page = pdf.addPage([595, 842]), font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('Harbour Studio consulting agreement', { x: 48, y: 760, size: 18, font })
  page.drawText('Nia Cole will review these fixed terms before signing.', { x: 48, y: 720, size: 11, font })
  return { values: { preparation: {
    title: `Harbour Studio agreement — ${phase}`, filename: 'consulting.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'),
    signers: [{ name: 'Nia Cole', email: 'nia@harbour.example' }],
    fields: [{ id: 'signature-0', type: 'signature', label: 'Signature', signer: 0, page: 0, x: 0.1, y: 0.7, width: 0.4, height: 0.07, required: true }],
  } }, clients: { local: { token: agent.token, clientId: `preparation:${agent.id}`, agent: { id: agent.id, name: 'Inkwell preparation agent', specialist: 'agreement operations' } } } }
}
