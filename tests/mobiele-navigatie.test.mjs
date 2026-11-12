import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
let vite, Topbar, Zijbalk
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ Topbar } = await vite.ssrLoadModule('/src/components/topbar.jsx'))
  ;({ Zijbalk } = await vite.ssrLoadModule('/src/components/zijbalk.jsx'))
})
after(async () => { await vite?.close() })
test('de mobiele menuknop zegt of de navigatie open is en heeft een controleerbaar doel', () => {
  const h = (open) => renderToStaticMarkup(React.createElement(Topbar, { naam: 'Test', online: [], thema: 'auto', menuOpen: open }))
  assert.match(h(false), /aria-label="Navigatie openen"/)
  assert.match(h(false), /aria-controls="hoofd-navigatie"/)
  assert.match(h(false), /aria-expanded="false"/)
  assert.match(h(true), /aria-label="Navigatie sluiten"/)
  assert.match(h(true), /aria-expanded="true"/)
})
test('de zijbalk heeft een stabiel doel en de open toestand is zichtbaar', () => {
  const h = (open) => renderToStaticMarkup(React.createElement(Zijbalk, { route: '#/', naar() {}, blokken: [], bronnen: [], beslissingen: [], voorstellen: [], menuOpen: open }))
  assert.match(h(false), /id="hoofd-navigatie"/)
  assert.match(h(true), /class="zijbalk open"/)
})
