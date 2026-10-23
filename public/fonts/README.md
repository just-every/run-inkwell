# Fonts

Every family is self-hosted under the SIL Open Font License 1.1, with its licence beside it. The WOFF2 subsets come from
Fontsource 5.3.0. `public/rer-theme.css` declares every `@font-face` beside the `--rer-*` tokens, so the installer, the
app, sign-in, `/setup`, the Lobby and the run site get the same faces and make no third-party request. The installer
reads only that file, in Base's theme grammar, so `fonts.css` here holds the rest of Inkwell's look: Base's extra
`--rer-*` names and Inkwell's own tokens. The font head (`src/base/font-head.ts`) links `fonts.css` on the root
document, `/setup`, sign-in and the run site, the edition identity's `fonts` on the Lobby and Base's Run, contract and
not-found pages, and `src/server.dev.ts` on the development sign-in and hand-off pages; the hosted demo's gate inlines
it before the theme.

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
