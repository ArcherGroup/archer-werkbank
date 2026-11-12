/* De actualiteit van de werkbank: per domein houdt een eigen wachter de bronnen
   in het oog. Wat hij vindt is een **signaal**, geen feit: het wordt pas waar
   als een mens het bevestigt. Deze functies groeperen en tellen dat. */

export const DOMEINEN = [
  { id: 'macro', naam: 'Macro', agent: 'macro-wachter', wat: 'inflatie, groei, rente, koopkracht' },
  { id: 'staatsschuld', naam: 'Staatsschuld', agent: 'schuld-wachter', wat: 'schuldratio, tekort, rentelasten' },
  { id: 'fiscaliteit', naam: 'Fiscaliteit', agent: 'fiscus-wachter', wat: 'tarieven, vrijstellingen, taksen' },
  { id: 'politiek', naam: 'Politiek en beleid', agent: 'beleid-wachter', wat: 'begroting, hervormingen, indexering' },
  { id: 'markten', naam: 'Markten', agent: 'markt-wachter', wat: 'indexen, kosten, obligaties, goud' },
  { id: 'energie', naam: 'Energie', agent: 'grondstof-wachter', wat: 'gas, stroom, olie, grondstoffen' },
]

/* Elk domein heeft zijn eigen ritme: politiek verandert sneller dan een
   schuldratio. De versheid meet of een wachter zijn werk doet. */
export const RITME = {
  macro: 'maandelijks',
  staatsschuld: 'per kwartaal',
  fiscaliteit: 'maandelijks',
  politiek: 'dagelijks',
  markten: 'wekelijks',
  energie: 'maandelijks',
}

const RITME_DAGEN = { dagelijks: 2, wekelijks: 10, maandelijks: 35, 'per kwartaal': 100, 'per vergadering': 45 }

export const STATUSSEN = [
  { id: 'te_controleren', label: 'Te controleren' },
  { id: 'bevestigd', label: 'Bevestigd' },
  { id: 'verworpen', label: 'Verworpen' },
]

export function domeinNaam(id) {
  return DOMEINEN.find((d) => d.id === id)?.naam || id || 'Onbekend domein'
}

/* Een signaal zonder zin telt niet mee; zonder bron al helemaal niet. */
export function isSignaal(s) {
  return !!s && typeof s.zin === 'string' && s.zin.trim().length > 0 && typeof s.bron_url === 'string' && s.bron_url.startsWith('http')
}

export function telPerStatus(lijst) {
  const uit = { te_controleren: 0, bevestigd: 0, verworpen: 0 }
  for (const s of Array.isArray(lijst) ? lijst : []) {
    if (!isSignaal(s)) continue
    if (uit[s.status] === undefined) uit[s.status] = 0
    uit[s.status] += 1
  }
  return uit
}

/* Groepeer per domein in de vaste volgorde van DOMEINEN; een onbekend domein
   komt achteraan in plaats van te verdwijnen. */
export function groepeerActua(lijst, { status = null } = {}) {
  const alles = (Array.isArray(lijst) ? lijst : []).filter(isSignaal)
  const perDomein = new Map()
  for (const s of alles) {
    if (status && s.status !== status) continue
    const sleutel = s.domein || 'overig'
    if (!perDomein.has(sleutel)) perDomein.set(sleutel, { id: sleutel, naam: domeinNaam(sleutel), agent: s.agent || DOMEINEN.find((d) => d.id === sleutel)?.agent || '', signalen: [] })
    perDomein.get(sleutel).signalen.push(s)
  }
  const volgorde = (id) => {
    const i = DOMEINEN.findIndex((d) => d.id === id)
    return i < 0 ? 99 : i
  }
  const uit = [...perDomein.values()].sort((a, b) => volgorde(a.id) - volgorde(b.id))
  for (const d of uit) {
    d.signalen.sort((a, b) => String(b.bron_datum || b.gevonden_op || '').localeCompare(String(a.bron_datum || a.gevonden_op || '')))
  }
  return uit
}

/* Hoeveel dagen geleden kwam dit binnen? Een oude bron is een oude waarheid. */
export function dagenOud(iso, nu = new Date()) {
  if (!iso) return null
  const dan = new Date(iso)
  if (Number.isNaN(dan.getTime())) return null
  return Math.max(0, Math.round((nu.getTime() - dan.getTime()) / 86400000))
}

export function versTekst(iso, nu = new Date()) {
  const dagen = dagenOud(iso, nu)
  if (dagen === null) return 'datum onbekend'
  if (dagen === 0) return 'vandaag'
  if (dagen === 1) return 'gisteren'
  if (dagen < 31) return `${dagen} dagen geleden`
  const maanden = Math.round(dagen / 30)
  return maanden <= 1 ? 'een maand geleden' : `${maanden} maanden geleden`
}
/* Een cijfer zoals een mens het leest: 5.26 wordt 5,26 en 25144 wordt 25.144.
   Is het geen cijfer, dan blijft de tekst staan zoals hij in de bron staat. */
export function mooiGetal(getal, eenheid = '') {
  const ruw = String(getal ?? '').trim()
  if (!ruw) return eenheid ? '' : ''
  const decimaal = /^-?\d+\.\d{1,2}$/.test(ruw)
  if (decimaal) {
    const n = Number(ruw)
    const uit = n.toLocaleString('nl-BE', { minimumFractionDigits: ruw.split('.')[1].length, maximumFractionDigits: 2 })
    return eenheid && eenheid.length < 14 ? `${uit} ${eenheid}` : uit
  }
  const geheel = /^-?\d{4,}$/.test(ruw)
  if (geheel) {
    const uit = Number(ruw).toLocaleString('nl-BE')
    return eenheid && eenheid.length < 14 ? `${uit} ${eenheid}` : uit
  }
  return eenheid && eenheid.length < 14 && eenheid !== 'procent' ? `${ruw} ${eenheid}` : ruw
}

/* De versheid per wachter: wanneer kwam zijn laatste signaal binnen, en is dat
   binnen zijn eigen ritme? Zo zie je in één oogopslag welke wachter stilvalt. */
export function versheidPerDomein(signalen, { nu = new Date() } = {}) {
  const alles = (Array.isArray(signalen) ? signalen : []).filter(isSignaal)
  return DOMEINEN.map((d) => {
    const eigen = alles.filter((s) => (s.domein || 'overig') === d.id)
    const momenten = eigen
      .map((s) => s.bron_datum || s.gevonden_op)
      .filter(Boolean)
      .sort()
    const laatste = momenten.length ? momenten[momenten.length - 1] : null
    const dagen = dagenOud(laatste, nu)
    const ritme = RITME[d.id] || 'maandelijks'
    const drempel = RITME_DAGEN[ritme] ?? 35
    let stand = 'leeg'
    if (dagen !== null) stand = dagen <= drempel ? 'vers' : dagen <= drempel * 2 ? 'let op' : 'verouderd'
    return { id: d.id, naam: d.naam, agent: d.agent, ritme, aantal: eigen.length, laatste, dagen, stand }
  })
}

export function versheidsTekst(v) {
  if (!v) return ''
  if (v.stand === 'leeg') return 'nog niets gevonden'
  if (v.stand === 'vers') return v.dagen === 0 ? 'vandaag bijgewerkt' : `bijgewerkt ${versTekst(v.laatste)}`
  if (v.stand === 'let op') return `laatst ${versTekst(v.laatste)}`
  return `stil sinds ${versTekst(v.laatste)}`
}
