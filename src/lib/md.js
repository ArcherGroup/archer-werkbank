import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

export function splitsFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md ?? '')
  if (!m) return { front: null, body: md ?? '' }
  return { front: m[1].trim(), body: md.slice(m[0].length) }
}

export function renderMd(md) {
  const { body } = splitsFrontmatter(md)
  return marked.parse(body)
}
