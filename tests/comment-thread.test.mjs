import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, CommentThread
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ CommentThread } = await vite.ssrLoadModule('/src/components/comment-thread.jsx')) } catch (e) { if (!/Failed to load|Cannot find/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

const root = {
  id: 9, auteur: 'Hermes', anker: '51 procent cash',
  tekst: 'Zet op de slide dat het om 11 van de 23 deelnemers gaat.',
  created_at: '2026-11-12T20:38:00Z',
}

const vol = (extra = {}) => ({
  root: {
    ...root,
    reacties: [
      { id: 10, auteur: 'Victor', tekst: 'Klopt, pas ik aan.', created_at: '2026-11-12T20:40:00Z' },
      { id: 11, auteur: 'Hermes', tekst: 'Dan zet ik het er zo in.', created_at: '2026-11-12T20:41:00Z' },
    ],
    ...extra,
  },
})

function html(props = {}) {
  return renderToStaticMarkup(React.createElement(CommentThread, {
    thread: vol(), naam: 'Victor', opAntwoord: () => {}, opLos: () => {}, opAfwijzen: () => {}, opHeropenen: () => {}, ...props,
  }))
}

test('een open comment toont zijn gesprek in volgorde', () => {
  const uit = html()
  assert.match(uit, /Hermes/)
  assert.match(uit, /Klopt, pas ik aan\./)
  assert.match(uit, /Dan zet ik het er zo in\./)
  assert.ok(uit.indexOf('Klopt, pas ik aan.') < uit.indexOf('Dan zet ik het er zo in.'))
  assert.match(uit, /data-status="open"/)
})

test('een eigen antwoord staat anders dan dat van een ander', () => {
  const uit = html()
  assert.match(uit, /thread-bubbel eigen">[^<]*<span[^>]*>Victor/)
  assert.match(uit, /thread-bubbel "><span[^>]*>Hermes/)
})

test('je kunt antwoorden, oplossen en afwijzen', () => {
  const uit = html()
  assert.match(uit, /Antwoord aan Hermes/)
  assert.match(uit, /Los op/)
  assert.match(uit, /Wijs af/)
})

test('afwijzen vraagt eerst om een reden', () => {
  const uit = html({ afwijzenOpen: true })
  assert.ok(uit)
  const metVraag = renderToStaticMarkup(React.createElement(CommentThread, {
    thread: vol(), naam: 'Victor', opAfwijzen: () => {}, opLos: () => {},
  }))
  assert.match(metVraag, /Wijs af/)
  assert.doesNotMatch(metVraag, /Waarom wijs je dit af/)
})

test('een afgewezen comment blijft staan met zijn reden en kan heropend worden', () => {
  const uit = html({ thread: vol({ afgewezen: true, afgewezen_door: 'Victor', afwijs_reden: 'Hoort bij 2.1' }) })
  assert.match(uit, /data-status="afgewezen"/)
  assert.match(uit, /afgewezen · Victor/)
  assert.match(uit, /Reden: Hoort bij 2\.1/)
  assert.match(uit, /Heropen/)
  assert.doesNotMatch(uit, /Antwoord aan Hermes/)
  assert.doesNotMatch(uit, /Wijs af/)
})

test('een opgeloste comment toont wie hem oploste', () => {
  const uit = html({ thread: vol({ opgelost: true, opgelost_door: 'Anthony' }) })
  assert.match(uit, /data-status="opgelost"/)
  assert.match(uit, /opgelost · Anthony/)
  assert.match(uit, /Heropen/)
})

test('zonder handlers blijven de woorden staan maar geen knoppen', () => {
  const uit = renderToStaticMarkup(React.createElement(CommentThread, { thread: vol(), naam: 'Victor' }))
  assert.match(uit, /Zet op de slide/)
  assert.doesNotMatch(uit, /Los op/)
  assert.doesNotMatch(uit, /Wijs af/)
  assert.doesNotMatch(uit, /Antwoord aan Hermes/)
})

test('zonder comment rendert hij niets', () => {
  assert.equal(renderToStaticMarkup(React.createElement(CommentThread, { thread: null })), '')
})