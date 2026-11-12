import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, ActuaPagina
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ ActuaPagina } = await vite.ssrLoadModule('/src/pages/actua.jsx')) } catch (e) { if (!/Failed to load|Cannot find/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

const signalen = [
  { id: 1, domein: 'macro', agent: 'macro-wachter', bron_naam: 'VRT NWS', bron_url: 'https://vrt.be/a', zin: 'De inflatie is in oktober 2026 naar 5,26 procent gestegen.', getal: '5.26', eenheid: 'procent', bron_datum: '2026-10-29', status: 'te_controleren' },
  { id: 2, domein: 'markten', agent: 'markt-wachter', bron_naam: 'Vanguard', bron_url: 'https://vanguard.nl/b', zin: 'De TER is 0,14 procent.', getal: '0.14', eenheid: 'procent', bron_datum: '2026-11-11', status: 'bevestigd' },
]

const h = (extra = {}) => renderToStaticMarkup(React.createElement(ActuaPagina, { signalen, geladen: true, naar() {}, opStatus: () => {}, ...extra }))

test('de pagina toont per domein de signalen met cijfer en bron', () => {
  const uit = h()
  assert.match(uit, /Actua/)
  assert.match(uit, /Macro/)
  assert.match(uit, /5,26 procent/)
  assert.match(uit, /De inflatie is in oktober 2026 naar 5,26 procent gestegen\./)
  assert.match(uit, /href="https:\/\/vrt\.be\/a"/)
  assert.match(uit, /macro-wachter/)
})

test('onder een signaal staan de beslissingen', () => {
  const uit = h()
  assert.match(uit, /Klopt/)
  assert.match(uit, /Leg weg/)
  assert.match(uit, /Open de bron/)
})

test('de standaardweergave is wat op een beslissing wacht', () => {
  const uit = h()
  assert.match(uit, /5,26 procent/)
  assert.doesNotMatch(uit, /0,14 procent/)
})

test('zonder signalen zegt de pagina dat er niets wacht', () => {
  const uit = h({ signalen: [] })
  assert.match(uit, /Niets in deze stand/)
  assert.doesNotMatch(uit, /signaal-acties/)
})

test('tijdens het laden staat er geen lege staat', () => {
  const uit = h({ geladen: false, signalen: [] })
  assert.match(uit, /laden/)
  assert.doesNotMatch(uit, /Niets in deze stand/)
})
test('de wachters staan met hun ritme en versheid bovenaan', () => {
  const uit = h({ filosofieId: 166 })
  assert.match(uit, /De wachters/)
  assert.match(uit, /macro-wachter/)
  assert.match(uit, /maandelijks/)
  assert.match(uit, /Lees de filosofie van dit hart/)
  assert.equal((uit.match(/class="wachter /g) || []).length, 6)
})

test('zonder filosofiedocument staat er geen link naar de filosofie', () => {
  assert.doesNotMatch(h(), /Lees de filosofie/)
})
