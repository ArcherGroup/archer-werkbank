import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpreektekst, splitsDelen, leesTijd, isSpreektekst, tijdLabel } from '../src/lib/spreektekst.js'

const MD = `# Spreektekst

Voorwoord dat geen podium is.

## 3.1 Opening: welkom (ca. 10 minuten)

> Goedemorgen allemaal.
> Fijn dat jullie er zijn.

*[Pauze.]*

> Vandaag gaan we het hebben over **vertrouwen** en *tijd*.
>
> Tweede alinea, ook gesproken. **[TE CONTROLEREN]**

## 3.2 Stilte (ca. 1 min)

> *[Stilte, ca. 1 minuut.]*

## 3.3 Cijfers en afsluiting

> We belegden 51 procent in cash *[kijkt de zaal in]* en dat blijft zo.
> **[ANTHONY BEVESTIGT: het precieze
> percentage per eind oktober]** Dank u.
`

test('leesTijd haalt de tijd uit de kop', () => {
  assert.deepEqual(leesTijd('Opening (ca. 10 minuten)'), { titel: 'Opening', minuten: 10 })
  assert.deepEqual(leesTijd('Stilte (ca. 1 min)'), { titel: 'Stilte', minuten: 1 })
  assert.deepEqual(leesTijd('Pauze (ca. 1,5 uur)'), { titel: 'Pauze', minuten: 90 })
  assert.deepEqual(leesTijd('Zonder tijd'), { titel: 'Zonder tijd', minuten: null })
})

test('passages volgen de ##-koppen met tijd en dezelfde ids als leesSecties', () => {
  const r = parseSpreektekst(MD)
  assert.equal(r.aantal, 3)
  assert.deepEqual(r.passages.map((p) => p.minuten), [10, 1, null])
  assert.equal(r.passages[0].titel, '3.1 Opening: welkom')
  assert.match(r.passages[0].id, /^3-1-opening/)
  assert.equal(r.totaalMinuten, 11)
})

test('opeenvolgende quote-regels vormen één vloeiende alinea; een lege > splitst', () => {
  const [p1] = parseSpreektekst(MD).passages
  const podium = p1.items.filter((i) => i.type === 'podium')
  assert.equal(podium.length, 3)
  assert.equal(podium[0].delen[0].tekst, 'Goedemorgen allemaal. Fijn dat jullie er zijn.')
  assert.match(podium[1].delen[0].tekst, /\*\*vertrouwen\*\*/)
  assert.match(podium[2].delen[0].tekst, /^Tweede alinea/)
})

test('regie wordt cue, geen podiumtekst', () => {
  const [p1, p2, p3] = parseSpreektekst(MD).passages
  assert.deepEqual(p1.items[1], { type: 'regie', tekst: 'Pauze.' })
  assert.deepEqual(p2.items, [{ type: 'regie', tekst: 'Stilte, ca. 1 minuut.' }])
  assert.equal(p2.woorden, 0)
  const delen = p3.items[0].delen
  assert.deepEqual(delen.map((d) => d.type), ['tekst', 'regie', 'tekst', 'marker', 'tekst'])
  assert.equal(delen[1].tekst, 'kijkt de zaal in')
})

test('markers, ook meerregelige, worden herkend en niet als regie gelezen', () => {
  const [p1, , p3] = parseSpreektekst(MD).passages
  const m1 = p1.items[3].delen.find((d) => d.type === 'marker')
  assert.deepEqual(m1, { type: 'marker', soort: 'controleren', tekst: '' })
  const m3 = p3.items[0].delen.find((d) => d.type === 'marker')
  assert.equal(m3.soort, 'bevestigt')
  assert.equal(m3.tekst, 'het precieze percentage per eind oktober')
  assert.equal(p1.markers, 1)
  assert.equal(p3.markers, 1)
  assert.ok(!p3.items[0].delen.some((d) => d.type === 'regie' && /ANTHONY/.test(d.tekst)))
})

test('tekst buiten een quote is geen podium', () => {
  const alles = parseSpreektekst(MD).passages.flatMap((p) => p.items)
  assert.ok(!JSON.stringify(alles).includes('Voorwoord'))
})

test('tekst voor de eerste kop wordt een eigen eerste passage als er podium staat', () => {
  const r = parseSpreektekst('> Eerst dit.\n\n## Daarna\n\n> Dan dat.')
  assert.equal(r.aantal, 2)
  assert.equal(r.passages[0].id, 'begin')
  assert.equal(r.passages[1].titel, 'Daarna')
})

test('leeg of kapot invoer geeft geen passages en geen fout', () => {
  assert.equal(parseSpreektekst('').aantal, 0)
  assert.equal(parseSpreektekst(null).aantal, 0)
  assert.deepEqual(splitsDelen('zomaar tekst').map((d) => d.type), ['tekst'])
})

test('soortcheck en tijdlabel', () => {
  assert.ok(isSpreektekst({ soort: 'spreektekst' }))
  assert.ok(!isSpreektekst({ soort: 'brief' }))
  assert.ok(!isSpreektekst(null))
  assert.equal(tijdLabel(10), 'ca. 10 min')
  assert.equal(tijdLabel(null), '')
})
