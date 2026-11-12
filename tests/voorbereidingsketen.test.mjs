import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/* Tests voor de voorbereidingsketen van één dagdeel (src/components/voorbereidingsketen.jsx).
   Geen netwerk, geen Supabase: de component krijgt alles via props en meldt alleen via `naar`
   waarheen de gebruiker klikte. De rekenregels zelf staan in tests/voorbereidingsketen-lib.test.mjs. */

const h = React.createElement
let vite
let Voorbereidingsketen

before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ Voorbereidingsketen } = await vite.ssrLoadModule('/src/components/voorbereidingsketen.jsx')) }
  catch (e) { if (!/Failed to load|Cannot find|does not exist|ENOENT/i.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

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
]
const NOTITIES = [
  { id: 1, doel_type: 'blok', doel_id: '1.3', tekst: 'Slide 4 is te druk', auteur: 'Bjorn', created_at: '2026-11-10T09:00:00Z' },
  { id: 2, doel_type: 'blok', doel_id: '1.3', tekst: 'Voorbeeld werkt goed', auteur: 'Anthony', created_at: '2026-11-11T09:00:00Z' },
  { id: 3, doel_type: 'blok', doel_id: '4.4', tekst: 'Ander dagdeel', auteur: 'Bjorn', created_at: '2026-11-12T09:00:00Z' },
]
const BESLISSINGEN = [{ id: 1, titel: 'Het GGR-anker', status: 'open' }, { id: 2, titel: 'Een losse keuze', status: 'beslist', blok_id: '1.3' }]
const BASIS = { blok: BLOK_13, documentenMeta: DOCS, bronnen: BRONNEN, notities: NOTITIES, beslissingen: BESLISSINGEN, geladen: true }

const render = (props = {}) => renderToStaticMarkup(h(Voorbereidingsketen, { ...BASIS, ...props }))
const platte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const links = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inhoud]) => ({ href: /\shref="([^"]*)"/.exec(` ${attrs}`)?.[1], tekst: platte(inhoud) }))
const hrefs = (html) => links(html).map((l) => l.href)
/* Eén tekstblok per stap: alles vanaf data-stap="…" tot de volgende stap (of het einde van de lijst). */
function stappen(html) {
  const lijst = html.slice(html.indexOf('<ol'), html.indexOf('</ol>'))
  return Object.fromEntries(lijst.split('data-stap="').slice(1).map((deel) => [deel.slice(0, deel.indexOf('"')), `<li data-stap="${deel}`]))
}
const VOLGORDE = ['vraag', 'bronnen', 'stelling', 'lesinhoud', 'oefening', 'feedback', 'bijsturing']

// ---------------------------------------------------------------- opbouw en filtering

test('de keten toont het dagdeel en de zeven stappen in de volgorde van de werkwijze', () => {
  assert.equal(typeof Voorbereidingsketen, 'function', 'Voorbereidingsketen ontbreekt')
  const html = render()
  assert.match(html, /<h2\b[^>]*>Voorbereidingsketen<\/h2>/)
  assert.match(platte(html), /1\.3 · Waarom beleggen/)
  assert.deepEqual(Object.keys(stappen(html)), VOLGORDE)
  const namen = ['Vraag', 'Bronnen', 'Stelling', 'Lesinhoud', 'Oefening', 'Feedback', 'Bijsturing']
  const staptekst = Object.values(stappen(html)).map((s) => platte(s))
  namen.forEach((naam, i) => assert.match(staptekst[i], new RegExp(`^${i + 1} ${naam}\\b`), `stap ${i + 1} hoort ${naam} te heten`))
})

test('alleen wat aan het gekozen dagdeel hangt komt in beeld; wat bij een ander dagdeel hoort niet', () => {
  const a = render({ blok: BLOK_13 })
  const b = render({ blok: BLOK_44 })
  const [ta, tb] = [platte(a), platte(b)]
  assert.match(ta, /FOD Financiën: TOB/)
  assert.match(ta, /Pensioenspaarfonds/)
  assert.match(ta, /research-rendement/)
  assert.doesNotMatch(ta, /GGR-studie|vermogensplan|Het GGR-anker/, '1.3 toont niets van 4.4')
  assert.match(tb, /GGR-studie/)
  assert.match(tb, /A3-template-vermogensplan/)
  assert.doesNotMatch(tb, /FOD Financiën|Pensioenspaarfonds|research-rendement|Een losse keuze/, '4.4 toont niets van 1.3')
  assert.doesNotMatch(ta + tb, /masterplan-februari-2027/, 'een stuk van "algemeen" is van geen dagdeel')
  assert.deepEqual([...new Set(hrefs(a).filter((x) => x.startsWith('#/doc/')))].sort(), ['#/doc/11', '#/doc/12', '#/doc/13', '#/doc/14', '#/doc/15'])
  assert.deepEqual([...new Set(hrefs(b).filter((x) => x.startsWith('#/doc/')))].sort(), ['#/doc/21', '#/doc/22'])
})

test('elke stap toont wat er bij zijn soort stuk hoort', () => {
  const s = stappen(render())
  assert.match(platte(s.vraag), /brief/)
  assert.match(platte(s.bronnen), /FOD Financiën: TOB.*Pensioenspaarfonds.*research-rendement/)
  assert.match(platte(s.lesinhoud), /spreektekst.*slides/)
  assert.match(platte(s.oefening), /werkboek/)
  assert.match(platte(s.bijsturing), /Een losse keuze/)
  assert.doesNotMatch(platte(s.vraag), /spreektekst|slides|werkboek/, 'een stuk staat bij één stap')
})

// ---------------------------------------------------------------- klikroutes

test('bij de vraag staat het concrete doel uit de eigen brief met doorklik', () => {
  const pagina = render({ doel: 'Deelnemers maken een plan.', doelBron: { id: 11 } })
  const vraag = stappen(pagina).vraag
  assert.match(platte(vraag), /Doel uit de brief/)
  assert.match(platte(vraag), /Deelnemers maken een plan/)
  assert.ok(links(vraag).some((link) => link.href === '#/doc/11'))
})

test('elke doorklik is een echte link naar de route die de app kent', () => {
  const a = render({ blok: BLOK_13 })
  for (const route of ['#/blok/1.3', '#/doc/11', '#/doc/12', '#/doc/13', '#/doc/14', '#/doc/15', '#/bron/1', '#/bron/2', '#/beslissing/2']) {
    assert.ok(hrefs(a).includes(route), `link naar ${route} ontbreekt`)
  }
  assert.ok(hrefs(render({ blok: BLOK_44 })).includes('#/beslissing/1'), 'het GGR-anker hangt aan de spreektekst van 4.4')
  assert.ok(!hrefs(a).includes('#/bron/3'), 'bron 3 is van 4.4')
  for (const l of links(a)) {
    assert.match(l.href, /^#\//, `${l.tekst}: alleen routes binnen de app`)
    assert.ok(l.tekst.length > 0, `link ${l.href} heeft geen leesbare naam`)
  }
  assert.doesNotMatch(a, /javascript:|<button/i, 'doorklikken zijn links, geen knoppen met een verborgen bestemming')
})

/* Echte klikken in een echte React-boom. Er staat geen jsdom in dit project: react-dom/client heeft aan
   een piepkleine eigen DOM genoeg, en een klik wordt aan de listeners van de root gegeven, net als in een browser. */
function maakDom() {
  const doc = { nodeType: 9, nodeName: '#document' }
  class Knoop {
    constructor(nodeType) { this.nodeType = nodeType; this.ownerDocument = doc; this.childNodes = []; this.parentNode = null }
    get firstChild() { return this.childNodes[0] ?? null }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null }
    get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] ?? null : null }
    get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] ?? null : null }
    insertBefore(kind, ref) {
      kind.parentNode?.removeChild(kind)
      kind.parentNode = this
      const i = ref ? this.childNodes.indexOf(ref) : -1
      if (i < 0) this.childNodes.push(kind); else this.childNodes.splice(i, 0, kind)
      return kind
    }
    appendChild(kind) { return this.insertBefore(kind, null) }
    removeChild(kind) { const i = this.childNodes.indexOf(kind); if (i >= 0) this.childNodes.splice(i, 1); kind.parentNode = null; return kind }
    contains(kind) { for (let n = kind; n; n = n.parentNode) if (n === this) return true; return false }
    get textContent() { return this.childNodes.map((k) => k.textContent).join('') }
    set textContent(tekst) { for (const k of [...this.childNodes]) this.removeChild(k); if (tekst) this.appendChild(new Tekst(String(tekst))) }
  }
  class Tekst extends Knoop {
    constructor(data) { super(3); this.data = data; this.nodeName = '#text' }
    get nodeValue() { return this.data }
    set nodeValue(waarde) { this.data = String(waarde) }
    get textContent() { return this.data }
    set textContent(waarde) { this.data = String(waarde) }
  }
  class Element extends Knoop {
    constructor(tag) {
      super(1)
      this.tagName = tag.toUpperCase(); this.nodeName = this.tagName; this.localName = tag
      this.namespaceURI = 'http://www.w3.org/1999/xhtml'; this.attributes = new Map(); this.style = {}; this.luisteraars = []
    }
    setAttribute(naam, waarde) { this.attributes.set(naam, String(waarde)) }
    setAttributeNS(_ns, naam, waarde) { this.setAttribute(naam, waarde) }
    removeAttribute(naam) { this.attributes.delete(naam) }
    getAttribute(naam) { return this.attributes.get(naam) ?? null }
    hasAttribute(naam) { return this.attributes.has(naam) }
    addEventListener(type, fn, opties) { this.luisteraars.push({ type, fn, capture: opties === true || opties?.capture === true }) }
    removeEventListener(type, fn) { this.luisteraars = this.luisteraars.filter((l) => !(l.type === type && l.fn === fn)) }
    focus() { doc.activeElement = this }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body }
  }
  doc.createElement = (tag) => new Element(tag)
  doc.createElementNS = (_ns, tag) => new Element(tag)
  doc.createTextNode = (tekst) => new Tekst(String(tekst))
  doc.addEventListener = () => {}
  doc.removeEventListener = () => {}
  doc.body = doc.createElement('body')
  doc.documentElement = doc.createElement('html')
  doc.documentElement.appendChild(doc.body)
  doc.activeElement = doc.body
  return doc
}

function installeerDom() {
  const doc = maakDom()
  const sleutels = ['window', 'document', 'HTMLIFrameElement', 'IS_REACT_ACT_ENVIRONMENT']
  const vorige = sleutels.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)])
  Object.assign(globalThis, { window: globalThis, document: doc, HTMLIFrameElement: class {}, IS_REACT_ACT_ENVIRONMENT: true })
  return { doc, herstel() { for (const [k, d] of vorige) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k] } } }
}

function vindAlle(wortel, voorwaarde, uit = []) {
  for (const kind of wortel.childNodes) {
    if (kind.nodeType !== 1) continue
    if (voorwaarde(kind)) uit.push(kind)
    vindAlle(kind, voorwaarde, uit)
  }
  return uit
}

async function mount(props = {}) {
  const dom = installeerDom()
  const klant = await import('react-dom/client')
  const createRoot = klant.createRoot ?? klant.default.createRoot
  const houder = dom.doc.createElement('div')
  dom.doc.body.appendChild(houder)
  const root = createRoot(houder)
  await act(async () => { root.render(h(Voorbereidingsketen, { ...BASIS, ...props })) })
  const link = (href) => vindAlle(houder, (k) => k.tagName === 'A' && k.getAttribute('href') === href)[0]
  const klik = async (doel, extra = {}) => {
    let gebeurtenis
    await act(async () => {
      gebeurtenis = { type: 'click', target: doel, button: 0, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
      const luisteraars = houder.luisteraars.filter((l) => l.type === 'click')
      for (const l of luisteraars.filter((x) => x.capture)) l.fn(gebeurtenis)
      for (const l of luisteraars.filter((x) => !x.capture)) l.fn(gebeurtenis)
    })
    return gebeurtenis
  }
  return { houder, link, klik, tekst: () => houder.textContent.replace(/\s+/g, ' ').trim(), async sluit() { await act(async () => root.unmount()); dom.herstel() } }
}

test('een gewone klik op een link geeft precies één keer de route door aan naar() en houdt de browser tegen', async () => {
  const naar = []
  const ui = await mount({ naar: (route) => naar.push(route) })
  try {
    for (const route of ['#/doc/12', '#/bron/1', '#/beslissing/2', '#/blok/1.3']) {
      const e = await ui.klik(ui.link(route))
      assert.equal(e.defaultPrevented, true, `${route}: de app navigeert zelf (met bewaking tegen werkverlies)`)
    }
    assert.deepEqual(naar, ['#/doc/12', '#/bron/1', '#/beslissing/2', '#/blok/1.3'])
  } finally { await ui.sluit() }
})

test('niets navigeert bij het laden; een klik met cmd, ctrl, shift, alt of de middelste knop laat de browser zijn gang gaan', async () => {
  const naar = []
  const ui = await mount({ naar: (route) => naar.push(route) })
  try {
    assert.deepEqual(naar, [], 'geen navigatie zonder klik')
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const e = await ui.klik(ui.link('#/doc/11'), extra)
      assert.equal(e.defaultPrevented, false, JSON.stringify(extra))
    }
    assert.deepEqual(naar, [], 'een nieuw tabblad opent zonder de huidige pagina te verplaatsen')
  } finally { await ui.sluit() }
})

test('zonder naar() blijven het gewone links die zelf werken', async () => {
  const ui = await mount({ naar: undefined })
  try {
    const e = await ui.klik(ui.link('#/doc/11'))
    assert.equal(e.defaultPrevented, false, 'geen app-navigatie aangesloten: de browser volgt de #-link')
    assert.match(ui.tekst(), /Voorbereidingsketen/)
  } finally { await ui.sluit() }
})

// ---------------------------------------------------------------- lege en onbekende staat

test('zonder gekozen dagdeel zegt de component dat eerlijk en wijst hij naar de planning', async () => {
  for (const blok of [undefined, null, {}, { id: '' }]) {
    const html = render({ blok })
    assert.match(platte(html), /Geen dagdeel gekozen/)
    assert.ok(hrefs(html).includes('#/planning'), 'een weg naar de planning')
    assert.equal(Object.keys(stappen(html.includes('<ol') ? html : '<ol></ol>')).length, 0, 'geen keten zonder dagdeel')
    assert.doesNotMatch(platte(html), /Niets gekoppeld|gekoppeld\b.*\d/, 'geen verzonnen cijfers')
  }
  const naar = []
  const ui = await mount({ blok: null, naar: (route) => naar.push(route) })
  try {
    const e = await ui.klik(ui.link('#/planning'))
    assert.equal(e.defaultPrevented, true)
    assert.deepEqual(naar, ['#/planning'])
  } finally { await ui.sluit() }
})

test('zolang de gegevens laden staat er niet "leeg" of "geen dagdeel", maar dat het laadt', () => {
  const zonderBlok = render({ blok: undefined, geladen: false })
  assert.match(zonderBlok, /aria-busy="true"/)
  assert.match(platte(zonderBlok), /geladen/i)
  assert.doesNotMatch(platte(zonderBlok), /Geen dagdeel gekozen/)
  const html = render({ geladen: false })
  assert.match(html, /aria-busy="true"/)
  const s = stappen(html)
  for (const id of VOLGORDE) {
    assert.match(s[id], /data-stand="onbekend"/, id)
    assert.match(platte(s[id]), /Wordt geladen/, id)
  }
  assert.doesNotMatch(platte(html), /Niets gekoppeld/)
  assert.deepEqual(hrefs(html).filter((x) => /^#\/(doc|bron|beslissing)\//.test(x)), [], 'tijdens het laden geen doorklikken die straks misschien niet kloppen')
})

test('aangeleverd en leeg is iets anders dan niet aangeleverd', () => {
  const leeg = stappen(render({ documentenMeta: [], bronnen: [], notities: [], beslissingen: [] }))
  for (const id of VOLGORDE.filter((x) => x !== 'stelling')) {
    assert.match(leeg[id], /data-stand="leeg"/, id)
    assert.match(platte(leeg[id]), /Niets gekoppeld/, id)
    assert.doesNotMatch(platte(leeg[id]), /Onbekend/, id)
  }
  const onbekend = stappen(render({ documentenMeta: undefined, bronnen: undefined, notities: undefined, beslissingen: undefined }))
  for (const id of VOLGORDE) {
    assert.match(onbekend[id], /data-stand="onbekend"/, id)
    assert.match(platte(onbekend[id]), /Onbekend/, id)
    assert.doesNotMatch(platte(onbekend[id]), /Niets gekoppeld|\b0\b/, `${id}: onbekend is niet "0"`)
  }
  assert.match(platte(onbekend.feedback), /geen gegevens/i, 'zegt waarom het onbekend is')
})

test('een stap met een deel van de gegevens toont wat er is en zegt dat er meer kan bestaan', () => {
  const s = stappen(render({ documentenMeta: undefined }))
  assert.match(platte(s.bronnen), /FOD Financiën: TOB/)
  assert.match(platte(s.bronnen), /Niet alle gegevens zijn aangeleverd/)
  assert.match(s.vraag, /data-stand="onbekend"/)
})

test('de stelling is onbekend en zegt waar je kan zoeken; een aangeleverde stelling staat als platte tekst met zijn eigen label', () => {
  const s = stappen(render())
  assert.match(s.stelling, /data-stand="onbekend"/)
  assert.match(platte(s.stelling), /legt de stelling niet apart vast/i)
  assert.deepEqual(links(s.stelling).map((l) => l.href), ['#/doc/11'], 'de brief als zoekplek')
  assert.match(links(s.stelling)[0].tekst, /brief/)
  const met = stappen(render({ stelling: 'Wie <b>vroeg</b> begint, wint tijd.' }))
  assert.match(met.stelling, /data-stand="aanwezig"/)
  assert.ok(platte(met.stelling).includes('Wie <b>vroeg</b> begint, wint tijd.'), 'letterlijk, niet opgemaakt')
  assert.doesNotMatch(met.stelling, /<b>/)
  assert.deepEqual(links(met.stelling), [], 'geen zoeklink als de stelling er al is')
})

test('een kernboodschap toont haar bron en link naar de echte brief', () => {
  const s = stappen(render({ stelling: 'Eerst de functie, dan het voertuig.', stellingBron: { id: 11 } }))
  assert.match(platte(s.stelling), /Kernboodschap uit de brief/)
  assert.match(platte(s.stelling), /Eerst de functie, dan het voertuig/)
  assert.ok(links(s.stelling).some((link) => link.href === '#/doc/11'))
})

test('notities worden geteld met de laatste auteur en datum, en leiden naar het dagdeel', () => {
  const html = render()
  const f = stappen(html).feedback
  assert.match(platte(f), /2 notities/)
  assert.match(platte(f), /Anthony/)
  assert.match(f, /<time\b[^>]*datetime="2026-11-11T09:00:00\.000Z"/i)
  assert.doesNotMatch(platte(f), /Slide 4 is te druk|Voorbeeld werkt goed/, 'de tekst van notities hoort in het notitiepaneel')
  assert.ok(links(f).some((l) => l.href === '#/blok/1.3'))
  assert.match(platte(stappen(render({ notities: NOTITIES.slice(0, 1) })).feedback), /1 notitie\b/)
})

test('op de dagdeelpagina zelf verwijst de keten niet naar die pagina', () => {
  const html = render({ opBlokPagina: true })
  assert.ok(!hrefs(html).includes('#/blok/1.3'))
  assert.match(platte(html), /1\.3 · Waarom beleggen/)
  assert.match(platte(stappen(html).feedback), /2 notities/)
})

// ---------------------------------------------------------------- geen schijnvalidatie

test('het bestaan van stukken en bronnen suggereert nergens validatie, voortgang of "klaar"', () => {
  const html = render({ blok: { ...BLOK_13, status: 'Final' }, bronnen: BRONNEN.map((b) => ({ ...b, gevalideerd: true })), stelling: 'Wie vroeg begint, wint tijd.' })
  const tekst = platte(html)
  assert.doesNotMatch(tekst, /gevalideerd|goedgekeurd|\bklaar\b|afgerond|voltooid|compleet|voortgang|\d+\s?%|\bFinal\b/i)
  assert.doesNotMatch(html, /role="progressbar"|<progress|aria-valuenow|aria-current/)
  assert.doesNotMatch(html, /lucide-(?:circle-)?check|lucide-badge|lucide-shield/, 'geen vinkjes of keurmerken')
  const standen = new Set([...html.matchAll(/data-stand="([^"]*)"/g)].map((m) => m[1]))
  assert.deepEqual([...standen].sort(), ['aanwezig'], 'met alles aanwezig bestaat er maar één soort stand, en die heet niet "klaar"')
  assert.match(tekst, /niet gecontroleerd/i, 'de keten zegt zelf dat aanwezigheid geen controle is')
  assert.match(tekst, /geen meter voor hoe ver je bent/i)
})

test('velden die validatie suggereren veranderen niets aan wat er getoond wordt', () => {
  const vervuild = render({
    blok: { ...BLOK_13, status: 'Final', gevalideerd: true },
    documentenMeta: DOCS.map((d) => ({ ...d, status: 'Final', gevalideerd: true, goedgekeurd: true, versie: 12 })),
    bronnen: BRONNEN.map((b) => ({ ...b, gecontroleerd: true, gevalideerd: true })),
  })
  assert.equal(vervuild, render())
})

test('een stuk dat bestaat maar leeg is wordt als leeg getoond en blijft een doorklik', () => {
  const s = stappen(render({ blok: BLOK_44 }))
  assert.match(s.oefening, /data-stand="leeg"/)
  assert.match(platte(s.oefening), /Nog zonder inhoud/)
  assert.match(platte(s.oefening), /A3-template-vermogensplan/)
  assert.deepEqual(links(s.oefening).map((l) => l.href), ['#/doc/22'])
  assert.doesNotMatch(platte(s.oefening), /\bgekoppeld\b/)
})

test('de status van een bron staat er als markering van het team, niet als oordeel over de bron', () => {
  const s = platte(stappen(render()).bronnen)
  assert.match(s, /FOD Financiën: TOB.*Kernbron/)
  assert.match(s, /Pensioenspaarfonds.*Ongelezen/)
  assert.match(platte(render()), /geen controle van de bron/i, 'in de uitleg per stap')
  assert.doesNotMatch(s, /betrouwbaar|bewezen|juist|correct/i)
})

// ---------------------------------------------------------------- vorm, veiligheid, toegankelijkheid

test('veel stukken in één stap: de eerste drie staan open, de rest zit in een uitklapper en blijft bereikbaar', () => {
  const veel = Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, blok_id: '1.3', soort: 'slides', titel: `slides deel ${i + 1}`, bytes: 10 }))
  const s = stappen(render({ documentenMeta: veel }))
  const [voor, rest] = s.lesinhoud.split('<details')
  assert.deepEqual(links(voor).map((l) => l.href), ['#/doc/100', '#/doc/101', '#/doc/102'])
  assert.match(rest, /<summary\b[^>]*>[^<]*3 meer tonen/)
  assert.deepEqual(links(rest).map((l) => l.href), ['#/doc/103', '#/doc/104', '#/doc/105'])
  assert.match(platte(s.lesinhoud), /6 gekoppeld/)
  assert.doesNotMatch(render(), /<details[^>]*class="vk-meer"/, 'een korte lijst heeft geen uitklapper')
})

test('titels uit de database worden als platte tekst getoond', () => {
  const gevaar = '<img src=x onerror=alert(1)> <script>alert(2)</script>'
  const html = render({
    documentenMeta: [{ id: 11, blok_id: '1.3', soort: 'brief', titel: gevaar, bytes: 1 }],
    bronnen: [{ id: 1, blok_id: '1.3', titel: `${gevaar}\u202E`, status: 'gelezen' }],
    blok: { ...BLOK_13, titel: gevaar },
  })
  assert.doesNotMatch(html, /<img|<script/i)
  assert.doesNotMatch(html, /\u202E/)
  assert.ok(platte(html).includes(gevaar))
})

test('de component is toegankelijk opgebouwd', () => {
  const html = render()
  const sectie = /<section\b[^>]*aria-labelledby="([^"]+)"/.exec(html)
  assert.ok(sectie, 'een sectie met een naam')
  assert.match(html, new RegExp(`<h2\\b[^>]*id="${sectie[1].replace(/[:]/g, '\\$&')}"`), 'de naam wijst naar de kop')
  assert.match(html, /<ol\b[^>]*role="list"/, 'een genummerde lijst die ook zonder bolletjes lijst blijft')
  assert.ok((html.match(/<svg\b/g) ?? []).length > 0)
  assert.equal((html.match(/<svg\b/g) ?? []).length, (html.match(/<svg\b[^>]*aria-hidden="true"/g) ?? []).length, 'iconen zijn versiering')
  for (const [id, deel] of Object.entries(stappen(html))) {
    assert.match(deel, /class="vk-stand"[^>]*>[^<]+</, `${id}: de stand staat in woorden, niet alleen in kleur`)
  }
  assert.doesNotMatch(html, /tabindex="[1-9]/i)
  assert.match(render({ niveau: 3 }), /<h3\b[^>]*>Voorbereidingsketen<\/h3>/, 'de kopniveau past in de pagina')
  assert.match(render({ niveau: 99 }), /<h6\b/, 'een onzin-niveau blijft een kop')
  assert.match(render({ niveau: 'x' }), /<h2\b/)
})

test('de stijl gebruikt alleen bestaande tokens en blijft binnen zijn eigen namen', () => {
  const css = readFileSync(new URL('../src/components/voorbereidingsketen.css', import.meta.url), 'utf8')
  const basis = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const bestaand = new Set([...basis.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const gebruikt = [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))]
  assert.ok(gebruikt.length >= 8, 'de stijl leunt op de tokens')
  assert.deepEqual(gebruikt.filter((t) => !bestaand.has(t)), [], 'een token dat niet bestaat valt stil terug op niets')
  const eigen = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = [...eigen.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith('@')).flatMap((s) => s.split(',')).map((s) => s.trim())
  const buiten = selectors.filter((s) => !/^(?:\.voorbereidingsketen|\.vk-)/.test(s) && !/^(?:from|to|\d+%)$/.test(s))
  assert.ok(selectors.length > 40, 'de selectors zijn echt gelezen')
  assert.deepEqual(buiten, [], 'elke regel begint bij .voorbereidingsketen of .vk-, zodat niets elders in de app verandert')
  assert.match(css, /prefers-reduced-motion/, 'beweging respecteert de systeeminstelling')
  assert.match(css, /:focus-visible/, 'zichtbare focus')
})
