// The "Jm" signature from the mark's letter: one stroke, a J with a lower loop, then an m with a long tail.
// Drawn in the mark's own 1024-unit space, where it spans x 345 to 697 and y 300 to 447.
export const JM = 'M357.5 382.5C365 350 395 315 425 312.5C450 311 447.5 340 437.5 362.5C425 392.5 390 430 355 435C335 437.5 350 415 380 405C410 395 450 380 475 365C492.5 355 497.5 372.5 485 392.5C470 420 480 425 500 405C520 385 540 365 555 372.5C570 380 575 395 592.5 390L685 362.5'

/** The Jm stroke placed in a box: x, y and width in the parent's units, stroke width in those units too. */
export function Jm({ x, y, width, stroke }: { x: number; y: number; width: number; stroke: number }) {
  const scale = width / 352
  return <path d={JM} transform={`translate(${x - 345 * scale} ${y - 300 * scale}) scale(${scale})`} fill="none" strokeWidth={stroke / scale} strokeLinecap="round" strokeLinejoin="round" />
}
