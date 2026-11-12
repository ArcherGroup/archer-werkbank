import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, WerkboekBalk
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ WerkboekBalk } = await vite.ssrLoadModule('/src/components/werkboek-balk.jsx')) } catch (e) { if (!/Failed to load|Cannot find/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

const secties = [
  { id: 'de-plek-in-de-stam', niveau: 2, titel: 'De plek in de stam' },
  { id: 'wat-dat-betekent', niveau: 3, titel: 'Wat dat betekent' },
  { id: 'de-cijfers', niveau: 2, titel: 'De cijfers' },
]

function html(props = {}) {
  return renderToStaticMarkup(React.createElement(WerkboekBalk, { secties, actiefId: secties[0].id, aantalComments: 2, ...props }))
}

test('elke sectie wordt een grote tag met een nummer', () => {
  const uit = html()
  assert.equal((uit.match(/class="wb-tag /g) || []).length, 3)
  assert.match(uit, />01</)
  assert.match(uit, />03</)
  assert.match(uit, /De plek in de stam/)
})

test('de actieve tag is gemarkeerd en de rest niet', () => {
  const uit = html({ actiefId: 'wat-dat-betekent' })
  assert.equal((uit.match(/aria-current="location"/g) || []).length, 1)
  assert.match(uit, /wb-tag diep aan[^>]*aria-current="location"|aria-current="location"[^>]*wb-tag diep aan/)
})

test('de pijl terug staat uit op de eerste tag, de pijl verder op de laatste', () => {
  const eerste = html({ actiefId: secties[0].id })
  assert.match(eerste, /aria-label="Vorige tag"[^>]*disabled|disabled[^>]*aria-label="Vorige tag"/)
  const laatste = html({ actiefId: secties[2].id })
  assert.match(laatste, /aria-label="Volgende tag"[^>]*disabled|disabled[^>]*aria-label="Volgende tag"/)
})

test('de laatste klik is zichtbaar met zijn fragment', () => {
  const uit = html({ laatste: { gebruiker: 'Anthony', fragment: 'de groeipilaar is de brug' } })
  assert.match(uit, /Anthony/)
  assert.match(uit, /de groeipilaar is de brug/)
})

test('zonder comments staat de walkthrough uit, met comments toont hij het aantal', () => {
  assert.match(html({ aantalComments: 0 }), /class="knop primair wb-start"[^>]*disabled|disabled[^>]*class="knop primair wb-start"/)
  assert.match(html({ aantalComments: 2 }), /Walkthrough · 2/)
})

test('zonder secties rendert de balk niets', () => {
  assert.equal(html({ secties: [] }), '')
})