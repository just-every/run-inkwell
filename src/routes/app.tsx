import { createFileRoute } from '@tanstack/react-router'
import { OperatorApp } from '../ui/operator-app'
export const Route = createFileRoute('/app')({
  head: () => ({ meta: [{ title: 'Inkwell · Envelopes' }], links: [{ rel: 'stylesheet', href: '/inkwell.css' }] }),
  component: OperatorApp,
})
