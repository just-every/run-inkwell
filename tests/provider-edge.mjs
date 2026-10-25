import assert from 'node:assert/strict'

export const providerBindings = { STRIPE_IDENTITY_SECRET_KEY:'synthetic-inkwell-1', TWILIO_ACCOUNT_SID:'synthetic-inkwell-2', TWILIO_AUTH_TOKEN:'synthetic-inkwell-3', TWILIO_VERIFY_SERVICE_SID:'synthetic-inkwell-4', AUTHENTICATE_API_KEY:'synthetic-inkwell-5', AUTHENTICATE_KBA_WORKFLOW_ID:'synthetic-inkwell-6' }

/** Only paid provider edges are replaced; the Worker owns every invitation, gate and record. */
export function providerEdges({now=Date.now()}={}) {
 const sessions=new Map(), requests=[], voice=[], knowledge=new Map();let applicants=0
 return {
  sessions,requests,voice,knowledge,
  async networkEdge(request) {
   const url=new URL(request.url)
   if(url.hostname==='api-v3.authenticating.com') {
    if(url.pathname==='/user/create') {const body=await request.json();assert.equal(body.dob,'15-06-1985');return Response.json({userAccessCode:'synthetic-inkwell-applicant-'+(++applicants)})}
    if(url.pathname==='/user/jwt') {const body=await request.json(),token='synthetic-inkwell-hosted-'+(knowledge.size+1);assert.equal(body.preferredWorkflowID,providerBindings.AUTHENTICATE_KBA_WORKFLOW_ID);knowledge.set(token,{userAccessCode:body.userAccessCode,medallion:{currentSession:{uuid:'synthetic-inkwell-session-'+(knowledge.size+1),workflowId:body.preferredWorkflowID,status:'INITIALIZED',expireOn:new Date(now+3600000).toISOString(),kba:{mandatory:true,status:'PENDING',success:false,attempts:{allowed:2,availed:0}},govtId:{mandatory:false},bank:{mandatory:false}}}});return Response.json({token,jwt:'private-provider-jwt'})}
    const token=url.pathname.split('/').at(-2);return Response.json(knowledge.get(token))
   }
   if(url.hostname==='api.stripe.com') {
    if(request.method==='POST') {
     const form=new URLSearchParams(await request.text());requests.push(Object.fromEntries(form))
     assert.equal(form.get('type'),'document');assert.equal(form.get('options[document][require_matching_selfie]'),'true')
     assert.ok(!form.has('provided_details[email]')&&!form.has('provided_details[phone]'))
     const id='synthetic-inkwell-'+(sessions.size+10);sessions.set(id,{id,status:'requires_input',last_error:null})
     return Response.json({id,url:'https://verify.stripe.com/'+id})
    }
    const id=url.pathname.split('/').at(-1);return Response.json(sessions.get(id)??{error:'unknown'})
   }
   if(url.hostname==='verify.twilio.com') {
    const form=new URLSearchParams(await request.text());voice.push(Object.fromEntries(form))
    if(url.pathname.endsWith('/Verifications')) {assert.equal(form.get('Channel'),'call');return Response.json({sid:'synthetic-inkwell-80',channel:'call',status:'pending'})}
    assert.equal(form.get('VerificationSid'),'synthetic-inkwell-80')
    return Response.json({sid:'synthetic-inkwell-80',channel:'call',status:form.get('Code')==='123456'?'approved':'pending'})
   }
  },
  knowledgeResult(outcome,attempts=1) {
   const token=[...knowledge.keys()].at(-1),state=knowledge.get(token);state.medallion.currentSession.status='COMPLETED';state.medallion.currentSession.kba={mandatory:true,status:'COMPLETED',success:outcome==='passed',attempts:{allowed:2,availed:attempts},questions:['private-kba-question'],answers:['private-kba-answer']};return token
  },
  result(outcome,name='Mara Quinn') {
   const id=[...sessions.keys()].at(-1),[first_name,...rest]=name.split(' ')
   sessions.set(id,{id,status:outcome==='passed'?'verified':'requires_input',last_error:outcome==='passed'?null:{code:'document_unverified_other'},last_verification_report:{verification_session:id,document:{status:outcome==='passed'?'verified':'unverified',first_name,last_name:rest.join(' '),files:['private-id-image'],address:{line1:'private-provider-address'},dob:'private-provider-dob'},selfie:{status:outcome==='passed'?'verified':'unverified',files:['private-selfie-image']}}})
   return id
  },
 }
}
