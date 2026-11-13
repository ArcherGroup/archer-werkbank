/* De commentaarwachtrij.

   De werkbank is een gedeelde databank, maar niet elke omgeving mag schrijven:
   de lokale proefweergave blokkeert bijvoorbeeld elke POST naar Supabase. Dan
   mag een comment niet verdwijnen. Wat niet verstuurd raakt, blijft in deze
   wachtrij staan (in de opslag van de browser) en gaat mee zodra het weer kan.

   Regels:
   - Eerst duurzaam bewaren, dan pas proberen te versturen.
   - Faalt de opslag (vol, geblokkeerd, afwezig), dan blijft de comment in het
     geheugen van dit tabblad staan. Dat is geen stille uitzondering: `opslagStatus()`
     meldt het, zodat de pagina het kan tonen en de gebruiker kan exporteren.
   - Elke comment heeft een stabiele `client_id` (standaard zijn `lokaal_id`).
     Daarmee is versturen idempotent: dubbel versturen maakt geen tweede rij.
   - Een verstuurde comment verdwijnt pas uit de wachtrij als de kaart
     lokaal-nummer -> echt nummer duurzaam bewaard is en de server een echte rij
     (met nummer) teruggaf. */

export const WACHTRIJ_SLEUTEL = 'werkbank_comment_wachtrij'
export const KAART_SLEUTEL = 'werkbank_comment_kaart'
export const EXPORT_TYPE = 'werkbank-comment-wachtrij'
export const EXPORT_VERSIE = 1

/* Opslagindeling (race-vast tussen tabbladen): elke comment en elke kaartregel is
   een eigen sleutel. Een tabblad schrijft of verwijdert alleen zijn eigen sleutel
   en leest nooit een hele lijst om die terug te schrijven, dus twee tabbladen
   kunnen elkaar niet overschrijven. De oude sleutels WACHTRIJ_SLEUTEL (array) en
   KAART_SLEUTEL (object) blijven bestaan als afgeleide cache voor oudere code en
   voor de storage-events van de pagina; ze worden nooit als waarheid gelezen,
   behalve één keer bij de migratie van een oude browser (zonder MIGRATIE_SLEUTEL). */
const ITEM_VOORVOEGSEL = `${'werkbank_comment_wachtrij'}:item:`
const KAART_VOORVOEGSEL = `${'werkbank_comment_kaart'}:regel:`
const MIGRATIE_SLEUTEL = 'werkbank_comment_opslag_versie'

const IMPORT_MAX_TEKENS = 5_000_000
const IMPORT_MAX_ITEMS = 5000
const DOEL_TYPES = ['blok', 'document', 'bron']
const LOKAAL_RE = /^lokaal-[A-Za-z0-9_-]{1,100}$/
const GEDEELD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/* ------------------------------------------------------------ opslag */

const toestand = {
  mem: new Map(), // items die niet in de opslag staan (lokaal_id -> item)
  weg: new Set(), // items die verwijderd zijn maar nog in de opslag staan
  beperkt: false,
  tijden: new Map(), // lokaal_id -> volgorde van items in mem
  cacheFout: false, // de compat-cache (oude array) kon niet geschreven worden
  kaartMem: new Map(), // kaartregels die niet in de opslag staan (lokaal_id -> echt nummer)
  kaartTijden: new Map(),
  kaartCacheFout: false,
  migratieFout: false, // de migratiemarkering kon niet geschreven worden
}
let laatsteT = 0
const volgendeT = () => { laatsteT = Math.max(Date.now() * 1000, laatsteT + 1); return laatsteT }
let lopend = null

const FOUT_TEKST = 'De opslag van deze browser is vol of geblokkeerd. Je comments staan alleen in het geheugen van dit tabblad en gaan verloren als je het sluit of ververst. Exporteer de wachtrij om ze veilig te stellen.'

function opslag() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function leesRuweTekst(sleutel) {
  const s = opslag()
  if (!s) return null
  try { return s.getItem(sleutel) } catch { return null }
}

function schrijfDuurzaam(sleutel, tekst) {
  const s = opslag()
  if (!s) return false
  try {
    s.setItem(sleutel, tekst)
    return s.getItem(sleutel) === tekst
  } catch {
    return false
  }
}

function verwijderRuw(sleutel) {
  const s = opslag()
  if (!s) return false
  try { s.removeItem(sleutel); return s.getItem(sleutel) === null } catch { return false }
}

function sleutelsMet(voorvoegsel) {
  const s = opslag()
  const uit = []
  if (!s) return uit
  try {
    const n = s.length
    for (let i = 0; i < n; i++) {
      const k = s.key(i)
      if (typeof k === 'string' && k.startsWith(voorvoegsel)) uit.push(k)
    }
  } catch { /* geen opsomming mogelijk */ }
  return uit
}

export function opslagBeperkt() {
  return toestand.beperkt || toestand.cacheFout || toestand.kaartMem.size > 0 || toestand.kaartCacheFout
}

/* Is alles wat we weten ook echt in de opslag terechtgekomen? */
export function opslagStatus() {
  const beperkt = opslagBeperkt()
  return { duurzaam: !beperkt, fout: beperkt ? FOUT_TEKST : null, inGeheugen: toestand.mem.size }
}

/* ------------------------------------------------------------ normaliseren */

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const isTekst = (x, max) => typeof x === 'string' && x.length <= max
const isGeheelGetal = (x) => Number.isInteger(x) && x >= 0 && x <= 1e9

function geldigGedeeldId(v) {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v > 0
  return typeof v === 'string' && GEDEELD_ID_RE.test(v) && v !== '0'
}

/* De marker van een stuk tekst: exact, prefix, suffix, start, end, document_versie.
   Alleen die velden gaan mee. Met `streng` komt een fout terug in plaats van stil weglaten. */
function leesContext(c, streng) {
  if (c === null || c === undefined) return { waarde: null }
  if (!isObject(c)) return streng ? { fout: 'anker_context is geen object' } : { waarde: null }
  const uit = {}
  for (const k of ['exact', 'prefix', 'suffix']) {
    if (c[k] === undefined || c[k] === null) continue
    if (!isTekst(c[k], 5000)) return streng ? { fout: `anker_context.${k} is geen tekst` } : { waarde: null }
    uit[k] = c[k]
  }
  for (const k of ['start', 'end']) {
    if (c[k] === undefined || c[k] === null) continue
    if (!isGeheelGetal(c[k])) return streng ? { fout: `anker_context.${k} is geen positief geheel getal` } : { waarde: null }
    uit[k] = c[k]
  }
  if (uit.start !== undefined && uit.end !== undefined && uit.end < uit.start) {
    return streng ? { fout: 'anker_context.end ligt voor start' } : { waarde: null }
  }
  if (c.document_versie !== undefined && c.document_versie !== null) {
    const v = c.document_versie
    if (!(isGeheelGetal(v) || (typeof v === 'string' && v.length > 0 && v.length <= 64))) {
      return streng ? { fout: 'anker_context.document_versie is ongeldig' } : { waarde: null }
    }
    uit.document_versie = v
  }
  return { waarde: Object.keys(uit).length ? uit : null }
}

/* Een item zoals het in de wachtrij staat. Null als het niet bruikbaar is. */
function normaliseer(x) {
  if (!isObject(x) || !x.lokaal_id || typeof x.lokaal_id !== 'string' || !x.tekst || typeof x.tekst !== 'string') return null
  return {
    lokaal_id: x.lokaal_id,
    client_id: (typeof x.client_id === 'string' && x.client_id) || x.lokaal_id,
    doel_type: x.doel_type,
    doel_id: String(x.doel_id),
    tekst: x.tekst,
    auteur: typeof x.auteur === 'string' ? x.auteur : '',
    anker: x.anker || null,
    anker_context: leesContext(x.anker_context, false).waarde,
    parent_id: x.parent_id ?? null,
    created_at: x.created_at,
    lokaal: true,
  }
}

/* ------------------------------------------------------------ wachtrij lezen en schrijven */

function leesEnvelop(ruw) {
  try {
    const o = JSON.parse(ruw)
    if (!isObject(o) || !Number.isFinite(o.t)) return null
    const item = normaliseer(o.item)
    return item ? { t: o.t, item } : null
  } catch {
    return null
  }
}

/* Eenmalig: de oude array en kaart van een browser van vóór deze indeling worden
   per stuk overgenomen. Bestaande sleutels en al verstuurde items blijven ongemoeid.
   Daarna zijn de oude sleutels alleen nog cache. */
function migreer() {
  if (!opslag()) return
  if (leesRuweTekst(MIGRATIE_SLEUTEL) !== null) { toestand.migratieFout = false; return }
  if (toestand.migratieFout) return
  const ruwKaart = leesRuweTekst(KAART_SLEUTEL)
  const oudeKaart = new Map()
  if (ruwKaart) {
    try {
      const o = JSON.parse(ruwKaart)
      if (isObject(o)) for (const [k, v] of Object.entries(o)) if (LOKAAL_RE.test(k) && geldigGedeeldId(v)) oudeKaart.set(k, v)
    } catch { schrijfDuurzaam(`${KAART_SLEUTEL}_onleesbaar`, ruwKaart) }
  }
  const ruw = leesRuweTekst(WACHTRIJ_SLEUTEL)
  if (ruw) {
    let lijst = null
    try { lijst = JSON.parse(ruw) } catch { schrijfDuurzaam(`${WACHTRIJ_SLEUTEL}_onleesbaar`, ruw) }
    if (Array.isArray(lijst)) {
      const basis = Date.now() * 1000 - lijst.length - 1
      lijst.map(normaliseer).forEach((item, i) => {
        if (!item || leesRuweTekst(ITEM_VOORVOEGSEL + item.lokaal_id) !== null) return
        if (oudeKaart.has(item.lokaal_id) || leesRuweTekst(KAART_VOORVOEGSEL + item.lokaal_id) !== null) return
        schrijfDuurzaam(ITEM_VOORVOEGSEL + item.lokaal_id, JSON.stringify({ t: basis + i, item }))
      })
    }
  }
  let t = Date.now() * 1000 - oudeKaart.size - 1
  for (const [k, v] of oudeKaart) {
    t += 1
    if (leesRuweTekst(KAART_VOORVOEGSEL + k) === null) schrijfDuurzaam(KAART_VOORVOEGSEL + k, JSON.stringify({ t, id: v }))
  }
  if (!schrijfDuurzaam(MIGRATIE_SLEUTEL, '2')) toestand.migratieFout = true
}

function leesOpgeslagenMetTijd() {
  migreer()
  const uit = []
  for (const k of sleutelsMet(ITEM_VOORVOEGSEL)) {
    const ruw = leesRuweTekst(k)
    const e = ruw ? leesEnvelop(ruw) : null
    if (e && ITEM_VOORVOEGSEL + e.item.lokaal_id === k) uit.push(e)
  }
  return uit.sort((a, b) => a.t - b.t || (a.item.lokaal_id < b.item.lokaal_id ? -1 : 1))
}

function leesRuw() {
  const opgeslagen = leesOpgeslagenMetTijd().map((e) => e.item).filter((x) => !toestand.weg.has(x.lokaal_id))
  if (!toestand.mem.size) return opgeslagen
  const ids = new Set(opgeslagen.map((x) => x.lokaal_id))
  return [...opgeslagen, ...[...toestand.mem.values()].filter((x) => !ids.has(x.lokaal_id))]
}

/* De oude array: een afgeleid exemplaar voor oudere code en storage-events. Nooit de bron. */
function ververseCache() {
  const lijst = leesRuw()
  toestand.cacheFout = !schrijfDuurzaam(WACHTRIJ_SLEUTEL, JSON.stringify(lijst))
  return !toestand.cacheFout
}

function herstelGeheugen() {
  for (const [id, item] of [...toestand.mem]) {
    const t = toestand.tijden.get(id) ?? volgendeT()
    if (schrijfDuurzaam(ITEM_VOORVOEGSEL + id, JSON.stringify({ t, item }))) { toestand.mem.delete(id); toestand.tijden.delete(id) }
  }
  for (const id of [...toestand.weg]) if (verwijderRuw(ITEM_VOORVOEGSEL + id)) toestand.weg.delete(id)
  toestand.beperkt = toestand.mem.size > 0 || toestand.weg.size > 0
}

/* Bewaar precies één item onder zijn eigen sleutel. Raakt andere items niet aan. */
function schrijfItem(item) {
  migreer()
  const t = volgendeT()
  const gelukt = schrijfDuurzaam(ITEM_VOORVOEGSEL + item.lokaal_id, JSON.stringify({ t, item }))
  if (gelukt) { toestand.mem.delete(item.lokaal_id); toestand.tijden.delete(item.lokaal_id); toestand.weg.delete(item.lokaal_id) }
  else { toestand.mem.set(item.lokaal_id, item); toestand.tijden.set(item.lokaal_id, t) }
  herstelGeheugen()
  const cache = ververseCache()
  return gelukt && cache && !toestand.beperkt
}

/* Verwijder precies één item. Lukt dat niet in de opslag, dan onthouden we dat het weg is. */
function wisItem(lokaalIdWaarde) {
  migreer()
  toestand.mem.delete(lokaalIdWaarde)
  toestand.tijden.delete(lokaalIdWaarde)
  if (!verwijderRuw(ITEM_VOORVOEGSEL + lokaalIdWaarde)) toestand.weg.add(lokaalIdWaarde)
  else toestand.weg.delete(lokaalIdWaarde)
  herstelGeheugen()
  const cache = ververseCache()
  return cache && !toestand.beperkt
}

/* De oude API geeft een array terug. De eerlijke opslagstand hangt er onzichtbaar aan. */
function metStand(lijst) {
  Object.defineProperty(lijst, 'opslagBeperkt', { value: opslagBeperkt(), enumerable: false })
  return lijst
}

/* ------------------------------------------------------------ kaart: lokaal nummer -> echt nummer */

function leesKaartMetTijd() {
  migreer()
  const uit = []
  for (const k of sleutelsMet(KAART_VOORVOEGSEL)) {
    const lokaal = k.slice(KAART_VOORVOEGSEL.length)
    if (!LOKAAL_RE.test(lokaal)) continue
    try {
      const o = JSON.parse(leesRuweTekst(k))
      if (isObject(o) && Number.isFinite(o.t) && geldigGedeeldId(o.id)) uit.push([lokaal, o.id, o.t])
    } catch { /* onleesbare regel: overslaan */ }
  }
  return uit.sort((a, b) => a[2] - b[2])
}

function leesKaart() {
  const kaart = new Map(leesKaartMetTijd().map(([k, v]) => [k, v]))
  for (const [k, v] of toestand.kaartMem) kaart.set(k, v)
  return kaart
}

function ververseKaartCache() {
  toestand.kaartCacheFout = !schrijfDuurzaam(KAART_SLEUTEL, JSON.stringify(Object.fromEntries(leesKaart())))
  return !toestand.kaartCacheFout
}

/* Bewaar één kaartregel onder een eigen sleutel: een gelijktijdige flush in een
   ander tabblad kan hem niet kwijtraken. Geeft true als alles duurzaam staat. */
function zetKaartRegel(lokaal, gedeeld) {
  migreer()
  const t = volgendeT()
  if (schrijfDuurzaam(KAART_VOORVOEGSEL + lokaal, JSON.stringify({ t, id: gedeeld }))) {
    toestand.kaartMem.delete(lokaal)
    toestand.kaartTijden.delete(lokaal)
  } else {
    toestand.kaartMem.set(lokaal, gedeeld)
    toestand.kaartTijden.set(lokaal, t)
  }
  for (const [k, v] of [...toestand.kaartMem]) {
    if (schrijfDuurzaam(KAART_VOORVOEGSEL + k, JSON.stringify({ t: toestand.kaartTijden.get(k) ?? volgendeT(), id: v }))) {
      toestand.kaartMem.delete(k)
      toestand.kaartTijden.delete(k)
    }
  }
  const cache = ververseKaartCache()
  return cache && toestand.kaartMem.size === 0
}

/* Het echte nummer van een lokale comment die al verstuurd is, of null.
   Zo kan een antwoord op een net gesynchroniseerde lokale wortel zijn ouder vinden. */
export function zoekGedeeldId(lokaalIdWaarde) {
  if (typeof lokaalIdWaarde !== 'string' || !lokaalIdWaarde.startsWith('lokaal-')) return null
  return leesKaart().get(lokaalIdWaarde) ?? null
}

/* ------------------------------------------------------------ publieke basis-API */

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

const contextSleutel = (c) => JSON.stringify(c ?? null)

function zelfdeInhoud(a, b) {
  return a.doel_type === b.doel_type && String(a.doel_id) === String(b.doel_id)
    && String(a.tekst).trim() === String(b.tekst).trim()
    && String(a.parent_id ?? '') === String(b.parent_id ?? '')
    && String(a.auteur ?? '') === String(b.auteur ?? '')
    && String(a.anker ?? '') === String(b.anker ?? '')
    && contextSleutel(a.anker_context) === contextSleutel(b.anker_context)
}

/* Bewaar een comment in de wachtrij. Geeft { item, nieuw, lijst, opslagBeperkt, alVerstuurd? }.
   Met een eigen lokaal_id of client_id telt alleen die identiteit; zonder identiteit
   gelden twee echt identieke comments (zelfde auteur, anker en ouder) als een dubbele klik. */
export function voegToeAanWachtrij(item, nu = new Date()) {
  if (!isObject(item) || typeof item.tekst !== 'string' || !item.tekst.trim()) {
    throw new Error('Een lege comment wordt niet bewaard.')
  }
  const lijst = leesRuw()
  const eigenId = item.lokaal_id || item.client_id || null
  const lokaal = item.lokaal_id || (typeof item.client_id === 'string' && LOKAAL_RE.test(item.client_id) ? item.client_id : lokaalId())
  const rij = normaliseer({
    ...item,
    lokaal_id: lokaal,
    client_id: item.client_id || lokaal,
    created_at: item.created_at || nu.toISOString(),
  })
  const bestaand = eigenId
    ? lijst.find((x) => x.lokaal_id === rij.lokaal_id || x.client_id === rij.client_id)
    : lijst.find((x) => zelfdeInhoud(x, rij))
  if (bestaand) return { item: bestaand, nieuw: false, lijst, opslagBeperkt: opslagBeperkt() }
  const gedeeld = leesKaart().get(rij.lokaal_id)
  if (gedeeld !== undefined) return { item: rij, nieuw: false, alVerstuurd: true, gedeeldId: gedeeld, lijst, opslagBeperkt: opslagBeperkt() }
  schrijfItem(rij)
  return { item: rij, nieuw: true, lijst: [...lijst, rij], opslagBeperkt: opslagBeperkt() }
}

export function bewaarInWachtrij(item, nu = new Date()) {
  return metStand(voegToeAanWachtrij(item, nu).lijst.slice())
}

export function verwijderUitWachtrij(lokaalIdWaarde) {
  wisItem(lokaalIdWaarde)
  return metStand(leesRuw())
}

export function wisWachtrij() {
  toestand.mem.clear()
  toestand.tijden.clear()
  toestand.weg.clear()
  toestand.beperkt = false
  toestand.cacheFout = false
  toestand.kaartMem.clear()
  toestand.kaartTijden.clear()
  toestand.kaartCacheFout = false
  toestand.migratieFout = false
  for (const k of [...sleutelsMet(ITEM_VOORVOEGSEL), ...sleutelsMet(KAART_VOORVOEGSEL)]) verwijderRuw(k)
  if (!schrijfDuurzaam(MIGRATIE_SLEUTEL, '2')) toestand.migratieFout = true
  toestand.cacheFout = !schrijfDuurzaam(WACHTRIJ_SLEUTEL, '[]')
  verwijderRuw(KAART_SLEUTEL)
  toestand.kaartCacheFout = !schrijfDuurzaam(KAART_SLEUTEL, '{}')
}

/* ------------------------------------------------------------ versturen */

const heeftEchtId = (rij) => rij != null && rij.id !== undefined && rij.id !== null && rij.id !== ''

/* Verstuur wat er staat, in volgorde. Wat lukt, gaat eruit; wat faalt, blijft
   staan. Een antwoord op een comment die zelf nog lokaal is, wacht tot de ouder
   verstuurd is: dan krijgt het antwoord het echte nummer van de ouder mee.
   Er loopt nooit meer dan één flush tegelijk: een tweede aanroep krijgt de
   uitkomst van de lopende. De verstuurder wordt ingegeven, zodat dit te testen is
   zonder netwerk, en moet de bewaarde rij met een echt `id` teruggeven. */
export function verwerkWachtrij(verstuur) {
  if (lopend) return lopend
  lopend = voerFlushUit(verstuur).finally(() => { lopend = null })
  return lopend
}

async function voerFlushUit(verstuur) {
  const gelukt = []
  const hersteld = []
  const fouten = []
  const gefaald = new Set() // versturen mislukte: deze run niet nog eens
  const klaar = new Set() // verstuurd (en eventueel nog niet opgeruimd): deze run niet nog eens
  const gezien = new Set() // alles wat een ronde al onder ogen had
  let voortgang
  do {
    voortgang = false
    const kaart = leesKaart()
    const ronde = leesRuw()
    for (const item of ronde) gezien.add(item.lokaal_id)
    for (const item of ronde) {
      const id = item.lokaal_id
      if (gefaald.has(id) || klaar.has(id)) continue

      // Al eerder verstuurd (kaart kent het), maar nog niet opgeruimd: alleen opruimen.
      if (kaart.has(id)) {
        klaar.add(id)
        if (rondAf(item, kaart, kaart.get(id))) hersteld.push(item)
        continue
      }

      const wachtOpOuder = item.parent_id != null && String(item.parent_id).startsWith('lokaal-')
      const ouder = wachtOpOuder ? kaart.get(String(item.parent_id)) : item.parent_id
      if (wachtOpOuder && ouder === undefined) continue

      let rij
      try {
        rij = await verstuur({ ...item, client_id: item.client_id || id, parent_id: ouder ?? null })
      } catch (e) {
        gefaald.add(id)
        fouten.push({ lokaal_id: id, fout: e?.message || String(e) })
        continue
      }
      if (!heeftEchtId(rij)) {
        gefaald.add(id)
        fouten.push({ lokaal_id: id, fout: 'De server gaf geen bewaarde rij terug.' })
        continue
      }
      klaar.add(id)
      voortgang = true
      gelukt.push(item)
      rondAf(item, kaart, rij.id)
    }
    // Wat tijdens het versturen is toegevoegd, krijgt nog een ronde.
    if (leesRuw().some((x) => !gezien.has(x.lokaal_id))) voortgang = true
  } while (voortgang)

  const rest = leesRuw()
  const mislukt = rest.filter((x) => !klaar.has(x.lokaal_id))
  const bekend = new Set([...rest.map((x) => x.lokaal_id), ...leesKaart().keys()])
  const wees = mislukt.filter((x) => x.parent_id != null && String(x.parent_id).startsWith('lokaal-') && !bekend.has(String(x.parent_id)))
  return { gelukt, mislukt, rest, hersteld, wees, fouten, opslagBeperkt: opslagBeperkt() }
}

/* Eerst de kaart duurzaam bewaren, dan pas de comment uit de wachtrij halen.
   Lukt de kaart niet en wacht er nog een antwoord op deze comment in de wachtrij,
   dan blijft hij staan: zonder kaart zou dat antwoord na een herstart zijn ouder
   kwijt zijn. Versturen is idempotent (client_id), dus blijven staan kost niets. */
function rondAf(item, kaart, gedeeldId) {
  kaart.set(item.lokaal_id, gedeeldId)
  const duurzaam = zetKaartRegel(item.lokaal_id, gedeeldId)
  if (!duurzaam) {
    const heeftKinderen = leesRuw().some((x) => x.lokaal_id !== item.lokaal_id && String(x.parent_id ?? '') === item.lokaal_id)
    if (heeftKinderen) return false
  }
  wisItem(item.lokaal_id)
  return true
}

/* ------------------------------------------------------------ weergave */

/* De comment zoals hij in de lijst moet staan voordat hij verstuurd is. */
export function alsNotitie(item) {
  const ouder = item.parent_id ?? null
  const gedeeldeOuder = typeof ouder === 'string' && ouder.startsWith('lokaal-') ? zoekGedeeldId(ouder) : null
  return {
    id: item.lokaal_id,
    lokaal_id: item.lokaal_id,
    client_id: item.client_id || item.lokaal_id,
    doel_type: item.doel_type,
    doel_id: String(item.doel_id),
    tekst: item.tekst,
    auteur: item.auteur,
    anker: item.anker,
    anker_context: item.anker_context ?? null,
    parent_id: gedeeldeOuder ?? ouder,
    lokaal_parent_id: gedeeldeOuder !== null ? ouder : null,
    created_at: item.created_at,
    lokaal: true,
    wachtend: true,
  }
}

/* ------------------------------------------------------------ export en import */

/* Alleen de wachtrij en de kaart, als JSON v1. Niets anders uit de opslag. */
export function exporteerWachtrij(nu = new Date()) {
  return JSON.stringify({
    type: EXPORT_TYPE,
    versie: EXPORT_VERSIE,
    geexporteerd_op: nu.toISOString(),
    items: leesRuw(),
    kaart: Object.fromEntries(leesKaart()),
  }, null, 2)
}

function leesImportItem(x, nu) {
  if (!isObject(x)) return { reden: 'item is geen object' }
  if (typeof x.lokaal_id !== 'string' || !LOKAAL_RE.test(x.lokaal_id)) return { reden: 'lokaal_id ontbreekt of is ongeldig' }
  if (x.client_id !== undefined && x.client_id !== null && !(typeof x.client_id === 'string' && LOKAAL_RE.test(x.client_id))) return { reden: 'client_id is ongeldig' }
  if (typeof x.tekst !== 'string' || !x.tekst.trim()) return { reden: 'tekst ontbreekt' }
  if (x.tekst.length > 20000) return { reden: 'tekst is te lang' }
  if (!DOEL_TYPES.includes(x.doel_type)) return { reden: 'doel_type is onbekend' }
  const doelOk = (typeof x.doel_id === 'string' && x.doel_id.length > 0 && x.doel_id.length <= 100)
    || (typeof x.doel_id === 'number' && Number.isFinite(x.doel_id))
  if (!doelOk) return { reden: 'doel_id ontbreekt of is ongeldig' }
  if (x.auteur !== undefined && x.auteur !== null && !isTekst(x.auteur, 200)) return { reden: 'auteur is ongeldig' }
  if (x.anker !== undefined && x.anker !== null && !isTekst(x.anker, 5000)) return { reden: 'anker is ongeldig' }
  const ctx = leesContext(x.anker_context, true)
  if (ctx.fout) return { reden: ctx.fout }
  let ouder = null
  if (x.parent_id !== undefined && x.parent_id !== null) {
    const p = x.parent_id
    const ok = (typeof p === 'string' && (LOKAAL_RE.test(p) || /^\d{1,19}$/.test(p))) || (typeof p === 'number' && Number.isSafeInteger(p) && p > 0)
    if (!ok) return { reden: 'parent_id is ongeldig' }
    ouder = p
  }
  if (x.created_at !== undefined && x.created_at !== null && !(isTekst(x.created_at, 40) && Number.isFinite(Date.parse(x.created_at)))) return { reden: 'created_at is geen geldige datum' }
  return {
    item: {
      lokaal_id: x.lokaal_id,
      client_id: x.client_id || x.lokaal_id,
      doel_type: x.doel_type,
      doel_id: String(x.doel_id),
      tekst: x.tekst,
      auteur: x.auteur || '',
      anker: x.anker || null,
      anker_context: ctx.waarde,
      parent_id: ouder,
      created_at: x.created_at || nu.toISOString(),
      lokaal: true,
    },
  }
}

/* Pure validator voor een voorbeeld vóór het delen of importeren: raakt de opslag
   niet aan en schrijft nergens. Accepteert tekst of een al geparseerd object. */
export function leesImportVoorbeeld(invoer, nu = new Date()) {
  const leeg = (fout) => ({ ok: false, fout, items: [], kaart: {}, aantal: 0, afgewezen: [], kaartAfgewezen: 0 })
  let o = invoer
  if (typeof invoer === 'string') {
    if (!invoer.trim()) return leeg('Het bestand is leeg.')
    if (invoer.length > IMPORT_MAX_TEKENS) return leeg('Het bestand is te groot.')
    try { o = JSON.parse(invoer) } catch { return leeg('Dit is geen geldige JSON.') }
  }
  if (!isObject(o)) return leeg('Dit is geen export van de commentwachtrij.')
  if (o.type !== EXPORT_TYPE) return leeg('Dit is geen export van de commentwachtrij.')
  if (o.versie !== EXPORT_VERSIE) return leeg(`Versie ${JSON.stringify(o.versie)} wordt niet ondersteund; verwacht ${EXPORT_VERSIE}.`)
  if (!Array.isArray(o.items)) return leeg('De lijst met comments ontbreekt.')
  if (!isObject(o.kaart)) return leeg('De kaart van lokale nummers ontbreekt.')
  if (o.items.length > IMPORT_MAX_ITEMS) return leeg('Er staan te veel comments in dit bestand.')
  const items = []
  const afgewezen = []
  const gezien = new Set()
  o.items.forEach((x, index) => {
    const r = leesImportItem(x, nu)
    if (r.item && gezien.has(r.item.lokaal_id)) { afgewezen.push({ index, reden: 'komt dubbel voor in het bestand' }); return }
    if (r.item) { gezien.add(r.item.lokaal_id); items.push(r.item) } else afgewezen.push({ index, reden: r.reden })
  })
  const kaart = {}
  let kaartAfgewezen = 0
  for (const [k, v] of Object.entries(o.kaart)) {
    if (LOKAAL_RE.test(k) && geldigGedeeldId(v)) kaart[k] = v
    else kaartAfgewezen++
  }
  return { ok: true, fout: null, items, kaart, aantal: items.length, afgewezen, kaartAfgewezen }
}

/* Voeg een export samen met wat er al staat. Bestaande items blijven ongemoeid,
   al verstuurde items komen niet terug, en dit schrijft nooit naar het netwerk. */
export function importeerWachtrij(invoer, nu = new Date()) {
  const v = leesImportVoorbeeld(invoer, nu)
  if (!v.ok) {
    return { ok: false, fout: v.fout, toegevoegd: 0, aantalToegevoegd: 0, bestond: 0, alVerstuurd: 0, afgewezen: [], opslagBeperkt: opslagBeperkt(), lijst: leesRuw() }
  }
  const kaart = leesKaart()
  for (const [k, id] of Object.entries(v.kaart)) {
    if (!kaart.has(k)) { kaart.set(k, id); zetKaartRegel(k, id) }
  }

  const lijst = leesRuw()
  const ids = new Set(lijst.flatMap((x) => [x.lokaal_id, x.client_id]))
  let bestond = 0
  let alVerstuurd = 0
  const nieuw = []
  for (const item of v.items) {
    if (ids.has(item.lokaal_id) || ids.has(item.client_id)) { bestond++; continue }
    if (kaart.has(item.lokaal_id)) { alVerstuurd++; continue }
    ids.add(item.lokaal_id)
    ids.add(item.client_id)
    nieuw.push(item)
  }
  for (const item of nieuw) schrijfItem(item)
  return {
    ok: true, fout: null,
    toegevoegd: nieuw.length, aantalToegevoegd: nieuw.length,
    bestond, alVerstuurd, afgewezen: v.afgewezen, kaartAfgewezen: v.kaartAfgewezen,
    opslagBeperkt: opslagBeperkt(), lijst: leesRuw(),
  }
}
