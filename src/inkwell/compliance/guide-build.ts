import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { renderMarkdown } from '../../site/docs/build/render'

/** The installed Settings guide and published docs share one Markdown source, rendered at build time. */
export function healthcareGuide(): Plugin {
  const id = 'virtual:inkwell-healthcare-guide', file = resolve('docs/healthcare.md')
  return { name: 'inkwell:healthcare-guide', resolveId: requested => requested === id ? '\0' + id : null,
    load(requested) {
      if (requested !== '\0' + id) return
      this.addWatchFile(file)
      return `export default ${JSON.stringify(renderMarkdown(readFileSync(file, 'utf8')).html)}`
    },
  }
}
