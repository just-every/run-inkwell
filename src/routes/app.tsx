import { createFileRoute } from '@tanstack/react-router'
import { appStyles } from '../ui/styles'
import { OperatorApp } from '../ui/operator-app'
export const Route = createFileRoute('/app')({
  head: () => ({ meta: [{ title: 'Inkwell · Envelopes' }], links: appStyles }),
  component: OperatorApp,
})
