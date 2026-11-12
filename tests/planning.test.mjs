import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, pagina
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  pagina = await vite.ssrLoadModule('/src/pages/planning.jsx')
})
after(async () => { await vite?.close() })

function scherm(extra = {}) {
  return renderToStaticMarkup(React.createElement(pagina.PlanningPagina, {
    geladen: true, beslissingen: [], validaties: [], voorstellen: [], naam: 'Victor', naar: () => {}, ...extra,
  }))
}

test('een open beslissing leidt naar een review in plaats van een lege invoerprompt', () => {
  const html = scherm({ beslissingen: [{ id: 1, titel: 'Het GGR-anker', detail: 'Kies één anker', eigenaar: 'Victor', status: 'open' }] })
  assert.match(html, /Bekijk beslissing/)
  assert.doesNotMatch(html, />\s*Beslechten\s*<\/button>/)
})

test('een open validatie biedt een review aan in plaats van een misleidend voltooid label', () => {
  const html = scherm({ validaties: [{ id: 1, onderwerp: 'Fiscale cijfers 2027', wie: 'Jurgen', wanneer: 'half januari', detail: 'Te controleren', status: 'open' }] })
  assert.match(html, /Bekijk validatie/)
  assert.doesNotMatch(html, />\s*Gevalideerd\s*<\/button>/)
})

test('de validatiereview toont de betrokkene en vraagt expliciete bevestiging', () => {
  assert.equal(typeof pagina.ValidatieReview, 'function')
  const html = renderToStaticMarkup(React.createElement(pagina.ValidatieReview, {
    validatie: { onderwerp: 'Fiscale cijfers 2027', wie: 'Jurgen', wanneer: 'half januari', detail: 'Te controleren', status: 'open' },
    opBevestig: () => {}, opAnnuleer: () => {},
  }))
  assert.match(html, /Fiscale cijfers 2027/)
  assert.match(html, /Jurgen/)
  assert.match(html, /Te controleren/)
  assert.match(html, /alleen de status/i)
  assert.match(html, /Als gevalideerd markeren/)
})

test('een voorstel wordt niet zonder review als gedaan gemarkeerd', () => {
  const html = scherm({ voorstellen: [{ id: 1, titel: 'Feedback verwerken', soort: 'inhoud', detail: 'Na bespreking', status: 'open' }] })
  assert.match(html, /Bekijk voorstel/)
  assert.doesNotMatch(html, />\s*Gedaan\s*<\/button>/)
})
