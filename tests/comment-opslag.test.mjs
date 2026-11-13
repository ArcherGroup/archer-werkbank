import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as W from '../src/lib/comment-wachtrij.js'

const f = (naam) => (...a) => W[naam](...a)
const {
  leesWachtrij, bewaarInWachtrij, verwijderUitWachtrij, telWachtrij, wisWachtrij, verwerkWachtrij, alsNotitie, WACHTRIJ_SLEUTEL, KAART_SLEUTEL,
} = W
const [voegToeAanWachtrij, opslagBeperkt, opslagStatus, exporteerWachtrij, importeerWachtrij, leesImportVoorbeeld, zoekGedeeldId] =
  ['voegToeAanWachtrij', 'opslagBeperkt', 'opslagStatus', 'exporteerWachtrij', 'importeerWachtrij', 'leesImportVoorbeeld', 'zoekGedeeldId'].map(f)

/* Een opslag zoals de browser, met een schakelaar om "vol" of "geblokkeerd" na te bootsen. */
let doos, schrijfLog, faalOp
before(() => {
  doos = new Map()
  global.localStorage = {
    getItem: (k) => (doos.has(k) ? doos.get(k) : null),
    setItem: (k, v) => {
      if (faalOp && (faalOp === true || faalOp.includes(k))) throw new DOMException('quota', 'QuotaExceededError')
      schrijfLog.push([k, String(v)])
      doos.set(k, String(v))
    },
    removeItem: (k) => doos.delete(k),
    clear: () => doos.clear(),
    get length() { return doos.size },
    key: (i) => [...doos.keys()][i] ?? null,
  }
})
after(() => { delete global.localStorage })
beforeEach(() => {
  faalOp = false
  schrijfLog = []
  localStorage.clear()
  wisWachtrij()
  localStorage.clear()
  schrijfLog = []
})

const rij = (extra = {}) => ({
  doel_type: 'document', doel_id: 9, tekst: 'Goed punt, pas ik aan.', auteur: 'Victor', anker: '51 procent cash', ...extra,
})
const CTX = { exact: '51 procent cash', prefix: 'bijna ', suffix: ' van de', start: 12, end: 27, document_versie: 4 }
const teksten = () => leesWachtrij().map((x) => x.tekst)

/* ------------------------------------------------ eerst bewaren, dan versturen */

test('bewaren gebeurt in de opslag vóórdat er iets verstuurd wordt', async () => {
  bewaarInWachtrij(rij({ tekst: 'eerst bewaren' }))
  let opslagBijVerzenden = null
  await verwerkWachtrij(async (item) => {
    opslagBijVerzenden = JSON.parse(localStorage.getItem(WACHTRIJ_SLEUTEL)).map((x) => x.tekst)
    return { id: 1, client_id: item.client_id }
  })
  assert.deepEqual(opslagBijVerzenden, ['eerst bewaren'])
})

test('de wachtrij kapt niet stil af op 200 comments', () => {
  for (let i = 0; i < 250; i++) bewaarInWachtrij(rij({ tekst: `comment ${i}` }))
  assert.equal(telWachtrij(), 250)
  assert.equal(JSON.parse(localStorage.getItem(WACHTRIJ_SLEUTEL)).length, 250)
  assert.equal(teksten()[0], 'comment 0')
  assert.equal(teksten()[249], 'comment 249')
})

test('een volle opslag laat de comment niet verdwijnen en meldt dat eerlijk', async () => {
  faalOp = true
  const uit = voegToeAanWachtrij(rij({ tekst: 'alleen in het geheugen' }))
  assert.equal(uit.nieuw, true)
  assert.equal(uit.opslagBeperkt, true)
  assert.equal(opslagBeperkt(), true)
  assert.deepEqual(teksten(), ['alleen in het geheugen'])
  assert.equal(telWachtrij(), 1)
  assert.equal(localStorage.getItem(WACHTRIJ_SLEUTEL), null, 'er staat echt niets in de opslag')
  // de oude API geeft dezelfde waarheid door, zonder zijn array-vorm te verliezen
  const lijst = bewaarInWachtrij(rij({ tekst: 'nog een' }))
  assert.ok(Array.isArray(lijst))
  assert.equal(lijst.opslagBeperkt, true)
  assert.deepEqual(teksten(), ['alleen in het geheugen', 'nog een'])

  // zodra de opslag weer werkt, komt alles alsnog in de opslag en is de waarschuwing weg
  faalOp = false
  bewaarInWachtrij(rij({ tekst: 'derde' }))
  assert.equal(opslagBeperkt(), false)
  assert.deepEqual(JSON.parse(localStorage.getItem(WACHTRIJ_SLEUTEL)).map((x) => x.tekst), ['alleen in het geheugen', 'nog een', 'derde'])
})

test('zonder opslag werkt versturen nog binnen de sessie en verwijderen blijft verwijderd', async () => {
  faalOp = true
  const a = voegToeAanWachtrij(rij({ tekst: 'a' })).item
  voegToeAanWachtrij(rij({ tekst: 'b' }))
  verwijderUitWachtrij(a.lokaal_id)
  assert.deepEqual(teksten(), ['b'])
  const uit = await verwerkWachtrij(async () => ({ id: 5 }))
  assert.equal(uit.gelukt.length, 1)
  assert.equal(uit.opslagBeperkt, true)
  assert.equal(telWachtrij(), 0)
})

test('een verwijdering die niet in de opslag lukt, laat het item niet terugkomen', () => {
  const a = voegToeAanWachtrij(rij({ tekst: 'a' })).item
  voegToeAanWachtrij(rij({ tekst: 'b' }))
  faalOp = true
  verwijderUitWachtrij(a.lokaal_id)
  assert.deepEqual(teksten(), ['b'])
  assert.equal(opslagBeperkt(), true)
})

/* ------------------------------------------------ stabiele identiteit en dedupe */

test('elke comment krijgt een stabiele client_id die gelijk is aan zijn lokaal_id en ongewijzigd wordt meegestuurd', async () => {
  const { item } = voegToeAanWachtrij(rij())
  assert.equal(item.client_id, item.lokaal_id)
  let gezien
  await verwerkWachtrij(async (i) => { gezien = i; return { id: 3 } })
  assert.equal(gezien.client_id, item.lokaal_id)
  const eigen = voegToeAanWachtrij(rij({ tekst: 'eigen', client_id: 'lokaal-eigen-1' })).item
  assert.equal(eigen.client_id, 'lokaal-eigen-1')
})

test('dubbel opslaan met hetzelfde client_id overschrijft geen tekst', () => {
  voegToeAanWachtrij(rij({ tekst: 'origineel', lokaal_id: 'lokaal-1-aaaa' }))
  const tweede = voegToeAanWachtrij(rij({ tekst: 'gewijzigd', lokaal_id: 'lokaal-1-aaaa' }))
  assert.equal(tweede.nieuw, false)
  assert.equal(tweede.item.tekst, 'origineel')
  assert.deepEqual(teksten(), ['origineel'])
})

test('dezelfde tekst van een andere auteur of op een ander anker wordt niet samengesmolten', () => {
  bewaarInWachtrij(rij())
  bewaarInWachtrij(rij())
  assert.equal(telWachtrij(), 1, 'echt dezelfde dubbelklik blijft één')
  bewaarInWachtrij(rij({ auteur: 'Anthony' }))
  assert.equal(telWachtrij(), 2)
  bewaarInWachtrij(rij({ anker: 'een andere zin' }))
  assert.equal(telWachtrij(), 3)
  bewaarInWachtrij(rij({ anker: null }))
  assert.equal(telWachtrij(), 4)
  bewaarInWachtrij(rij({ anker_context: { ...CTX, start: 99, end: 114 } }))
  assert.equal(telWachtrij(), 5)
  bewaarInWachtrij(rij({ parent_id: 12 }))
  assert.equal(telWachtrij(), 6)
  assert.deepEqual(new Set(leesWachtrij().map((x) => x.auteur)), new Set(['Victor', 'Anthony']))
})

test('twee bewust verschillende comments met eigen id blijven allebei, ook met gelijke inhoud', () => {
  voegToeAanWachtrij(rij({ lokaal_id: 'lokaal-1-aaaa' }))
  voegToeAanWachtrij(rij({ lokaal_id: 'lokaal-2-bbbb' }))
  assert.equal(telWachtrij(), 2)
})

test('anker_context blijft bewaard en gaat mee naar de verstuurder en de notitie', async () => {
  const ctx = CTX
  const { item } = voegToeAanWachtrij(rij({ anker_context: ctx }))
  assert.deepEqual(leesWachtrij()[0].anker_context, ctx)
  const n = alsNotitie(item)
  assert.deepEqual(n.anker_context, ctx)
  assert.equal(n.client_id, item.client_id)
  assert.equal(n.lokaal, true)
  assert.equal(n.wachtend, true)
  assert.equal(n.lokaal_id, item.lokaal_id)
  assert.equal(n.id, item.lokaal_id)
  let gezien
  await verwerkWachtrij(async (i) => { gezien = i; return { id: 8 } })
  assert.deepEqual(gezien.anker_context, ctx)
})

/* ------------------------------------------------ versturen: geen races, geen verlies */

test('twee gelijktijdige flushes versturen elk item maar één keer', async () => {
  bewaarInWachtrij(rij({ tekst: 'een' }))
  bewaarInWachtrij(rij({ tekst: 'twee' }))
  const verstuurd = []
  const verstuur = async (i) => { verstuurd.push(i.tekst); await new Promise((r) => setTimeout(r, 5)); return { id: verstuurd.length } }
  const [a, b] = await Promise.all([verwerkWachtrij(verstuur), verwerkWachtrij(verstuur)])
  assert.deepEqual(verstuurd, ['een', 'twee'])
  assert.equal(a.gelukt.length, 2)
  assert.equal(b.gelukt.length, 2)
  assert.equal(telWachtrij(), 0)
})

test('een comment die tijdens het versturen wordt toegevoegd, gaat niet verloren', async () => {
  bewaarInWachtrij(rij({ tekst: 'eerste' }))
  let toegevoegd = false
  const uit = await verwerkWachtrij(async (i) => {
    if (!toegevoegd) { toegevoegd = true; bewaarInWachtrij(rij({ tekst: 'tijdens flush' })) }
    return { id: i.tekst === 'eerste' ? 1 : 2 }
  })
  assert.deepEqual(uit.gelukt.map((x) => x.tekst).sort(), ['eerste', 'tijdens flush'])
  assert.equal(telWachtrij(), 0)

  // ook als het versturen van de eerste mislukt: de nieuwe blijft staan
  toegevoegd = false
  bewaarInWachtrij(rij({ tekst: 'mislukt' }))
  await verwerkWachtrij(async (i) => {
    if (!toegevoegd) { toegevoegd = true; bewaarInWachtrij(rij({ tekst: 'erbij' })) }
    if (i.tekst === 'mislukt') throw new Error('netwerk')
    return { id: 9 }
  })
  assert.deepEqual(teksten(), ['mislukt'])
})

test('een flush na een eerdere flush kan opnieuw starten', async () => {
  bewaarInWachtrij(rij({ tekst: 'x' }))
  await verwerkWachtrij(async () => { throw new Error('nee') })
  assert.equal(telWachtrij(), 1)
  const uit = await verwerkWachtrij(async () => ({ id: 2 }))
  assert.equal(uit.gelukt.length, 1)
})

test('een ontbrekende of lege terugleesrij verwijdert niets', async () => {
  for (const antwoord of [undefined, null, {}, { id: null }, { id: '' }]) {
    wisWachtrij()
    bewaarInWachtrij(rij({ tekst: `leeg ${JSON.stringify(antwoord)}` }))
    const uit = await verwerkWachtrij(async () => antwoord)
    assert.equal(uit.gelukt.length, 0)
    assert.equal(uit.mislukt.length, 1)
    assert.equal(telWachtrij(), 1)
  }
})

test('de ouderkaart staat duurzaam in de opslag vóórdat de ouder uit de wachtrij gaat', async () => {
  const { item: ouder } = voegToeAanWachtrij(rij({ tekst: 'wortel' }))
  voegToeAanWachtrij(rij({ tekst: 'kind', parent_id: ouder.lokaal_id }))
  schrijfLog = []
  await verwerkWachtrij(async (i) => (i.tekst === 'wortel' ? { id: 77 } : (() => { throw new Error('nog niet') })()))
  const kaartIdx = schrijfLog.findIndex(([k, v]) => k === KAART_SLEUTEL && JSON.parse(v)[ouder.lokaal_id] === 77)
  const verwijderIdx = schrijfLog.findIndex(([k, v]) => k === WACHTRIJ_SLEUTEL && !JSON.parse(v).some((x) => x.tekst === 'wortel'))
  assert.ok(kaartIdx >= 0, 'kaart is geschreven')
  assert.ok(verwijderIdx >= 0, 'ouder is verwijderd')
  assert.ok(kaartIdx < verwijderIdx, 'kaart eerst, dan pas verwijderen')
  assert.deepEqual(teksten(), ['kind'])
})

test('lukt de kaart niet te bewaren, dan blijft de ouder staan, het kind gaat toch met het echte nummer mee en een herstart stuurt de ouder niet opnieuw', async () => {
  const { item: ouder } = voegToeAanWachtrij(rij({ tekst: 'wortel' }))
  voegToeAanWachtrij(rij({ tekst: 'kind', parent_id: ouder.lokaal_id }))
  faalOp = [KAART_SLEUTEL]
  const verstuurd = []
  const uit = await verwerkWachtrij(async (i) => { verstuurd.push({ t: i.tekst, p: i.parent_id }); return { id: i.tekst === 'wortel' ? 77 : 78 } })
  assert.equal(uit.opslagBeperkt, true)
  assert.equal(opslagBeperkt(), true)
  assert.deepEqual(verstuurd, [{ t: 'wortel', p: null }, { t: 'kind', p: 77 }])
  assert.ok(teksten().includes('wortel'), 'ouder blijft staan zolang de kaart niet duurzaam is')
  assert.equal(zoekGedeeldId(ouder.lokaal_id), 77, 'de kaart leeft ten minste in het geheugen')

  faalOp = false
  const opnieuw = await verwerkWachtrij(async () => { throw new Error('mag niet opnieuw verstuurd worden') })
  assert.equal(opnieuw.mislukt.length, 0)
  assert.equal(telWachtrij(), 0)
  assert.equal(JSON.parse(localStorage.getItem(KAART_SLEUTEL))[ouder.lokaal_id], 77)
  assert.equal(opslagBeperkt(), false)
})

test('een antwoord in dezelfde ronde als zijn lokale ouder gaat meteen mee, ook bij omgekeerde volgorde', async () => {
  const lijst = [
    { lokaal_id: 'lokaal-2-kind', tekst: 'kind', parent_id: 'lokaal-1-wortel' },
    { lokaal_id: 'lokaal-1-wortel', tekst: 'wortel', parent_id: null },
  ].map((x) => ({ ...rij(), ...x }))
  const imp = importeerWachtrij(JSON.stringify({ type: 'werkbank-comment-wachtrij', versie: 1, items: lijst, kaart: {} }))
  assert.equal(imp.ok, true)
  const gezien = []
  const uit = await verwerkWachtrij(async (i) => { gezien.push([i.tekst, i.parent_id]); return { id: i.tekst === 'wortel' ? 10 : 11 } })
  assert.deepEqual(gezien, [['wortel', null], ['kind', 10]])
  assert.equal(uit.gelukt.length, 2)
})

test('een kind zonder bekende ouder wacht en wordt als wees gemeld, niet als wortel verstuurd', async () => {
  voegToeAanWachtrij(rij({ tekst: 'wees', parent_id: 'lokaal-weg-0000' }))
  let aantal = 0
  const uit = await verwerkWachtrij(async () => { aantal++; return { id: 1 } })
  assert.equal(aantal, 0)
  assert.equal(uit.mislukt.length, 1)
  assert.deepEqual(uit.wees.map((x) => x.tekst), ['wees'])
  assert.equal(telWachtrij(), 1)
})

/* ------------------------------------------------ gedeeld id voor antwoorden */

test('zoekGedeeldId geeft het echte nummer van een zojuist gesynchroniseerde lokale wortel', async () => {
  const { item } = voegToeAanWachtrij(rij({ tekst: 'wortel' }))
  assert.equal(zoekGedeeldId(item.lokaal_id), null)
  await verwerkWachtrij(async () => ({ id: 123 }))
  assert.equal(telWachtrij(), 0)
  assert.equal(zoekGedeeldId(item.lokaal_id), 123)
  assert.equal(zoekGedeeldId('lokaal-onbekend'), null)
  assert.equal(zoekGedeeldId(42), null)
  assert.equal(zoekGedeeldId(null), null)
})

test('alsNotitie toont een antwoord op een al gesynchroniseerde lokale ouder met het echte nummer als ouder', async () => {
  const { item: ouder } = voegToeAanWachtrij(rij({ tekst: 'wortel' }))
  await verwerkWachtrij(async () => ({ id: 123 }))
  const { item: kind } = voegToeAanWachtrij(rij({ tekst: 'kind', parent_id: ouder.lokaal_id }))
  const n = alsNotitie(kind)
  assert.equal(n.parent_id, 123)
  assert.equal(n.lokaal_parent_id, ouder.lokaal_id)
  // en een kind van een nog lokale ouder houdt het lokale nummer
  const { item: lokaleOuder } = voegToeAanWachtrij(rij({ tekst: 'nog lokaal' }))
  const { item: kind2 } = voegToeAanWachtrij(rij({ tekst: 'kind 2', parent_id: lokaleOuder.lokaal_id }))
  assert.equal(alsNotitie(kind2).parent_id, lokaleOuder.lokaal_id)
})

/* ------------------------------------------------ export en import */

test('exporteren geeft JSON v1 met alleen items en kaart', async () => {
  localStorage.setItem('iets_anders', 'geheim')
  const { item: ouder } = voegToeAanWachtrij(rij({ tekst: 'wortel', anker_context: CTX }))
  await verwerkWachtrij(async () => ({ id: 31 }))
  voegToeAanWachtrij(rij({ tekst: 'kind', auteur: 'Anthony', parent_id: ouder.lokaal_id, created_at: '2026-11-12T10:00:00.000Z' }))
  const tekst = exporteerWachtrij()
  assert.equal(typeof tekst, 'string')
  assert.ok(!tekst.includes('geheim'))
  const o = JSON.parse(tekst)
  assert.equal(o.type, 'werkbank-comment-wachtrij')
  assert.equal(o.versie, 1)
  assert.deepEqual(Object.keys(o).filter((k) => !['type', 'versie', 'geexporteerd_op', 'items', 'kaart'].includes(k)), [])
  assert.equal(o.items.length, 1)
  assert.equal(o.items[0].auteur, 'Anthony')
  assert.equal(o.items[0].parent_id, ouder.lokaal_id)
  assert.equal(o.kaart[ouder.lokaal_id], 31)
})

test('een export van een lege wachtrij is geldig en importeerbaar', () => {
  const o = JSON.parse(exporteerWachtrij())
  assert.deepEqual(o.items, [])
  const uit = importeerWachtrij(exporteerWachtrij())
  assert.equal(uit.ok, true)
  assert.equal(uit.toegevoegd, 0)
})

test('importeren herstelt auteur, tijd, ouder, anker en context en is idempotent', async () => {
  const { item: ouder } = voegToeAanWachtrij(rij({ tekst: 'wortel', auteur: 'Hermes', created_at: '2026-11-12T09:00:00.000Z', anker_context: CTX }))
  voegToeAanWachtrij(rij({ tekst: 'kind', auteur: 'Anthony', parent_id: ouder.lokaal_id, created_at: '2026-11-12T10:00:00.000Z', anker: null }))
  const export1 = exporteerWachtrij()
  const vooraf = leesWachtrij()

  localStorage.clear(); wisWachtrij()
  assert.equal(telWachtrij(), 0)
  const uit = importeerWachtrij(export1)
  assert.equal(uit.ok, true)
  assert.equal(uit.toegevoegd, 2)
  assert.deepEqual(leesWachtrij(), vooraf)

  const nogmaals = importeerWachtrij(export1)
  assert.equal(nogmaals.ok, true)
  assert.equal(nogmaals.toegevoegd, 0)
  assert.equal(nogmaals.bestond, 2)
  assert.deepEqual(leesWachtrij(), vooraf)
})

test('importeren behoudt wat er al staat en voegt alleen toe', () => {
  voegToeAanWachtrij(rij({ tekst: 'bestaand', lokaal_id: 'lokaal-1-aaaa' }))
  const tekst = JSON.stringify({
    type: 'werkbank-comment-wachtrij', versie: 1,
    items: [
      { ...rij({ tekst: 'overschrijf mij niet' }), lokaal_id: 'lokaal-1-aaaa' },
      { ...rij({ tekst: 'nieuw' }), lokaal_id: 'lokaal-2-bbbb' },
    ],
    kaart: {},
  })
  const uit = importeerWachtrij(tekst)
  assert.equal(uit.toegevoegd, 1)
  assert.equal(uit.bestond, 1)
  assert.deepEqual(teksten(), ['bestaand', 'nieuw'])
})

test('importeren schrijft nooit naar het netwerk en start geen flush', () => {
  let netwerk = 0
  const oud = global.fetch
  global.fetch = () => { netwerk++; throw new Error('geen netwerk bij import') }
  try {
    importeerWachtrij(JSON.stringify({ type: 'werkbank-comment-wachtrij', versie: 1, items: [{ ...rij(), lokaal_id: 'lokaal-3-cccc' }], kaart: {} }))
  } finally { global.fetch = oud }
  assert.equal(netwerk, 0)
  assert.equal(telWachtrij(), 1)
})

test('importeren weigert onbetrouwbare of ongeldige invoer zonder iets te wijzigen', () => {
  voegToeAanWachtrij(rij({ tekst: 'blijft', lokaal_id: 'lokaal-0-keep' }))
  const goed = { type: 'werkbank-comment-wachtrij', versie: 1, items: [{ ...rij(), lokaal_id: 'lokaal-9-zzzz' }], kaart: {} }
  const slecht = [
    'geen json', '', null, undefined, 42, '[]', '"tekst"', 'null',
    { ...goed, type: 'iets-anders' },
    { ...goed, versie: 2 },
    { ...goed, versie: '1' },
    { ...goed, items: 'nee' },
    { ...goed, items: null },
    { ...goed, kaart: [] },
    { type: 'werkbank-comment-wachtrij', versie: 1 },
  ]
  for (const s of slecht) {
    const uit = importeerWachtrij(typeof s === 'object' && s !== null ? JSON.stringify(s) : s)
    assert.equal(uit.ok, false, `moet geweigerd worden: ${JSON.stringify(s)}`)
    assert.equal(typeof uit.fout, 'string')
  }
  assert.deepEqual(teksten(), ['blijft'])
})

test('importeren wijst per item af wat niet klopt en neemt de rest over', () => {
  const basis = rij()
  const items = [
    { ...basis, lokaal_id: 'lokaal-1-goed' },
    { ...basis, lokaal_id: 'echt-1', tekst: 'geen lokaal-voorvoegsel' },
    { ...basis, lokaal_id: '__proto__', tekst: 'proto' },
    { ...basis, lokaal_id: 'lokaal-9-ctx-a', anker_context: { exact: 5 }, tekst: 'exact geen tekst' },
    { ...basis, lokaal_id: 'lokaal-9-ctx-b', anker_context: { exact: 'x', start: -1 }, tekst: 'start negatief' },
    { ...basis, lokaal_id: 'lokaal-9-ctx-c', anker_context: { exact: 'x', start: 10, end: 5 }, tekst: 'end voor start' },
    { ...basis, lokaal_id: 'lokaal-9-ctx-d', anker_context: [], tekst: 'ctx array' },
    { ...basis, lokaal_id: 'lokaal-' + 'x'.repeat(200), tekst: 'te lang' },
    { ...basis, lokaal_id: 'lokaal-<script>', tekst: 'tekens' },
    { ...basis, lokaal_id: 'lokaal-2-leeg', tekst: '   ' },
    { ...basis, lokaal_id: 'lokaal-3-getal', tekst: 5 },
    { ...basis, lokaal_id: 'lokaal-4-type', doel_type: 'rekening', tekst: 'fout type' },
    { ...basis, lokaal_id: 'lokaal-5-doel', doel_id: '', tekst: 'geen doel' },
    { ...basis, lokaal_id: 'lokaal-6-datum', created_at: 'gisteren', tekst: 'rare datum' },
    { ...basis, lokaal_id: 'lokaal-7-ctx', anker_context: 'tekst', tekst: 'ctx geen object' },
    { ...basis, lokaal_id: 'lokaal-8-ouder', parent_id: { x: 1 }, tekst: 'ouder object' },
    null, 'tekst', 7, [],
  ]
  const uit = importeerWachtrij(JSON.stringify({ type: 'werkbank-comment-wachtrij', versie: 1, items, kaart: {} }))
  assert.equal(uit.ok, true)
  assert.equal(uit.toegevoegd, 1)
  assert.equal(uit.afgewezen.length, items.length - 1)
  assert.ok(uit.afgewezen.every((a) => typeof a.reden === 'string' && Number.isInteger(a.index)))
  assert.deepEqual(leesWachtrij().map((x) => x.lokaal_id), ['lokaal-1-goed'])
  assert.equal(Object.getPrototypeOf({}).tekst, undefined)
})

test('importeren neemt alleen bekende velden over en dwingt lokaal-vlaggen zelf af', () => {
  const uit = importeerWachtrij(JSON.stringify({
    type: 'werkbank-comment-wachtrij', versie: 1,
    items: [{ ...rij(), lokaal_id: 'lokaal-1-vlag', lokaal: false, wachtend: false, id: 99999, afgewezen: true, opgelost: true, evil: '<img>' }],
    kaart: {},
  }).replace('"evil"', '"__proto__":{"x":1},"evil"'))
  assert.equal(uit.toegevoegd, 1)
  const [i] = leesWachtrij()
  assert.equal(i.lokaal, true)
  assert.equal(i.client_id, 'lokaal-1-vlag')
  assert.deepEqual(Object.keys(i).sort(), ['anker', 'anker_context', 'auteur', 'client_id', 'created_at', 'doel_id', 'doel_type', 'lokaal', 'lokaal_id', 'parent_id', 'tekst'])
})

test('importeren controleert de kaart en slaat reeds gesynchroniseerde items niet opnieuw in de wachtrij', async () => {
  const uit = importeerWachtrij(JSON.stringify({
    type: 'werkbank-comment-wachtrij', versie: 1,
    items: [
      { ...rij({ tekst: 'al weg' }), lokaal_id: 'lokaal-1-weg' },
      { ...rij({ tekst: 'nog niet' }), lokaal_id: 'lokaal-2-nog' },
    ],
    kaart: { 'lokaal-1-weg': 55, 'lokaal-3-vies': { x: 1 }, 'geen-lokaal': 9, 'lokaal-4-neg': -1 },
  }).replace('"kaart":{', '"kaart":{"__proto__":7,'))
  assert.equal(uit.ok, true)
  assert.equal(uit.alVerstuurd, 1)
  assert.deepEqual(teksten(), ['nog niet'])
  assert.equal(zoekGedeeldId('lokaal-1-weg'), 55)
  assert.equal(zoekGedeeldId('lokaal-3-vies'), null)
  assert.equal(zoekGedeeldId('lokaal-4-neg'), null)
  assert.equal(zoekGedeeldId('geen-lokaal'), null)
})

test('een geïmporteerde wachtrij gaat daarna gewoon mee bij versturen', async () => {
  importeerWachtrij(JSON.stringify({
    type: 'werkbank-comment-wachtrij', versie: 1,
    items: [{ ...rij({ tekst: 'terug', auteur: 'Anthony', created_at: '2026-11-12T08:00:00.000Z' }), lokaal_id: 'lokaal-1-terug' }],
    kaart: {},
  }))
  let gezien
  await verwerkWachtrij(async (i) => { gezien = i; return { id: 4 } })
  assert.equal(gezien.auteur, 'Anthony')
  assert.equal(gezien.created_at, '2026-11-12T08:00:00.000Z')
  assert.equal(gezien.client_id, 'lokaal-1-terug')
})

test('importeren in een volle opslag houdt de items in het geheugen en meldt dat', () => {
  faalOp = true
  const uit = importeerWachtrij(JSON.stringify({ type: 'werkbank-comment-wachtrij', versie: 1, items: [{ ...rij(), lokaal_id: 'lokaal-1-vol' }], kaart: {} }))
  assert.equal(uit.ok, true)
  assert.equal(uit.opslagBeperkt, true)
  assert.equal(telWachtrij(), 1)
})

/* ------------------------------------------------ oude gedrag blijft werken */

test('oude exports en oude opgeslagen items zonder client_id blijven leesbaar en versturen met lokaal_id', async () => {
  localStorage.setItem(WACHTRIJ_SLEUTEL, JSON.stringify([
    { lokaal_id: 'lokaal-1-oud', doel_type: 'blok', doel_id: '1.3', tekst: 'oud item', auteur: 'Victor', anker: null, parent_id: null, created_at: '2026-11-01T10:00:00.000Z', lokaal: true },
  ]))
  assert.equal(telWachtrij(), 1)
  let gezien
  await verwerkWachtrij(async (i) => { gezien = i; return { id: 1 } })
  assert.equal(gezien.client_id, 'lokaal-1-oud')
  assert.equal(gezien.anker_context ?? null, null)
})

/* ------------------------------------------------ integratiecontract voor de ouder */

test('anker_context houdt alleen het markerschema: exact, prefix, suffix, start, end, document_versie', () => {
  const { item } = voegToeAanWachtrij(rij({ anker_context: { ...CTX, vreemd: 'weg', __x: 1 } }))
  assert.deepEqual(item.anker_context, CTX)
  assert.deepEqual(Object.keys(item.anker_context).sort(), ['document_versie', 'end', 'exact', 'prefix', 'start', 'suffix'])
  const { item: zonder } = voegToeAanWachtrij(rij({ tekst: 'zonder', anker_context: 'geen object' }))
  assert.equal(zonder.anker_context, null)
})

test('opslagStatus meldt duurzaam of een eerlijke fout', () => {
  assert.deepEqual(Object.keys(opslagStatus()).sort().slice(0, 2), ['duurzaam', 'fout'])
  assert.equal(opslagStatus().duurzaam, true)
  assert.equal(opslagStatus().fout, null)
  faalOp = true
  bewaarInWachtrij(rij({ tekst: 'niet duurzaam' }))
  const st = opslagStatus()
  assert.equal(st.duurzaam, false)
  assert.equal(typeof st.fout, 'string')
  assert.ok(st.fout.length > 5)
  assert.equal(opslagBeperkt(), true)
  faalOp = false
  bewaarInWachtrij(rij({ tekst: 'weer duurzaam' }))
  assert.deepEqual({ d: opslagStatus().duurzaam, f: opslagStatus().fout }, { d: true, f: null })
})

test('leesImportVoorbeeld is puur: geeft items, kaart en aantal en raakt de opslag niet', () => {
  voegToeAanWachtrij(rij({ tekst: 'bestaand', lokaal_id: 'lokaal-0-keep' }))
  schrijfLog = []
  const invoer = JSON.stringify({
    type: 'werkbank-comment-wachtrij', versie: 1,
    items: [
      { ...rij({ tekst: 'een', auteur: 'Anthony', anker_context: CTX }), lokaal_id: 'lokaal-1-een' },
      { ...rij({ tekst: 'twee' }), lokaal_id: 'lokaal-2-twee', parent_id: 'lokaal-1-een' },
      { ...rij({ tekst: '' }), lokaal_id: 'lokaal-3-leeg' },
    ],
    kaart: { 'lokaal-9-oud': 12 },
  })
  const v = leesImportVoorbeeld(invoer)
  assert.equal(v.ok, true)
  assert.equal(v.aantal, 2)
  assert.deepEqual(v.items.map((x) => x.tekst), ['een', 'twee'])
  assert.equal(v.items[0].auteur, 'Anthony')
  assert.deepEqual(v.items[0].anker_context, CTX)
  assert.equal(v.items[0].client_id, 'lokaal-1-een')
  assert.deepEqual(v.kaart, { 'lokaal-9-oud': 12 })
  assert.equal(v.afgewezen.length, 1)
  assert.deepEqual(schrijfLog, [], 'geen enkele opslagschrijfactie')
  assert.deepEqual(teksten(), ['bestaand'])
  assert.equal(zoekGedeeldId('lokaal-9-oud'), null)
  // ongeldige invoer: nette lege uitkomst
  const slecht = leesImportVoorbeeld('geen json')
  assert.equal(slecht.ok, false)
  assert.equal(slecht.aantal, 0)
  assert.deepEqual(slecht.items, [])
  assert.deepEqual(slecht.kaart, {})
  assert.equal(typeof slecht.fout, 'string')
  // ook een object mag, net als tekst
  assert.equal(leesImportVoorbeeld(JSON.parse(invoer)).aantal, 2)
})

test('importeerWachtrij meldt aantalToegevoegd naast toegevoegd en geeft de kaart mee aan zoekGedeeldId', () => {
  const uit = importeerWachtrij(JSON.stringify({
    type: 'werkbank-comment-wachtrij', versie: 1,
    items: [{ ...rij(), lokaal_id: 'lokaal-1-een' }], kaart: { 'lokaal-5-sync': 88 },
  }))
  assert.equal(uit.aantalToegevoegd, 1)
  assert.equal(uit.toegevoegd, 1)
  assert.equal(zoekGedeeldId('lokaal-5-sync'), 88)
})

test('de ouderkaart blijft bewaard na het leegmaken van de wachtrij, voor nieuwe antwoorden op een gesynchroniseerde wortel', async () => {
  const ouders = []
  for (let i = 0; i < 3; i++) {
    const { item } = voegToeAanWachtrij(rij({ tekst: `wortel ${i}` }))
    ouders.push(item.lokaal_id)
  }
  await verwerkWachtrij(async (i) => ({ id: 100 + Number(i.tekst.slice(-1)) }))
  assert.equal(telWachtrij(), 0)
  // een volgende flush van iets anders mag de oude kaart niet opruimen
  voegToeAanWachtrij(rij({ tekst: 'los' }))
  await verwerkWachtrij(async () => ({ id: 500 }))
  assert.deepEqual(ouders.map(zoekGedeeldId), [100, 101, 102])
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem(KAART_SLEUTEL))).filter((k) => ouders.includes(k)).sort(), [...ouders].sort())
  // een nieuw antwoord op de gesynchroniseerde wortel krijgt direct het echte nummer
  const { item: antw } = voegToeAanWachtrij(rij({ tekst: 'antwoord', parent_id: ouders[1] }))
  let gezien
  await verwerkWachtrij(async (i) => { gezien = i; return { id: 600 } })
  assert.equal(antw.client_id, antw.lokaal_id)
  assert.equal(gezien.parent_id, 101)
})
