import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, CommentThread
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ CommentThread } = await vite.ssrLoadModule('/src/components/comment-thread.jsx'))
})
after(async () => { await vite?.close() })

const root = (extra = {}) => ({
  id: 9, auteur: 'Hermes', anker: '51 procent cash',
  tekst: 'Zet op de slide dat het om 11 van de 23 deelnemers gaat.',
  created_at: '2026-11-12T20:38:00Z',
  reacties: [],
  ...extra,
})

function html(props = {}) {
  return renderToStaticMarkup(React.createElement(CommentThread, {
    thread: { root: root() }, naam: 'Victor', opAntwoord: () => {}, opLos: () => {}, opAfwijzen: () => {}, opHeropenen: () => {}, ...props,
  }))
}

test('een comment zonder anker heet eerlijk een Algemene comment', () => {
  const uit = html({ thread: { root: root({ anker: null }) } })
  assert.match(uit, /Algemene comment/)
})

test('een normale, gevonden passage blijft gewoon een citaat, geen "gewijzigd"-label', () => {
  const uit = html({ lichaamTekst: 'Hier staat 51 procent cash en nog wat tekst erna.' })
  assert.match(uit, /51 procent cash/)
  assert.doesNotMatch(uit, /Passage gewijzigd/)
})

test('een gewijzigde passage krijgt een eerlijk label in plaats van een stille misser', () => {
  const uit = html({
    thread: { root: root({ anker: '51 procent cash', anker_context: { exact: '51 procent cash', prefix: 'hier staat ', suffix: ' en nog wat' } }) },
    lichaamTekst: 'Hier staat 51 procent aan liquiditeiten en nog wat tekst erna.',
    opToon: () => {},
  })
  assert.match(uit, /Passage gewijzigd/)
})

test('een reactie die nog lokaal is krijgt zijn eigen badge, los van de wortel', () => {
  const uit = html({ thread: { root: root({ reacties: [{ id: 'lokaal-1', auteur: 'Victor', tekst: 'Komt eraan', created_at: '2026-11-12T20:39:00Z', lokaal: true }] }) } })
  assert.match(uit, /Komt eraan/)
  assert.match(uit, /lokaal/i)
})

test('oplossen en afwijzen staan uit op een nog niet verstuurde wortel, met uitleg', () => {
  const uit = html({ thread: { root: root({ id: 'lokaal-9', lokaal: true }) } })
  assert.match(uit, /Eerst synchroniseren/)
  assert.doesNotMatch(uit, /<button[^>]*onclick/i)
  const knopLosOp = /<button[^>]*class="[^"]*thread-los[^"]*"[^>]*>/.exec(uit)
  assert.ok(!knopLosOp || /disabled/.test(knopLosOp[0]), 'Los op moet uit staan voor een onverstuurde wortel')
})

test('een synchrone, al bewaarde wortel mag gewoon opgelost of afgewezen worden', () => {
  const uit = html({ thread: { root: root({ id: 42 }) } })
  assert.doesNotMatch(uit, /Eerst synchroniseren/)
  assert.match(uit, /Los op/)
  assert.doesNotMatch(uit, /class="[^"]*thread-los[^"]*"[^>]*disabled/)
})

test('geen permanente verwijder-knop meer in de normale ervaring', () => {
  const uit = html({ opVerwijderen: () => {} })
  assert.doesNotMatch(uit, /aria-label="Comment verwijderen"/)
})
