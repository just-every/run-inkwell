/** The mark and the "Inkwell" wordmark in the heading face: the header's and the footer's lockup. */
export function Lockup({ size = 'header' }: { size?: 'header' | 'footer' }) {
  const width = size === 'header' ? 70 : 50
  return (
    <a className={`ik-lockup ik-lockup--${size}`} href="/">
      <img src="/brand/mark.svg" width={width} height={width} alt="" />
      <span>Inkwell</span>
    </a>
  )
}
