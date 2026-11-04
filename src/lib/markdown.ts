import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.use({ gfm: true, breaks: true })

const cache = new Map<string, string>()

export function renderMarkdown(src: string) {
  const hit = cache.get(src)
  if (hit !== undefined) return hit
  const html = DOMPurify.sanitize(marked.parse(src, { async: false }) as string)
  if (cache.size > 2000) cache.clear()
  cache.set(src, html)
  return html
}

export function stripMarkdown(src: string) {
  return src
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [image] ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
