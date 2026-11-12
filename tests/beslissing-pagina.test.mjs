import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, pagina = {}
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  try { pagina = await vite.ssrLoadModule('/src/pages/beslissing.jsx') } catch (e) { if (!/Failed to load|Cannot find/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

test('een beslispagina toont de vraag, mogelijkheden, bronnen en een geblokkeerde bevestiging', () => {
  assert.equal(typeof pagina.BeslissingPagina, 'function')
  const html = renderToStaticMarkup(React.createElement(pagina.BeslissingPagina, {
    beslissingId: 1, geladen: true, beslissingen: [{ id: 1, titel: 'Het GGR-anker', detail: 'Eén getal kiezen', status: 'open', eigenaar: 'Victor' }],
    documentenMeta: [{ id: 75, blok_id: 'algemeen', titel: 'masterplan-februari-2027' }, { id: 72, blok_id: '4.4', titel: 'spreektekst' }],
    naar: () => {}, herlaad: () => {},
  }))
  assert.match(html, /Het GGR-anker/)
  assert.match(html, /0,3% als rode-draadanker/)
  assert.match(html, /0,6% als rode-draadanker/)
  assert.match(html, /Spreektekst 4\.4/)
  assert.match(html, /Motivering/)
  assert.match(html, /Vastleggen/)
  assert.match(html, /disabled=""/)
})
