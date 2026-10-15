// Line icons in plum for the drawings and the Also included tiles. Decorative: each sits beside its own text.
const Svg = ({ children, size = 48 }: { children: React.ReactNode; size?: number }) => (
  <svg className="ik-icon" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const DocumentIcon = () => <Svg size={24}><path d="M13 5h15l9 9v29H13z" /><path d="M28 5v9h9" /></Svg>
export const SignersIcon = () => <Svg><circle cx="24" cy="15" r="6" /><path d="M13 39c0-7 5-12 11-12s11 5 11 12z" /><circle cx="9" cy="21" r="4" /><path d="M2 39c0-5 3-9 7-9 2 0 3 .5 4.5 1.5" /><circle cx="39" cy="21" r="4" /><path d="M46 39c0-5-3-9-7-9-2 0-3 .5-4.5 1.5" /></Svg>
export const FieldsIcon = () => <Svg><path d="M5 3h17l7 7v33H5z" /><path d="M22 3v7h7M11 14h8M11 20h12M11 27h4M17 27h8M21 27v9M11 33h4" /><rect x="31" y="29" width="14" height="14" rx="2" /><path d="M31 34h14M35 26v5M41 26v5" /></Svg>
export const VoidIcon = () => <Svg><circle cx="24" cy="24" r="19" /><path d="M17 17l14 14M31 17L17 31" /></Svg>
export const RestoreIcon = () => <Svg><ellipse cx="20" cy="10" rx="14" ry="5" /><path d="M6 10v24c0 3 6 5 14 5M34 10v12M6 22c0 3 6 5 14 5" /><path d="M31 32a8 8 0 1 0 2.5-5.8M33.5 21.5v5h5" /></Svg>
export const EraseIcon = () => <Svg><path d="M9 11h30M19 11V6h10v5M12 11l2 31h20l2-31M21 18v17M27 18v17" /></Svg>
