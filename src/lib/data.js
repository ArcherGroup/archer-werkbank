import { sb, FUNCTIES, SB_KEY } from './supabase'

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

export async function laadNotities(doelType, doelId) {
  const { data, error } = await sb
    .from('notities')
    .select('*')
    .eq('doel_type', doelType)
    .eq('doel_id', String(doelId))
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
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

export async function verwijderNotitie(id) {
  const { error } = await sb.from('notities').delete().eq('id', id)
  if (error) throw error
}

export async function bewaarDocument(doc, nieuweInhoud, wie) {
  // oude versie naar de historiek, dan het document zelf
  const { error: hfout } = await sb.from('documenten_historiek').insert({
    document_id: doc.id,
    versie: doc.versie,
    inhoud: doc.inhoud,
    bewerkt_door: doc.bewerkt_door ?? doc.schrijver ?? null,
  })
  if (hfout) throw hfout
  const { data, error } = await sb
    .from('documenten')
    .update({
      inhoud: nieuweInhoud,
      bytes: new TextEncoder().encode(nieuweInhoud).length,
      versie: (doc.versie ?? 1) + 1,
      bewerkt_door: wie,
      updated_at: new Date().toISOString(),
    })
    .eq('id', doc.id)
    .select()
    .single()
  if (error) throw error
  return data
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

export async function bewaarBronPagina(id, { pagina_titel, pagina_tekst, fout }) {
  const { error } = await sb
    .from('bronnen')
    .update({
      pagina_titel: pagina_titel ?? null,
      pagina_tekst: pagina_tekst ?? null,
      fout: fout ?? null,
      opgehaald_op: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
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
  return r.json()
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

const KLEUREN = ['#0a84ff', '#30b0c7', '#22a06b', '#f0a020', '#e0492f', '#8b5cf6', '#d6336c']

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
