export interface Envelope {id:string;title:string;status:string;signers:{email:string;[key:string]:unknown}[];events:{action:string;[key:string]:unknown}[];testMode?:true;[key:string]:unknown}
export interface Result {result:{id:string;status?:string}}
export interface Definition {title?:string;filename?:string;pdfBase64?:string;signers?:unknown[];fields?:unknown[];templateId?:string;recipients?:unknown[];status?:'draft'|'sent';[key:string]:unknown}
export class Inkwell {
 constructor(options:{origin:string;key:string;fetch?:typeof fetch});
 request<T=unknown>(path:string,options?:{method?:string;body?:unknown;binary?:boolean}):Promise<T>;
 list(query?:Record<string,string>):Promise<{envelopes:Envelope[];total:number}>;
 get(id:string):Promise<{envelope:Envelope}>;
 create(definition:Definition,commandId?:string):Promise<Result>;
 send(id:string,options?:Record<string,unknown>,commandId?:string):Promise<Result>;
 correct(id:string,input:Record<string,unknown>,commandId?:string):Promise<Result>;
 resend(id:string,input:Record<string,unknown>,commandId?:string):Promise<Result>;
 void(id:string,reason:string,commandId?:string):Promise<Result>;
 artifact(id:string,kind:string):Promise<Uint8Array>;
 templates(query?:Record<string,string>):Promise<{templates:unknown[]}>;
 openapi():Promise<unknown>;
}
