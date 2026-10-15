# Fonts

Two families, both self-hosted under the SIL Open Font License 1.1:

- `libre-caslon-display/`: Libre Caslon Display 400 by Pablo Impallari,
  headings only. Latin and Latin Extended WOFF2 subsets from Fontsource
  (`@fontsource/libre-caslon-display` 5.3.0).
- `dm-sans/`: DM Sans by the DM Sans Project Authors, variable weight, upright
  and italic (the typed signature). Latin and Latin Extended WOFF2 subsets from
  Fontsource (`@fontsource-variable/dm-sans` 5.3.0).

`public/rer-theme.css` declares every `@font-face`, so every page that links
the theme (app, sign-in, `/setup`, the Lobby, the run site) gets both families
and makes no third-party request. `src/base/font-head.ts` preloads the two
Latin files the first paint uses.
