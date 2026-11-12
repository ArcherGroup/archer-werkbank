/* De commentaarwachtrij.

   De werkbank is een gedeelde databank, maar niet elke omgeving mag schrijven:
   de lokale proefweergave blokkeert bijvoorbeeld elke POST naar Supabase. Dan
   mag een comment niet verdwijnen. Wat niet verstuurd raakt, blijft in deze
   wachtrij staan (in de opslag van de browser) en gaat mee zodra het weer kan.

   Eén regel: eerst bewaren, dan pas proberen te versturen. Nooit een comment
   laten vallen omdat het netwerk of de omgeving nee zegt. */

export const WACHTRIJ_SLEUTEL = 'werkbank_comment_wachtrij'
export const KAART_SLEUTEL = 'werkbank_comment_kaart'

function opslag() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function leesRuw() {
  const s = opslag()
  if (!s) return []
  try {
    const ruw = JSON.parse(s.getItem(WACHTRIJ_SLEUTEL) || '[]')
    return Array.isArray(ruw) ? ruw.filter((x) => x && x.lokaal_id && x.tekst) : []
  } catch {
    return []
  }
}

function schrijfRuw(lijst) {
  const s = opslag()
  if (!s) return
  try {
    s.setItem(WACHTRIJ_SLEUTEL, JSON.stringify(lijst.slice(-200)))
  } catch {
    /* vol of geblokkeerd: dan blijft het bij deze sessie */
  }
}

/* Als een lokale comment verstuurd is, onthouden we welk nummer hij kreeg.
   Anders zou een antwoord erop bij de volgende ronde zijn ouder kwijt zijn. */
function leesKaart() {
  const s = opslag()
  if (!s) return {}
  try {
    const ruw = JSON.parse(s.getItem(KAART_SLEUTEL) || '{}')
    return ruw && typeof ruw === 'object' && !Array.isArray(ruw) ? ruw : {}
  } catch {
    return {}
  }
}

function schrijfKaart(kaart) {
  const s = opslag()
  if (!s) return
  try {
    s.setItem(KAART_SLEUTEL, JSON.stringify(kaart))
  } catch {
    /* zonder opslag lukt het binnen deze sessie nog steeds */
  }
}

export function leesWachtrij() {
  return leesRuw()
}

export function telWachtrij() {
  return leesRuw().length
}

/* Een tijdelijk nummer, zodat een comment in de lijst een echte sleutel heeft. */
export function lokaalId(nu = Date.now()) {
  return `lokaal-${nu}-${Math.random().toString(36).slice(2, 8)}`
}

function zelfdeInhoud(a, b) {
  return a.doel_type === b.doel_type && String(a.doel_id) === String(b.doel_id)
    && String(a.tekst).trim() === String(b.tekst).trim()
    && String(a.parent_id ?? '') === String(b.parent_id ?? '')
}

export function bewaarInWachtrij(item, nu = new Date()) {
  const lijst = leesRuw()
  if (lijst.some((x) => zelfdeInhoud(x, item))) return lijst
  const rij = {
    lokaal_id: item.lokaal_id || lokaalId(),
    doel_type: item.doel_type,
    doel_id: String(item.doel_id),
    tekst: String(item.tekst),
    auteur: item.auteur || '',
    anker: item.anker || null,
    parent_id: item.parent_id ?? null,
    created_at: item.created_at || nu.toISOString(),
    lokaal: true,
  }
  const nieuw = [...lijst, rij]
  schrijfRuw(nieuw)
  return nieuw
}

export function verwijderUitWachtrij(lokaalIdWaarde) {
  const nieuw = leesRuw().filter((x) => x.lokaal_id !== lokaalIdWaarde)
  schrijfRuw(nieuw)
  return nieuw
}

export function wisWachtrij() {
  schrijfRuw([])
  schrijfKaart({})
}

/* Verstuur wat er staat, in volgorde. Wat lukt, gaat eruit; wat faalt, blijft
   staan. Een antwoord op een comment die zelf nog lokaal is, wacht tot de ouder
   verstuurd is: dan krijgt het antwoord het echte nummer van de ouder mee.
   De verstuurder wordt ingegeven, zodat dit te testen is zonder netwerk. */
export async function verwerkWachtrij(verstuur) {
  const lijst = leesRuw()
  const kaart = new Map(Object.entries(leesKaart()))
  const gelukt = []
  const mislukt = []
  for (const item of lijst) {
    const wachtOpOuder = item.parent_id != null && String(item.parent_id).startsWith('lokaal-')
    const ouder = wachtOpOuder ? kaart.get(String(item.parent_id)) : item.parent_id
    if (wachtOpOuder && !ouder) {
      mislukt.push(item)
      continue
    }
    try {
      const rij = await verstuur({ ...item, parent_id: ouder ?? null })
      verwijderUitWachtrij(item.lokaal_id)
      if (rij?.id !== undefined && rij?.id !== null) kaart.set(item.lokaal_id, rij.id)
      gelukt.push(item)
    } catch {
      mislukt.push(item)
    }
  }
  const bewaard = Object.fromEntries([...kaart.entries()])
  const nogNodig = {}
  for (const item of leesRuw()) {
    if (item.parent_id != null && bewaard[item.parent_id] !== undefined) nogNodig[item.parent_id] = bewaard[item.parent_id]
  }
  schrijfKaart(nogNodig)
  return { gelukt, mislukt, rest: leesRuw() }
}

/* De comment zoals hij in de lijst moet staan voordat hij verstuurd is. */
export function alsNotitie(item) {
  return {
    id: item.lokaal_id,
    doel_type: item.doel_type,
    doel_id: String(item.doel_id),
    tekst: item.tekst,
    auteur: item.auteur,
    anker: item.anker,
    parent_id: item.parent_id ?? null,
    created_at: item.created_at,
    lokaal: true,
    wachtend: true,
  }
}