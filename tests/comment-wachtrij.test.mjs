import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  leesWachtrij, bewaarInWachtrij, verwijderUitWachtrij, telWachtrij, wisWachtrij,
  verwerkWachtrij, alsNotitie, lokaalId, WACHTRIJ_SLEUTEL,
} from '../src/lib/comment-wachtrij.js'

/* Een kleine opslag zoals de browser die heeft, zodat de wachtrij te testen is. */
before(() => {
  const doos = new Map()
  global.localStorage = {
    getItem: (k) => (doos.has(k) ? doos.get(k) : null),
    setItem: (k, v) => doos.set(k, String(v)),
    removeItem: (k) => doos.delete(k),
    clear: () => doos.clear(),
    get length() { return doos.size },
    key: (i) => [...doos.keys()][i] ?? null,
  }
})
after(() => { delete global.localStorage })
beforeEach(() => { localStorage.clear() })

const antwoord = (extra = {}) => ({
  doel_type: 'document', doel_id: 9, tekst: 'Goed punt, pas ik aan.', auteur: 'Victor', anker: '51 procent cash', ...extra,
})

test('een comment die niet verstuurd raakt, blijft bewaard', () => {
  const lijst = bewaarInWachtrij(antwoord())
  assert.equal(lijst.length, 1)
  assert.equal(telWachtrij(), 1)
  assert.equal(leesWachtrij()[0].tekst, 'Goed punt, pas ik aan.')
  assert.equal(leesWachtrij()[0].lokaal, true)
  assert.ok(leesWachtrij()[0].lokaal_id.startsWith('lokaal-'))
})

test('dezelfde comment komt er maar één keer in', () => {
  bewaarInWachtrij(antwoord())
  bewaarInWachtrij(antwoord())
  assert.equal(telWachtrij(), 1)
  bewaarInWachtrij(antwoord({ tekst: 'iets anders' }))
  assert.equal(telWachtrij(), 2)
})

test('een lege wachtrij is geen lijst met rommel', () => {
  localStorage.setItem(WACHTRIJ_SLEUTEL, 'geen json')
  assert.deepEqual(leesWachtrij(), [])
  localStorage.setItem(WACHTRIJ_SLEUTEL, JSON.stringify([{ tekst: 'zonder nummer' }]))
  assert.deepEqual(leesWachtrij(), [])
})

test('een verstuurde comment gaat eruit, een mislukte blijft', async () => {
  bewaarInWachtrij(antwoord({ tekst: 'eerste' }))
  bewaarInWachtrij(antwoord({ tekst: 'tweede' }))
  const uit = await verwerkWachtrij(async (item) => {
    if (item.tekst === 'tweede') throw new Error('netwerk')
    return { id: 41 }
  })
  assert.deepEqual(uit.gelukt.map((x) => x.tekst), ['eerste'])
  assert.deepEqual(uit.mislukt.map((x) => x.tekst), ['tweede'])
  assert.deepEqual(leesWachtrij().map((x) => x.tekst), ['tweede'])
})

test('een antwoord op een lokale comment wacht en krijgt daarna het echte nummer', async () => {
  const [ouder] = bewaarInWachtrij({ ...antwoord({ tekst: 'de vraag' }), parent_id: null })
  bewaarInWachtrij({ ...antwoord({ tekst: 'het antwoord' }), parent_id: ouder.lokaal_id })
  const gezien = []
  const eerste = await verwerkWachtrij(async (item) => {
    gezien.push(item)
    if (item.tekst === 'de vraag') return { id: 77 }
    throw new Error('nog niet')
  })
  assert.deepEqual(eerste.gelukt.map((x) => x.tekst), ['de vraag'])
  assert.deepEqual(leesWachtrij().map((x) => x.tekst), ['het antwoord'])

  const tweede = await verwerkWachtrij(async (item) => { gezien.push(item); return { id: 78 } })
  assert.deepEqual(tweede.gelukt.map((x) => x.tekst), ['het antwoord'])
  assert.equal(gezien[gezien.length - 1].parent_id, 77)
  assert.equal(telWachtrij(), 0)
})

test('een lokale comment ziet er in de lijst uit als een wachtende notitie', () => {
  const [item] = bewaarInWachtrij(antwoord())
  const notitie = alsNotitie(item)
  assert.equal(notitie.id, item.lokaal_id)
  assert.equal(notitie.lokaal, true)
  assert.equal(notitie.wachtend, true)
  assert.equal(String(notitie.doel_id), '9')
})

test('opruimen en los verwijderen werken', () => {
  const [a] = bewaarInWachtrij(antwoord({ tekst: 'a' }))
  bewaarInWachtrij(antwoord({ tekst: 'b' }))
  verwijderUitWachtrij(a.lokaal_id)
  assert.deepEqual(leesWachtrij().map((x) => x.tekst), ['b'])
  wisWachtrij()
  assert.equal(telWachtrij(), 0)
})

test('een lokaal nummer is uniek', () => {
  const ids = new Set(Array.from({ length: 50 }, (_, i) => lokaalId(1000 + i)))
  assert.equal(ids.size, 50)
})