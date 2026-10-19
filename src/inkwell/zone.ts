/** The account's US time zone: America/New_York until ADMIN-004 lets the owner choose another (DELIV-003, RECORD-002). */
export const accountTimeZone = 'America/New_York'

/** A zone's offset from UTC at an instant, in milliseconds. */
export function zoneOffset(at: number, zone = accountTimeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(at)).map(part => [part.type, Number(part.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000
}
/** The instant a wall-clock time (UTC fields of `wall`) happens in `zone`. */
export const zoneInstant = (wall: number, zone = accountTimeZone) => wall - zoneOffset(wall - zoneOffset(wall, zone), zone)

/** An instant as the account reads it, in ASCII: "2026-10-18 22:30:00 EDT". */
export function localStamp(at: string | number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: accountTimeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date(at)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`
}
