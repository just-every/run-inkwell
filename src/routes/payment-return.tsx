import { createFileRoute } from '@tanstack/react-router'
import { appStyles } from '../ui/styles'
export const Route=createFileRoute('/payment-return')({head:()=>({meta:[{title:'Inkwell · Payment checkout'}],links:appStyles}),component:PaymentReturn})
function PaymentReturn(){return <div className="iw-app iw-signer"><main className="iw-main"><h1>Return to your signing tab</h1><p>Checkout has ended. Return to Inkwell and choose Check payment status. Your signature is saved only when you explicitly sign after Stripe confirmation.</p><button type="button" onClick={()=>window.close()}>Close checkout tab</button><a href="/app">Open Inkwell</a></main></div>}
