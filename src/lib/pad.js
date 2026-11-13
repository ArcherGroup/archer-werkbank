/* Het pad bovenaan toont de plek in de masterclass, niet de klikgeschiedenis:
   Werkbank › Dag 1 · de spiegel › 1.3 · ETF's › werkboek, met de positie
   (dagdeel 3 van 16, dag 1 van 4) als vaste rode draad. */

const KORT = 46
const DAG_KORT = 34

const VASTE_ROUTES = {
  '': 'Werkblad',
  status: 'Stand van zaken',
  planning: 'Planning',
  bronnen: 'Bronnen',
  actua: 'Actua',
  onderzoek: 'Onderzoek',
  'agent-proef': 'Agentproef',
}

function kort(tekst, max = KORT) {
  const schoon = String(tekst ?? '').replace(/\s+/g, ' ').trim()
  if (schoon.length <= max) return schoon
  return schoon.slice(0, max - 1).trimEnd() + '…'
}

function splitsRoute(route) {
  const schoon = String(route ?? '').replace(/^#\/?/, '')
  const [soort, id] = schoon.split('/')
  return { soort: soort || '', id: id || null }
}

function isDagdeel(blok) {
  return blok && Number(blok.dag) >= 1 && blok.id !== 'algemeen' && blok.id !== 'bronnen'
}

export function dagdelenVan(blokken) {
  return (Array.isArray(blokken) ? blokken : [])
    .filter(isDagdeel)
    .slice()
    .sort((a, b) => {
      const va = Number(a.volgorde ?? 0) || 0
      const vb = Number(b.volgorde ?? 0) || 0
      if (va !== vb) return va - vb
      return String(a.id).localeCompare(String(b.id), 'nl', { numeric: true })
    })
}

export function positieVoor(blok, blokken) {
  const lijst = dagdelenVan(blokken)
  if (!blok || !isDagdeel(blok) || !lijst.length) return null
  const i = lijst.findIndex((b) => String(b.id) === String(blok.id))
  if (i < 0) return null
  const dagen = [...new Set(lijst.map((b) => Number(b.dag)))].sort((a, b) => a - b)
  const laatsteDag = dagen[dagen.length - 1]
  return { dagdeel: i + 1, dagdelen: lijst.length, dag: Number(blok.dag), dagen: laatsteDag }
}

export function positieTekst(positie) {
  if (!positie) return null
  return `Dagdeel ${positie.dagdeel} van ${positie.dagdelen} · Dag ${positie.dag} van ${positie.dagen}`
}

/* Op een smal scherm past de volledige zin niet; dezelfde cijfers, korter. */
export function positieKort(positie) {
  if (!positie) return null
  return `${positie.dagdeel}/${positie.dagdelen} · dag ${positie.dag}/${positie.dagen}`
}

function dagLabel(dag, dagTitels) {
  const gevonden = (Array.isArray(dagTitels) ? dagTitels : []).find((d) => Number(d.dag) === Number(dag))
  // In het pad telt de bijnaam uit het masterplan: "Financiële Bewustwording (de spiegel)"
  // wordt "Dag 1 · de spiegel". Zonder haakjes de eerste woorden van de titel.
  const ruw = gevonden ? String(gevonden.titel ?? '').trim() : ''
  const tussen = /\s*\(([^)]+)\)\s*$/.exec(ruw)
  const bijnaam = tussen ? tussen[1].trim() : (ruw ? kort(ruw, DAG_KORT) : '')
  return bijnaam ? `Dag ${dag} · ${bijnaam}` : `Dag ${dag}`
}

function blokLabel(blok) {
  const code = blok.code || blok.id
  if (!isDagdeel(blok) || !blok.titel) return kort(code, 12)
  return kort(`${code} · ${blok.titel}`)
}

export function padVoorRoute(route, invoer = {}) {
  const { blokken = [], documentenMeta = [], bronnen = [], dagTitels = [] } = invoer || {}
  const { soort, id } = splitsRoute(route)
  const delen = [{ label: 'Werkbank', route: '#/' }]

  if (!soort) {
    delen.push({ label: 'Werkblad', route: null })
    const aantal = dagdelenVan(blokken).length
    return { delen, positie: aantal ? `Vier dagen · ${aantal} dagdelen` : null }
  }

  if (VASTE_ROUTES[soort] && !id) {
    delen.push({ label: VASTE_ROUTES[soort], route: null })
    return { delen, positie: soort === 'status' && dagdelenVan(blokken).length ? `Vier dagen · ${dagdelenVan(blokken).length} dagdelen` : null }
  }

  const blokVan = (blokId) => (Array.isArray(blokken) ? blokken.find((b) => String(b.id) === String(blokId)) : null)

  if (soort === 'blok' && id) {
    const blok = blokVan(id)
    if (!blok) { delen.push({ label: 'Onbekend dagdeel', route: null }); return { delen, positie: null } }
    if (isDagdeel(blok)) delen.push({ label: dagLabel(blok.dag, dagTitels), route: '#/status' })
    delen.push({ label: blokLabel(blok), titel: `${blok.code || blok.id} · ${blok.titel || ''}`.trim(), route: null })
    const p = positieVoor(blok, blokken)
    return { delen, positie: positieTekst(p), positieKort: positieKort(p) }
  }

  if (soort === 'doc' && id) {
    const doc = (Array.isArray(documentenMeta) ? documentenMeta : []).find((d) => String(d.id) === String(id))
    if (!doc) { delen.push({ label: 'Onbekend stuk', route: null }); return { delen, positie: null } }
    const blok = doc.blok_id ? blokVan(doc.blok_id) : null
    if (blok && isDagdeel(blok)) {
      delen.push({ label: dagLabel(blok.dag, dagTitels), route: '#/status' })
      delen.push({ label: blokLabel(blok), titel: `${blok.code || blok.id} · ${blok.titel || ''}`.trim(), route: `#/blok/${blok.id}` })
    }
    delen.push({ label: kort(doc.titel), route: null })
    const p = blok ? positieVoor(blok, blokken) : null
    return { delen, positie: positieTekst(p), positieKort: positieKort(p) }
  }

  if (soort === 'bron' && id) {
    const bron = (Array.isArray(bronnen) ? bronnen : []).find((b) => String(b.id) === String(id))
    const blok = bron && bron.blok_id ? blokVan(bron.blok_id) : null
    if (blok && isDagdeel(blok)) {
      delen.push({ label: dagLabel(blok.dag, dagTitels), route: '#/status' })
      delen.push({ label: blokLabel(blok), titel: `${blok.code || blok.id} · ${blok.titel || ''}`.trim(), route: `#/blok/${blok.id}` })
    } else {
      delen.push({ label: 'Bronnen', route: '#/bronnen' })
    }
    delen.push({ label: bron ? kort(bron.titel || bron.url) : 'Onbekende bron', route: null })
    const p = blok ? positieVoor(blok, blokken) : null
    return { delen, positie: positieTekst(p), positieKort: positieKort(p) }
  }

  if (soort === 'beslissing' && id) {
    delen.push({ label: 'Planning', route: '#/planning' })
    delen.push({ label: 'Beslissing', route: null })
    return { delen, positie: null }
  }

  delen.push({ label: kort(soort), route: null })
  return { delen, positie: null }
}