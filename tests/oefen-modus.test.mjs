import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

let vite, OefenModus
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ OefenModus } = await vite.ssrLoadModule('/src/components/oefen-modus.jsx'))
})
after(async () => { await vite?.close() })

const MD = `## 1 Opening (ca. 10 minuten)

> Goedemorgen allemaal.
> Fijn dat jullie er zijn. **[TE CONTROLEREN]**

*[Pauze.]*

> Dan beginnen we *[kijkt op]* meteen. **[ANTHONY BEVESTIGT: het getal]**

## 2 Midden (ca. 5 minuten)

> Tweede passage.
`
const html = (props = {}) => renderToStaticMarkup(React.createElement(OefenModus, { markdown: MD, titel: 'Keynote', opSluit() {}, ...props }))

test('toont de eerste passage groot, met voortgang en tijd', () => {
  const uit = html()
  assert.match(uit, /Passage 1 van 2/)
  assert.match(uit, /ca\. 10 min/)
  assert.match(uit, /Goedemorgen allemaal\. Fijn dat jullie er zijn\./)
  assert.match(uit, /role="progressbar"[^>]*aria-valuenow="1"/)
  assert.doesNotMatch(uit, /Tweede passage/)
})

test('regie is een cue, niet in de spreektekst; controlepunten standaard verborgen', () => {
  const uit = html()
  assert.match(uit, /class="oefen-cue blok"[^>]*>.*Pauze\./)
  assert.match(uit, /oefen-cue inline/)
  assert.doesNotMatch(uit, /oefen-badge/)
  assert.doesNotMatch(uit, /TE CONTROLEREN/)
  assert.match(uit, /Controlepunten \(2\)/)
})

test('navigatie toont alle passages met tijd; startIndex springt', () => {
  const uit = html({ startIndex: 1 })
  assert.equal((uit.match(/class="oefen-nav-knop/g) || []).length, 2)
  assert.match(uit, /Passage 2 van 2/)
  assert.match(uit, /Tweede passage/)
  assert.match(uit, /aria-current="location"[^>]*>.*2 Midden/)
  assert.match(uit, /Klaar · terug naar lezen/)
})

test('heeft een duidelijke sluitknop en is een dialoog', () => {
  const uit = html()
  assert.match(uit, /Sluit oefenmodus/)
  assert.match(uit, /role="dialog"/)
  assert.doesNotMatch(uit, /Bewerken|Historiek|Comments/)
})

test('lege tekst geeft een vriendelijke leegstaat met terugknop', () => {
  const uit = html({ markdown: 'Alleen een gewone alinea.' })
  assert.match(uit, /nog geen passages/)
  assert.match(uit, /Terug naar lezen/)
})

test('document.jsx: knop alleen voor spreektekst, oefenmodus additief naast lees/bewerk/historiek', () => {
  const src = readFileSync(new URL('../src/pages/document.jsx', import.meta.url), 'utf8')
  assert.match(src, /isSpreektekst\(doc\) && \(\s*<button[\s\S]{0,120}setModus\('oefen'\)/)
  assert.match(src, /modus === 'oefen' && isSpreektekst\(doc\)/)
  assert.match(src, /setModus\('bewerk'\)/)
  assert.match(src, /setModus\('historiek'\)/)
})

test('css respecteert reduced motion en gebruikt tokens', () => {
  const css = readFileSync(new URL('../src/components/oefen-modus.css', import.meta.url), 'utf8')
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /var\(--pagina\)/)
  for (const m of css.matchAll(/font-family:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'var(--font-ui)')
})
