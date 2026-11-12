import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, CommentsBalk, Walkthrough
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ CommentsBalk } = await vite.ssrLoadModule('/src/components/comments-balk.jsx'))
  ;({ Walkthrough } = await vite.ssrLoadModule('/src/components/walkthrough.jsx'))
})
after(async () => { await vite?.close() })

const blokken = [{ id: '1.3', code: '1.3', dag: 1, titel: 'ETF', volgorde: 50 }, { id: '2.1', code: '2.1', dag: 2, titel: 'Vastgoed', volgorde: 70 }]
const documentenMeta = [{ id: 9, blok_id: '1.3', soort: 'brief', titel: 'brief' }, { id: 24, blok_id: '2.1', soort: 'slides', titel: 'slides' }]
const notities = [
  { id: 1, doel_type: 'document', doel_id: '9', auteur: 'Victor', tekst: 'Deze passage moet de bron noemen.', anker: '51 procent in cash', opgelost: false, parent_id: null, created_at: '2026-11-12T10:01:00Z' },
  { id: 2, doel_type: 'document', doel_id: '9', auteur: 'Anthony', tekst: 'Akkoord, ik voeg de voetnoot toe.', anker: null, opgelost: false, parent_id: 1, created_at: '2026-11-12T10:05:00Z' },
  { id: 3, doel_type: 'document', doel_id: '24', auteur: 'Victor', tekst: 'Andere dag.', anker: null, opgelost: false, parent_id: null, created_at: '2026-11-12T11:00:00Z' },
  { id: 4, doel_type: 'document', doel_id: '9', auteur: 'Victor', tekst: 'Al klaar.', anker: null, opgelost: true, parent_id: null, created_at: '2026-11-12T09:00:00Z' },
]
const ctx = { blokken, documentenMeta, bronnen: [] }

test('de balk toont het aantal open comments, het bereik en de echte chips', () => {
  const html = renderToStaticMarkup(React.createElement(CommentsBalk, {
    ...ctx, notities, blokId: '1.3', dag: 1, bereik: 'dagdeel', titel: '1.3 · brief',
    opBereik() {}, opToonOpgelost() {}, opOpen() {}, opWalkthrough() {}, opSluiten() {},
  }))
  assert.match(html, /Comments/)
  assert.match(html, /<b class="cbalk-teller">3<\/b>/, 'drie open comments in totaal')
  assert.match(html, /aria-pressed="true"[^>]*>Dit dagdeel</)
  assert.match(html, /Deze passage moet de bron noemen/)
  assert.match(html, /51 procent in cash/)
  assert.match(html, /Walkthrough/)
  assert.doesNotMatch(html, /Al klaar/, 'opgeloste comments staan standaard uit')
})

test('opgeloste comments komen terug met de schakelaar, en Alles toont andere dagdelen', () => {
  const html = renderToStaticMarkup(React.createElement(CommentsBalk, {
    ...ctx, notities, blokId: '1.3', dag: 1, bereik: 'alles', toonOpgelost: true,
    opBereik() {}, opToonOpgelost() {}, opOpen() {}, opWalkthrough() {}, opSluiten() {},
  }))
  assert.match(html, /Al klaar/)
  assert.match(html, /Andere dag\./)
})

test('zonder comments legt de balk uit wat je moet doen', () => {
  const html = renderToStaticMarkup(React.createElement(CommentsBalk, {
    ...ctx, notities: [], blokId: '1.3', dag: 1, bereik: 'dagdeel',
    opBereik() {}, opToonOpgelost() {}, opOpen() {}, opWalkthrough() {}, opSluiten() {},
  }))
  assert.match(html, /Nog geen open comments in dit bereik/)
  assert.match(html, /disabled/, 'walkthrough staat uit zonder comments')
})

test('de walkthrough toont één comment groot, met de reactie eronder en een antwoordveld', () => {
  const html = renderToStaticMarkup(React.createElement(Walkthrough, {
    open: true, ...ctx, notities, blokId: '1.3', dag: 1, bereik: 'dagdeel', naam: 'Victor',
    opSluiten() {}, opOpenPlek() {}, opLos() {}, opAntwoord() {},
  }))
  assert.match(html, /Walkthrough in comments/)
  assert.match(html, /1 \/ 1/, 'één comment in dit dagdeel, de reactie hangt eronder en telt niet mee')
  assert.match(html, /51 procent in cash/)
  assert.match(html, /Deze passage moet de bron noemen/)
  assert.match(html, /Akkoord, ik voeg de voetnoot toe/, 'de reactie staat eronder')
  assert.match(html, /Open op de plek/)
  assert.match(html, /Los op/)
  assert.match(html, /Antwoord aan Victor/)
})

test('een lege walkthrough zegt het eerlijk en sluit netjes', () => {
  const dicht = renderToStaticMarkup(React.createElement(Walkthrough, { open: false, ...ctx, notities }))
  assert.equal(dicht, '')
  const leeg = renderToStaticMarkup(React.createElement(Walkthrough, {
    open: true, ...ctx, notities: [], blokId: '1.3', bereik: 'dagdeel', opSluiten() {},
  }))
  assert.match(leeg, /Geen open comments in dit bereik/)
})