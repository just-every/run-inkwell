import { Jm } from './signature'

// The mascot, drawn from the mark: the smiling jade envelope with a thick near-black outline, flat fills, the lighter
// band along the pocket's V and one deeper-jade side for depth. The hero's is open with the signed letter rising; the
// filing moment's is sealed, its flap folded down to a round green check.

/** The hero's open envelope, the same character as the mark drawn larger, with its fold lines and a soft ground shadow. */
export function HeroMascot({ className = '' }: { className?: string }) {
  const body = 'M40 228Q40 210 57 218L285 322Q300 329 315 322L543 218Q560 210 560 228V470Q560 495 535 495H65Q40 495 40 470Z'
  return (
    <svg className={className} viewBox="0 0 600 540" aria-hidden="true">
      <defs>
        <clipPath id="hm-body"><path d={body} /></clipPath>
        <filter id="hm-blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <ellipse cx="312" cy="516" rx="262" ry="13" fill="#07211a" opacity=".13" filter="url(#hm-blur)" />
      <g transform="rotate(-2.5 300 300)" stroke="#07211a" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round">
        <path d={body} transform="translate(9 11)" fill="#078a5e" />
        <path d="M40 218L190 120L282 52Q300 40 318 52L410 120L560 218V330H40Z" fill="#0a9e6c" />
        <path d="M150 330V112Q150 94 168 94H432Q450 94 450 112V330Z" fill="#fff" />
        <g stroke="#07211a"><Jm x={204} y={146} width={196} stroke={9} /></g>
        <path d={body} fill="#00c98b" />
        <g clipPath="url(#hm-body)" fill="none" stroke="#2bd9a2" strokeWidth="14">
          <path d="M48 238L285 345Q300 352 315 345L552 238" />
        </g>
        <path d="M66 478L238 374M534 478L362 374" fill="none" stroke="#0a9e6c" strokeWidth="5" opacity=".7" />
        <path d="M57 218L285 322Q300 329 315 322L543 218M194 392A26 26 0 0 1 246 392M354 392A26 26 0 0 1 406 392" fill="none" />
        <path d="M257 405H343Q355 405 353 417C348 450 328 468 300 468C272 468 252 450 247 417Q245 405 257 405Z" fill="#07211a" strokeWidth="4" />
        <ellipse cx="300" cy="452" rx="26" ry="11" fill="#f26f8a" stroke="none" />
      </g>
    </svg>
  )
}

/** Section 8's sealed envelope: flap folded down to a round green check, the mark's face on the flap, mid-hop. */
export function SealedMascot({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 420 380" aria-hidden="true">
      <defs><filter id="sm-blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="8" /></filter></defs>
      <ellipse cx="214" cy="358" rx="96" ry="10" fill="#07211a" opacity=".14" filter="url(#sm-blur)" />
      <path d="M178 298l-10 26M208 300l6 26" stroke="#07211a" strokeWidth="6" strokeLinecap="round" fill="none" />
      <g transform="rotate(-7 210 160)" stroke="#07211a" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round">
        <rect x="30" y="56" width="360" height="222" rx="24" transform="translate(8 10)" fill="#078a5e" />
        <rect x="30" y="56" width="360" height="222" rx="24" fill="#00c98b" />
        <path d="M44 74L196 186Q210 196 224 186L376 74" fill="none" stroke="#9df0ce" strokeWidth="13" transform="translate(0 15)" />
        <path d="M40 66L196 182Q210 192 224 182L380 66" fill="none" />
        <path d="M150 112A20 20 0 0 1 190 112M230 112A20 20 0 0 1 270 112" fill="none" />
        <path d="M183 124H237Q245 124 244 132C241 152 228 162 210 162C192 162 179 152 176 132Q175 124 183 124Z" fill="#07211a" strokeWidth="3" />
        <ellipse cx="210" cy="152" rx="16" ry="7" fill="#f26f8a" stroke="none" />
        <circle cx="210" cy="196" r="27" fill="#12a150" stroke="#fff" strokeWidth="7" />
        <circle cx="210" cy="196" r="31" fill="none" strokeWidth="5" />
        <path d="M197 197l9 9 17-18" fill="none" stroke="#fff" strokeWidth="7" />
      </g>
    </svg>
  )
}

/** The mark's character at the foot of the closing, peeking over the footer rule. */
export function PeekMascot({ className = '' }: { className?: string }) {
  return <img className={className} src="/brand/mark.svg" width={240} height={240} alt="" />
}
