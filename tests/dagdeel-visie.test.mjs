import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, DagdeelVisie, herstelVisieStand, metVisieStand
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ DagdeelVisie, herstelVisieStand, metVisieStand } = await vite.ssrLoadModule('/src/components/dagdeel-visie.jsx')) } catch (e) { if (!/Failed to load|Cannot find/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

const blok = { id: '1.3', code: '1.3', titel: "ETF's, theorie en oefening", dag: 1, spreker: 'Anthony' }
const blokken = [
  { id: '1.1', code: '1.1', titel: 'Inleiding', dag: 1, volgorde: 1 },
  { id: '1.3', code: '1.3', titel: 'ETF’s', dag: 1, volgorde: 3 },
  { id: '4.4', code: '4.4', titel: 'Vermogensplan', dag: 4, volgorde: 4 },
]
const kaart = {
  doel: 'De deelnemer kan een ETF vergelijken.', boodschap: 'Eerst de functie, dan het voertuig.',
  tijdvakken: [
    { id: 1, begin: '14:00', einde: '14:10', minuten: 10, vorm: 'luisteren', titel: 'Opening', detail: 'De startvraag.' },
    { id: 2, begin: '14:10', einde: '14:45', minuten: 35, vorm: 'luisteren', titel: 'Theorie', detail: 'De uitleg.' },
    { id: 3, begin: '14:45', einde: '15:15', minuten: 30, vorm: 'doen', titel: 'Oefening', detail: 'Vergelijk op papier.' },
    { id: 4, begin: '15:15', einde: '15:30', minuten: 15, vorm: 'beslissen', titel: 'Afsluiting', detail: 'Kies een actie.' },
  ],
  bronnen: [
    { id: 9, soort: 'brief', titel: 'brief', route: '#/doc/9' },
    { id: 16, soort: 'spreektekst', titel: 'spreektekst', route: '#/doc/16' },
    { id: 15, soort: 'slides', titel: 'slides', route: '#/doc/15' },
    { id: 17, soort: 'werkboek', titel: 'werkboek', route: '#/doc/17' },
  ],
  dagdelen: blokken.filter((b) => b.dag === 1).map((b) => ({ ...b, route: `#/blok/${b.id}` })),
  dagen: [{ dag: 1, titel: 'Bewustwording' }, { dag: 2, titel: 'Activa' }, { dag: 3, titel: 'Structuur' }, { dag: 4, titel: 'Plan' }],
  rodeDraad: 'Vier dagen bouwen aan een plan.', plek: { ggr: 'Wat doet dit met je GGR?', gebouw: 'De groeipilaar' },
}
const h = (extra = {}) => renderToStaticMarkup(React.createElement(DagdeelVisie, { blok, blokken, kaart, naar() {}, ...extra }))

test('het gekozen onderdeel toont de stukken die bij zijn vorm horen, met doorklik', () => {
  const html = h()
  const begin = html.indexOf('class="dv-detail"')
  const detail = html.slice(begin, html.indexOf('</section>', begin))
  assert.match(detail, /Bij dit onderdeel/)
  assert.match(detail, /href="#\/doc\/16"/, 'de spreektekst hoort bij luisteren')
  assert.match(detail, /href="#\/doc\/15"/, 'de slides horen bij luisteren')
  assert.doesNotMatch(detail, /href="#\/doc\/17"/, 'het werkboek hoort niet bij luisteren')
})

test('een stuk waarvan de titel de soort is, toont zijn soort niet twee keer', () => {
  const html = h()
  assert.doesNotMatch(html, /<span>brief<\/span><em>brief<\/em>/, 'geen dubbele labels')
  const metEigenTitel = h({ stukkenPerBlok: { '1.3': [{ id: 21, soort: 'research', titel: '01-etf-kosten', route: '#/doc/21' }] } })
  assert.match(metEigenTitel, /<span>01-etf-kosten<\/span><em>research<\/em>/, 'een eigen titel houdt zijn soortlabel')
})

test('de dag toont per dagdeel een widget met de echte stukken en een doorklik', () => {
  const stukkenPerBlok = {
    '1.1': [{ id: 40, soort: 'brief', titel: 'brief', route: '#/doc/40' }],
    '1.3': kaart.bronnen,
  }
  const html = h({ beginNiveau: 'dag', stukkenPerBlok })
  assert.match(html, /<details class="dv-widget[^"]*"/)
  assert.match(html, /1 stuk/, 'het aantal stukken staat op de rij')
  assert.match(html, /href="#\/doc\/40"/, 'een stuk van een ander dagdeel is bereikbaar')
  assert.match(html, /Open het volledige dagdeel/)
  assert.match(html, /href="#\/blok\/1.1"/)
  const zonder = html.slice(html.indexOf('href="#/doc/40"'))
  assert.ok(!zonder.slice(0, 40).includes('#/doc/9'))
})

test('de dagstrip laat rechtstreeks naar een andere dag springen', () => {
  const html = h({ beginNiveau: 'dag' })
  for (const dag of [1, 2, 3, 4]) assert.match(html, new RegExp(`>Dag ${dag}<`))
})

test('de vierdaagse noemt per dag hoeveel dagdelen er zijn', () => {
  const html = h({ beginNiveau: 'vierdaagse' })
  assert.match(html, /2 dagdelen/, 'dag 1 heeft twee dagdelen in de invoer')
  assert.match(html, /1 dagdeel[^n]/, 'dag 4 heeft er één')
})

test('terug in de geschiedenis herstelt het gekozen niveau, dag, onderdeel en open blok', () => {
  const bestaand = { __werkbank: { spoor: ['#/blok/1.3'], scroll: 42 }, anders: 'behouden' }
  const stand = { niveau: 'dag', dag: 4, gekozenId: 3, open: '1.1' }
  const geschiedenis = metVisieStand(bestaand, '1.3', stand)
  assert.deepEqual(geschiedenis.__werkbank, bestaand.__werkbank)
  assert.equal(geschiedenis.anders, 'behouden')
  assert.deepEqual(herstelVisieStand(geschiedenis, blok), stand)
  assert.deepEqual(herstelVisieStand(geschiedenis, { ...blok, id: '2.1', dag: 2 }), { niveau: 'dagdeel', dag: 2, gekozenId: null, open: null })
  assert.deepEqual(herstelVisieStand({ __dagdeelVisie: { blokId: '1.3', niveau: 'onzin', dag: -1, gekozenId: {}, open: 7 } }, blok), { niveau: 'dagdeel', dag: 1, gekozenId: null, open: null })
})

test('een opengeklapt dagdeel staat meteen open als de geschiedenis dat zegt', () => {
  const html = h({ beginNiveau: 'dag', beginOpen: '1.1', stukkenPerBlok: { '1.1': [{ id: 40, soort: 'brief', titel: 'brief', route: '#/doc/40' }] } })
  const eerste = html.slice(html.indexOf('<details class="dv-widget'), html.indexOf('</details>') + 10)
  assert.match(eerste, /data-open="ja"/, 'het eerste blok staat open')
  assert.match(eerste, /href="#\/doc\/40"/, 'de stukken staan meteen klaar')
  const tweede = html.slice(html.indexOf('<details class="dv-widget', html.indexOf('<details class="dv-widget') + 5))
  assert.match(tweede, /data-open="nee"/, 'de andere blokken blijven dicht')
})

test('de geschiedenis wint van het standaardniveau, zodat terugkeer de werkplek herstelt', () => {
  const vorige = globalThis.window
  globalThis.window = { history: { state: { __dagdeelVisie: { blokId: '1.3', niveau: 'dag', dag: 4, gekozenId: null, open: '4.4' } }, replaceState() {} } }
  try {
    const html = h()
    assert.match(html, /data-niveau="dag"/, 'de kaart opent op de dag uit de geschiedenis')
    assert.match(html, /data-open="ja"/, 'het opengeklapte dagdeel blijft open')
  } finally {
    if (vorige === undefined) delete globalThis.window; else globalThis.window = vorige
  }
})

test('de visuele kaart signaleert verschillende eigenaars met een link naar de brief', () => {
  const html = h({ eigenaarVerschil: { dagdeel: 'Anthony', brief: 'Victor', bron: '#/doc/9' } })
  assert.match(html, /Verschil om af te stemmen/)
  assert.match(html, /Dagdeel:.*Anthony/)
  assert.match(html, /Brief:.*Victor/)
  assert.match(html, /href="#\/doc\/9"/)
})

test('de visuele dagdeelkaart toont doel, tijdlijn, bron en drie niveaus', () => {
  assert.equal(typeof DagdeelVisie, 'function', 'visuele dagdeelkaart ontbreekt')
  const html = h()
  for (const label of ['Dagdeel', 'Dag', '4 dagen', 'Wat gebeurt er?', 'De deelnemer kan een ETF vergelijken.', '14:00', '15:30']) assert.ok(html.includes(label), `${label} ontbreekt`)
  assert.match(html, /href="#\/doc\/9"/)
  assert.match(html, /href="#\/doc\/17"/)
})

test('ontbrekende briefing geeft geen verzonnen tijden of doelen', () => {
  const leeg = { ...kaart, doel: null, boodschap: null, tijdvakken: [], bronnen: [], dagen: [], plek: null, rodeDraad: null }
  const html = h({ kaart: leeg })
  assert.doesNotMatch(html, /14:00|15:30|De deelnemer kan een ETF vergelijken/)
  assert.match(html, /nog niet beschikbaar|nog geen|ontbreekt/i)
})

test('bij het laden zegt de kaart dat eerlijk in plaats van dat de inhoud ontbreekt', () => {
  const html = h({ laden: true, kaart: { ...kaart, doel: null, tijdvakken: [] } })
  assert.match(html, /laden|geladen/i)
  assert.doesNotMatch(html, /nog geen programma/i)
})

test('het dag-niveau toont een tijdlijn van de dagdelen met hun begin- en einduur', () => {
  const dagSchema = { '1.1': { begin: '09:00', einde: '10:30', minuten: 90 }, '1.3': { begin: '14:00', einde: '15:30', minuten: 90 } }
  const html = h({ beginNiveau: 'dag', dagSchema })
  assert.match(html, /class="dv-dagtijdlijn"/)
  assert.match(html, /09:00 tot 10:30/)
  assert.match(html, /14:00 tot 15:30/)
  assert.ok(html.indexOf('09:00 tot 10:30') < html.indexOf('14:00 tot 15:30'), 'de tijdlijn staat op volgorde van begintijd')
  assert.match(html, /href="#\/blok\/1\.1"/, 'een tijdvlak klikt door naar het dagdeel')
  const zonder = h({ beginNiveau: 'dag' })
  assert.doesNotMatch(zonder, /dv-dagtijdlijn/, 'zonder schema geen tijdlijn')
})
