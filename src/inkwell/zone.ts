/** The account's US time zone: America/New_York until ADMIN-004 lets the owner choose another (DELIV-003, RECORD-002). */
export const accountTimeZone = 'America/New_York'

/** An instant as the account reads it, in ASCII: "2026-10-18 22:30:00 EDT". */
export function localStamp(at: string | number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: accountTimeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date(at)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`
}
