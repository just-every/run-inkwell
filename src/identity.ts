// This edition's identity: what its installed Lobby and its run site say.
// The name and colour are the ones setup saves in src/branding.json. The
// tagline is the run site's meta description; public/fonts/fonts.css declares the faces.
import type { EditionIdentity } from './base/identity'
import branding from './branding.json'
import site from '../deploy-site.json'

export const identity: EditionIdentity = {
  product: branding.name,
  deployment: branding.name,
  purpose: '{deployment} sends agreements to each signer in order and keeps the signed record.',
  tagline: 'Send it once. Get it signed. Free, open source e-signature: the alternative to Docusign, Adobe Acrobat Sign and Dropbox Sign.',
  signInPath: '/signin',
  // The run site `rer deploy --site` publishes (deploy-site.json).
  runSite: `https://${site.domain}`,
  // An installed instance serves the Lobby at /.
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  band: '/brand/band.svg',
  fonts: '/fonts/fonts.css',
  accentColor: branding.primaryColor,
}
