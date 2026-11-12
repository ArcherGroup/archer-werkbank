import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, WerkboekWalkthrough
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ WerkboekWalkthrough } = await vite.ssrLoadModule('/src/components/werkboek-walkthrough.jsx')) } catch (e) { if (!/Failed to load|Cannot find/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

const body = `# 1.3 ETF's

Inleiding.

## De plek in de stam

De ETF is in het beeld van de stam de groeipilaar. Hij staat naast de GGR.
De vroege deelnemers zitten op 1 procent ETF's en 51 procent cash.

## De cijfers

De kostenkloof is het tweede beeld.
`

const notities = [
  {
    id: 9, doel_type: 'document', doel_id: '9', auteur: 'Hermes', anker: '51 procent cash',
    tekst: 'Zet op de slide dat het om 11 van de 23 deelnemers gaat.', created_at: '2026-11-12T20:38:00Z',
  },
  { id: 99, parent_id: 9, doel_type: 'document', doel_id: '9', auteur: 'Victor', anker: null, tekst: 'Goed punt, pas ik aan.', created_at: '2026-11-12T20:40:00Z' },
]

function html(props = {}) {
  return renderToStaticMarkup(React.createElement(WerkboekWalkthrough, {
    open: true, notities, body, secties: [], naam: 'Victor', titel: 'brief',
    opSluiten: () => {}, opSpring: () => {}, opLos: () => {}, opAntwoord: () => {}, opAfwijzen: () => {}, opHeropenen: () => {}, ...props,
  }))
}

test('de walkthrough toont het stuk met de aangehaalde zin gemarkeerd', () => {
  const uit = html()
  assert.match(uit, /class="ww-anker">51 procent cash</)
  assert.match(uit, /De vroege deelnemers zitten op 1 procent ETF&#x27;s en/)
  assert.match(uit, /In het stuk/)
})

test('de comment staat ernaast met zijn auteur, datum en antwoordveld', () => {
  const uit = html()
  assert.match(uit, /Hermes/)
  assert.match(uit, /Zet op de slide dat het om 11 van de 23 deelnemers gaat\./)
  assert.match(uit, /Antwoord aan Hermes/)
  assert.match(uit, /1 \/ 1/)
})

test('reacties worden als gesprek getoond, met de knop om af te wijzen', () => {
  const uit = html()
  assert.match(uit, /Goed punt, pas ik aan\./)
  assert.match(uit, /Wijs af/)
  assert.match(uit, /Los op/)
})

test('zonder comments zegt hij dat er niets te doorlopen is', () => {
  const uit = html({ notities: [] })
  assert.match(uit, /Nog geen open comments in dit stuk/)
  assert.match(uit, /0 \/ 0/)
})

test('een comment zonder anker krijgt geen verzonnen citaat', () => {
  const uit = html({ notities: [{ ...notities[0], anker: null }] })
  assert.doesNotMatch(uit, /class="ww-anker"/)
  assert.match(uit, /hangt niet aan een zin/)
})

test('gesloten rendert hij niets', () => {
  assert.equal(html({ open: false }), '')
})