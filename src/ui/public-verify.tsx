// RECORD-004: the signed-out verification page. A visitor uploads an executed PDF or certificate and learns only
// whether it matches a completed envelope here, and if it does, which one.
import { useState } from 'react'
import { HydrationUnit } from '../base/hydration/unit'
import { dateTime } from './types'
import { ErrorNotice, useAction } from './feedback'
import { Check } from './marks'
import { Brand } from './shell'

type Verification = { match: boolean; sha256: string; document?: 'executed' | 'certificate'; envelope?: { title: string; completedAt?: string; signers: { name: string; signedAt?: string }[] } }
async function verify(file: File): Promise<Verification> {
  const response = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file })
  const payload = await response.json().catch(() => null) as (Verification & { error?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.error ?? `Verification failed (${response.status})`)
  return payload
}
export function PublicVerify() {
  const [file, setFile] = useState<File>()
  const [result, setResult] = useState<Verification & { name: string }>()
  const action = useAction()
  return <div className="iw-app iw-signer"><HydrationUnit><header className="iw-header"><Brand href="/" /><span className="iw-header-note">Document verification</span></header></HydrationUnit><main className="iw-main">
    <HydrationUnit><section className="iw-page-heading"><div><p className="iw-eyebrow">Verify</p><h1>Check a signed document</h1><p>Upload an executed PDF or completion certificate from this Inkwell. No sign-in is needed, and nothing about other documents is shown.</p></div></section></HydrationUnit>
    <HydrationUnit><section className="iw-panel iw-stack">
      <form className="iw-stack" onSubmit={event => { event.preventDefault(); if (file) void action.run(async () => { setResult(undefined); setResult({ ...await verify(file), name: file.name }) }) }}>
        <label>Executed PDF or certificate<input type="file" accept="application/pdf,.pdf" required onChange={event => { setFile(event.target.files?.[0]); setResult(undefined) }} /></label>
        <button className="iw-primary iw-fit" disabled={!file || action.busy}>{action.busy ? 'Checking…' : 'Verify document'}</button>
      </form>
      <ErrorNotice error={action.error} />
      {result && (result.match && result.envelope ? <div className="iw-callout iw-done iw-stack" role="status"><h2><Check />Genuine {result.document === 'executed' ? 'executed PDF' : 'completion certificate'}.</h2><p>{result.name} matches the completed envelope “{result.envelope.title}”{result.envelope.completedAt ? `, completed ${dateTime(result.envelope.completedAt)}` : ''}.</p><ul>{result.envelope.signers.map((signer, index) => <li key={index}>{signer.name}{signer.signedAt ? ` · signed ${dateTime(signer.signedAt)}` : ''}</li>)}</ul><p><small style={{ overflowWrap: 'anywhere' }}>SHA-256 {result.sha256}</small></p></div>
        : <div className="iw-callout iw-stack" role="status"><h2>No match.</h2><p>{result.name} does not match any completed envelope in this Inkwell. It may have been altered, or it was not completed here.</p><p><small style={{ overflowWrap: 'anywhere' }}>SHA-256 {result.sha256}</small></p></div>)}
    </section></HydrationUnit>
  </main></div>
}
