import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: false })

export function splitsFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md ?? '')
  if (!m) return { front: null, body: md ?? '' }
  return { front: m[1].trim(), body: md.slice(m[0].length) }
}

/* Markdown komt uit de database en wordt met dangerouslySetInnerHTML gezet.
   Zonder sanitatie kan een geïnjecteerde <img onerror=…> in een document
   uitvoeren in de browser van de andere gebruiker. DOMPurify houdt de
   gewone opmaak (tabellen, koppen, links) intact en gooit scripts en
   gebeurtenisattributen weg. */
export function renderMd(md) {
  const { body } = splitsFrontmatter(md)
  const html = marked.parse(body)
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
  })
}
