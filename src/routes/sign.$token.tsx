import { createFileRoute } from '@tanstack/react-router'
import { appStyles } from '../ui/styles'
import { SignerApp } from '../ui/signer-app'
export const Route = createFileRoute('/sign/$token')({
  head: () => ({ meta: [{ title: 'Inkwell · Sign document' }, { name: 'referrer', content: 'no-referrer' }], links: appStyles }),
  component: () => { const { token } = Route.useParams(); return <SignerApp token={token} /> },
})
