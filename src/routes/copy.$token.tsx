import { createFileRoute } from '@tanstack/react-router'
import { appStyles } from '../ui/styles'
import { CompletedCopy } from '../ui/completed-copy'
export const Route = createFileRoute('/copy/$token')({
  head: () => ({ meta: [{ title: 'Inkwell · Completed copy' }, { name: 'referrer', content: 'no-referrer' }], links: appStyles }),
  component: () => { const { token } = Route.useParams(); return <CompletedCopy token={token} /> },
})
