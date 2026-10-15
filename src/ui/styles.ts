// The app's stylesheets, linked by the /app and /sign/$token routes after the
// root's rer-theme.css and tokens.css. Each file holds one part of the app.
export const appStyles = ['controls', 'shell', 'envelopes', 'editor', 'settings'].map(name => ({ rel: 'stylesheet', href: `/app/${name}.css` }))
