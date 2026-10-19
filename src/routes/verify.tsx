import { createFileRoute } from '@tanstack/react-router'
import { appStyles } from '../ui/styles'
import { PublicVerify } from '../ui/public-verify'
export const Route = createFileRoute('/verify')({
  head: () => ({ meta: [{ title: 'Inkwell · Verify a signed document' }, { name: 'referrer', content: 'no-referrer' }], links: appStyles }),
  component: PublicVerify,
})
