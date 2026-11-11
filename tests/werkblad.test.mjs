import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

async function laad() {
  try {
    return await import('../src/lib/werkblad.js')
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
    throw e
  }
}

test('een sectie stopt bij de volgende kop van hetzelfde niveau', async () => {
  const werkblad = await laad()
  assert.equal(typeof werkblad.haalSectie, 'function', 'werkblad moet secties uit brondocumenten kunnen lezen')
  const markdown = '# Brief\n\n## Kernboodschap\nEerste alinea.\n\n### Nadere uitleg\nDetails.\n\n## Te controleren\nNog open.'
  assert.equal(werkblad.haalSectie(markdown, 'Kernboodschap'), 'Eerste alinea.\n\n### Nadere uitleg\nDetails.')
  assert.equal(werkblad.haalSectie(markdown, 'Ontbrekend'), '')
})

test('uit een lijst worden alleen echte punten gekozen en de volgorde blijft behouden', async () => {
  const werkblad = await laad()
  assert.equal(typeof werkblad.eerstePunten, 'function')
  const sectie = 'Introductie.\n\n1. **Eerste keuze.** Met context.\n2. **Tweede keuze.** Ook context.\n3. Derde keuze.'
  assert.deepEqual(werkblad.eerstePunten(sectie, 2), ['**Eerste keuze.** Met context.', '**Tweede keuze.** Ook context.'])
  assert.deepEqual(werkblad.eerstePunten('Geen lijst aanwezig.', 2), [])
})

test('de lagen van de rode draad komen uit de tabel van het masterplan', async () => {
  const werkblad = await laad()
  assert.equal(typeof werkblad.haalLagen, 'function')
  const tekst = '## 2. De rode draad in één zin\n\n| Laag | Wat het is | Waar |\n|---|---|---|\n| **B · de romp** | De vier dagen | De volgorde |\n| **A · de meetlat** | Het GGR | Elk dagdeel |\n\n## Verder\nTekst'
  assert.deepEqual(werkblad.haalLagen(tekst), [
    { naam: 'B · de romp', uitleg: 'De vier dagen', waar: 'De volgorde' },
    { naam: 'A · de meetlat', uitleg: 'Het GGR', waar: 'Elk dagdeel' },
  ])
  assert.deepEqual(werkblad.haalLagen('# Geen tabel'), [])
})

test('het werkblad kiest de echte brief en verwart de sprekersbriefing niet met de brief', async () => {
  const werkblad = await laad()
  assert.equal(typeof werkblad.vindBrief, 'function')
  const documenten = [
    { id: 19, blok_id: '2.1', soort: 'brief', titel: 'briefing-gunther' },
    { id: 18, blok_id: '2.1', soort: 'brief', titel: 'brief' },
    { id: 9, blok_id: '1.3', soort: 'brief', titel: 'brief' },
  ]
  assert.equal(werkblad.vindBrief(documenten, '2.1')?.id, 18)
  assert.equal(werkblad.vindBrief(documenten, '4.4'), null)
  assert.equal(werkblad.vindBrief([...documenten, { id: 20, blok_id: '2.1', soort: 'brief', titel: 'brief' }], '2.1'), null)
})

test('de vergelijking haalt alleen de aanwezige onderdelen uit het werkdocument', async () => {
  const werkblad = await laad()
  assert.equal(typeof werkblad.maakVergelijking, 'function')
  const brief = '# Brief\n\n## Kernboodschap\nNieuwe boodschap.\n\n## Hergebruik uit september\n1. Oud punt.\n\n## Niet meer doen\n1. Laat dit weg.\n\n## Lessen uit de Telegram feedback\n1. Gebruik een microfoon.\n\n## Te controleren\nJurgen kijkt dit na.'
  const vergelijking = werkblad.maakVergelijking(brief)
  assert.equal(vergelijking.kern, 'Nieuwe boodschap.')
  assert.equal(vergelijking.september, '1. Oud punt.')
  assert.equal(vergelijking.nietMeer, '1. Laat dit weg.')
  assert.equal(vergelijking.feedback, '1. Gebruik een microfoon.')
  assert.equal(vergelijking.controle, 'Jurgen kijkt dit na.')
  assert.equal(vergelijking.stam, '', 'ontbrekende broninhoud mag niet worden ingevuld')
})

test('oude dagbronnen worden afgeleid uit de verwijzingen in de brief', async () => {
  const werkblad = await laad()
  assert.equal(typeof werkblad.vorigeDagen, 'function')
  const brief = '## Hergebruik uit september\nZie dag 4-transcript, dag2-september-2026.md en later dag 4.\n\n## Te controleren\nGeen andere bron.'
  assert.deepEqual(werkblad.vorigeDagen(brief), [4, 2])
  assert.deepEqual(werkblad.vorigeDagen('## Hergebruik uit september\nEr is geen dag genoemd.'), [])
})

test('de vergelijking laat verleden, huidige aanpak en controlepunten met bron zien', async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  try {
    let pagina = {}
    try { pagina = await vite.ssrLoadModule('/src/pages/werkblad.jsx') } catch (e) {
      if (!String(e.message).includes('werkblad.jsx')) throw e
    }
    assert.equal(typeof pagina.VergelijkingInhoud, 'function', 'de vergelijkingsweergave ontbreekt')
    const brief = { id: 9, inhoud: '## Kernboodschap\nNieuwe aanpak.\n\n## Hergebruik uit september\n1. Papieren oefening.\n\n## Te controleren\nLaat nakijken.' }
    const html = renderToStaticMarkup(React.createElement(pagina.VergelijkingInhoud, { brief, documentenMeta: [], naar: () => {} }))
    assert.match(html, /Nieuwe aanpak/)
    assert.match(html, /Papieren oefening/)
    assert.match(html, /Laat nakijken/)
    assert.match(html, /werkdocument/i)
  } finally { await vite.close() }
})

test('extra bronpunten blijven via details beschikbaar in plaats van te verdwijnen', async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  try {
    const pagina = await vite.ssrLoadModule('/src/pages/werkblad.jsx')
    const brief = { id: 9, inhoud: '## Hergebruik uit september\n1. Eerste punt.\n2. Tweede punt.\n3. Derde punt.' }
    const html = renderToStaticMarkup(React.createElement(pagina.VergelijkingInhoud, { brief, documentenMeta: [], naar: () => {} }))
    assert.match(html, /Derde punt/)
    assert.match(html, /<details/)
  } finally { await vite.close() }
})

test('een onderzoeksresultaat toont verifieerbare bron en verbergt onbeoordeelde AI-duiding', async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  try {
    let module = {}
    try { module = await vite.ssrLoadModule('/src/pages/onderzoek.jsx') } catch (e) {
      if (!String(e.message).includes('onderzoek.jsx')) throw e
    }
    assert.equal(typeof module.OnderzoeksResultaat, 'function', 'onderzoeksresultaat ontbreekt')
    const resultaat = { status: 'klaar', bronnen: [
      { titel: 'Officiële bron', url: 'https://financien.belgium.be/bron', citaat: 'Letterlijk broncitaat.', claim: 'Duiding van de agent.' },
      { titel: 'Ongeldig', url: 'javascript:alert(1)', citaat: 'Mag nooit een link zijn.', claim: 'Onveilig.' },
    ], open_vragen: [] }
    const html = renderToStaticMarkup(React.createElement(module.OnderzoeksResultaat, { resultaat }))
    assert.match(html, /Letterlijk broncitaat/)
    assert.match(html, /href="https:\/\/financien\.belgium\.be\/bron"/)
    assert.match(html, /nog niet inhoudelijk gecontroleerd/i)
    assert.match(html, /<details/)
    assert.doesNotMatch(html, /href="javascript:/i)
  } finally { await vite.close() }
})

test('de gedeelde site toont geen schijnbaar werkende agentknop', async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  try {
    const module = await vite.ssrLoadModule('/src/pages/onderzoek.jsx')
    assert.equal(typeof module.OnderzoekPaneel, 'function', 'agentpaneel ontbreekt')
    const html = renderToStaticMarkup(React.createElement(module.OnderzoekPaneel, { lokaal: false }))
    assert.match(html, /gedeelde.*agent.*niet actief/i)
    assert.match(html, /extern model/i)
    assert.doesNotMatch(html, /type="submit"/i)
  } finally { await vite.close() }
})

test('feedback toont dat de toegang openbaar is', async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  try {
    const pagina = await vite.ssrLoadModule('/src/pages/werkblad.jsx')
    const html = renderToStaticMarkup(React.createElement(pagina.WerkbladPagina, {
      geladen: true, blokken: [{ id: '1.3', code: '1.3', titel: 'ETF' }], documentenMeta: [], beslissingen: [], naam: 'Victor', naar: () => {}, tik: 0,
    }))
    assert.match(html, /openbaar.*iedereen.*lezen.*wijzigen/i)
  } finally { await vite.close() }
})

test('het werkblad verzint geen masterplan als de bron ontbreekt', async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  try {
    const pagina = await vite.ssrLoadModule('/src/pages/werkblad.jsx')
    assert.equal(typeof pagina.WerkbladPagina, 'function')
    const html = renderToStaticMarkup(React.createElement(pagina.WerkbladPagina, {
      geladen: true, blokken: [], documentenMeta: [], beslissingen: [], naam: 'Victor', naar: () => {}, tik: 0,
    }))
    assert.match(html, /masterplan.*niet.*beschikbaar/i)
    assert.doesNotMatch(html, /0,3%/)
  } finally { await vite.close() }
})
