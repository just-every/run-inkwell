import type { ReactNode } from 'react'
import { EraseIcon, FieldsIcon, RestoreIcon, SignersIcon, VoidIcon } from './icons'

const tiles: [ReactNode, string, string][] = [
  [<SignersIcon />, 'Up to five signers', 'Add one to five people and Inkwell invites them in order.'],
  [<FieldsIcon />, 'Text and date fields', 'Place signature, text and date fields on any page.'],
  [<VoidIcon />, 'Void with a reason', 'Stop an unfinished envelope and the reason stays on record.'],
  [<SignersIcon />, 'Owner, admin and member', 'Admins prepare and send; members can read.'],
  [<RestoreIcon />, 'Archive and restore', 'Download everything and restore it into a fresh Inkwell.'],
  [<EraseIcon />, 'Erase on request', 'The owner can permanently erase a finished envelope.'],
]

export function Included() {
  return (
    <section className="ik-included" id="included" aria-labelledby="included-title">
      <h2 className="ik-eyebrow" id="included-title">Also included</h2>
      <ul>{tiles.map(([icon, title, line]) => <li key={title}>{icon}<h3>{title}</h3><p>{line}</p></li>)}</ul>
    </section>
  )
}
