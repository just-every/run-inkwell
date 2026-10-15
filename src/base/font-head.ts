// Shared by the root renderer and the no-JavaScript first-run document.
// public/rer-theme.css declares the faces; these preload the Latin files the
// first paint uses (DM Sans for text, Libre Caslon Display for headings).
export const fontLinks = [
  { rel: 'preload', href: '/fonts/dm-sans/dm-sans-latin-wght-normal.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  { rel: 'preload', href: '/fonts/libre-caslon-display/libre-caslon-display-latin-400-normal.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
] as const

export const fontHead = fontLinks.map(link => `<link ${Object.entries(link).map(([name, value]) => `${name.toLowerCase()}="${value}"`).join(' ')}>`).join('')
