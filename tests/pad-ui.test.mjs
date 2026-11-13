import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'

let vite, Pad
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ Pad } = await vite.ssrLoadModule('/src/components/pad.jsx'))
})
after(async () => { await vite?.close() })

test('de ruime dagdeelknop benoemt de inhoud en navigeert vanuit het werkboek terug', () => {
  const dom = new JSDOM('<div id="test"></div>')
  const oud = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(document.getElementById('test'))
  try {
    const routes = []
    act(() => root.render(React.createElement(Pad, {
      route: '#/doc/17', naar: (r) => routes.push(r),
      blokken: [{ id: '1.3', code: '1.3', titel: "ETF's, theorie en oefening", dag: 1, volgorde: 3 }],
      documentenMeta: [{ id: 17, titel: 'werkboek', blok_id: '1.3' }],
    })))
    const knop = [...document.querySelectorAll('button')].find((b) => b.textContent === "1.3 · ETF's, theorie en oefening")
    assert.ok(knop)
    assert.ok(knop.classList.contains('plek-dagdeel'), 'Dagdeel moet een grotere herkenbare klikzone krijgen')
    act(() => knop.click())
    assert.deepEqual(routes, ['#/blok/1.3'])
    assert.equal(document.querySelector('[aria-current="page"]').textContent, 'werkboek')
  } finally {
    act(() => root.unmount())
    Object.assign(globalThis, oud); dom.window.close()
  }
})
