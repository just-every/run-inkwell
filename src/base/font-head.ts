// Shared by the root renderer and the no-JavaScript first-run document.
// public/rer-theme.css declares the faces; this preloads the Latin Geist file the first paint uses and links
// public/fonts/fonts.css, Inkwell's tokens beyond the theme.
export const fontLinks = [
  { rel: 'preload', href: '/fonts/geist/geist-latin-wght-normal.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: '/fonts/fonts.css' },
] as const

export const fontHead = fontLinks.map(link => `<link ${Object.entries(link).map(([name, value]) => `${name.toLowerCase()}="${value}"`).join(' ')}>`).join('')
