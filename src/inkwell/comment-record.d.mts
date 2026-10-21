import type { Envelope } from './model'
export function commentEpoch(envelope: Envelope, signer: number): string
export function validCommentRecords(envelope: Envelope, rows: {id:string;data:string}[], canonical: (value:unknown)=>string, sha256:(value:string)=>Promise<string>): Promise<boolean>
