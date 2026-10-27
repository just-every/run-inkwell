/** Inkwell clients keep credentials in the caller's server process. Never bundle a key into browser code. */
export class Inkwell {
 constructor({origin,key,fetch:transport=globalThis.fetch}){const url=new URL(origin);if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Use HTTPS for the installation origin.');this.origin=url.origin;this.key=key;this.transport=transport}
 async request(path,{method='GET',body,binary=false}={}){if(!path.startsWith('/api/v1/')||path.includes('://'))throw Error('Use a relative public API path.');const response=await this.transport(new URL(path,this.origin),{method,redirect:'error',headers:{authorization:`Bearer ${this.key}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!response.ok){const error=await response.json().catch(()=>({error:'Request failed.'}));throw Object.assign(Error(error.error??'Request failed.'),{status:response.status,code:error.code,retryAfter:response.headers.get('retry-after')})}return binary?new Uint8Array(await response.arrayBuffer()):response.json()}
 list(query={}){return this.request('/api/v1/envelopes?'+new URLSearchParams(query))}
 get(id){return this.request('/api/v1/envelopes/'+encodeURIComponent(id))}
 create(definition,commandId=crypto.randomUUID()){return this.request('/api/v1/envelopes',{method:'POST',body:{...definition,commandId}})}
 send(id,options={},commandId=crypto.randomUUID()){return this.mutate(id,'send',options,commandId)}
 correct(id,input,commandId=crypto.randomUUID()){return this.mutate(id,'correct',input,commandId)}
 resend(id,input,commandId=crypto.randomUUID()){return this.mutate(id,'resend',input,commandId)}
 void(id,reason,commandId=crypto.randomUUID()){return this.mutate(id,'void',{reason},commandId)}
 mutate(id,action,input,commandId){return this.request(`/api/v1/envelopes/${encodeURIComponent(id)}/${action}`,{method:'POST',body:{...input,commandId}})}
 artifact(id,kind){return this.request(`/api/v1/envelopes/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(kind)}`,{binary:true})}
 templates(query={}){return this.request('/api/v1/templates?'+new URLSearchParams(query))}
 openapi(){return this.request('/api/v1/openapi.json')}
}
