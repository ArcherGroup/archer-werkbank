/* Een klik op de huidige bestemming veroorzaakt geen hashchange. Markeer die
   daarom nooit als goedgekeurde navigatie: anders kan een latere terugknop de
   waarschuwing voor niet-bewaarde tekst overslaan. */
export function beoordeelNavigatie(doel, huidigeHash, vies) {
  if (!doel || doel === (huidigeHash || '#/')) return 'geen'
  return vies ? 'vraag' : 'ga'
}

// Ieder browsergeschiedenis-item bewaart zijn eigen pad; terug is geen nieuwe
// doorklik. Onbekende of gemanipuleerde routes worden niet in het pad gebruikt.
export const WERKBLOKKEN = ['1.3', '2.1', '3.1', '4.4']

export function herstelVergelijking(id) {
  return WERKBLOKKEN.includes(id) ? id : '1.3'
}

export function naamVoorRoute(route, { blokken = [], documentenMeta = [], bronnen = [], beslissingen = [] } = {}) {
  const [soort, id] = String(route || '#/').replace(/^#\//, '').split('/')
  if (!soort) return 'Werkblad'
  if (soort === 'status') return 'Stand van zaken'
  if (soort === 'planning') return 'Planning'
  if (soort === 'agent-proef') return 'Agentproef'
  if (soort === 'bronnen') return 'Bronnen'
  if (soort === 'beslissing') return beslissingen.find((b) => String(b.id) === id)?.titel || 'Beslissing'
  if (soort === 'blok') {
    const b = blokken.find((x) => String(x.id) === id)
    return b ? `${b.code} · ${b.titel}` : 'Dagdeel'
  }
  if (soort === 'doc') {
    const d = documentenMeta.find((x) => String(x.id) === id)
    return d ? `${d.blok_id} · ${d.titel}` : 'Document'
  }
  if (soort === 'bron') return bronnen.find((b) => String(b.id) === id)?.titel || 'Bron'
  return 'Werkbank'
}

export function slaScrollBijAfsluitenOp(posities, route, element) {
  if (element?.isConnected) posities[route] = element.scrollTop
}

export function bepaalSpoor(vorig, geschiedenis, route) {
  const geldig = (spoor) => Array.isArray(spoor) && spoor.every((s) => typeof s === 'string' && s.startsWith('#/'))
  if (geldig(geschiedenis) && geschiedenis.at(-1) === route) return geschiedenis.slice(-8)
  const basis = geldig(vorig) ? vorig : []
  if (basis.at(-1) === route) return basis.slice(-8)
  return [...basis, route].slice(-8)
}
