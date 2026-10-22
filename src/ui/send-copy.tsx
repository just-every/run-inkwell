// ROUTE-009: after completion, send the completed copy to more people. Each gets the copy the account's setting
// chooses (DELIV-007) and is listed under Receive a copy.
import { useState } from 'react'
import { command } from './types'
import { ErrorNotice, useAction } from './feedback'

export function SendCopy({ id, refresh, documents }: { documents?:{filename:string}[]; id: string; refresh: () => Promise<void> }) {
  const [selected,setSelected]=useState(documents?.map((_,i)=>i)??[])
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState([{ name: '', email: '' }])
  const [sent, setSent] = useState<string[]>([])
  const action = useAction()
  const update = (index: number, key: 'name' | 'email', value: string) => setPeople(current => current.map((person, i) => i === index ? { ...person, [key]: value } : person))
  return <div className="iw-quiet"><button disabled={action.busy} onClick={() => setOpen(value => !value)}>Send the completed copy…</button>
    {open && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { const result = await command<{ sent: string[] }>('envelope.send_copy', { id, recipients: people, ...(documents?{documents:selected}:{}) }); setSent(result.sent); setPeople([{ name: '', email: '' }]); setOpen(false); await refresh() }) }}>
      {documents&&<fieldset className="iw-stack"><legend>Documents in this completed copy</legend>{documents.map((d,i)=><label className="iw-check" key={i}><input type="checkbox" checked={selected.includes(i)} onChange={event=>setSelected(event.target.checked?[...selected,i]:selected.filter(n=>n!==i))}/>{d.filename}</label>)}</fieldset>}
      {people.map((person, index) => <div key={index} className="iw-two"><label>Name<input required maxLength={100} value={person.name} onChange={event => update(index, 'name', event.target.value)} /></label><label>Email<input required type="email" value={person.email} onChange={event => update(index, 'email', event.target.value)} /></label></div>)}
      <div className="iw-actions">{people.length < 20 && <button type="button" onClick={() => setPeople(current => [...current, { name: '', email: '' }])}>Add another</button>}<button className="iw-primary" disabled={action.busy}>{action.busy ? 'Sending…' : 'Send copy'}</button></div>
    </form>}
    {sent.length > 0 && <p role="status">Completed copy queued for {sent.join(', ')}.</p>}<ErrorNotice error={action.error} />
  </div>
}
