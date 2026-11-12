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
  return alles.filter((n) => {
    if (!toonOpgelost && isGesloten(n)) return false
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

// Ouders met hun reacties. Een reactie waarvan de ouder niet in de lijst zit,
// wordt zelf een wortel: liever tonen dan stil laten verdwijnen.
export function groepeerReacties(lijst) {
  const alles = (Array.isArray(lijst) ? lijst : []).slice()
  const perId = new Map(alles.map((n) => [String(n.id), { ...n, reacties: [] }]))
  const wortels = []
  for (const n of perId.values()) {
    const ouder = n.parent_id != null ? perId.get(String(n.parent_id)) : null
    if (ouder && ouder !== n) ouder.reacties.push(n)
    else wortels.push(n)
  }
  const opTijd = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id)
  for (const w of wortels) w.reacties.sort(opTijd)
  return wortels.sort(opTijd)
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

export function telOpen(lijst) {
  return (Array.isArray(lijst) ? lijst : []).filter((n) => !isGesloten(n)).length
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