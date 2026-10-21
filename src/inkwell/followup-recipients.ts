import { currentSigners, memberRow, rowPlace, type Envelope } from './model'
export interface FollowupRecipient { row:number; place:number; member?:number; name:string; email:string }
export function followupRecipients(e:Envelope):FollowupRecipient[]{return e.signers.flatMap<FollowupRecipient>((s,place)=>s.group?s.group.members.map((person,member)=>({row:memberRow(place,member),place,member,...person})):[{row:place,place,member:undefined,...s}])}
export function followupRecipient(e:Envelope,row:number){return followupRecipients(e).find(p=>p.row===row)!}
export const currentFollowupRecipients=(e:Envelope)=>followupRecipients(e).filter(p=>currentSigners(e).includes(p.place))
export const followupPlace=(row:number)=>rowPlace(row).place
