import { test } from 'node:test'
import assert from 'node:assert/strict'

/* Tests voor de rekenlaag van de dagdeelvisie (src/lib/dagdeel-visie.js).
   Geen netwerk, geen Supabase en geen React: alles komt uit de invoer die de test zelf meegeeft.
   De teksten hieronder zijn oefenmateriaal in de vorm van de echte 1.3-brief en het masterplan.
   De implementatie mag geen van deze teksten kennen: de laatste tests bewijzen dat met een
   volledig ander dagdeel. */

async function laad() {
  try { return await import('../src/lib/dagdeel-visie.js') }
  catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e }
}
const { bouwDagdeelVisie, vergelijkEigenaar, stukkenBijTijdvak, stukkenVanDagdeel } = await laad()

const BLOK_13 = { id: '1.3', code: '1.3', titel: "ETF's", dag: 1, spreker: 'Anthony' }
const BLOK_21 = { id: '2.1', code: '2.1', titel: 'Vastgoed keynote', dag: 2 }
const BLOKKEN = [
  { id: '1.4', code: '1.4', titel: 'Private markets', dag: 1, volgorde: 4, status: 'Leeg' },
  { id: '2.1', code: '2.1', titel: 'Vastgoed keynote', dag: 2, volgorde: 5 },
  { id: '1.1', code: '1.1', titel: 'Inleiding', dag: 1, volgorde: 1 },
  { id: 'algemeen', code: 'algemeen', titel: 'Algemeen', dag: 1, volgorde: 0 },
  { id: 'bronnen', code: 'bronnen', titel: 'Bronnen', dag: 1, volgorde: 99 },
  { id: '1.3', code: '1.3', titel: "ETF's", dag: 1, volgorde: 3 },
  { id: '1.2', code: '1.2', titel: 'Macro en rentes', dag: 1, volgorde: 2 },
]
// Zoals laadDocumentenMeta ze aanlevert: gesorteerd op soort, dan titel.
const DOCS = [
  { id: 9, blok_id: '1.3', soort: 'brief', titel: 'brief' },
  { id: 19, blok_id: '1.3', soort: 'oefening', titel: 'brokerfiche' },
  { id: 18, blok_id: '1.3', soort: 'research', titel: 'research-kosten' },
  { id: 15, blok_id: '1.3', soort: 'slides', titel: 'slides' },
  { id: 16, blok_id: '1.3', soort: 'spreektekst', titel: 'spreektekst' },
  { id: 17, blok_id: '1.3', soort: 'werkboek', titel: 'werkboek' },
  { id: 30, blok_id: '2.1', soort: 'brief', titel: 'brief' },
  { id: 31, blok_id: '2.1', soort: 'brief', titel: 'briefing-gunther' },
  { id: 32, blok_id: '2.1', soort: 'werkboek', titel: 'werkboek' },
  { id: 75, blok_id: 'algemeen', soort: 'brief', titel: 'masterplan-februari-2027' },
]

const BRIEF_13 = `---
type: brief
---

# 1.3 ETF's: brief

**Eigenaar:** Victor.

## Doel

De deelnemer begrijpt waarom een ETF de **goedkoopste groeimotor** is en kent de [zes stappen](#/doc/99) om er een te kopen.

Een tweede alinea die geen doel is.

## Kernboodschap

Een ETF is een *beursgenoteerd* mandje dat je in vijftien minuten koopt en dertig jaar kunt vergeten.
De keuze moet bewust gebeuren.

## Leerdoelen

1. Uitleggen wat een ETF is.
2. De zes criteria toepassen.

## Opbouw

1. **14:00 tot 14:10: opening met de spiegel (10 min, luisteren).** Het cijfer van de zaal: 1 procent ETF's, 51 procent cash. De vraag: wat kost dat?
2. **14:10 tot 14:45: theorie, deel 1 (35 min, luisteren).** Wat is een ETF, waarom is het de goedkoopste groeimotor.
3. **14:45 tot 15:15: oefening (30 min, doen).** De vijf ETF's rangschikken op papier. Offline, geen wifi.
4. **15:15 tot 15:30: afsluiting en beslissingsvragen (15 min).** De vijf beslissingsvragen invullen en de brug naar 1.4 (private markets).

## Hergebruik uit september

1. **09:00 tot 09:10: dit hoort niet bij de opbouw (5 min, doen).** Genummerd en met tijd, maar in een andere sectie.
`
const BRIEF_21 = '## Doel\n\nVastgoed als pilaar.\n\n## Kernboodschap\n\nInkomen en bescherming.\n\n## Opbouw\n\n1. **09:00 tot 09:30: keynote (30 min, luisteren).** Vastgoed in drie stappen.\n'

const MASTER = `# Masterplan februari 2027

## 2. De rode draad in één zin

> **Van nul naar groeimotor: vier dagen bouwen aan het gebouw van je vermogen.**

De vier lagen die elkaar versterken:

| Laag | Wat het is | Waar het terugkomt |
|---|---|---|
| **B · de romp** | De vier dagen | De dagindeling |

## 3. De vier dagen en de zeventien dagdelen

### Dag 0: de nulmeting (de onboarding)

Geen dagdeel, en geen kop in de vorm "Dag N · titel".

### Dag 1 · Financiële Bewustwording (de spiegel)

| Dagdeel | Kernboodschap | Spreker | De GGR-moment | De steen |
|---|---|---|---|---|
| 1.1 Inleiding en waarom beleggen | Het ankerverhaal | Anthony | Jouw startpunt | De fundering |
| 1.3 ETF's | De goedkoopste groeimotor | Anthony | Het instrument om je GGR te keren | De groeipilaar |
| 1.30 Een ander dagdeel | Andere boodschap | Iemand | Verkeerde meetlat | Verkeerde steen |

### Dag 2 · De activa (de stenen)

| Dagdeel | Kernboodschap | Spreker | De GGR-moment | De steen |
|---|---|---|---|---|
| 2.1 Vastgoed keynote | Vastgoed als pilaar | Gunther | Wat vastgoed netto doet | De inkomenspilaar |

### Dag 3 · De verpakking (de structuren)

### Dag 4 · Het plan (de praktijk)

## 7. De bronnen

| Bron | Wat | Waar |
|---|---|---|
| Transcripten september | Vijf dagtranscripten | de app |
`

const maak = (extra = {}) => ({ blok: BLOK_13, blokken: BLOKKEN, documentenMeta: DOCS, brief: { id: 9, blok_id: '1.3', soort: 'brief', titel: 'brief', inhoud: BRIEF_13 }, masterplan: { id: 75, blok_id: 'algemeen', inhoud: MASTER }, ...extra })
const visie = (extra) => bouwDagdeelVisie(maak(extra))
const LEEG = { doel: null, boodschap: null, tijdvakken: [], bronnen: [], dagdelen: [], dagen: [], rodeDraad: null, plek: null }
const brief = (inhoud, extra = {}) => ({ id: 9, blok_id: '1.3', soort: 'brief', titel: 'brief', inhoud, ...extra })
const opbouw = (...regels) => brief(`## Opbouw\n\n${regels.join('\n')}\n`)
const tabel = (...rijen) => `| Dagdeel | Thema | De GGR-moment | De steen |\n|---|---|---|---|\n${rijen.join('\n')}\n`
const diepVries = (w) => { if (w && typeof w === 'object' && !Object.isFrozen(w)) { Object.freeze(w); Object.values(w).forEach(diepVries) } return w }

// ---------------------------------------------------------------- de 1.3-vorm

test('eigenaar in dagdeel en echte brief worden vergeleken zonder te kiezen', () => {
  const invoer = maak({ blok: { ...BLOK_13, eigenaar: 'Anthony' } })
  assert.deepEqual(vergelijkEigenaar(invoer), { dagdeel: 'Anthony', brief: 'Victor', bron: '#/doc/9' })
  assert.equal(vergelijkEigenaar({ ...invoer, blok: { ...invoer.blok, eigenaar: 'Victor' } }), null)
  assert.equal(vergelijkEigenaar({ ...invoer, brief: { ...invoer.brief, blok_id: '2.1' } }), null)
  assert.equal(vergelijkEigenaar({ ...invoer, documentenMeta: [...invoer.documentenMeta, { id: 10, blok_id: '1.3', titel: 'brief', soort: 'brief' }] }), null)
  assert.equal(vergelijkEigenaar({ ...invoer, brief: { ...invoer.brief, inhoud: invoer.brief.inhoud.replace('**Eigenaar:** Victor.', '**Eigenaar:** Victor. **Eigenaar:** Anthony.') } }), null)
})

const STUKKEN = [
  { id: 9, soort: 'brief', titel: 'brief', route: '#/doc/9' },
  { id: 18, soort: 'research', titel: 'research-kosten', route: '#/doc/18' },
  { id: 19, soort: 'oefening', titel: 'brokerfiche', route: '#/doc/19' },
  { id: 15, soort: 'slides', titel: 'slides', route: '#/doc/15' },
  { id: 16, soort: 'spreektekst', titel: 'spreektekst', route: '#/doc/16' },
  { id: 17, soort: 'werkboek', titel: 'werkboek', route: '#/doc/17' },
]

test('een onderdeel toont alleen de stukken die bij zijn vorm horen en die echt bestaan', () => {
  assert.deepEqual(stukkenBijTijdvak(STUKKEN, { vorm: 'luisteren' }).map((s) => s.id), [16, 15])
  assert.deepEqual(stukkenBijTijdvak(STUKKEN, { vorm: 'doen' }).map((s) => s.id), [17, 19])
  assert.deepEqual(stukkenBijTijdvak(STUKKEN, { vorm: 'beslissen' }).map((s) => s.id), [17])
  assert.deepEqual(stukkenBijTijdvak(STUKKEN, { vorm: 'Luisteren' }).map((s) => s.id), [16, 15])
  assert.deepEqual(stukkenBijTijdvak(STUKKEN, { vorm: null }), [], 'zonder vorm wordt niets bij een onderdeel gehangen')
  assert.deepEqual(stukkenBijTijdvak(STUKKEN, { vorm: 'onbekend' }), [])
  assert.deepEqual(stukkenBijTijdvak([{ id: 1, soort: 'werkboek', titel: 'los' }], { vorm: 'beslissen' }).map((s) => s.titel), ['los'], 'de titel komt uit het stuk zelf')
  assert.deepEqual(stukkenBijTijdvak(null, { vorm: 'doen' }), [])
})

test('alle stukken van een dagdeel komen in vaste volgorde, zonder die van een ander dagdeel', () => {
  assert.deepEqual(stukkenVanDagdeel(DOCS, '1.3').map((s) => s.id), [9, 16, 15, 17, 19, 18])
  assert.deepEqual(stukkenVanDagdeel(DOCS, '2.1').map((s) => s.id), [30, 31, 32])
  assert.deepEqual(stukkenVanDagdeel(DOCS, 'bestaat-niet'), [])
  assert.deepEqual(stukkenVanDagdeel(null, '1.3'), [])
  assert.deepEqual(stukkenVanDagdeel(DOCS, null), [])
})

test('de visie heeft precies de acht velden van het contract', () => {
  assert.equal(typeof bouwDagdeelVisie, 'function', 'bouwDagdeelVisie ontbreekt')
  assert.deepEqual(Object.keys(visie()).sort(), ['boodschap', 'bronnen', 'dagdelen', 'dagen', 'doel', 'plek', 'rodeDraad', 'tijdvakken'])
})

test('doel en boodschap zijn de eerste alinea van de brief van dit dagdeel, zonder opmaak', () => {
  const v = visie()
  assert.equal(v.doel, 'De deelnemer begrijpt waarom een ETF de goedkoopste groeimotor is en kent de zes stappen om er een te kopen.')
  assert.equal(v.boodschap, 'Een ETF is een beursgenoteerd mandje dat je in vijftien minuten koopt en dertig jaar kunt vergeten. De keuze moet bewust gebeuren.')
})

test('het programma komt uit de genummerde regels van ## Opbouw en nergens anders vandaan', () => {
  assert.deepEqual(visie().tijdvakken, [
    { id: 1, begin: '14:00', einde: '14:10', minuten: 10, vorm: 'luisteren', titel: 'opening met de spiegel', detail: "Het cijfer van de zaal: 1 procent ETF's, 51 procent cash. De vraag: wat kost dat?" },
    { id: 2, begin: '14:10', einde: '14:45', minuten: 35, vorm: 'luisteren', titel: 'theorie, deel 1', detail: 'Wat is een ETF, waarom is het de goedkoopste groeimotor.' },
    { id: 3, begin: '14:45', einde: '15:15', minuten: 30, vorm: 'doen', titel: 'oefening', detail: "De vijf ETF's rangschikken op papier. Offline, geen wifi." },
    { id: 4, begin: '15:15', einde: '15:30', minuten: 15, vorm: null, titel: 'afsluiting en beslissingsvragen', detail: 'De vijf beslissingsvragen invullen en de brug naar 1.4 (private markets).' },
  ])
})

test('de bronnen zijn de stukken van de vier soorten van dit dagdeel in vaste volgorde, met de route die de app kent', () => {
  assert.deepEqual(visie().bronnen, [
    { id: 9, soort: 'brief', titel: 'brief', route: '#/doc/9' },
    { id: 16, soort: 'spreektekst', titel: 'spreektekst', route: '#/doc/16' },
    { id: 15, soort: 'slides', titel: 'slides', route: '#/doc/15' },
    { id: 17, soort: 'werkboek', titel: 'werkboek', route: '#/doc/17' },
  ])
})

test('de dagdelen van de dag staan gesorteerd, zonder algemeen en bronnen, met alleen id, code, titel en route', () => {
  assert.deepEqual(visie().dagdelen, [
    { id: '1.1', code: '1.1', titel: 'Inleiding', route: '#/blok/1.1' },
    { id: '1.2', code: '1.2', titel: 'Macro en rentes', route: '#/blok/1.2' },
    { id: '1.3', code: '1.3', titel: "ETF's", route: '#/blok/1.3' },
    { id: '1.4', code: '1.4', titel: 'Private markets', route: '#/blok/1.4' },
  ])
})

test('de dagen komen alleen uit koppen in de vorm "### Dag N · titel"', () => {
  assert.deepEqual(visie().dagen, [
    { dag: 1, titel: 'Financiële Bewustwording (de spiegel)' },
    { dag: 2, titel: 'De activa (de stenen)' },
    { dag: 3, titel: 'De verpakking (de structuren)' },
    { dag: 4, titel: 'Het plan (de praktijk)' },
  ])
})

test('de rode draad is de blockquote in sectie "2. De rode draad in één zin"', () => {
  assert.equal(visie().rodeDraad, 'Van nul naar groeimotor: vier dagen bouwen aan het gebouw van je vermogen.')
})

test('de plek is de unieke tabelrij van dit dagdeel: de GGR-kolom en de steen-kolom', () => {
  assert.deepEqual(visie().plek, { ggr: 'Het instrument om je GGR te keren', gebouw: 'De groeipilaar' })
})

// ---------------------------------------------------------------- andere dagdelen uitsluiten

test('een ander dagdeel krijgt zijn eigen gegevens en niets van 1.3', () => {
  const v = bouwDagdeelVisie({ ...maak(), blok: BLOK_21, brief: { id: 30, blok_id: '2.1', soort: 'brief', titel: 'brief', inhoud: BRIEF_21 } })
  assert.equal(v.doel, 'Vastgoed als pilaar.')
  assert.equal(v.boodschap, 'Inkomen en bescherming.')
  assert.deepEqual(v.tijdvakken, [{ id: 1, begin: '09:00', einde: '09:30', minuten: 30, vorm: 'luisteren', titel: 'keynote', detail: 'Vastgoed in drie stappen.' }])
  assert.deepEqual(v.bronnen, [
    { id: 30, soort: 'brief', titel: 'brief', route: '#/doc/30' },
    { id: 31, soort: 'brief', titel: 'briefing-gunther', route: '#/doc/31' },
    { id: 32, soort: 'werkboek', titel: 'werkboek', route: '#/doc/32' },
  ], 'de stukken van 1.3 en algemeen horen er niet bij; de sprekersbriefing toont zijn eigen titel')
  assert.deepEqual(v.dagdelen, [{ id: '2.1', code: '2.1', titel: 'Vastgoed keynote', route: '#/blok/2.1' }])
  assert.deepEqual(v.plek, { ggr: 'Wat vastgoed netto doet', gebouw: 'De inkomenspilaar' })
  assert.doesNotMatch(JSON.stringify(v.plek), /GGR te keren|groeipilaar/)
})

test('een brief van een ander dagdeel levert niets op, ook niet als hij zelf wel klopt', () => {
  const v = visie({ brief: { id: 30, blok_id: '2.1', soort: 'brief', titel: 'brief', inhoud: BRIEF_21 } })
  assert.equal(v.doel, null)
  assert.equal(v.boodschap, null)
  assert.deepEqual(v.tijdvakken, [])
})

test('een brief die niet de unieke brief van dit dagdeel is, of niet zegt waar hij bij hoort, wordt geweigerd', () => {
  assert.equal(visie({ brief: brief(BRIEF_13, { id: 99 }) }).doel, null, 'ander id dan de brief in de lijst met stukken')
  assert.equal(visie({ brief: brief(BRIEF_13, { blok_id: undefined }) }).doel, null, 'zonder blok_id is er niets te controleren')
  assert.equal(visie({ brief: brief(BRIEF_13, { blok_id: '2.1' }) }).doel, null, 'blok_id van een ander dagdeel')
  assert.equal(visie({ brief: brief(undefined) }).doel, null, 'zonder inhoud')
  assert.ok(visie({ brief: brief(BRIEF_13, { id: '9' }) }).doel, 'een id als tekst is hetzelfde id')
})

test('zolang de brief laadt zijn alleen de briefvelden leeg; de rest blijft staan', () => {
  const v = visie({ brief: null })
  assert.deepEqual([v.doel, v.boodschap, v.tijdvakken], [null, null, []])
  assert.equal(v.bronnen.length, 4)
  assert.equal(v.dagdelen.length, 4)
  assert.equal(v.dagen.length, 4)
  assert.ok(v.rodeDraad && v.plek)
})

test('stukken van andere dagdelen of soorten zijn geen bron', () => {
  const ids = visie().bronnen.map((b) => b.id)
  for (const vreemd of [18, 19, 30, 31, 32, 75]) assert.ok(!ids.includes(vreemd), `stuk ${vreemd} hoort er niet bij`)
})

test('een code die alleen op het begin van een andere code lijkt, is niet dezelfde rij', () => {
  const fout = tabel('| 1.30 Ander | x | verkeerd A | verkeerd B |', '| 1.3.1 Sub | x | verkeerd C | verkeerd D |', '| 11.3 Elders | x | verkeerd E | verkeerd F |', '| 1.3a Variant | x | verkeerd G | verkeerd H |', '| 3.1 en 1.3 | x | verkeerd I | verkeerd J |')
  assert.equal(visie({ masterplan: { inhoud: fout } }).plek, null)
  const goed = tabel('| 1.30 Ander | x | verkeerd A | verkeerd B |', '| **1.3** · ETF | x | goede meetlat | goed gebouw |')
  assert.deepEqual(visie({ masterplan: { inhoud: goed } }).plek, { ggr: 'goede meetlat', gebouw: 'goed gebouw' })
})

// ---------------------------------------------------------------- ontbrekende gegevens

test('zonder bruikbaar dagdeel is er niets te tonen', () => {
  for (const blok of [undefined, null, {}, { id: '' }, { id: '  ' }, { id: null, code: '1.3' }, 'tekst', []]) {
    assert.deepEqual(visie({ blok }), LEEG, JSON.stringify(blok))
  }
  assert.deepEqual(bouwDagdeelVisie(), LEEG)
  assert.deepEqual(bouwDagdeelVisie(null), LEEG)
  assert.deepEqual(bouwDagdeelVisie('tekst'), LEEG)
})

test('zonder enige aangeleverde gegevens is alles leeg: null of een lege lijst, nooit een verzonnen waarde', () => {
  assert.deepEqual(bouwDagdeelVisie({ blok: BLOK_13 }), LEEG)
  assert.deepEqual(bouwDagdeelVisie({ blok: BLOK_13, blokken: null, documentenMeta: 'kapot', brief: 7, masterplan: [] }), LEEG)
})

test('ontbrekende secties in de brief geven null of een lege lijst', () => {
  const v = visie({ brief: brief('# Brief\n\n## Leerdoelen\n\n1. **14:00 tot 14:10: dit is geen opbouw (10 min).** Tekst.\n') })
  assert.deepEqual([v.doel, v.boodschap, v.tijdvakken], [null, null, []])
  assert.equal(visie({ brief: brief('## Doel\n\n## Kernboodschap\n\n   \n## Opbouw\nGeen lijst, alleen tekst.\n') }).doel, null, 'een lege sectie is geen doel')
  assert.deepEqual(visie({ brief: brief('## Opbouw (60 minuten)\n\n1. **14:00 tot 14:10: kop met toevoeging (10 min).** Tekst.\n') }).tijdvakken, [], 'een andere kop is een andere sectie')
})

test('een ontbrekend masterplan of ontbrekende masterplansecties geven null of een lege lijst', () => {
  for (const masterplan of [undefined, null, {}, { inhoud: null }, { inhoud: '' }, { inhoud: '# Alleen een titel' }, 42]) {
    const v = visie({ masterplan })
    assert.deepEqual([v.dagen, v.rodeDraad, v.plek], [[], null, null], JSON.stringify(masterplan))
    assert.equal(v.tijdvakken.length, 4, 'de brief heeft het masterplan niet nodig')
  }
  assert.equal(visie({ masterplan: MASTER }).rodeDraad, 'Van nul naar groeimotor: vier dagen bouwen aan het gebouw van je vermogen.', 'ook de kale tekst van het masterplan werkt')
})

test('een tijdvak waarvan een deel ontbreekt krijgt voor dat deel null; minuten worden nooit uit de tijden afgeleid', () => {
  const v = bouwDagdeelVisie(maak({ brief: opbouw(
    '1. **09:00 tot 09:10: welkom.** Zonder minuten en zonder vorm.',
    '2. **Pauze (15 min, rusten).**',
    '3. Een losse regel zonder opmaak.',
    '4. **10:00 tot 10:30: alleen een titel.**',
  ) }))
  assert.deepEqual(v.tijdvakken, [
    { id: 1, begin: '09:00', einde: '09:10', minuten: null, vorm: null, titel: 'welkom', detail: 'Zonder minuten en zonder vorm.' },
    { id: 2, begin: null, einde: null, minuten: 15, vorm: 'rusten', titel: 'Pauze', detail: null },
    { id: 3, begin: null, einde: null, minuten: null, vorm: null, titel: null, detail: 'Een losse regel zonder opmaak.' },
    { id: 4, begin: '10:00', einde: '10:30', minuten: null, vorm: null, titel: 'alleen een titel', detail: null },
  ])
})

test('onmogelijke of tegenstrijdige tijden worden niet getoond en niet gerepareerd', () => {
  const v = bouwDagdeelVisie(maak({ brief: opbouw(
    '1. **25:00 tot 26:00: onmogelijk (10 min, doen).** Tekst.',
    '2. **15:00 tot 14:00: omgekeerd (5 min).** Tekst.',
    '3. **9:05 tot 9:15: zonder voorloopnul (10 min).** Tekst.',
    '4. **10:00 tot 10:30: ongeldige duur (0 min).** Tekst.',
  ) }))
  assert.deepEqual(v.tijdvakken.map((t) => [t.begin, t.einde, t.minuten, t.titel]), [
    [null, null, 10, 'onmogelijk'],
    [null, null, 5, 'omgekeerd'],
    ['09:05', '09:15', 10, 'zonder voorloopnul'],
    ['10:00', '10:30', null, 'ongeldige duur (0 min)'],
  ])
})

test('een regel die op de volgende regel doorloopt blijft bij hetzelfde tijdvak; een sublijst niet', () => {
  const v = bouwDagdeelVisie(maak({ brief: opbouw(
    '1. **14:00 tot 14:10: opening (10 min, luisteren).** Eerste deel',
    'en tweede deel.',
    '   - een sublijst die niet meetelt',
    '2. **14:10 tot 14:20: vervolg (10 min).** Kort.',
  ) }))
  assert.equal(v.tijdvakken.length, 2)
  assert.equal(v.tijdvakken[0].detail, 'Eerste deel en tweede deel.')
  assert.equal(v.tijdvakken[1].titel, 'vervolg')
})

test('een haakjesdeel dat geen duur is blijft in de titel, en een punt buiten de vette kop is geen detail', () => {
  const v = bouwDagdeelVisie(maak({ brief: opbouw('1. **11:00 tot 11:30: VVPRbis (18% sinds 1 juli) uitgelegd (30 min, luisteren).** Tekst.') }))
  assert.equal(v.tijdvakken[0].titel, 'VVPRbis (18% sinds 1 juli) uitgelegd')
  assert.equal(v.tijdvakken[0].minuten, 30)
  const buiten = bouwDagdeelVisie(maak({ brief: opbouw('1. **11:00 tot 11:30: uitleg (30 min, luisteren)**. Tekst na de punt.') }))
  assert.deepEqual(buiten.tijdvakken, [{ id: 1, begin: '11:00', einde: '11:30', minuten: 30, vorm: 'luisteren', titel: 'uitleg', detail: 'Tekst na de punt.' }], 'een punt buiten de vette kop is geen detail')
})

test('een dag zonder bekende dag heeft geen dagdelen, en een dag als tekst telt als dezelfde dag', () => {
  assert.deepEqual(visie({ blok: { ...BLOK_13, dag: undefined } }).dagdelen, [])
  assert.deepEqual(visie({ blok: { ...BLOK_13, dag: null } }).dagdelen, [])
  assert.deepEqual(visie({ blok: { ...BLOK_13, dag: '' } }).dagdelen, [])
  assert.deepEqual(visie({ blok: { ...BLOK_13, dag: '1' } }).dagdelen.map((d) => d.id), ['1.1', '1.2', '1.3', '1.4'])
  assert.deepEqual(visie({ blok: { ...BLOK_13, dag: 7 } }).dagdelen, [], 'een dag zonder dagdelen in de lijst')
})

test('dagdelen sorteren op volgorde als alle dagdelen er een hebben, anders op code met getallen als getal', () => {
  const dag = (...codes) => codes.map((code, i) => ({ id: code, code, titel: `Blok ${code}`, dag: 1, volgorde: 50 - i }))
  assert.deepEqual(visie({ blokken: dag('1.1', '1.2', '1.3') }).dagdelen.map((d) => d.id), ['1.3', '1.2', '1.1'], 'volgorde wint van de code')
  const zonder = ['1.10', '1.4', '1.3', '1.2'].map((code) => ({ id: code, code, titel: code, dag: 1 }))
  assert.deepEqual(visie({ blokken: zonder }).dagdelen.map((d) => d.id), ['1.2', '1.3', '1.4', '1.10'])
  const gemengd = [{ id: '1.3', code: '1.3', titel: 'c', dag: 1, volgorde: 1 }, { id: '1.1', code: '1.1', titel: 'a', dag: 1 }, { id: '1.2', code: '1.2', titel: 'b', dag: 1, volgorde: 2 }]
  assert.deepEqual(visie({ blokken: gemengd }).dagdelen.map((d) => d.id), ['1.1', '1.2', '1.3'], 'een dagdeel zonder volgorde: alles op code')
})

test('dagdelen krijgen een veilige route en een dubbel dagdeel telt één keer', () => {
  const blokken = [{ id: 'a/b?c', code: 'x', titel: 'y', dag: 1 }, { id: 'a/b?c', code: 'x', titel: 'dubbel', dag: 1 }, { id: 5, code: '5', titel: null, dag: 1 }]
  assert.deepEqual(visie({ blokken }).dagdelen, [
    { id: '5', code: '5', titel: null, route: '#/blok/5' },
    { id: 'a/b?c', code: 'x', titel: 'y', route: '#/blok/a%2Fb%3Fc' },
  ])
})

test('dagen met een andere kopvorm of een ander niveau tellen niet; dubbele koppen worden niet geraden', () => {
  const plan = '## Dag 5 · te hoog niveau\n#### Dag 6 · te laag niveau\n### Dag 7: met dubbele punt\n### Dag 8 -- met streepjes\n### Dag 9 · \n### Dag 2 · **Tweede** dag\n### Dag 1 · Eerste dag\n### Dag 3 · Eerste titel\n### Dag 3 · Andere titel\n### Dag 4 · Dubbel gelijk\n### Dag 4 · Dubbel gelijk\n'
  assert.deepEqual(visie({ masterplan: { inhoud: plan } }).dagen, [
    { dag: 1, titel: 'Eerste dag' },
    { dag: 2, titel: 'Tweede dag' },
    { dag: 4, titel: 'Dubbel gelijk' },
  ])
})

test('de rode draad ontbreekt als de blockquote in een andere sectie staat of niet de enige is', () => {
  const sectie = (inhoud) => ({ inhoud })
  assert.equal(visie({ masterplan: sectie('## 1. De belofte\n\n> Deze zin staat in een andere sectie.\n\n## 2. De rode draad in één zin\n\nGeen quote hier.\n') }).rodeDraad, null)
  assert.equal(visie({ masterplan: sectie('## 2. De rode draad in één zin\n\n> Eerste zin.\n\nTekst ertussen.\n\n> Tweede zin.\n') }).rodeDraad, null, 'twee blockquotes: welke is de rode draad?')
  assert.equal(visie({ masterplan: sectie('## 2. De rode draad in één zin\n\n> Een zin die\n> over twee regels loopt.\n\n## 3. Volgende\n\n> Andere sectie.\n') }).rodeDraad, 'Een zin die over twee regels loopt.')
  assert.equal(visie({ masterplan: sectie('## 2. De rode draad\n\n> Niet de juiste kop.\n') }).rodeDraad, null)
})

// ---------------------------------------------------------------- dubbelzinnigheid

test('twee rijen voor dezelfde code zijn dubbelzinnig, in dezelfde tabel en in twee tabellen', () => {
  const rij = (ggr) => `| 1.3 ETF's | x | ${ggr} | De groeipilaar |`
  assert.equal(visie({ masterplan: { inhoud: tabel(rij('eerste'), rij('tweede')) } }).plek, null, 'twee rijen in één tabel')
  assert.equal(visie({ masterplan: { inhoud: `${tabel(rij('eerste'))}\n### Dag 2 · Elders\n\n${tabel(rij('tweede'))}` } }).plek, null, 'dezelfde code in twee tabellen')
  assert.deepEqual(visie({ masterplan: { inhoud: `${tabel(rij('enige'))}\n${tabel('| 2.1 Ander | x | x | x |')}` } }).plek, { ggr: 'enige', gebouw: 'De groeipilaar' }, 'andere codes in andere tabellen zijn geen probleem')
})

test('kolommen worden op hun kop herkend; een ontbrekende of dubbelzinnige kolom geeft null voor dat deel', () => {
  const rij = (...cellen) => `| ${cellen.join(' | ')} |`
  const plek = (kop, ...cellen) => visie({ masterplan: { inhoud: `${rij(...kop)}\n|${kop.map(() => '---').join('|')}|\n${rij(...cellen)}\n` } }).plek
  assert.deepEqual(plek(['Dagdeel', 'De GGR-moment'], '1.3', 'alleen meetlat'), { ggr: 'alleen meetlat', gebouw: null })
  assert.deepEqual(plek(['Dagdeel', 'Het gebouw'], '1.3', 'alleen gebouw'), { ggr: null, gebouw: 'alleen gebouw' })
  assert.equal(plek(['Dagdeel', 'Spreker'], '1.3', 'Anthony'), null, 'geen herkende kolom')
  assert.deepEqual(plek(['Dagdeel', 'GGR nu', 'GGR straks', 'De steen'], '1.3', 'a', 'b', 'steen'), { ggr: null, gebouw: 'steen' }, 'twee GGR-kolommen: geen gok')
  assert.deepEqual(plek(['Dagdeel', 'De steen', 'De GGR-moment'], '1.3', 'alleen steen'), { ggr: null, gebouw: 'alleen steen' }, 'kortere rij dan de kop')
  assert.equal(plek(['Dagdeel', 'De GGR-moment', 'De steen'], '1.3', '', '—'), null, 'lege cellen en streepjes zijn geen tekst')
})

test('een rij zonder echte tabel eromheen telt niet, en de code staat alleen in de eerste kolom', () => {
  assert.equal(visie({ masterplan: { inhoud: '| 1.3 ETF | x | los | rijtje |\n' } }).plek, null)
  assert.equal(visie({ masterplan: { inhoud: '| Dagdeel | Thema | De GGR-moment | De steen |\n| 2.1 Ander | x | x | x |\n| 1.3 ETF | x | geen scheidingsregel | dus geen tabel |\n' } }).plek, null, 'zonder |---| is het geen tabel')
  assert.equal(visie({ masterplan: { inhoud: tabel('| Anthony | 1.3 ETF | verkeerd | verkeerd |') } }).plek, null, 'tweede kolom telt niet')
  assert.equal(visie({ blok: { id: '1.3', dag: 1 } }).plek, null, 'zonder blok.code geen rij zoeken')
})

test('dubbelzinnige stukken worden niet geraden: alles blijft bereikbaar met eigen titel, de brief wordt alleen gelezen als hij uniek is', () => {
  const titels = (docs) => visie({ documentenMeta: docs }).bronnen.map((b) => `${b.soort}:${b.titel}`)
  assert.deepEqual(titels([...DOCS, { id: 8, blok_id: '1.3', soort: 'werkboek', titel: 'werkboek-extra' }]), ['brief:brief', 'spreektekst:spreektekst', 'slides:slides', 'werkboek:werkboek', 'werkboek:werkboek-extra'], 'twee werkboeken: beide staan er, op titel')
  const dubbeleBrief = visie({ documentenMeta: [...DOCS, { id: 41, blok_id: '1.3', soort: 'brief', titel: 'brief' }] })
  assert.deepEqual([dubbeleBrief.doel, dubbeleBrief.boodschap, dubbeleBrief.tijdvakken], [null, null, []], 'twee briefs met de titel brief: geen enkele wordt gelezen')
  assert.deepEqual(dubbeleBrief.bronnen.filter((b) => b.soort === 'brief').map((b) => b.id), [9, 41], 'maar beide stukken blijven bereikbaar')
  const briefing = visie({ documentenMeta: [...DOCS, { id: 42, blok_id: '1.3', soort: 'brief', titel: 'briefing-anthony' }] })
  assert.ok(briefing.doel, 'een sprekersbriefing is geen tweede brief')
  assert.deepEqual(briefing.bronnen.filter((b) => b.soort === 'brief').map((b) => b.titel), ['brief', 'briefing-anthony'])
  assert.deepEqual(visie({ documentenMeta: [...DOCS, DOCS[0], DOCS[5]] }).bronnen.map((b) => b.id), [9, 16, 15, 17], 'dezelfde rij twee keer is één stuk')
})

// ---------------------------------------------------------------- opmaak en veiligheid

test('uitvoerteksten zijn korte platte tekst: geen opmaak, geen onzichtbare of omkerende tekens, geen html', () => {
  const doel = 'Een <b>vet</b> doel\u202E met\u200B verborgen\u0007 tekens<br>en een ![plaatje](x.png) met `code`, __streep__ en *schuin*.'
  const v = visie({ brief: brief(`## Doel\n\n${doel}\n`) })
  assert.equal(v.doel, 'Een vet doel met verborgen tekens en een plaatje met code, streep en schuin.')
  const lang = visie({ brief: brief(`## Doel\n\n${'woord '.repeat(200)}\n\n## Kernboodschap\n\n${'zin. '.repeat(400)}\n`) })
  assert.ok(lang.doel.length <= 300 && lang.doel.endsWith('…') && !lang.doel.endsWith(' …'), `doel is te lang: ${lang.doel.length}`)
  assert.ok(lang.boodschap.length <= 600 && lang.boodschap.endsWith('…'), `boodschap is te lang: ${lang.boodschap.length}`)
  const detail = visie({ brief: opbouw(`1. **14:00 tot 14:10: titel (10 min).** ${'tekst '.repeat(300)}`) }).tijdvakken[0].detail
  assert.ok(detail.length <= 400 && detail.endsWith('…'))
  assert.equal(visie({ brief: brief('## Doel\n\nKosten < 2% en rendement > 7% blijven staan.\n') }).doel, 'Kosten < 2% en rendement > 7% blijven staan.', 'een kleiner-dan-teken is geen tag')
})

test('de invoer wordt nooit gewijzigd en dezelfde invoer geeft dezelfde uitvoer', () => {
  const invoer = diepVries(maak())
  const voor = JSON.stringify(invoer)
  const eerste = bouwDagdeelVisie(invoer)
  assert.equal(JSON.stringify(invoer), voor)
  assert.deepEqual(bouwDagdeelVisie(invoer), eerste)
  eerste.tijdvakken.push('x')
  assert.equal(bouwDagdeelVisie(invoer).tijdvakken.length, 4, 'de uitvoer is geen verwijzing naar iets van de invoer')
})

test('kapotte regels in de invoer worden overgeslagen in plaats van de visie te breken', () => {
  const v = visie({
    documentenMeta: [null, 'x', 7, [], {}, { blok_id: '1.3', soort: 'werkboek', titel: 'zonder id' }, { id: 17, blok_id: '1.3', soort: 'werkboek', titel: null }, ...DOCS],
    blokken: [undefined, 'x', 3, [], {}, { id: '', dag: 1 }, { id: '1.9', dag: 1 }, ...BLOKKEN],
  })
  assert.deepEqual(v.bronnen.map((b) => [b.soort, b.id]), [['brief', 9], ['spreektekst', 16], ['slides', 15], ['werkboek', 17]])
  assert.equal(v.bronnen[3].titel, null, 'een ontbrekende titel wordt niet bedacht; de eerste rij met dit id wint')
  assert.deepEqual(v.dagdelen.map((d) => d.id), ['1.1', '1.2', '1.3', '1.4', '1.9'], 'zonder volgorde bij iedereen sorteert alles op code, of op id als de code ontbreekt')
  assert.deepEqual(v.dagdelen.at(-1), { id: '1.9', code: null, titel: null, route: '#/blok/1.9' })
})

// ---------------------------------------------------------------- niets is vastgelegd voor 1.3

test('een volledig ander dagdeel geeft zijn eigen gegevens: er is niets van 1.3 ingebakken', () => {
  const blok = { id: '5.2', code: '5.2', titel: 'Slotronde', dag: 5 }
  const andereBrief = { id: 501, blok_id: '5.2', soort: 'brief', titel: 'Brief', inhoud: '## Doel\n\nZelfgekozen doel voor een heel ander dagdeel.\n\n## Kernboodschap\n\nEen andere boodschap.\n\n## Opbouw\n\n1. **08:30 tot 09:15: welkomstronde (45 min, praten).** Iedereen stelt zich voor.\n2. **09:15 tot 09:45: afronding.** Wat nemen we mee?\n' }
  const master = '## 2. De rode draad in één zin\n\n> Een heel andere zin.\n\n### Dag 5 · De afsluiting\n\n| Onderdeel | Thema | De GGR-meting | Het gebouw |\n|---|---|---|---|\n| 5.1 Voorspel | x | niet deze | niet deze |\n| 5.2 Slotronde | x | Meten wat er bleef | Het dak |\n'
  const v = bouwDagdeelVisie({
    blok,
    blokken: [{ id: '5.1', code: '5.1', titel: 'Voorspel', dag: 5, volgorde: 1 }, { id: '5.2', code: '5.2', titel: 'Slotronde', dag: 5, volgorde: 2 }, ...BLOKKEN],
    documentenMeta: [{ id: 501, blok_id: '5.2', soort: 'brief', titel: 'Brief' }, { id: 502, blok_id: '5.2', soort: 'slides', titel: 'slides vijf-twee' }, ...DOCS],
    brief: andereBrief,
    masterplan: { inhoud: master },
  })
  assert.deepEqual(v, {
    doel: 'Zelfgekozen doel voor een heel ander dagdeel.',
    boodschap: 'Een andere boodschap.',
    tijdvakken: [
      { id: 1, begin: '08:30', einde: '09:15', minuten: 45, vorm: 'praten', titel: 'welkomstronde', detail: 'Iedereen stelt zich voor.' },
      { id: 2, begin: '09:15', einde: '09:45', minuten: null, vorm: null, titel: 'afronding', detail: 'Wat nemen we mee?' },
    ],
    bronnen: [{ id: 501, soort: 'brief', titel: 'Brief', route: '#/doc/501' }, { id: 502, soort: 'slides', titel: 'slides vijf-twee', route: '#/doc/502' }],
    dagdelen: [{ id: '5.1', code: '5.1', titel: 'Voorspel', route: '#/blok/5.1' }, { id: '5.2', code: '5.2', titel: 'Slotronde', route: '#/blok/5.2' }],
    dagen: [{ dag: 5, titel: 'De afsluiting' }],
    rodeDraad: 'Een heel andere zin.',
    plek: { ggr: 'Meten wat er bleef', gebouw: 'Het dak' },
  })
  assert.doesNotMatch(JSON.stringify(v), /ETF|14:00|groeimotor|spiegel|GGR te keren/)
})
