// A drawn QR-style tile for the web form cards: three finder squares and a fixed scatter of modules. It is a picture
// of a code, not a scannable one, so it points nowhere.
const SIZE = 21
const finder = (x: number, y: number) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`

function modules(): string {
  let seed = 1048, d = ''
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    if (!inFinder(x, y) && seed % 100 < 47) d += `M${x} ${y}h1v1h-1z`
  }
  return d
}
const PATH = finder(0, 0) + finder(14, 0) + finder(0, 14) + modules()

export function Qr({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="-1 -1 23 23" shapeRendering="crispEdges" aria-hidden="true"><path d={PATH} fillRule="evenodd" fill="#0b0d12" /></svg>
}
