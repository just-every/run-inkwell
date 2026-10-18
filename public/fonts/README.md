# Fonts

Every family is self-hosted under the SIL Open Font License 1.1, with its licence beside it. The WOFF2 subsets come from
Fontsource 5.3.0. `fonts.css` declares every `@font-face`; `public/rer-theme.css` imports it, so the app, sign-in,
`/setup`, the Lobby and the run site get the same faces and make no third-party request.

- `geist/`: Geist by the Geist Project Authors (Vercel), variable weight, upright (Latin and Latin Extended) and italic
  (Latin). Headings, the wordmark and all text. `@fontsource-variable/geist`.
- `geist-mono/`: Geist Mono by the Geist Project Authors, variable weight, Latin. Code and fingerprints.
  `@fontsource-variable/geist-mono`.
- `kalam/`: Kalam 400 and 700 by the Indian Type Foundry, Latin. The run site's handwritten sticky notes.
  `@fontsource/kalam`.
- `mrs-saint-delafield/`: Mrs Saint Delafield 400 by Alejandro Paul, Latin. Mark Ellis's drawn signature on the run
  site. `@fontsource/mrs-saint-delafield`.
- `allura/`: Allura 400 by the Allura Project Authors, Latin. Kenji Watanabe's drawn signature on the run site.
  `@fontsource/allura`.

`src/base/font-head.ts` preloads the Geist Latin file the first paint uses.
