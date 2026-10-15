import pkg from '../../../package.json'

// Every outward link on the run site comes from package.json's repository.
export const repository = pkg.repository
export const licence = `${pkg.repository}/blob/main/LICENSE`
export const docsPath = (slug?: string) => (slug ? `/docs/${slug}` : '/docs')
