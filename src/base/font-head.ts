// Shared by the root renderer and the no-JavaScript first-run document.
// public/fonts/fonts.css declares the faces; this preloads the Latin Geist file the first paint uses.
export const fontLinks = [
  { rel: 'preload', href: '/fonts/geist/geist-latin-wght-normal.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
] as const

export const fontHead = fontLinks.map(link => `<link ${Object.entries(link).map(([name, value]) => `${name.toLowerCase()}="${value}"`).join(' ')}>`).join('')
