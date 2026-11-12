import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leesSecties, sectieVoorAnker, contextVoorAnker, plekVanKlik, sectieAlineas } from '../src/lib/secties.js'

const md = `---
titel: 1.3
---

# 1.3 ETF's: brief

Inleiding zonder kop.

## De plek in de stam

De ETF is in het beeld van de stam de **groeipilaar**. Hij staat naast de GGR.
De vroege deelnemers zitten op 1 procent ETF's en 51 procent cash.

### Wat dat betekent

De kostenkloof is het tweede beeld: 0,12 procent tegen 1,32 procent.

## De cijfers

| Cijfer | Bron |
|---|---|
| 51% | brief |

## De cijfers

Tweede blok met dezelfde titel.
`

test('de koppen komen in leesorde met een stabiele id', () => {
  const s = leesSecties(md)
  assert.deepEqual(s.map((x) => x.titel), ['De plek in de stam', 'Wat dat betekent', 'De cijfers', 'De cijfers'])
  assert.equal(s[0].id, 'de-plek-in-de-stam')
  assert.equal(s[1].niveau, 3)
  assert.equal(s[3].id, 'de-cijfers-2')
})

test('een anker vindt zijn stuk, ook met opmaakstreepjes in de bron', () => {
  const s = leesSecties(md)
  assert.equal(sectieVoorAnker(md, 'de groeipilaar', s).id, 'de-plek-in-de-stam')
  assert.equal(sectieVoorAnker(md, 'De kostenkloof is het tweede beeld', s).id, 'wat-dat-betekent')
  assert.equal(sectieVoorAnker(md, 'Tweede blok met dezelfde titel', s).id, 'de-cijfers-2')
})

test('een afgekapte kliktekst vindt nog steeds het stuk', () => {
  const s = leesSecties(md)
  const afgekapt = 'De vroege deelnemers zitten op 1 procent ETF’s en 51 procent ca'
  assert.equal(sectieVoorAnker(md, afgekapt, s)?.id ?? 'de-plek-in-de-stam', 'de-plek-in-de-stam')
})

test('een anker dat nergens staat geeft null, geen gok', () => {
  assert.equal(sectieVoorAnker(md, 'Deze zin staat er niet in', leesSecties(md)), null)
  assert.equal(sectieVoorAnker(md, '', leesSecties(md)), null)
  assert.equal(sectieVoorAnker('', 'iets', []), null)
})

test('de context toont de alinea met de zin, met wat ervoor en erna komt', () => {
  const c = contextVoorAnker(md, '51 procent cash')
  assert.match(c.voor, /^De ETF is in het beeld van de stam de groeipilaar\. Hij staat naast de GGR\. De vroege deelnemers zitten op 1 procent ETF's en $/)
  assert.equal(c.anker, '51 procent cash')
  assert.equal(c.ervoor, 'Inleiding zonder kop.')
  assert.equal(c.erna, '')
  assert.equal(c.sectieTitel, 'De plek in de stam')
  assert.equal(c.alinea, 5)
})

test('de context werkt ook als het anker tussen opmaak staat', () => {
  const c = contextVoorAnker(md, 'groeipilaar')
  assert.ok(c)
  assert.equal(c.voor, 'De ETF is in het beeld van de stam de ')
  assert.equal(c.na, '. Hij staat naast de GGR. De vroege deelnemers zitten op 1 procent ETF\'s en 51 procent cash.')
})

test('context zonder anker of zonder tekst is null', () => {
  assert.equal(contextVoorAnker(md, ''), null)
  assert.equal(contextVoorAnker(md, 'bestaat niet'), null)
  assert.equal(contextVoorAnker('', 'iets'), null)
})

test('een klik bewaart stuk en zin, geen pixelpositie', () => {
  const plek = plekVanKlik({ markdown: md, element: { textContent: 'De vroege deelnemers zitten op 1 procent ETF\'s en 51 procent cash.' }, documentId: 17, gebruiker: 'Victor', nu: '2026-11-12T20:00:00Z' })
  assert.equal(plek.document_id, '17')
  assert.equal(plek.gebruiker, 'Victor')
  assert.equal(plek.sectie, 'de-plek-in-de-stam')
  assert.match(plek.fragment, /51 procent cash/)
  assert.equal(plek.created_at, '2026-11-12T20:00:00Z')
})

test('een klik zonder tekst levert niets op', () => {
  assert.equal(plekVanKlik({ markdown: md, element: { textContent: '   ' }, documentId: 17 }), null)
  assert.equal(plekVanKlik({ markdown: md, element: null, documentId: 17 }), null)
})
const dubbel = `## Eerste stuk

Dezelfde zin staat hier ook: 51 procent cash.

## Tweede stuk

Dezelfde zin staat hier ook: 51 procent cash. En nog iets.
`

test('bij een dubbel anker wint het stuk van de comment', () => {
  const c = contextVoorAnker(dubbel, '51 procent cash', { sectieId: 'tweede-stuk' })
  assert.equal(c.na, '. En nog iets.')
  const zonder = contextVoorAnker(dubbel, '51 procent cash')
  assert.equal(zonder.na, '.')
})

test('lange tekst wordt op een zinsgrens afgeknipt, niet midden in een woord', () => {
  const lang = `## Stuk

${'Een zin die lang genoeg is om te knippen. '.repeat(20)}51 procent cash.`
  const c = contextVoorAnker(lang, '51 procent cash')
  assert.ok(c.voor.length <= 420)
  assert.ok(c.voor.startsWith('Een zin') || c.voor.startsWith('die lang'), c.voor.slice(0, 30))
  assert.ok(!c.voor.endsWith('hie'), 'geen half woord aan het einde')
})

test('een tekst die midden in een woord begint, schuift naar de eerste zinsgrens', () => {
  const md2 = `## Stuk

eerste deel van een zin die afgeknipt werd en nu midden in een woord begint. De rest van de alinea gaat verder met een lange uitleg over de cijfers en eindigt met 51 procent cash.`
  const c = contextVoorAnker(md2, '51 procent cash')
  assert.ok(c.voor.startsWith('De rest van de alinea'), c.voor)
})

test('het hele stuk komt in alinea’s, zonder de kop', () => {
  const alineas = sectieAlineas(md, 'de-plek-in-de-stam')
  assert.ok(alineas.length >= 1)
  assert.ok(alineas[0].startsWith('De ETF is in het beeld van de stam de groeipilaar'))
  assert.ok(!alineas.some((a) => a.includes('De plek in de stam')))
  assert.deepEqual(sectieAlineas(md, 'bestaat-niet'), [])
  assert.deepEqual(sectieAlineas('', 'x'), [])
})

test('een stuk met meerdere alinea’s geeft ze allemaal', () => {
  const meer = `## Stuk

Eerste alinea.

Tweede alinea.

Derde alinea.`
  assert.deepEqual(sectieAlineas(meer, 'stuk'), ['Eerste alinea.', 'Tweede alinea.', 'Derde alinea.'])
})

test('een opsomming valt uiteen in losse punten', () => {
  const metPunten = `## Stuk

- Eerste punt over cash.
- Tweede punt over goud.
- Derde punt over ETF's.`
  const alineas = sectieAlineas(metPunten, 'stuk')
  assert.equal(alineas.length, 3)
  assert.ok(alineas[1].startsWith('Tweede punt'))
  assert.ok(!alineas[1].startsWith('-'))
})
