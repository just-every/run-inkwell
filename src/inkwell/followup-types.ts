import type { Role } from './model'
export interface FollowupGrant { version:number; state:'active'|'revoked'|'suspended'|'ended'; memberId:string; memberVersion:number; memberRole:Role; maxContacts:number; days:number[]; startHour:number; endHour:number; escalationOwner:string; channels:['email']; at:string; startedAt?:string }
export interface FollowupState { signer:number; identity:string; cause?:string; paused:boolean; waitUntil?:string; contacts:number; proposal?:{email:string;source:string}; notified?:string[]; lastViewedAt?:string; viewSession?:string }
