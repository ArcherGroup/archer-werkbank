import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, Hoofd
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ Hoofd } = await vite.ssrLoadModule('/src/App.jsx'))
})
after(async () => { await vite?.close() })
const basis = { weergave: 'agent-proef', proefToegestaan: true, naam: 'Preview', naar() {}, blokken: [], documentenMeta: [], bronnen: [], beslissingen: [], geladen: true }

test('de lokale proefroute opent de echte proefpagina', () => {
  assert.equal(typeof Hoofd, 'function')
  const html = renderToStaticMarkup(React.createElement(Hoofd, basis))
  assert.match(html, /Proef met de commentaaragent/)
  assert.match(html, /Fictieve proef/)
  assert.match(html, /Echt model/)
})

test('zonder expliciete preview blijft de proefroute buiten de gedeelde app', () => {
  const html = renderToStaticMarkup(React.createElement(Hoofd, { ...basis, proefToegestaan: false }))
  assert.doesNotMatch(html, /Proef met de commentaaragent/)
  assert.match(html, /Van september naar februari/)
})
