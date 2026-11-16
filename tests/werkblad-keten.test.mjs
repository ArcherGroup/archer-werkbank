import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, WerkbladPagina, BlokPagina
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ WerkbladPagina } = await vite.ssrLoadModule('/src/pages/werkblad.jsx'))
  ;({ BlokPagina } = await vite.ssrLoadModule('/src/pages/blok.jsx'))
})
after(async () => { await vite?.close() })
const blok = { id: '1.3', code: '1.3', titel: 'Waarom beleggen', dag: 1, status: 'Review' }
const docs = [
  { id: 9, blok_id: '1.3', soort: 'brief', titel: 'brief', bytes: 100 },
  { id: 10, blok_id: '1.3', soort: 'slides', titel: 'slides', bytes: 400 },
  { id: 20, blok_id: '4.4', soort: 'werkboek', titel: 'ander werkboek', bytes: 400 },
]
const bronnen = [{ id: 21, blok_id: '1.3', titel: 'Bron van 1.3' }, { id: 22, blok_id: '4.4', titel: 'Bron van ander dagdeel' }]
const props = { naam: 'Test', naar() {}, herlaad() {}, blokken: [blok], documentenMeta: docs, bronnen, beslissingen: [], geladen: true }
const html = (Component, extra = {}) => renderToStaticMarkup(React.createElement(Component, { ...props, ...extra }))
const stap = (pagina, id) => {
  const begin = pagina.indexOf(`data-stap="${id}"`)
  assert.ok(begin >= 0, `stap ${id} ontbreekt`)
  const eind = pagina.indexOf('data-stap="', begin + 11)
  return pagina.slice(begin, eind < 0 ? pagina.length : eind)
}

test('het werkblad laat de voorbereidingsketen van het geselecteerde dagdeel zien met echte doorklikken', () => {
  const pagina = html(WerkbladPagina)
  assert.match(pagina, /Voorbereidingsketen/)
  assert.match(pagina, /href="#\/doc\/9"/)
  assert.match(pagina, /href="#\/bron\/21"/)
  assert.doesNotMatch(pagina, /Bron van ander dagdeel/)
})

test('alleen de lokale preview biedt de interactieve agentproef aan', () => {
  const lokaal = html(WerkbladPagina, { proefToegestaan: true })
  const gedeeld = html(WerkbladPagina, { proefToegestaan: false })
  assert.match(lokaal, /Probeer de commentaaragent/)
  assert.doesNotMatch(gedeeld, /Probeer de commentaaragent/)
})

test('voor feedback is de stand onbekend totdat de notities werkelijk geladen zijn', () => {
  for (const pagina of [html(WerkbladPagina), html(BlokPagina, { blokId: '1.3' })]) {
    const feedback = stap(pagina, 'feedback')
    assert.match(feedback, /data-stand="onbekend"/)
    assert.doesNotMatch(feedback, /Nog geen notities/)
  }
})

test('niet geladen bronnen en stukken worden niet als lege of gevulde keten getoond', () => {
  const toestand = { documenten: false, bronnen: false, beslissingen: false }
  for (const pagina of [html(WerkbladPagina, { gegevensBeschikbaar: toestand }), html(BlokPagina, { blokId: '1.3', gegevensBeschikbaar: toestand })]) {
    for (const id of ['vraag', 'bronnen', 'lesinhoud', 'oefening', 'bijsturing']) {
      assert.match(stap(pagina, id), /data-stand="onbekend"/, `${id} is niet geladen`)
    }
  }
})

test('ook op een smal scherm heeft de dagdeelpagina toegang tot comments', () => {
  const pagina = html(BlokPagina, { blokId: '1.3' })
  assert.match(pagina, /class="knop doc-notities-knop"[^>]*aria-controls="blok-notities-paneel"/)
  assert.match(pagina, /id="blok-notities-paneel"[^>]*class="inspector doc-inspector /)
  assert.match(pagina, />Sluit comments</)
})

test('elk dagdeel krijgt het visuele overzicht en behoudt alle stukken in een gesloten lijst', () => {
  const pagina = html(BlokPagina, { blokId: '1.3' })
  assert.match(pagina, /Overzicht van het dagdeel/)
  assert.match(pagina, /Het dagdeel wordt geladen/)
  assert.match(pagina, /<details class="dv-stukken"><summary>Alle stukken/)
  assert.ok(pagina.indexOf('Overzicht van het dagdeel') < pagina.indexOf('Alle stukken'))
  assert.match(pagina, /href="#\/doc\/9"/)
  assert.match(pagina, /href="#\/doc\/10"/)
  assert.match(pagina, /Alle stukken van dit dagdeel \(2\)/, 'de kaart telt de echte stukken van dit dagdeel')
  const ander = html(BlokPagina, { blokId: '2.1', blokken: [{ ...blok, id: '2.1', code: '2.1' }] })
  assert.match(ander, /Overzicht van het dagdeel/, 'de visuele laag is er voor elk dagdeel, niet alleen 1.3')
  assert.match(ander, /Het dagdeel wordt geladen/, 'zonder geladen brief toont de kaart eerlijk dat hij laadt, geen verzonnen inhoud')
})

test('ieder dagdeel heeft dezelfde voorbereidingsketen met bronnen en eigen stukken', () => {
  const pagina = html(BlokPagina, { blokId: '1.3' })
  assert.match(pagina, /Voorbereidingsketen/)
  assert.match(pagina, /href="#\/doc\/10"/)
  assert.match(pagina, /href="#\/bron\/21"/)
  assert.doesNotMatch(pagina, /Bron van ander dagdeel/)
})
