/* Comments als laag over de hele werkbank.

   Eén notitie is één comment. Ze hangt aan een stuk, een dagdeel of een bron, en
   soms aan een stuk tekst (het anker). Deze module rekent alleen: welke comment
   hoort bij welke scope, in welke volgorde een walkthrough ze toont, en hoe een
   reactie bij zijn ouder hangt. Geen React, geen netwerk, geen opslag. */

export const BEREIKEN = [
  { id: 'dagdeel', label: 'Dit dagdeel' },
  { id: 'dag', label: 'Deze dag' },
  { id: 'alles', label: 'Alles' },
]

const SOORT_RANG = { blok: 0, document: 1, bron: 2 }
const DOC_RANG = { brief: 0, spreektekst: 1, slides: 2, werkboek: 3, oefening: 4, research: 5, bron: 6 }

export const tekst = (w) => (typeof w === 'string' ? w : '')
export const zelfde = (a, b) => a != null && b != null && String(a) === String(b)

export function kort(w, max = 120) {
  const t = tekst(w).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const knip = t.slice(0, max)
  const spatie = knip.lastIndexOf(' ')
  return `${knip.slice(0, spatie > max / 2 ? spatie : max).replace(/[\s,;:.]+$/, '')}…`
}

export function blokVoor(n, { documentenMeta = [], bronnen = [] } = {}) {
  if (!n) return null
  if (n.doel_type === 'blok') return String(n.doel_id)
  if (n.doel_type === 'document') {
    const doc = documentenMeta.find((d) => zelfde(d.id, n.doel_id))
    return doc ? String(doc.blok_id) : null
  }
  if (n.doel_type === 'bron') {
    const bron = bronnen.find((b) => zelfde(b.id, n.doel_id))
    return bron ? String(bron.blok_id) : null
  }
  return null
}

export function dagVoor(n, ctx = {}) {
  const blokId = blokVoor(n, ctx)
  if (!blokId) return null
  const blok = (ctx.blokken || []).find((b) => zelfde(b.id, blokId))
  return blok ? Number(blok.dag) : null
}

// Wat je in de balk en de walkthrough boven een comment zet: "1.3 · brief".
export function herkomst(n, { documentenMeta = [], blokken = [], bronnen = [] } = {}) {
  const blokId = blokVoor(n, { documentenMeta, bronnen })
  const blok = blokken.find((b) => zelfde(b.id, blokId))
  const code = blok?.code || blokId || 'Algemeen'
  if (n?.doel_type === 'document') {
    const doc = documentenMeta.find((d) => zelfde(d.id, n.doel_id))
    return `${code} · ${doc?.titel || 'stuk'}`
  }
  if (n?.doel_type === 'bron') {
    const bron = bronnen.find((b) => zelfde(b.id, n.doel_id))
    return `${code} · bron${bron?.titel ? `: ${kort(bron.titel, 40)}` : ''}`
  }
  return `${code} · dagdeel`
}

/* Een comment is open, opgelost of afgewezen. Afgewezen is geen verwijdering:
   hij blijft bestaan met zijn gesprek, maar telt niet meer als werk. */
export function statusVan(n) {
  if (n?.afgewezen === true) return 'afgewezen'
  if (n?.opgelost === true) return 'opgelost'
  return 'open'
}

export function isGesloten(n) {
  return statusVan(n) !== 'open'
}

export function filterComments(lijst, { bereik = 'dagdeel', blokId = null, dag = null, toonOpgelost = false, documentenMeta = [], bronnen = [], blokken = [] } = {}) {
  const alles = Array.isArray(lijst) ? lijst : []
  // Een gesloten gesprek sluit al zijn antwoorden mee; anders blijven ze als wees achter.
  const wortelVan = new Map()
  if (!toonOpgelost) for (const g of bouwGesprekken(alles)) for (const n of [g.wortel, ...g.leden]) wortelVan.set(n, g.wortel)
  return alles.filter((n) => {
    if (!toonOpgelost && isGesloten(wortelVan.get(n) ?? n)) return false
    if (bereik === 'alles') return true
    const eigen = blokVoor(n, { documentenMeta, bronnen })
    if (bereik === 'dagdeel') return blokId != null && eigen === String(blokId)
    if (bereik === 'dag') {
      if (dag == null) return false
      const blok = blokken.find((b) => zelfde(b.id, eigen))
      return blok != null && Number(blok.dag) === Number(dag)
    }
    return true
  })
}

/* ------------------------------------------------------------ gesprekken

   Een gesprek is een wortel met al zijn afstammelingen, ook antwoorden op
   antwoorden. Elk bericht komt in precies één gesprek voor:
   - een bericht waarvan de ouder ontbreekt of naar zichzelf wijst, wordt zelf wortel;
   - zitten berichten in een lus, dan wordt de oudste van de lus de wortel;
   - een ouder wordt gevonden via `id` of via `client_id`, zodat een antwoord dat nog naar
     een lokaal nummer wijst zijn net gesynchroniseerde wortel vindt;
   - een lokale kopie van een bericht dat al op de server staat (zelfde client_id) telt niet dubbel. */

const isRij = (n) => n !== null && typeof n === 'object' && !Array.isArray(n) && n.id !== undefined && n.id !== null

const tijdVan = (n) => {
  const t = Date.parse(n?.created_at)
  return Number.isFinite(t) ? t : null
}

function vergelijkId(a, b) {
  const x = String(a), y = String(b)
  const getalX = /^\d+$/.test(x), getalY = /^\d+$/.test(y)
  if (getalX && getalY) return Number(x) - Number(y)
  if (getalX !== getalY) return getalX ? -1 : 1
  return x < y ? -1 : x > y ? 1 : 0
}

// Oudste eerst; wie geen geldige tijd heeft, komt achteraan; gelijke tijd valt terug op het id.
function opTijd(a, b) {
  const ta = tijdVan(a), tb = tijdVan(b)
  if (ta !== tb) {
    if (ta === null) return 1
    if (tb === null) return -1
    return ta - tb
  }
  return vergelijkId(a.id, b.id)
}

function bouwGesprekken(lijst) {
  const invoer = (Array.isArray(lijst) ? lijst : []).filter(isRij)
  // Dezelfde id twee keer: de laatste versie wint, op de plek van de eerste.
  const perIdRuw = new Map()
  for (const n of invoer) perIdRuw.set(String(n.id), n)
  const unieke = [...perIdRuw.values()]
  const opServer = new Set(unieke.filter((n) => !n.lokaal && n.client_id != null).map((n) => String(n.client_id)))
  const nodes = unieke.filter((n) => !(n.lokaal && n.client_id != null && opServer.has(String(n.client_id))))

  const perId = new Map(nodes.map((n) => [String(n.id), n]))
  const perClient = new Map()
  for (const n of nodes) {
    if (n.client_id == null) continue
    const k = String(n.client_id)
    if (!perClient.has(k) || (perClient.get(k).lokaal && !n.lokaal)) perClient.set(k, n)
  }
  const ouders = new Map()
  const kinderen = new Map(nodes.map((n) => [n, []]))
  const wortels = []
  for (const n of nodes) {
    let ouder = null
    if (n.parent_id != null) {
      const sleutel = String(n.parent_id)
      ouder = perId.get(sleutel) ?? perClient.get(sleutel) ?? null
      if (ouder === n) ouder = null
    }
    ouders.set(n, ouder)
    if (ouder) kinderen.get(ouder).push(n)
    else wortels.push(n)
  }

  const bezocht = new Set()
  const gesprekken = []
  const verzamel = (wortel) => {
    const leden = []
    const stapel = [wortel]
    bezocht.add(wortel)
    while (stapel.length) {
      const huidig = stapel.pop()
      for (const kind of kinderen.get(huidig)) {
        if (bezocht.has(kind)) continue
        bezocht.add(kind)
        leden.push(kind)
        stapel.push(kind)
      }
    }
    gesprekken.push({ wortel, leden: leden.sort(opTijd) })
  }
  for (const w of wortels) verzamel(w)

  // Wat nog niet bezocht is, hangt aan een lus: breek hem bij zijn oudste lid.
  for (const n of [...nodes].sort(opTijd)) {
    if (bezocht.has(n)) continue
    const pad = new Set()
    let huidig = n
    while (huidig && !pad.has(huidig)) { pad.add(huidig); huidig = ouders.get(huidig) }
    const lus = [huidig]
    for (let p = ouders.get(huidig); p && p !== huidig; p = ouders.get(p)) lus.push(p)
    verzamel(lus.sort(opTijd)[0])
  }
  return gesprekken.sort((x, y) => opTijd(x.wortel, y.wortel))
}

// Wortels met al hun afstammelingen, in tijdvolgorde. Elk bericht houdt zijn eigen auteur en parent_id.
export function groepeerReacties(lijst) {
  return bouwGesprekken(lijst).map(({ wortel, leden }) => ({
    ...wortel,
    reacties: leden.map((r) => ({ ...r, reacties: [] })),
  }))
}

// Het aantal gesprekken, ongeacht hoeveel berichten erin zitten.
export function telGesprekken(lijst) {
  return bouwGesprekken(lijst).length
}

export function sorteerVoorWalkthrough(lijst, { blokken = [], documentenMeta = [] } = {}) {
  const rang = (n) => {
    const blokId = blokVoor(n, { documentenMeta })
    const blok = blokken.find((b) => zelfde(b.id, blokId))
    return blok && Number.isFinite(Number(blok.volgorde)) ? Number(blok.volgorde) : 999
  }
  const docRang = (n) => {
    if (n?.doel_type !== 'document') return SOORT_RANG[n?.doel_type] ?? 9
    const doc = documentenMeta.find((d) => zelfde(d.id, n.doel_id))
    return 10 + (DOC_RANG[doc?.soort] ?? 9)
  }
  return (Array.isArray(lijst) ? lijst : []).slice().sort((a, b) =>
    rang(a) - rang(b) ||
    docRang(a) - docRang(b) ||
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    Number(a.id) - Number(b.id))
}

// Open gesprekken: de wortel bepaalt of een gesprek open of gesloten is.
export function telOpen(lijst) {
  return bouwGesprekken(lijst).filter((g) => !isGesloten(g.wortel)).length
}

// De route waar een comment woont. De documentpagina leest het doel uit
// sessionStorage, zodat de router geen queryparameters hoeft te kennen.
export function routeVoor(n) {
  if (!n) return '#/'
  if (n.doel_type === 'document') return `#/doc/${n.doel_id}`
  if (n.doel_type === 'blok') return `#/blok/${n.doel_id}`
  if (n.doel_type === 'bron') return `#/bron/${n.doel_id}`
  return '#/'
}

export const DOEL_SLEUTEL = 'werkbank_comment_doel'

export function bewaarDoel(n) {
  try {
    sessionStorage.setItem(DOEL_SLEUTEL, JSON.stringify({ id: n.id, doel_type: n.doel_type, doel_id: String(n.doel_id), anker: n.anker || null }))
  } catch { /* zonder opslag werkt de knop nog steeds, alleen zonder sprong */ }
}

export function leesDoel() {
  try {
    const ruw = sessionStorage.getItem(DOEL_SLEUTEL)
    if (!ruw) return null
    sessionStorage.removeItem(DOEL_SLEUTEL)
    const d = JSON.parse(ruw)
    return d && d.id != null ? d : null
  } catch {
    return null
  }
}

// Kijken zonder op te ruimen: de pagina leest het doel pas als het stuk en de
// comments geladen zijn. Pas na een geslaagde sprong wissen we het.
export function piekDoel() {
  try {
    const ruw = sessionStorage.getItem(DOEL_SLEUTEL)
    if (!ruw) return null
    const d = JSON.parse(ruw)
    return d && d.id != null ? d : null
  } catch {
    return null
  }
}

export function wisDoel() {
  try { sessionStorage.removeItem(DOEL_SLEUTEL) } catch { /* niets */ }
}