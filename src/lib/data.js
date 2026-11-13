import { sb, FUNCTIES, SB_KEY } from './supabase'
import { isBronBlokkade, isOnderhoudspagina } from './bron-check'

/* ---------------------------------------------------------------- lezen */

export async function laadBlokken() {
  const { data, error } = await sb.from('blokken').select('*').order('volgorde')
  if (error) throw error
  return data ?? []
}

export async function laadDocumentenMeta() {
  const { data, error } = await sb
    .from('documenten')
    .select('id,blok_id,soort,titel,pad,bytes,versie,bewerkt_door,updated_at')
    .order('soort').order('titel')
  if (error) throw error
  return data ?? []
}

export async function laadDocument(id) {
  const { data, error } = await sb.from('documenten').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function laadBronnen() {
  const { data, error } = await sb
    .from('bronnen')
    .select('id,blok_id,document_id,titel,url,datum,soort,status,notitie,pagina_titel,opgehaald_op,fout')
    .order('id')
  if (error) throw error
  return data ?? []
}

export async function laadBron(id) {
  const { data, error } = await sb.from('bronnen').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

/* Alle rijen van een query, pagina na pagina, tot een echt lege pagina.
   De server mag minder teruggeven dan gevraagd (max-rows): de volgende pagina begint daarom
   bij het aantal ontvangen rijen, en stopt pas als de server niets meer geeft.
   Lukt een pagina niet, dan is het hele resultaat een fout: nooit een afgekapte lijst. */
const MAX_PAGINAS = 10000

async function leesAllePaginas(bouwQuery, paginaGrootte = 1000) {
  const rijen = []
  const gezien = new Set()
  let offset = 0
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const { data, error } = await bouwQuery().range(offset, offset + paginaGrootte - 1)
    if (error) throw error
    if (!data || data.length === 0) return rijen
    let nieuw = 0
    for (const rij of data) {
      const sleutel = rij?.id == null ? null : String(rij.id)
      if (sleutel !== null) {
        if (gezien.has(sleutel)) continue
        gezien.add(sleutel)
      }
      rijen.push(rij)
      nieuw++
    }
    if (nieuw === 0) throw new Error('De paginering herhaalt dezelfde rijen; het resultaat is niet volledig betrouwbaar.')
    offset += data.length
  }
  throw new Error('Te veel pagina\u2019s bij het laden; het resultaat is niet volledig.')
}

// Notities van één doel, standaard nieuwste eerst. Intern altijd stabiel gepagineerd op (created_at, id).
export async function laadNotities(doelType, doelId, { client = sb, oplopend = false, paginaGrootte = 1000 } = {}) {
  const rijen = await leesAllePaginas(() => client
    .from('notities')
    .select('*')
    .eq('doel_type', doelType)
    .eq('doel_id', String(doelId))
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }), paginaGrootte)
  return oplopend ? rijen : rijen.reverse()
}

export async function laadAlleNotities() {
  const { data, error } = await sb
    .from('notities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

// Voor de comments-laag: alle notities, oudste eerst, stabiel gepagineerd op (created_at, id).
export async function laadNotitiesAlles({ client = sb, paginaGrootte = 1000 } = {}) {
  return leesAllePaginas(() => client
    .from('notities')
    .select('*')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }), paginaGrootte)
}

export async function laadHistoriek(documentId) {
  const { data, error } = await sb
    .from('documenten_historiek')
    .select('*')
    .eq('document_id', documentId)
    .order('versie', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function laadBeslissingen() {
  const { data, error } = await sb.from('beslissingen').select('*').order('id')
  if (error) throw error
  return data ?? []
}

export async function laadValidaties() {
  const { data, error } = await sb.from('validaties').select('*').order('id')
  if (error) throw error
  return data ?? []
}

export async function laadVoorstellen() {
  const { data, error } = await sb.from('voorstellen').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/* ---------------------------------------------------------------- schrijven */

export async function voegNotitieToe(doelType, doelId, tekst, auteur) {
  const { data, error } = await sb
    .from('notities')
    .insert({ doel_type: doelType, doel_id: String(doelId), tekst, auteur })
    .select()
    .single()
  if (error) throw error
  return data
}

const NOTITIE_DOELEN = ['blok', 'document', 'bron']

// Het echte nummer van een notitie via zijn client_id, of null. Alleen lezen.
export async function zoekNotitieIdViaClientId(clientId, client = sb) {
  const { data, error } = await client.from('notities').select('id').eq('client_id', String(clientId)).maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

/* Bewaar een comment precies één keer. De identiteit is `client_id` (= rij.client_id of
   rij.lokaal_id): een herhaald verzoek maakt niets nieuws en overschrijft nooit de bewaarde
   tekst. Daarna lezen we de echte rij terug; ontbreekt die, dan is het een fout, geen succes.
   Een antwoord op een nog lokale ouder wordt via de client_id van die ouder vertaald. */
export async function bewaarNotitieIdempotent(rij, client = sb) {
  const clientId = rij?.client_id || rij?.lokaal_id
  if (!clientId) throw new Error('Een client_id of lokaal_id is nodig om een comment idempotent te bewaren.')
  if (typeof rij.tekst !== 'string' || !rij.tekst.trim()) throw new Error('Een lege comment wordt niet bewaard.')
  if (!NOTITIE_DOELEN.includes(rij.doel_type) || rij.doel_id == null || String(rij.doel_id) === '') {
    throw new Error('Een comment heeft een bekend doel nodig.')
  }
  let ouder = rij.parent_id ?? null
  if (typeof ouder === 'string' && ouder.startsWith('lokaal-')) {
    const echt = await zoekNotitieIdViaClientId(ouder, client)
    if (echt == null) throw new Error('De ouder van dit antwoord is nog niet bewaard. Probeer het straks opnieuw.')
    ouder = echt
  }
  const context = rij.anker_context !== null && typeof rij.anker_context === 'object' && !Array.isArray(rij.anker_context) ? rij.anker_context : null
  const payload = {
    client_id: String(clientId),
    doel_type: rij.doel_type,
    doel_id: String(rij.doel_id),
    tekst: rij.tekst,
    auteur: rij.auteur,
    anker: rij.anker || null,
    anker_context: context,
    parent_id: ouder,
  }
  if (rij.created_at) payload.created_at = rij.created_at
  const { error } = await client.from('notities').upsert(payload, { onConflict: 'client_id', ignoreDuplicates: true })
  if (error) throw error
  const { data, error: leesFout } = await client.from('notities').select('*').eq('client_id', String(clientId)).maybeSingle()
  if (leesFout) throw leesFout
  if (!data || data.id == null || data.id === '') throw new Error('De comment is niet teruggelezen uit de werkbank; ik beschouw hem niet als bewaard.')
  return data
}

export async function verwijderNotitie(id) {
  const { error } = await sb.from('notities').delete().eq('id', id)
  if (error) throw error
}

export async function bewaarDocumentVeilig(doc, nieuweInhoud, wie, client = sb) {
  if (!doc?.id || typeof nieuweInhoud !== 'string') throw new Error('Document of inhoud ontbreekt.')
  // Eerst controleren vóór het toevoegen van historie; vervolgens conditioneel
  // bijwerken om een wijziging tussen die controle en het bewaren op te vangen.
  const { data: huidig, error: leesFout } = await client.from('documenten').select('id,versie,inhoud,updated_at').eq('id', doc.id).single()
  if (leesFout) throw leesFout
  if (!huidig || huidig.versie !== doc.versie || (huidig.inhoud ?? '') !== (doc.inhoud ?? '') || (huidig.updated_at ?? null) !== (doc.updated_at ?? null)) {
    throw new Error('Dit document is elders gewijzigd. Je tekst is niet opgeslagen; kopieer of download je werk en herlaad eerst.')
  }
  const { error: historieFout } = await client.from('documenten_historiek').insert({
    document_id: doc.id, versie: doc.versie, inhoud: doc.inhoud,
    bewerkt_door: doc.bewerkt_door ?? doc.schrijver ?? null,
  })
  if (historieFout) throw historieFout
  let query = client.from('documenten').update({
    inhoud: nieuweInhoud, bytes: new TextEncoder().encode(nieuweInhoud).length,
    versie: (doc.versie ?? 1) + 1, bewerkt_door: wie, updated_at: new Date().toISOString(),
  }).eq('id', doc.id)
  query = doc.versie == null ? query.is('versie', null) : query.eq('versie', doc.versie)
  query = doc.updated_at == null ? query.is('updated_at', null) : query.eq('updated_at', doc.updated_at)
  const { data, error } = await query.select().maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Dit document is intussen gewijzigd. Je tekst is niet opgeslagen; herlaad eerst. Er kan een extra momentopname in de historiek staan.')
  if (String(data.id) !== String(doc.id) || data.inhoud !== nieuweInhoud) throw new Error('De teruggelezen inhoud verschilt. Controleer de actuele stand; je tekst is nog beschikbaar.')
  return data
}

export async function bewaarDocument(doc, nieuweInhoud, wie) {
  return bewaarDocumentVeilig(doc, nieuweInhoud, wie)
}

export async function zetDocumentVersie(docId, inhoud, versie, wie, bronVersie) {
  const { data, error } = await sb
    .from('documenten')
    .update({
      inhoud,
      bytes: new TextEncoder().encode(inhoud).length,
      versie,
      bewerkt_door: wie,
      updated_at: new Date().toISOString(),
    })
    .eq('id', docId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function zetBlokStatus(id, status) {
  const { error } = await sb.from('blokken').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function zetBronStatus(id, status) {
  const { error } = await sb.from('bronnen').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function voegBronToe({ url, titel, blok_id, soort = 'web', auteur }) {
  const { data, error } = await sb
    .from('bronnen')
    .insert({ url, titel: titel || url, blok_id, soort, status: 'ongelezen' })
    .select()
    .single()
  if (error) throw error
  if (auteur) {
    await voegNotitieToe('bron', data.id, `Bron toegevoegd via de werkbank.`, auteur)
  }
  return data
}

export async function legBeslissingVast(beslissing, besluit, client = sb) {
  if (!beslissing?.id || beslissing.status !== 'open' || !String(besluit ?? '').trim()) {
    throw new Error('Een open beslissing en een ingevuld besluit zijn vereist.')
  }
  let query = client.from('beslissingen')
    .update({ status: 'beslist', besluit: besluit.trim(), updated_at: new Date().toISOString() })
    .eq('id', beslissing.id).eq('status', 'open')
  query = beslissing.updated_at == null
    ? query.is('updated_at', null)
    : query.eq('updated_at', beslissing.updated_at)
  const { data, error } = await query.select('id,status,besluit,updated_at').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('De beslissing is intussen gewijzigd. Herlaad en beoordeel opnieuw.')
  if (String(data.id) !== String(beslissing.id) || data.status !== 'beslist' || data.besluit !== besluit.trim()) {
    throw new Error('De teruggelezen beslissing verschilt van de keuze. Controleer de actuele stand.')
  }
  return data
}

export async function zetBeslissing(id, velden) {
  const { error } = await sb.from('beslissingen').update({ ...velden, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function zetValidatie(id, velden) {
  const { error } = await sb.from('validaties').update({ ...velden, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function voegVoorstelToe({ soort, titel, detail, auteur }) {
  const { data, error } = await sb.from('voorstellen').insert({ soort, titel, detail, auteur }).select().single()
  if (error) throw error
  return data
}

export async function zetVoorstel(id, velden) {
  const { error } = await sb.from('voorstellen').update(velden).eq('id', id)
  if (error) throw error
}

export async function voegDocumentToe({ blok_id, soort, titel, auteur }) {
  const { data, error } = await sb
    .from('documenten')
    .insert({
      blok_id,
      soort,
      titel,
      pad: null,
      inhoud: `# ${titel}\n\n_Nieuw document, aangemaakt in de werkbank door ${auteur}._\n`,
      bytes: 60,
      versie: 1,
      bewerkt_door: auteur,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function zoekInhoud(q) {
  const { data, error } = await sb.rpc('zoek_inhoud', { q })
  if (error) throw error
  return data ?? []
}

export async function leesBron(url) {
  const r = await fetch(`${FUNCTIES}/lees-bron`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
    body: JSON.stringify({ url }),
  })
  const resultaat = await r.json()
  if (!r.ok || resultaat?.fout) {
    return { fout: resultaat?.fout || `De bronlezer is tijdelijk niet bereikbaar (HTTP ${r.status}).` }
  }
  // De edgefunctie kan zelf 200 teruggeven terwijl de oorspronkelijke site
  // een 403 of 404 terugstuurde. Een foutpagina is geen leesbare bron.
  const bronStatus = Number(resultaat?.status)
  if (bronStatus === 401 || bronStatus === 403 || bronStatus === 429) {
    return { fout: `De website blokkeert deze lezer (HTTP ${bronStatus}). Open de originele bron.`, status: bronStatus }
  }
  if (bronStatus >= 400) {
    return { fout: `De website kon niet geladen worden (HTTP ${bronStatus}). Open de originele bron.`, status: bronStatus }
  }
  if (isBronBlokkade(resultaat?.titel, resultaat?.tekst)) {
    return { fout: 'De website toont een beveiligingscontrole in plaats van de bron. Open de originele bron.', status: bronStatus }
  }
  if (isOnderhoudspagina(resultaat?.tekst)) {
    return { fout: 'De website meldt tijdelijk onderhoud. Probeer de originele bron.', status: bronStatus }
  }
  if (typeof resultaat?.tekst !== 'string' || !resultaat.tekst.trim()) {
    return { fout: 'De website gaf geen leesbare tekst terug. Open de originele bron.', status: bronStatus }
  }
  return resultaat
}

/* ---------------------------------------------------------------- realtime */

export function abonneer(cb) {
  const kanaal = sb
    .channel('werkbank-data')
    .on('postgres_changes', { event: '*', schema: 'werkbank', table: 'documenten' }, cb)
    .on('postgres_changes', { event: '*', schema: 'werkbank', table: 'notities' }, cb)
    .on('postgres_changes', { event: '*', schema: 'werkbank', table: 'bronnen' }, cb)
    .on('postgres_changes', { event: '*', schema: 'werkbank', table: 'blokken' }, cb)
    .on('postgres_changes', { event: '*', schema: 'werkbank', table: 'beslissingen' }, cb)
    .on('postgres_changes', { event: '*', schema: 'werkbank', table: 'validaties' }, cb)
    .on('postgres_changes', { event: '*', schema: 'werkbank', table: 'voorstellen' }, cb)
    .subscribe()
  return kanaal
}

// Alle kleuren halen ≥ 4,5:1 met witte initialen (WCAG AA), ook in donker.
const KLEUREN = ['#0b6fd6', '#0f766e', '#1a7f37', '#b45309', '#b3400a', '#7c3aed', '#c2255c']

export function kleurVoor(naam) {
  let h = 0
  for (const c of String(naam)) h = (h * 31 + c.charCodeAt(0)) % 997
  return KLEUREN[h % KLEUREN.length]
}

export function initialen(naam) {
  return String(naam || '?')
    .split(/\s+/)
    .map((d) => d[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function bytesLeesbaar(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(n / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`
}

export function datumKort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
}

/* de dagen van de editie, voor de zijbalk en het overzicht */
export const DAG_NAMEN = { 0: 'Dag 0 · Voorbereiding', 1: 'Dag 1 · Anthony', 2: 'Dag 2 · Vastgoed', 3: 'Dag 3 · Fiscaliteit', 4: 'Dag 4 · Afronding' }

/* ---------------------------------------------------------------- klikplekken */

/* Waar klikte de vorige lezer? Alleen het laatste spoor per stuk, geen reeks.
   De tabel bestaat uit één regel per klik; hij groeit traag en wordt nooit
   gebruikt om iemand te volgen, alleen om de plek terug te vinden. */
export async function laadLaatsteKlik(documentId) {
  const { data, error } = await sb
    .from('klikplekken')
    .select('document_id,gebruiker,sectie,fragment,created_at')
    .eq('document_id', String(documentId))
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

export async function bewaarKlik(rij) {
  const { error } = await sb.from('klikplekken').insert(rij)
  if (error) throw error
}

/* ---------------------------------------------------------------- actualiteit */

/* Wat de wachters vonden. Signalen zijn voorstellen: de mens bevestigt of legt weg. */
export async function laadActualiteit() {
  const { data, error } = await sb
    .from('actualiteit')
    .select('id,domein,bron_naam,bron_url,titel,zin,getal,eenheid,bron_datum,status,agent,gevonden_op')
    .order('gevonden_op', { ascending: false })
    .limit(400)
  if (error) throw error
  return data ?? []
}

export async function zetSignaalStatus(id, status) {
  const { error } = await sb.from('actualiteit').update({ status }).eq('id', id)
  if (error) throw error
}
