import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zoekCommentPassages } from '../src/lib/comment-navigatie.js'

/* Pure helper: waar (welke offsets in de originele, platte tekst) hoort een
   comment-anker? Onderscheidt eerlijk: één eenduidige plek, meerdere identieke
   plekken, een gewijzigde passage (hersteld via oude historiek-tekst), niets
   betrouwbaars (onbekend), of een algemene comment zonder anker (geen). */

test('een legacy anker dat twee keer exact voorkomt geeft ALLE plekken, niet stil niets', () => {
  const tekst = 'De omzet groeide. Verderop: de omzet daalde. Tot slot: de omzet herstelde.'
  const r = zoekCommentPassages(tekst, { anker: 'omzet' })
  assert.equal(r.status, 'meerdere')
  assert.equal(r.plekken.length, 3)
  assert.deepEqual(r.plekken.map((p) => tekst.slice(p.start, p.end)), ['omzet', 'omzet', 'omzet'])
  assert.match(r.melding, /meerdere|niet eenduidig|keer/i)
})

test('weergegeven woorden met NBSP/extra spaties mappen naar originele offsets', () => {
  const tekst = 'De\u00a0omzet  groeide met 12 procent in het eerste kwartaal.'
  const r = zoekCommentPassages(tekst, { anker: 'omzet groeide met 12 procent' })
  assert.equal(r.status, 'gevonden')
  assert.equal(r.plekken.length, 1)
  const { start, end } = r.plekken[0]
  assert.equal(start, tekst.indexOf('omzet'))
  assert.equal(end, tekst.indexOf('procent') + 'procent'.length)
})

test("quote-context onderscheidt de tweede van twee identieke frases", () => {
  const tekst = 'Van het vermogen staat 51 procent in cash. Later staat nog eens 51 procent in obligaties.'
  const tweede = tekst.lastIndexOf('51 procent')
  const exact = '51 procent'
  const notitie = {
    anker: exact,
    anker_context: {
      exact,
      prefix: tekst.slice(Math.max(0, tweede - 10), tweede),
      suffix: tekst.slice(tweede + exact.length, tweede + exact.length + 10),
      start: tweede,
      end: tweede + exact.length,
    },
  }
  const r = zoekCommentPassages(tekst, notitie)
  assert.equal(r.status, 'gevonden')
  assert.equal(r.plekken.length, 1)
  assert.equal(r.plekken[0].start, tweede)
})

test("oude 'maandsalaris'-zin vervangen door '900 euro' met zelfde voor/na: gewijzigd + begrensde range", () => {
  const oud = 'Je vaste loon blijft je maandsalaris, ongewijzigd.'
  const nieuw = 'Je vaste loon blijft je 900 euro, ongewijzigd.'
  const r = zoekCommentPassages(nieuw, { anker: 'maandsalaris' }, { historiek: [oud] })
  assert.equal(r.status, 'gewijzigd')
  assert.equal(r.plekken.length, 1)
  const { start, end } = r.plekken[0]
  assert.ok(start < end, 'de gewijzigde passage moet een niet-lege begrensde range zijn')
  assert.ok(nieuw.slice(start, end).includes('900'), `range ${JSON.stringify(nieuw.slice(start, end))} moet de nieuwe waarde omvatten`)
  assert.ok(nieuw.slice(0, start).includes('blijft je'))
  assert.ok(nieuw.slice(end).includes(', ongewijzigd.'))
})

test('zonder betrouwbare unieke voor/na-context: onbekend en eerlijke melding', () => {
  const oud = 'De directeur noemde het maandsalaris eenvoudig.'
  const nieuw = 'De directeur noemde het eenvoudig. De directeur noemde het nogmaals eenvoudig.'
  const r = zoekCommentPassages(nieuw, { anker: 'maandsalaris' }, { historiek: [oud] })
  assert.equal(r.status, 'onbekend')
  assert.deepEqual(r.plekken, [])
  assert.match(r.melding, /niet betrouwbaar|niet terug te vinden|onbekend/i)
})

test('een herschreven alinea met uniek lang gelijk begin blijft via de historiek bereikbaar', () => {
  const begin='Op zeshonderdduizend euro is 1,8 procent kostenverschil 10.800 euro per jaar. Dat is '
  const oud=begin+'een maandsalaris van een goede werknemer. Elk jaar. Twintig jaar lang.'
  const nu=begin+'negenhonderd euro per maand aan het startbedrag. Het is een gevoelsmaat, geen vast jaarlijks kasbedrag.'
  const r=zoekCommentPassages(nu,{anker:'maandsalaris van een goede werknemer'},{historiek:[oud]})
  assert.equal(r.status,'gewijzigd')
  assert.equal(r.plekken.length,1)
  assert.match(nu.slice(r.plekken[0].start,r.plekken[0].end),/negenhonderd/)
})

test('algemene comment zonder anker: geen', () => {
  const r = zoekCommentPassages('Wat tekst', {})
  assert.equal(r.status, 'geen')
  assert.deepEqual(r.plekken, [])
  assert.ok(typeof r.melding === 'string' && r.melding.length > 0)
})
