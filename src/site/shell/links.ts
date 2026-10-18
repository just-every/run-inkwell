import pkg from '../../../package.json'

// Every outward link on the run site comes from package.json's repository; the demo is the hosted try-it page.
export const repository = pkg.repository
export const licence = `${pkg.repository}/blob/main/LICENSE`
export const demo = 'https://demo.run-inkwell.com/'
export const docsPath = (slug?: string) => (slug ? `/docs/${slug}` : '/docs')
