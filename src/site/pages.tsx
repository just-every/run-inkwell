// The run site (run-inkwell.com) `rer build --site` writes: the homepage with its Run action, /run, the docs from
// docs/site.json, /contract from CONTRACT.md, and the not-found page. Every Run page string and command is in run.json;
// nothing here reads installation data.
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fontLinks } from '../base/font-head'
import { contractPageHtml } from '../base/contract-page'
import { hostingPageHtml } from '../base/hosting-page'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsHead, docsPages } from './docs/pages'
import { Landing } from './landing/Landing'
import { run } from './run'

// Code cards get their Copy button only when script runs; without it the command is still there to select.
const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"

const SHARE_IMAGE = `${identity.runSite}/site/share.jpg`
const ICONS = '<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'

// Base's Run, contract and not-found pages (src/base, copied unchanged) link the full mark as their icon and carry only
// the theme's tokens; on the run site they get the hand-tuned favicons and the site's grid paper and heavy headings.
const baseLook = (html: string) => html
  .replace(/<link rel="icon" href="\/brand\/mark\.svg">/, ICONS)
  .replace('</head>', '<link rel="stylesheet" href="/site/base-pages.css"></head>')

export function sitePages({ styles, contract, hosting }: SiteContext): SiteBuild {
  const data: RunData = run
  const document = (title: string, description: string, body: ReactElement, script = '') => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#ffffff" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Inkwell" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={SHARE_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {fontLinks.map(link => <link key={link.href} {...link} />)}
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}{script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document('Inkwell — Send it once. Get it signed.', identity.tagline, <Landing />) },
      { path: '/run', html: baseLook(runPageHtml(identity, data, contract)) },
      ...(contract ? [{ path: '/contract', html: baseLook(contractPageHtml(identity, data, contract)) }] : []),
      { path: '/docs', html: document(...docsHead(), <DocsIndex />) },
      { path: '/docs/hosting', html: baseLook(hostingPageHtml(identity, data, hosting, contract)) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(...docsHead(page.slug), <DocsArticle slug={page.slug} />, COPY) })),
      { path: '/404', html: baseLook(siteNotFoundHtml(identity, data, contract)) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'apple-touch-icon.png'],
  }
}
