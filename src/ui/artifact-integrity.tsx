import { useState } from 'react'
import { request, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'

type Verification = { ok: boolean; auditChain: { ok: boolean; events: number }; fingerprints: { kind: string; available: boolean; expected?: string; actual?: string; ok?: boolean; error?: string }[] }
export function ArtifactIntegrity({ envelope, base }: { envelope: Envelope; base: string }) {
  const [result, setResult] = useState<Verification>()
  const action = useAction()
  return <div className="iw-stack">
    <h3>Artifact integrity</h3>
    <dl className="iw-hashes">
      <dt>Original SHA-256</dt><dd>{envelope.originalSha256}</dd>
      {envelope.signedSha256 && <><dt>Executed PDF SHA-256</dt><dd>{envelope.signedSha256}</dd></>}
      {envelope.certificateSha256 && <><dt>Certificate SHA-256</dt><dd>{envelope.certificateSha256}</dd></>}
    </dl>
    <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => setResult(await request<Verification>(`${base}/verify`)))}>{action.busy ? 'Checking…' : 'Verify stored artifacts'}</button>
    {result && <div className="iw-callout iw-stack" role="status">
      <h3>{result.ok ? 'Integrity checks passed.' : 'An integrity check failed.'}</h3>
      <p>Audit chain: {result.auditChain.ok ? 'valid' : 'failed'} · {result.auditChain.events} events</p>
      <ul>{result.fingerprints.map(file => <li key={file.kind}>{file.kind}: {!file.available ? 'not yet available' : file.ok ? 'SHA-256 matches' : file.error || 'SHA-256 mismatch'}</li>)}</ul>
      <details><summary>Verification details</summary><pre className="iw-json">{JSON.stringify(result, null, 2)}</pre></details>
    </div>}
    <ErrorNotice error={action.error} />
  </div>
}
