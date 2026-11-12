import { test } from 'node:test'
import assert from 'node:assert/strict'
import { padVoorRoute, positieVoor, dagdelenVan } from '../src/lib/pad.js'

const blokken = [
  { id: 'algemeen', code: 'A', titel: 'Algemeen', dag: 0, volgorde: 5 },
  { id: 'bronnen', code: 'B', titel: 'Bronnen', dag: 0, volgorde: 6 },
  { id: '1.1', code: '1.1', titel: 'De spiegel', dag: 1, volgorde: 30 },
  { id: '1.2', code: '1.2', titel: 'De meetlat', dag: 1, volgorde: 40 },
  { id: '1.3', code: '1.3', titel: "ETF's, theorie en oefening", dag: 1, volgorde: 50 },
  { id: '1.4', code: '1.4', titel: 'De oefening', dag: 1, volgorde: 60 },
  { id: '2.1', code: '2.1', titel: 'Het gebouw', dag: 2, volgorde: 70 },
  { id: '2.2', code: '2.2', titel: 'Vastgoed', dag: 2, volgorde: 80 },
  { id: '2.3', code: '2.3', titel: 'Grondstoffen', dag: 2, volgorde: 90 },
  { id: '2.4', code: '2.4', titel: 'Crypto', dag: 2, volgorde: 100 },
  { id: '3.1', code: '3.1', titel: 'De verpakking', dag: 3, volgorde: 110 },
  { id: '3.2', code: '3.2', titel: 'Vennootschap', dag: 3, volgorde: 120 },
  { id: '3.3', code: '3.3', titel: 'Dividend', dag: 3, volgorde: 130 },
  { id: '3.4', code: '3.4', titel: 'Exit', dag: 3, volgorde: 140 },
  { id: '4.1', code: '4.1', titel: 'Het plan', dag: 4, volgorde: 150 },
  { id: '4.2', code: '4.2', titel: 'De praktijk', dag: 4, volgorde: 160 },
  { id: '4.3', code: '4.3', titel: 'De A3', dag: 4, volgorde: 170 },
  { id: '4.4', code: '4.4', titel: 'Afronding', dag: 4, volgorde: 180 },
]

const documentenMeta = [
  { id: 17, titel: 'werkboek', blok_id: '1.3', soort: 'werkboek' },
  { id: 30, titel: 'Algemene bronnenlijst', blok_id: null, soort: 'bron' },
  { id: 299, titel: 'Een langere titel die best wel eens afgekapt zou mogen worden in het pad', blok_id: '2.1', soort: 'brief' },
]

const bronnen = [
  { id: 211, titel: 'Morningstar ETF-rapport', blok_id: '1.3', url: 'https://example.org/a' },
  { id: 500, titel: 'FSMA', blok_id: null, url: 'https://example.org/b' },
]

const dagTitels = [
  { dag: 1, titel: 'Financiële Bewustwording (de spiegel)' },
  { dag: 2, titel: 'De activa (de stenen)' },
]

const invoer = { blokken, documentenMeta, bronnen, dagTitels }

test('een werkboek toont dag, dagdeel en stuk, met de positie in de vierdaagse', () => {
  const pad = padVoorRoute('#/doc/17', invoer)
  assert.deepEqual(pad.delen.map((d) => d.label), ['Werkbank', 'Dag 1 · de spiegel', '1.3', 'werkboek'])
  assert.equal(pad.delen[0].route, '#/')
  assert.equal(pad.delen[1].route, '#/status')
  assert.equal(pad.delen[2].route, '#/blok/1.3')
  assert.equal(pad.delen[3].route, null)
  assert.equal(pad.positie, 'Dagdeel 3 van 16 · Dag 1 van 4')
})

test('de korte positie zegt dezelfde cijfers', () => {
  assert.equal(padVoorRoute('#/doc/17', invoer).positieKort, '3/16 · dag 1/4')
})

test('een dagdeel zelf is de laatste stap en heeft geen route', () => {
  const pad = padVoorRoute('#/blok/1.3', invoer)
  assert.equal(pad.delen[pad.delen.length - 1].label, '1.3')
  assert.equal(pad.delen[pad.delen.length - 1].route, null)
  assert.equal(pad.positie, 'Dagdeel 3 van 16 · Dag 1 van 4')
})

test('dag 0 en de verzamelblokken tellen niet mee als dagdeel', () => {
  const pad = padVoorRoute('#/blok/algemeen', invoer)
  assert.deepEqual(pad.delen.map((d) => d.label), ['Werkbank', 'A'])
  assert.equal(pad.positie, null)
  assert.equal(dagdelenVan(blokken).length, 16)
})

test('een stuk zonder dagdeel krijgt geen verzonnen dag', () => {
  const pad = padVoorRoute('#/doc/30', invoer)
  assert.deepEqual(pad.delen.map((d) => d.label), ['Werkbank', 'Algemene bronnenlijst'])
  assert.equal(pad.positie, null)
})

test('een bron met een dagdeel erft de plek, een losse bron niet', () => {
  const met = padVoorRoute('#/bron/211', invoer)
  assert.deepEqual(met.delen.map((d) => d.label), ['Werkbank', 'Dag 1 · de spiegel', '1.3', 'Morningstar ETF-rapport'])
  assert.equal(met.positie, 'Dagdeel 3 van 16 · Dag 1 van 4')
  const zonder = padVoorRoute('#/bron/500', invoer)
  assert.deepEqual(zonder.delen.map((d) => d.label), ['Werkbank', 'Bronnen', 'FSMA'])
  assert.equal(zonder.positie, null)
})

test('het werkblad toont de omvang van de vierdaagse', () => {
  const pad = padVoorRoute('#/', invoer)
  assert.deepEqual(pad.delen.map((d) => d.label), ['Werkbank', 'Werkblad'])
  assert.equal(pad.positie, 'Vier dagen · 16 dagdelen')
})

test('de vaste pagina’s krijgen hun eigen naam', () => {
  for (const [route, label] of [['#/status', 'Stand van zaken'], ['#/planning', 'Planning'], ['#/bronnen', 'Bronnen']]) {
    const pad = padVoorRoute(route, invoer)
    assert.equal(pad.delen[1].label, label)
  }
})

test('een onbekend stuk of dagdeel wordt gezegd, niet verzonnen', () => {
  assert.equal(padVoorRoute('#/doc/999', invoer).delen[1].label, 'Onbekend stuk')
  assert.equal(padVoorRoute('#/blok/9.9', invoer).delen[1].label, 'Onbekend dagdeel')
})

test('de volgorde komt uit volgorde, niet uit de aanleveringsvolgorde', () => {
  const doorElkaar = [...blokken].reverse()
  assert.equal(positieVoor(blokken.find((b) => b.id === '1.3'), doorElkaar).dagdeel, 3)
  assert.equal(positieVoor(blokken.find((b) => b.id === '1.3'), doorElkaar).dagdelen, 16)
})

test('zonder masterplan staat er alleen de dagnaam, geen verzonnen titel', () => {
  const pad = padVoorRoute('#/blok/1.3', { blokken, documentenMeta, bronnen })
  assert.equal(pad.delen[1].label, 'Dag 1')
})

test('een lange titel wordt afgekapt met een ellips', () => {
  const pad = padVoorRoute('#/doc/299', invoer)
  assert.ok(pad.delen[3].label.endsWith('…'))
  assert.ok(pad.delen[3].label.length <= 46)
})