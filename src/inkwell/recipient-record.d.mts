import type { Envelope } from './model'
export function validRecipientRecord(envelope:Envelope,canonical:(value:unknown)=>string,sha256:(value:string)=>Promise<string>):Promise<boolean>
