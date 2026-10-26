import assert from 'node:assert/strict'

/** Stripe alone is faked; all invitation, consent, policy and signed custody run through native doors. */
export function paymentEdge(){
 const sessions=new Map(),customers=new Map();let count=0,block
 const reference=(prefix,n)=>`${prefix}_synthetic_inkwell_${n}`
 const edge=async request=>{
  const url=new URL(request.url);if(url.hostname!=='api.stripe.com')return
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-inkwell-1')
  if(url.pathname==='/v1/customers'){
   const form=new URLSearchParams(await request.text()),id=reference('cus',++count),value={id,livemode:false,metadata:{signing_reference:form.get('metadata[signing_reference]')}};customers.set(id,value);return Response.json(value)
  }
  if(url.pathname==='/v1/checkout/sessions'){
   const form=new URLSearchParams(await request.text()),n=++count,id=reference('cs',n),mode=form.get('mode'),setup=mode==='setup',value={id,url:'https://checkout.stripe.com/c/pay/'+id,mode,client_reference_id:form.get('client_reference_id'),livemode:false,status:'open',payment_status:'unpaid',payment_method_types:[form.get('payment_method_types[0]')],currency:form.get('line_items[0][price_data][currency]')??form.get('currency'),amount_total:setup?null:Number(form.get('line_items[0][price_data][unit_amount]')),customer:form.get('customer'),[setup?'setup_intent':'payment_intent']:{id:reference(setup?'seti':'pi',n),livemode:false,status:'requires_payment_method',metadata:{signing_reference:form.get(`${setup?'setup_intent_data':'payment_intent_data'}[metadata][signing_reference]`)},...(setup?{customer:form.get('customer')}:{amount:Number(form.get('line_items[0][price_data][unit_amount]')),currency:form.get('line_items[0][price_data][currency]')}),payment_method:{id:reference('pm',n),livemode:false,type:form.get('payment_method_types[0]')}}};sessions.set(id,value);return Response.json(value)
  }
  const match=/^\/v1\/checkout\/sessions\/([^/]+)$/.exec(url.pathname)
  if(match){if(block){const pending=block;block=undefined;pending.reached();await pending.wait}const value=sessions.get(match[1]);return value?Response.json(value):Response.json({error:'not found'},{status:404})}
  if(url.pathname.startsWith('/v1/mandates/')){const id=url.pathname.split('/').at(-1),n=id.split('_').at(-1);return Response.json({id,livemode:false,status:'active',payment_method:reference('pm',n)})}
  throw new Error('Unexpected Stripe test edge request')
 }
 const outcome=(id,succeeded)=>{const value=sessions.get(id);assert.ok(value);const intent=value[value.mode==='setup'?'setup_intent':'payment_intent'];intent.status=succeeded?'succeeded':'requires_payment_method';if(succeeded){value.status='complete';value.payment_status=value.mode==='setup'?'no_payment_required':'paid';if(value.payment_method_types[0]==='us_bank_account')intent.mandate=reference('mandate',id.split('_').at(-1))}else intent[value.mode==='setup'?'last_setup_error':'last_payment_error']={code:'card_declined'}}
 return{edge,sessions,succeed:id=>outcome(id,true),decline:id=>outcome(id,false),blockNext(){let reached,release;const ready=new Promise(r=>reached=r),wait=new Promise(r=>release=r);block={reached,wait};return{ready,release}}}
}
