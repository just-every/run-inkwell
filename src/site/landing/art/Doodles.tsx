import { Jm } from './signature'

// The closing's doodles: three small checked envelopes riding a dotted path, and a signed paper plane looping away.

export function MiniEnvelope({ tone, className = '' }: { tone: 'white' | 'blue' | 'green'; className?: string }) {
  const fill = { white: '#ffffff', blue: '#d6e9ff', green: '#c9f3df' }[tone]
  return (
    <svg className={className} viewBox="0 0 124 100" aria-hidden="true">
      <g stroke="#0b0d12" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
        <rect x="8" y="30" width="96" height="62" rx="8" fill={fill} />
        <path d="M11 35L56 66L101 35" fill="none" />
      </g>
      <circle cx="100" cy="28" r="17" fill="#12a150" stroke="#fff" strokeWidth="4" />
      <path d="M92 28.5l6 6 10.5-11" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PaperPlane({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 280 210" aria-hidden="true">
      <path d="M58 168c-30 8-46-14-30-30 14-14 34 0 24 18-10 18-38 24-52 40" fill="none" stroke="#0b0d12" strokeWidth="3" strokeDasharray="7 8" strokeLinecap="round" />
      <g stroke="#0b0d12" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M60 78L268 16L150 150L122 104Z" fill="#fff" />
        <path d="M268 16L122 104L118 146L150 128" fill="#eef1f5" />
        <g stroke="#0b0d12"><Jm x={118} y={58} width={88} stroke={4} /></g>
      </g>
    </svg>
  )
}
