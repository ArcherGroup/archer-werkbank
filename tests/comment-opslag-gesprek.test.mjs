import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as C from '../src/lib/comments.js'
const { groepeerReacties, telOpen, filterComments } = C
const telGesprekken = (...a) => C.telGesprekken(...a)

const n = (id, extra = {}) => ({
  id, doel_type: 'document', doel_id: '9', auteur: 'Victor', tekst: `tekst ${id}`, anker: null,
  opgelost: false, afgewezen: false, parent_id: null,
  created_at: `2026-11-12T10:${String(id).padStart(2, '0')}:00Z`, ...extra,
})
const ids = (l) => l.map((x) => x.id)
const alleIds = (groepen) => groepen.flatMap((g) => [g.id, ...g.reacties.map((r) => r.id)])

test('een gesprek bevat de wortel en al zijn afstammelingen in tijdvolgorde, met eigen auteurs', () => {
  const lijst = [
    n(1, { auteur: 'Hermes' }),
    n(2, { parent_id: 1, auteur: 'Victor' }),
    n(3, { parent_id: 2, auteur: 'Anthony' }), // antwoord op een antwoord
    n(4, { parent_id: 3, auteur: 'Hermes' }),
    n(5, { parent_id: 1, auteur: 'Victor' }),
  ]
  const [g, ...rest] = groepeerReacties(lijst)
  assert.equal(rest.length, 0)
  assert.equal(g.id, 1)
  assert.deepEqual(ids(g.reacties), [2, 3, 4, 5])
  assert.deepEqual(g.reacties.map((r) => r.auteur), ['Victor', 'Anthony', 'Hermes', 'Victor'])
  assert.deepEqual(g.reacties.map((r) => r.parent_id), [1, 2, 3, 1], 'ouderverwijzing blijft behouden')
  assert.ok(g.reacties.every((r) => Array.isArray(r.reacties)))
})

test('de volgorde volgt de tijd, niet de invoervolgorde of het id', () => {
  const lijst = [
    n(5, { parent_id: 1, created_at: '2026-11-12T10:03:00Z' }),
    n(2, { parent_id: 1, created_at: '2026-11-12T10:05:00Z' }),
    n(1, { created_at: '2026-11-12T10:00:00Z' }),
    n(3, { parent_id: 2, created_at: '2026-11-12T10:06:00Z' }),
  ]
  assert.deepEqual(ids(groepeerReacties(lijst)[0].reacties), [5, 2, 3])
})

test('verschillende tijdnotaties worden als tijd vergeleken, niet als tekst', () => {
  const lijst = [
    n(1, { created_at: '2026-11-12T10:00:00+00:00' }),
    n(2, { parent_id: 1, created_at: '2026-11-12T11:30:00+01:00' }), // = 10:30Z
    n(3, { parent_id: 1, created_at: '2026-11-12T10:10:00.500000Z' }),
  ]
  assert.deepEqual(ids(groepeerReacties(lijst)[0].reacties), [3, 2])
})

test('gelijke tijd valt terug op het id, ook met lokale ids tussen echte ids', () => {
  const t = '2026-11-12T10:00:00Z'
  const lijst = [
    n('lokaal-b', { parent_id: 1, created_at: t }),
    n(11, { parent_id: 1, created_at: t }),
    n(1, { created_at: t }),
    n(2, { parent_id: 1, created_at: t }),
    n('lokaal-a', { parent_id: 1, created_at: t }),
  ]
  const uit = ids(groepeerReacties(lijst)[0].reacties)
  assert.deepEqual(uit, [2, 11, 'lokaal-a', 'lokaal-b'])
  assert.deepEqual(ids(groepeerReacties([...lijst].reverse())[0].reacties), uit, 'onafhankelijk van invoervolgorde')
})

test('een cyclus verdwijnt niet: elk bericht komt precies één keer terug', () => {
  const lijst = [
    n(1, { parent_id: 2, auteur: 'Victor' }),
    n(2, { parent_id: 1, auteur: 'Anthony' }),
    n(3, { parent_id: 2, auteur: 'Hermes' }), // hangt aan de cyclus
    n(4, { auteur: 'Hermes' }),
  ]
  const g = groepeerReacties(lijst)
  assert.deepEqual(alleIds(g).sort(), [1, 2, 3, 4])
  assert.equal(g.length, 2)
  const cyc = g.find((x) => x.id === 1 || x.id === 2)
  assert.equal(cyc.id, 1, 'de oudste van de cyclus wordt de wortel')
  assert.deepEqual(ids(cyc.reacties), [2, 3])
  assert.deepEqual(cyc.reacties.map((r) => r.auteur), ['Anthony', 'Hermes'])
})

test('een zelfverwijzing en een lange cyclus verdwijnen niet', () => {
  const zelf = groepeerReacties([n(1, { parent_id: 1 })])
  assert.deepEqual(alleIds(zelf), [1])
  const ring = groepeerReacties([n(1, { parent_id: 3 }), n(2, { parent_id: 1 }), n(3, { parent_id: 2 })])
  assert.equal(ring.length, 1)
  assert.deepEqual(alleIds(ring).sort(), [1, 2, 3])
})

test('wezen blijven zichtbaar als eigen gesprek, met hun eigen reacties', () => {
  const lijst = [n(10, { parent_id: 99 }), n(11, { parent_id: 10 })]
  const g = groepeerReacties(lijst)
  assert.equal(g.length, 1)
  assert.equal(g[0].id, 10)
  assert.deepEqual(ids(g[0].reacties), [11])
})

test('een server-wortel met client_id ontvangt antwoorden die nog naar zijn lokale id wijzen', () => {
  const lijst = [
    n(41, { client_id: 'lokaal-1-w', auteur: 'Victor' }),
    n('lokaal-2-k', { parent_id: 'lokaal-1-w', lokaal: true, wachtend: true, auteur: 'Anthony', created_at: '2026-11-12T10:50:00Z' }),
  ]
  const g = groepeerReacties(lijst)
  assert.equal(g.length, 1)
  assert.deepEqual(ids(g[0].reacties), ['lokaal-2-k'])
  assert.equal(g[0].reacties[0].auteur, 'Anthony')
})

test('de lokale kopie van een al gesynchroniseerde comment verdubbelt hem niet, maar een ander bericht blijft', () => {
  const lijst = [
    n(41, { client_id: 'lokaal-1-w', auteur: 'Victor' }),
    n('lokaal-1-w', { client_id: 'lokaal-1-w', lokaal: true, wachtend: true, auteur: 'Victor' }),
    n('lokaal-5-x', { client_id: 'lokaal-5-x', lokaal: true, wachtend: true, auteur: 'Anthony' }),
  ]
  const g = groepeerReacties(lijst)
  assert.deepEqual(g.map((x) => x.id).sort(), [41, 'lokaal-5-x'].sort())
})

test('dezelfde id twee keer in de invoer is één bericht', () => {
  const g = groepeerReacties([n(1), n(1, { tekst: 'nieuwere versie' }), n(2, { parent_id: 1 })])
  assert.equal(g.length, 1)
  assert.equal(g[0].tekst, 'nieuwere versie')
  assert.deepEqual(ids(g[0].reacties), [2])
})

test('groeperen verandert de invoer niet en geeft verse objecten', () => {
  const lijst = [n(1), n(2, { parent_id: 1 })]
  const kopie = JSON.stringify(lijst)
  const g = groepeerReacties(lijst)
  assert.equal(JSON.stringify(lijst), kopie)
  assert.notEqual(g[0], lijst[0])
  assert.deepEqual(groepeerReacties(null), [])
  assert.deepEqual(groepeerReacties([null, undefined, 'x', {}]), [])
})

test('wortels staan in tijdvolgorde en elk bericht komt in een grote rommelige lijst precies één keer voor', () => {
  const lijst = []
  for (let i = 1; i <= 60; i++) lijst.push(n(i, { parent_id: i % 7 === 0 ? i + 1 : (i > 3 ? Math.floor(i / 2) : null), created_at: `2026-11-12T10:${String(i % 60).padStart(2, '0')}:00Z` }))
  const g = groepeerReacties(lijst)
  const alle = alleIds(g)
  assert.equal(alle.length, 60)
  assert.equal(new Set(alle).size, 60)
  const tijden = g.map((x) => Date.parse(x.created_at))
  assert.deepEqual(tijden, [...tijden].sort((a, b) => a - b))
})

/* ------------------------------------------------ tellers */

test('telOpen telt gesprekken, niet alle berichten', () => {
  const lijst = [n(1), n(2, { parent_id: 1 }), n(3, { parent_id: 2 }), n(4), n(5, { parent_id: 4 })]
  assert.equal(telOpen(lijst), 2)
  assert.equal(telGesprekken(lijst), 2)
})

test('een gesloten wortel sluit het hele gesprek, ook als antwoorden zelf niet gesloten zijn', () => {
  const lijst = [n(1, { opgelost: true }), n(2, { parent_id: 1 }), n(3, { parent_id: 2 }), n(4, { afgewezen: true }), n(5, { parent_id: 4 }), n(6)]
  assert.equal(telOpen(lijst), 1)
  assert.equal(telGesprekken(lijst), 3)
})

test('een cyclus en een wees tellen elk als één gesprek', () => {
  const lijst = [n(1, { parent_id: 2 }), n(2, { parent_id: 1 }), n(3, { parent_id: 77 }), n(4, { parent_id: 4 })]
  assert.equal(telOpen(lijst), 3)
})

test('telOpen met rommel of leeg geeft nul', () => {
  assert.equal(telOpen(null), 0)
  assert.equal(telOpen([]), 0)
  assert.equal(telOpen([null, 'x']), 0)
})

test('de lokale kopie en zijn gesynchroniseerde tegenhanger tellen als één gesprek', () => {
  const lijst = [n(41, { client_id: 'lokaal-1-w' }), n('lokaal-1-w', { client_id: 'lokaal-1-w', lokaal: true })]
  assert.equal(telOpen(lijst), 1)
})

/* ------------------------------------------------ filteren per gesprek */

test('filteren verbergt een gesloten gesprek met al zijn antwoorden, en toont het weer met toonOpgelost', () => {
  const lijst = [n(1, { opgelost: true }), n(2, { parent_id: 1 }), n(3, { parent_id: 2 }), n(4), n(5, { parent_id: 4 })]
  assert.deepEqual(ids(filterComments(lijst, { bereik: 'alles' })), [4, 5])
  assert.deepEqual(ids(filterComments(lijst, { bereik: 'alles', toonOpgelost: true })), [1, 2, 3, 4, 5])
})

test('een open gesprek met een gesloten antwoord blijft helemaal zichtbaar', () => {
  const lijst = [n(1), n(2, { parent_id: 1, opgelost: true })]
  assert.deepEqual(ids(filterComments(lijst, { bereik: 'alles' })), [1, 2])
})
