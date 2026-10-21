import { accountTimeZone } from './zone'
export const localDate=(at:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:accountTimeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at)
export const localHour=(at:number)=>Number(new Intl.DateTimeFormat('en-US',{timeZone:accountTimeZone,hour:'numeric',hourCycle:'h23'}).format(at))
export const dayOfWeek=(date:string)=>new Date(date+'T12:00:00Z').getUTCDay()
export function addBusinessDays(date:string,count:number){let at=Date.parse(date+'T12:00:00Z');while(count>0){at+=86400000;const d=new Date(at).getUTCDay();if(d>0&&d<6)count--}return new Date(at).toISOString().slice(0,10)}
