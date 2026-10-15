import { useState } from 'react'
export function ErrorNotice({ error }: { error?: string }) { return error ? <p className="iw-error" role="alert">{error}</p> : null }
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : 'The request failed. Please try again.') } finally { setBusy(false) }
  }
  return { busy, error, run, setError }
}
