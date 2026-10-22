import { PDFDocument, StandardFonts } from 'pdf-lib'
import { party, type Envelope } from '../model'
/** A printed manifestation travels inside the fingerprinted PDF, including each component's appended envelope record. */
export async function appendManifestations(document: PDFDocument, e: Envelope) {
 if (!e.part11) return
 const font=await document.embedFont(StandardFonts.Helvetica)
 for(const [i,s] of e.signers.entries()) {
  if(!s.signedAt || !s.part11)continue
  const page=document.addPage([595,842]), p=party(e,i), documents=[...new Set(e.fields.filter(f=>f.signer===i&&f.type==='signature'&&s.values?.[f.id]).map(f=>e.documents?.[f.document??0]?.filename??e.filename))]
  const lines=['Signature manifestation',`Envelope: ${e.id}`,`Printed name: ${p.name}`,`Signed at (UTC): ${s.signedAt}`,`Meaning: ${s.part11.reason}`,`Re-authenticated (UTC): ${s.part11.reauthenticatedAt}`,`Method: ${s.part11.method}`,`Signed documents: ${documents.join(', ')}`,'This page records the envelope signature and its document scope.','These controls have not been qualified as a Part 11 installation.']
  let y=790
  for(const line of lines)for(let n=0;n<line.length;n+=90){page.drawText(line.slice(n,n+90),{font,size:9,x:40,y});y-=16}
 }
}
