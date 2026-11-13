import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, ZaalPreview
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ ZaalPreview } = await vite.ssrLoadModule('/src/components/zaal-preview.jsx')) } catch (e) { if (!/Failed to load|Cannot find/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

const h = (extra = {}) => renderToStaticMarkup(React.createElement(ZaalPreview, { ...extra }))

test('het gemiddelde van de zaal staat er met de steekproef erbij', () => {
  const uit = h()
  assert.match(uit, /€ 262\.548/)
  assert.match(uit, /gemiddeld ingevuld financieel vermogen/)
  assert.match(uit, /10<\/b> van 24 deelnemers/)
  assert.match(uit, /€ 2\.625\.482/)
})

test('de verdeling is een taart met een legende en blijft standaard dicht', () => {
  const dicht = h()
  assert.match(dicht, /Bekijk de verdeling/)
  assert.doesNotMatch(dicht, /zaal-legende/)
  const open = h({ compact: false })
  assert.match(open, /Verberg de verdeling/)
  assert.match(open, /zaal-legende/)
  assert.match(open, /Cash/)
  assert.match(open, /53,3%/)
  assert.match(open, /ETF&#x27;s en fondsen/)
})

test('de bron en de beperking staan er letterlijk bij', () => {
  const uit = h()
  assert.match(uit, /Invest App V0, februari 2027, 13 november 2026/)
  assert.match(uit, /vroege steekproef/)
  assert.match(uit, /100,1 procent/)
  assert.match(uit, /exclusief vastgoed en ondernemingswaarde/)
  assert.match(uit, /zonder beheerders of mentoren/)
})

test('de taart heeft voor elke post met een stuk een pad', () => {
  const uit = h({ compact: false })
  assert.equal((uit.match(/<path /g) || []).length, 20)
})
