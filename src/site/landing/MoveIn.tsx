import { Feature } from './Feature'
import { ProductCard } from './ProductCard'
import { DocumentIcon } from './icons'

export function MoveIn() {
  return (
    <Feature id="move-in" eyebrow="Move in" title="Bring your DocuSeal history." drawing="left"
      body="Import signed PDFs and their provider evidence from a DocuSeal archive. You can undo it if you change your mind."
      label="The imported library: three DocuSeal agreements, each with its signed PDF, provider certificate and provider audit PDF.">
      <ProductCard title="Move in from DocuSeal">
        <p className="ik-card-label">Imported library (3)</p>
        <ul className="ik-library">{[0, 1, 2].map(row => <li key={row}><DocumentIcon /><span className="ik-chip">Signed PDF</span><span className="ik-chip">Provider certificate</span><span className="ik-chip">Provider audit PDF</span></li>)}</ul>
        <span className="ik-drawn-link">Undo this import…</span>
      </ProductCard>
    </Feature>
  )
}
