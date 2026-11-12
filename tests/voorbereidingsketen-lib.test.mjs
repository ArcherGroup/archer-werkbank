import { test } from 'node:test'
import assert from 'node:assert/strict'

/* Tests voor de rekenlaag van de voorbereidingsketen (src/lib/voorbereidingsketen.js).
   Geen netwerk en geen Supabase: alles komt uit de invoer die de test zelf meegeeft. */

async function laad() {
  try { return await import('../src/lib/voorbereidingsketen.js') }
  catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e }
}
const { bouwKeten, KETEN_STAPPEN } = await laad()

const BLOK_13 = { id: '1.3', code: '1.3', titel: 'Waarom beleggen' }
const BLOK_44 = { id: '4.4', code: '4.4', titel: 'Het vermogensplan' }
const DOCS = [
  { id: 11, blok_id: '1.3', soort: 'brief', titel: 'brief', bytes: 3200 },
  { id: 12, blok_id: '1.3', soort: 'spreektekst', titel: 'spreektekst', bytes: 9100 },
  { id: 13, blok_id: '1.3', soort: 'slides', titel: 'slides', bytes: 4000 },
  { id: 14, blok_id: '1.3', soort: 'werkboek', titel: 'werkboek', bytes: 5200 },
  { id: 15, blok_id: '1.3', soort: 'research', titel: 'research-rendement', bytes: 7000 },
  { id: 21, blok_id: '4.4', soort: 'spreektekst', titel: 'spreektekst', bytes: 800 },
  { id: 22, blok_id: '4.4', soort: 'oefening', titel: 'A3-template-vermogensplan', bytes: 0 },
  { id: 75, blok_id: 'algemeen', soort: 'brief', titel: 'masterplan-februari-2027', bytes: 100 },
]
const BRONNEN = [
  { id: 1, blok_id: '1.3', document_id: null, titel: 'FOD Financiën: TOB', status: 'kernbron' },
  { id: 2, blok_id: '1.3', document_id: 12, titel: 'Pensioenspaarfonds', status: 'ongelezen' },
  { id: 3, blok_id: '4.4', document_id: null, titel: 'GGR-studie', status: 'gelezen' },
  { id: 4, blok_id: null, document_id: 13, titel: 'Zonder dagdeel, hangt aan de slides van 1.3', status: 'ongelezen' },
  { id: 5, blok_id: '2.1', document_id: 12, titel: 'Expliciet ander dagdeel', status: 'gelezen' },
  { id: 6, blok_id: null, document_id: null, titel: 'Los van alles', status: 'ongelezen' },
]
const NOTITIES = [
  { id: 1, doel_type: 'blok', doel_id: '1.3', tekst: 'Slide 4 is te druk', auteur: 'Bjorn', created_at: '2026-11-10T09:00:00Z' },
  { id: 2, doel_type: 'blok', doel_id: '1.3', tekst: 'Voorbeeld werkt goed', auteur: 'Anthony', created_at: '2026-11-11T09:00:00Z' },
  { id: 3, doel_type: 'blok', doel_id: '4.4', tekst: 'Andere dagdeel', auteur: 'Bjorn', created_at: '2026-11-12T09:00:00Z' },
  { id: 4, doel_type: 'doc', doel_id: '1.3', tekst: 'Notitie bij een stuk, niet bij het dagdeel', auteur: 'Bjorn', created_at: '2026-11-12T10:00:00Z' },
]
const BESLISSINGEN = [
  { id: 1, titel: 'Het GGR-anker', status: 'open' },
  { id: 2, titel: 'Een losse keuze', status: 'beslist', blok_id: '1.3' },
  { id: 3, titel: 'Zonder enige koppeling', status: 'open' },
]
const VOL = { documentenMeta: DOCS, bronnen: BRONNEN, notities: NOTITIES, beslissingen: BESLISSINGEN }
const keten = (blok, extra = {}) => bouwKeten({ blok, ...VOL, ...extra })
const stap = (k, id) => k.stappen.find((s) => s.id === id)
const ids = (s) => s.items.map((i) => `${i.soort}:${i.id}`)

test('de keten heeft zeven stappen in de vaste volgorde van de werkwijze', () => {
  assert.equal(typeof bouwKeten, 'function', 'bouwKeten ontbreekt')
  assert.deepEqual(keten(BLOK_13).stappen.map((s) => s.id), ['vraag', 'bronnen', 'stelling', 'lesinhoud', 'oefening', 'feedback', 'bijsturing'])
  assert.deepEqual(KETEN_STAPPEN.map((s) => s.naam), ['Vraag', 'Bronnen', 'Stelling', 'Lesinhoud', 'Oefening', 'Feedback', 'Bijsturing'])
})

test('stukken worden echt per dagdeel gefilterd en per stap op soort ingedeeld', () => {
  const a = keten(BLOK_13)
  assert.deepEqual(ids(stap(a, 'vraag')), ['stuk:11'])
  assert.deepEqual(ids(stap(a, 'lesinhoud')), ['stuk:12', 'stuk:13'], 'spreektekst vóór slides')
  assert.deepEqual(ids(stap(a, 'oefening')), ['stuk:14'])
  const b = keten(BLOK_44)
  assert.deepEqual(ids(stap(b, 'vraag')), [], '4.4 heeft geen eigen brief; de brief van "algemeen" hoort er niet bij')
  assert.deepEqual(ids(stap(b, 'lesinhoud')), ['stuk:21'])
  assert.deepEqual(ids(stap(b, 'oefening')), ['stuk:22'])
  const alle = [a, b].flatMap((k) => k.stappen.flatMap(ids))
  assert.ok(!alle.includes('stuk:75'), 'een stuk van "algemeen" is van geen enkel dagdeel')
})

test('bronnen volgen blok_id; zonder blok_id telt het stuk waaraan ze hangen; een ander blok_id wint altijd', () => {
  const a = stap(keten(BLOK_13), 'bronnen')
  assert.deepEqual(ids(a), ['bron:1', 'bron:2', 'bron:4', 'stuk:15'], 'bronnen eerst in invoervolgorde, dan research-stukken')
  assert.ok(!ids(a).includes('bron:5'), 'bron 5 zegt zelf dat ze bij 2.1 hoort, ook al hangt ze aan een stuk van 1.3')
  assert.ok(!ids(a).includes('bron:6'), 'een bron zonder enige koppeling is van geen dagdeel')
  assert.deepEqual(ids(stap(keten(BLOK_44), 'bronnen')), ['bron:3'])
})

test('elke doorklik krijgt de route die de app kent', () => {
  const k = keten(BLOK_13)
  assert.equal(k.blok.route, '#/blok/1.3')
  assert.equal(stap(k, 'vraag').items[0].route, '#/doc/11')
  assert.equal(stap(k, 'bronnen').items[0].route, '#/bron/1')
  assert.equal(stap(k, 'bronnen').items.at(-1).route, '#/doc/15')
  assert.equal(stap(keten(BLOK_44), 'bijsturing').items[0].route, '#/beslissing/1')
})

test('leeg en onbekend zijn twee verschillende dingen', () => {
  const leeg = bouwKeten({ blok: BLOK_13, documentenMeta: [], bronnen: [], notities: [], beslissingen: [] })
  for (const s of leeg.stappen.filter((x) => x.id !== 'stelling')) {
    assert.equal(s.stand, 'leeg', `${s.id}: aangeleverd en leeg`)
    assert.equal(s.reden, null)
  }
  const zonder = bouwKeten({ blok: BLOK_13 })
  for (const s of zonder.stappen) {
    assert.equal(s.stand, 'onbekend', `${s.id}: niets aangeleverd is geen "0"`)
    assert.equal(s.reden, s.id === 'stelling' ? 'niet-vastgelegd' : 'niet-aangeleverd')
    assert.deepEqual(s.items, [])
  }
  assert.equal(stap(bouwKeten({ blok: BLOK_13, notities: null, beslissingen: 'kapot', documentenMeta: DOCS }), 'feedback').stand, 'onbekend', 'null is geen lege lijst')
  assert.equal(stap(bouwKeten({ blok: BLOK_13, notities: null, beslissingen: 'kapot', documentenMeta: DOCS }), 'bijsturing').stand, 'onbekend', 'een tekst is geen lijst')
})

test('zolang de gegevens laden is alles onbekend, ook als er al iets is aangeleverd', () => {
  const k = keten(BLOK_13, { geladen: false })
  assert.ok(k.stappen.every((s) => s.stand === 'onbekend' && s.reden === 'laden' && s.items.length === 0))
  assert.equal(k.geladen, false)
})

test('een deels aangeleverde stap toont wat er is en zegt dat er mogelijk meer bestaat', () => {
  const k = bouwKeten({ blok: BLOK_13, bronnen: BRONNEN })
  const s = stap(k, 'bronnen')
  assert.deepEqual(ids(s), ['bron:1', 'bron:2'], 'zonder documentenMeta valt "via het stuk" weg en zijn er geen research-stukken te vinden')
  assert.equal(s.stand, 'aanwezig')
  assert.equal(s.reden, 'onvolledig')
  assert.equal(stap(bouwKeten({ blok: BLOK_13, documentenMeta: DOCS, bronnen: BRONNEN }), 'bronnen').reden, null)
})

test('het bestaan van een stuk is geen validatie: alleen aanwezigheid, nooit "klaar" of "gevalideerd"', () => {
  const k = keten(BLOK_13)
  const TOEGESTAAN = ['onbekend', 'leeg', 'aanwezig']
  for (const s of k.stappen) {
    assert.ok(TOEGESTAAN.includes(s.stand), `${s.id}: stand ${s.stand}`)
    assert.doesNotMatch(Object.keys(s).join(' '), /klaar|valid|goedgekeurd|voltooid|voortgang|percentage|score/i)
    for (const item of s.items) assert.doesNotMatch(Object.keys(item).join(' '), /klaar|valid|goedgekeurd|voltooid|voortgang|percentage|score/i)
  }
  // Velden die validatie of voortgang zouden kunnen suggereren, worden niet eens gelezen.
  const vervuild = {
    blok: { ...BLOK_13, status: 'Final', gevalideerd: true },
    documentenMeta: DOCS.map((d) => ({ ...d, status: 'Final', gevalideerd: true, goedgekeurd: true, versie: 9, bewerkt_door: 'Victor' })),
    bronnen: BRONNEN.map((b) => ({ ...b, gevalideerd: true, gecontroleerd: true })),
  }
  assert.deepEqual(bouwKeten({ ...VOL, ...vervuild }), keten(BLOK_13))
})

test('een stuk dat bestaat maar 0 bytes groot is, telt als nog zonder inhoud; een onbekende grootte wordt niet als leeg bestempeld', () => {
  const b = stap(keten(BLOK_44), 'oefening')
  assert.equal(b.items[0].leeg, true)
  assert.equal(b.stand, 'leeg')
  assert.equal(b.reden, 'zonder-inhoud')
  assert.equal(b.items.length, 1, 'het stuk blijft een doorklik: je kan het gaan vullen')
  const onbekendeGrootte = bouwKeten({ blok: BLOK_44, documentenMeta: [{ id: 22, blok_id: '4.4', soort: 'oefening', titel: 'x' }] })
  assert.equal(stap(onbekendeGrootte, 'oefening').stand, 'aanwezig')
  assert.equal(stap(onbekendeGrootte, 'oefening').items[0].leeg, false)
  const gemengd = bouwKeten({ blok: BLOK_44, documentenMeta: [{ id: 1, blok_id: '4.4', soort: 'slides', titel: 'a', bytes: 0 }, { id: 2, blok_id: '4.4', soort: 'spreektekst', titel: 'b', bytes: 12 }] })
  assert.equal(stap(gemengd, 'lesinhoud').stand, 'aanwezig', 'één stuk met inhoud volstaat voor "gekoppeld"')
})

test('notities tellen alleen als ze bij dit dagdeel horen en tonen de laatste echt als laatste', () => {
  const f = stap(keten(BLOK_13), 'feedback')
  assert.equal(f.stand, 'aanwezig')
  assert.equal(f.aantal, 2, 'notitie 3 is van 4.4 en notitie 4 hangt aan een stuk')
  assert.deepEqual(f.laatste, { auteur: 'Anthony', datum: '2026-11-11T09:00:00.000Z' })
  assert.deepEqual(f.items, [], 'notities worden geteld, hun tekst wordt hier niet getoond')
  assert.equal(f.route, '#/blok/1.3', 'de notities staan op de dagdeelpagina')
  assert.equal(stap(keten(BLOK_44), 'feedback').aantal, 1)
  // Een ouder die al gefilterd heeft, hoeft de doelvelden niet mee te geven.
  const kaal = bouwKeten({ blok: BLOK_13, notities: [{ id: 9, tekst: 'Kaal', auteur: 'Bjorn' }] })
  assert.equal(stap(kaal, 'feedback').aantal, 1)
  assert.equal(stap(kaal, 'feedback').laatste, null, 'zonder geldig tijdstip geen verzonnen datum')
})

test('beslissingen horen bij een dagdeel via een expliciet blok_id of via de bestaande bronkoppeling, nooit op gevoel', () => {
  const b = stap(keten(BLOK_44), 'bijsturing')
  assert.deepEqual(ids(b), ['beslissing:1'], 'Het GGR-anker hangt aan de spreektekst van 4.4')
  assert.equal(b.items[0].status, 'open')
  assert.deepEqual(ids(stap(keten(BLOK_13), 'bijsturing')), ['beslissing:2'], 'expliciet blok_id 1.3; het GGR-anker hoort daar niet')
  const geen = stap(bouwKeten({ blok: BLOK_44, documentenMeta: [], beslissingen: BESLISSINGEN }), 'bijsturing')
  assert.deepEqual(geen.items, [], 'zonder het stuk waaraan de koppeling hangt, is er geen koppeling')
  assert.equal(geen.stand, 'leeg')
  assert.ok(![BLOK_13, BLOK_44].some((blok) => ids(stap(keten(blok), 'bijsturing')).includes('beslissing:3')), 'beslissing 3 heeft geen enkele koppeling')
})

test('de stelling is onbekend tot de ouder er een aanlevert; de brief wordt alleen als zoekplek genoemd', () => {
  const onbekend = stap(keten(BLOK_13), 'stelling')
  assert.equal(onbekend.stand, 'onbekend')
  assert.equal(onbekend.reden, 'niet-vastgelegd')
  assert.deepEqual(onbekend.verwijzing, { route: '#/doc/11', titel: 'brief' })
  assert.equal(stap(keten(BLOK_44), 'stelling').verwijzing, null, 'geen brief, geen verwijzing')
  const er = stap(keten(BLOK_13, { stelling: '  Wie\u202E vroeg   begint,\n wint tijd.  ' }), 'stelling')
  assert.equal(er.stand, 'aanwezig')
  assert.equal(er.tekst, 'Wie vroeg begint, wint tijd.', 'witruimte genormaliseerd en omkerende tekens verwijderd')
  const lang = stap(keten(BLOK_13, { stelling: 'a'.repeat(900) }), 'stelling')
  assert.ok(lang.tekst.length <= 281 && lang.tekst.endsWith('…'))
  assert.equal(stap(keten(BLOK_13, { stelling: '   ' }), 'stelling').stand, 'leeg')
  assert.equal(stap(keten(BLOK_13, { stelling: 42 }), 'stelling').stand, 'onbekend', 'een getal is geen stelling')
})

test('de kernboodschap verwijst alleen naar de aangeleverde bronbrief van dit dagdeel', () => {
  const k = bouwKeten({ ...VOL, blok: BLOK_13, stelling: 'De kernboodschap.', stellingBron: { id: 11 } })
  assert.deepEqual(stap(k, 'stelling').herkomst, { route: '#/doc/11', titel: 'brief' })
  const ander = bouwKeten({ ...VOL, blok: BLOK_13, stelling: 'De kernboodschap.', stellingBron: { id: 75 } })
  assert.equal(stap(ander, 'stelling').herkomst, null)
})

test('zonder bruikbaar dagdeel is er geen keten', () => {
  for (const blok of [undefined, null, {}, { id: '' }, { id: null, code: '1.3' }, 'tekst', []]) {
    const k = bouwKeten({ blok, ...VOL })
    assert.equal(k.blok, null, JSON.stringify(blok))
    assert.deepEqual(k.stappen, [])
  }
})

test('kapotte regels in de invoer worden overgeslagen in plaats van de keten te breken', () => {
  const k = bouwKeten({
    blok: BLOK_13,
    documentenMeta: [null, 'x', 7, {}, { blok_id: '1.3', soort: 'brief', titel: 'zonder id' }, { id: 11, blok_id: '1.3', soort: 'brief', titel: 'ok' }, { id: 11, blok_id: '1.3', soort: 'brief', titel: 'dubbel' }],
    bronnen: [undefined, [], { titel: 'zonder id', blok_id: '1.3' }, { id: 1, blok_id: '1.3', titel: '', status: 'raar' }],
    notities: [null, 3],
    beslissingen: [null, {}, { titel: 'zonder id', blok_id: '1.3' }],
  })
  assert.deepEqual(ids(stap(k, 'vraag')), ['stuk:11'], 'geen id: geen doorklik; dubbel id: één keer')
  assert.equal(stap(k, 'vraag').items[0].titel, 'ok')
  assert.deepEqual(ids(stap(k, 'bronnen')), ['bron:1'])
  assert.equal(stap(k, 'bronnen').items[0].titel, 'Bron zonder titel', 'een lege titel krijgt een eerlijke vervanger, geen verzonnen naam')
  assert.equal(stap(k, 'bronnen').items[0].status, null, 'een onbekende bronstatus wordt niet doorgegeven')
  assert.equal(stap(k, 'feedback').aantal, 0)
  assert.equal(stap(k, 'feedback').stand, 'leeg')
  assert.deepEqual(stap(k, 'bijsturing').items, [])
})

test('id\'s worden veilig in een route gezet', () => {
  const k = bouwKeten({ blok: { id: 'a/b?c', code: 'x', titel: 'y' }, documentenMeta: [{ id: '5#x', blok_id: 'a/b?c', soort: 'brief', titel: 't' }] })
  assert.equal(k.blok.route, '#/blok/a%2Fb%3Fc')
  assert.equal(stap(k, 'vraag').items[0].route, '#/doc/5%23x')
})
