import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  blokVoor, dagVoor, herkomst, filterComments, groepeerReacties,
  sorteerVoorWalkthrough, telOpen, routeVoor, kort, statusVan, isGesloten,
} from '../src/lib/comments.js'

const blokken = [
  { id: '1.1', code: '1.1', dag: 1, titel: 'Inleiding', volgorde: 30 },
  { id: '1.3', code: '1.3', dag: 1, titel: 'ETF', volgorde: 50 },
  { id: '2.1', code: '2.1', dag: 2, titel: 'Vastgoed', volgorde: 70 },
]
const documentenMeta = [
  { id: 9, blok_id: '1.3', soort: 'brief', titel: 'brief' },
  { id: 16, blok_id: '1.3', soort: 'spreektekst', titel: 'spreektekst' },
  { id: 24, blok_id: '2.1', soort: 'slides', titel: 'slides' },
]
const bronnen = [{ id: 211, blok_id: '1.3', titel: 'FSMA kosten' }]
const ctx = { blokken, documentenMeta, bronnen }

const n = (id, extra = {}) => ({ id, doel_type: 'document', doel_id: '9', auteur: 'Victor', tekst: `tekst ${id}`, anker: null, opgelost: false, parent_id: null, created_at: `2026-11-12T10:0${id}:00Z`, ...extra })
const lijst = [
  n(1, { anker: 'De kosten van 0,1 tot 0,3 procent' }),
  n(2, { parent_id: 1, auteur: 'Anthony' }),
  n(3, { doel_type: 'blok', doel_id: '1.3' }),
  n(4, { doel_id: '16' }),
  n(5, { doel_id: '24' }),
  n(6, { doel_type: 'bron', doel_id: '211' }),
  n(7, { opgelost: true }),
]

test('een comment weet bij welk dagdeel hij hoort, ook via een bron', () => {
  assert.equal(blokVoor(lijst[0], ctx), '1.3')
  assert.equal(blokVoor(lijst[2], ctx), '1.3')
  assert.equal(blokVoor(lijst[5], ctx), '1.3')
  assert.equal(blokVoor(lijst[4], ctx), '2.1')
  assert.equal(blokVoor(n(9, { doel_type: 'document', doel_id: '999' }), ctx), null)
  assert.equal(dagVoor(lijst[0], ctx), 1)
  assert.equal(dagVoor(lijst[4], ctx), 2)
  assert.equal(dagVoor(n(9, { doel_type: 'document', doel_id: '999' }), ctx), null)
})

test('de herkomst is leesbaar en noemt het dagdeel en het stuk', () => {
  assert.equal(herkomst(lijst[0], ctx), '1.3 · brief')
  assert.equal(herkomst(lijst[2], ctx), '1.3 · dagdeel')
  assert.equal(herkomst(lijst[5], ctx), '1.3 · bron: FSMA kosten')
  assert.equal(herkomst(n(9, { doel_type: 'document', doel_id: '999' }), ctx), 'Algemeen · stuk')
})

test('filteren op dagdeel, dag en alles, met opgeloste comments apart', () => {
  assert.deepEqual(filterComments(lijst, { ...ctx, bereik: 'dagdeel', blokId: '1.3' }).map((x) => x.id), [1, 2, 3, 4, 6])
  assert.deepEqual(filterComments(lijst, { ...ctx, bereik: 'dag', dag: 1 }).map((x) => x.id), [1, 2, 3, 4, 6])
  assert.deepEqual(filterComments(lijst, { ...ctx, bereik: 'dag', dag: 2 }).map((x) => x.id), [5])
  assert.deepEqual(filterComments(lijst, { ...ctx, bereik: 'alles' }).map((x) => x.id), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(filterComments(lijst, { ...ctx, bereik: 'alles', toonOpgelost: true }).map((x) => x.id), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(filterComments(lijst, { ...ctx, bereik: 'dagdeel', blokId: 'bestaat-niet' }), [])
})

test('een reactie hangt onder zijn ouder, een wees blijft zichtbaar', () => {
  const groep = groepeerReacties(lijst.filter((x) => !x.opgelost))
  const een = groep.find((x) => x.id === 1)
  assert.deepEqual(een.reacties.map((r) => r.id), [2])
  const wees = groepeerReacties([n(10, { parent_id: 99 })])
  assert.equal(wees.length, 1)
  assert.equal(wees[0].id, 10)
  assert.deepEqual(wees[0].reacties, [])
})

test('de walkthrough volgt de volgorde van de vierdaagse, dan het stuk, dan de tijd', () => {
  const gesorteerd = sorteerVoorWalkthrough([lijst[4], lijst[3], lijst[0], lijst[2]], ctx)
  assert.deepEqual(gesorteerd.map((x) => x.id), [3, 1, 4, 5], 'dagdeel eerst, dan brief, dan spreektekst, dan de volgende dag')
})

test('sorteren is stabiel en zet het brief-comment voor het spreektekst-comment', () => {
  const gesorteerd = sorteerVoorWalkthrough([n(4, { doel_id: '16' }), n(1, { doel_id: '9' })], ctx)
  assert.deepEqual(gesorteerd.map((x) => x.id), [1, 4])
})

test('open tellen, routes en korte tekst', () => {
  assert.equal(telOpen(lijst), 5) // gesprekken: 1,3,4,5,6 open; antwoord 2 telt niet apart, 7 is opgelost
  assert.equal(routeVoor(lijst[0]), '#/doc/9')
  assert.equal(routeVoor(lijst[2]), '#/blok/1.3')
  assert.equal(routeVoor(lijst[5]), '#/bron/211')
  assert.equal(routeVoor(null), '#/')
  assert.equal(kort('  een   lange\nzin  '), 'een lange zin')
  assert.match(kort('a'.repeat(200), 20), /…$/)
})

test('een comment is open, opgelost of afgewezen', () => {
  assert.equal(statusVan({ id: 1 }), 'open')
  assert.equal(statusVan({ id: 1, opgelost: true }), 'opgelost')
  assert.equal(statusVan({ id: 1, afgewezen: true }), 'afgewezen')
  assert.equal(statusVan({ id: 1, opgelost: true, afgewezen: true }), 'afgewezen')
  assert.equal(statusVan(null), 'open')
})

test('gesloten betekent opgelost of afgewezen, niet allebei', () => {
  assert.equal(isGesloten({ id: 1 }), false)
  assert.equal(isGesloten({ id: 1, opgelost: true }), true)
  assert.equal(isGesloten({ id: 1, afgewezen: true }), true)
})

test('een afgewezen comment telt niet meer als open werk', () => {
  const lijst = [
    { id: 1, doel_type: 'document', doel_id: '9' },
    { id: 2, doel_type: 'document', doel_id: '9', afgewezen: true },
    { id: 3, doel_type: 'document', doel_id: '9', opgelost: true },
  ]
  assert.equal(telOpen(lijst), 1)
})
