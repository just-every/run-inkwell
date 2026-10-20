import { insist } from './model'

/** PREP-003: image stamps use SIGNX-002's existing PNG/JPEG and 512 KiB image bounds. */
export const MAX_STAMP_BYTES = 512 * 1024
export const MAX_STAMP_VALUE = Math.ceil(MAX_STAMP_BYTES / 3) * 4 + 32
export function stampParts(value: string, label = 'stamp') {
  const match = value.length <= MAX_STAMP_VALUE && /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  insist(match, `Upload a PNG or JPEG image of at most 512 KiB for ${label}.`)
  return { mediaType: match[1] as 'image/png' | 'image/jpeg', imageBase64: match[2] }
}
