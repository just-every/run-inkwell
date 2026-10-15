// Small marks shared by the app's screens: the plum check on signed rows,
// integrity results and the signer's confirmation, and the marbled roundel.
export function Check() {
  return <svg className="iw-check-mark" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" /><path d="M6.5 11.3l3 3 6-6.4" /></svg>
}
export function Roundel({ size = 64 }: { size?: number }) {
  return <img className="iw-roundel" src="/brand/mark.svg" width={size} height={size} alt="" />
}
