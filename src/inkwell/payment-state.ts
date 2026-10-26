import { canonical, sha256, type Env } from './model'
import { recipientOf, type SigningContext } from './signing'

export interface PaymentRow {id:string;envelope_id:string;signer:number;token_hash:string;requirement_hash:string;provider_binding:string;checkout_reference:string|null;sealed_url:string|null;receipt:string|null;consumed_at:string|null}
export async function currentPayment(env:Env,context:SigningContext){
 const signer=recipientOf(context),authority=signer.paymentAuthority
 if(!signer.payment||!authority)return undefined
 const hash=await sha256(canonical({requirement:signer.payment,version:authority.version,buyer:authority.buyer.reference}))
 const row=await env.DB.prepare('SELECT * FROM iw_payments WHERE envelope_id=? AND signer=? AND token_hash=? AND requirement_hash=?').bind(context.envelope.id,context.recipient.row,context.recipient.token_hash,hash).first<PaymentRow>()
 return{requirement:signer.payment,authority,hash,row}
}
export async function paymentSessionState(env:Env,context:SigningContext){
 const state=await currentPayment(env,context)
 return state?{needsConsent:!state.row,...(state.row?.checkout_reference?{reference:state.row.checkout_reference}:{})}:{}
}
