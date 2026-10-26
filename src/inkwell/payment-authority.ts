import { insist, canonical, sha256, type Actor, type Env } from './model'
import { paymentBuyer } from './payment-provider'
import { samePaymentRequirement, type PaymentAuthority, type PaymentRequirement } from './payment-requirement'

/** Configuration evidence is server-made; a caller cannot supply a buyer account or inherit another consent. */
export async function configurePayment(env:Env,actor:Actor|undefined,requirement:PaymentRequirement|undefined,previous?:PaymentRequirement,authority?:PaymentAuthority){
 if(samePaymentRequirement(requirement,previous)&&(!requirement||authority))return authority
 insist(actor&&['owner','admin'].includes(actor.role),'Only an owner or admin can configure a payment requirement.',403)
 if(!requirement)return undefined
 const buyer=await paymentBuyer(env)
 return{actor:actor.id,at:new Date().toISOString(),version:await sha256(canonical({requirement,buyer:buyer.reference})),buyer} satisfies PaymentAuthority
}
