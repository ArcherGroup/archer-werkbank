/* De gedeelde agent staat hard uit tot login, database en veiligheid afzonderlijk
   zijn beoordeeld. Een weergegeven naam is nooit een authenticatiesessie. */
export const GEDEELDE_AGENT_INGESCHAKELD = false

const taakVelden = 'id,notitie_id,document_id,document_versie,status,fout_code,model,tokens_in,tokens_uit,kost_usd,created_at,klaar_op'
const voorstelVelden = 'id,opdracht_id,soort,oorspronkelijk,voorstel,uitleg,bronstatus,status,beoordeeld_op,beoordelingsreden,created_at'
const geldigId = (id) => Number.isSafeInteger(id) && id > 0

async function controleerSessie(client, ingeschakeld) {
  if (ingeschakeld !== true) throw new Error('agent_niet_vrijgegeven')
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  if (!data?.session?.user?.id || !data?.session?.access_token) throw new Error('niet_ingelogd')
}

export async function vingerafdrukVoorstel(voorstelId, bekeken) {
  if (!geldigId(voorstelId) || bekeken?.voorstel_id !== voorstelId || !geldigId(bekeken?.document_versie) ||
      typeof bekeken?.oorspronkelijk !== 'string' || typeof bekeken?.voorstel !== 'string' ||
      typeof bekeken?.uitleg !== 'string' || !globalThis.crypto?.subtle) throw new Error('ongeldige_beoordeling')
  const encoder = new TextEncoder()
  const velden = [String(voorstelId), String(bekeken.document_versie), bekeken.oorspronkelijk, bekeken.voorstel, bekeken.uitleg]
  const bericht = velden.map((v) => `${encoder.encode(v).length}:${v}`).join('')
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(bericht)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function combineerAgentOpdrachten(taken, voorstellen) {
  const voorstellenPerTaak = new Map((Array.isArray(voorstellen) ? voorstellen : []).map((v) => [v.opdracht_id, v]))
  const resultaat = Object.create(null)
  for (const taak of Array.isArray(taken) ? taken : []) {
    if (!taak || taak.notitie_id == null || Object.hasOwn(resultaat, taak.notitie_id)) continue
    const voorstel = voorstellenPerTaak.get(taak.id)
    resultaat[taak.notitie_id] = voorstel ? {
      ...taak, soort: voorstel.soort, voorstel_id: voorstel.id, oorspronkelijk: voorstel.oorspronkelijk,
      voorstel: voorstel.voorstel, uitleg: voorstel.uitleg, bronstatus: voorstel.bronstatus,
      beoordeling: ['toegepast', 'afgewezen'].includes(voorstel.status) ? { besluit: voorstel.status } : null,
    } : taak
  }
  return resultaat
}

export async function statusGedeeldeAgent({ client, ingeschakeld = GEDEELDE_AGENT_INGESCHAKELD }) {
  await controleerSessie(client, ingeschakeld)
  const { data, error } = await client.rpc('agent_status')
  if (error) throw error
  if (typeof data !== 'boolean') throw new Error('status_niet_bevestigd')
  return data
}

export async function laadGedeeldeAgent(documentId, { client, ingeschakeld = GEDEELDE_AGENT_INGESCHAKELD }) {
  if (!geldigId(documentId)) throw new Error('ongeldig_document')
  await controleerSessie(client, ingeschakeld)
  const { data: taken, error } = await client.from('agent_opdrachten').select(taakVelden)
    .eq('document_id', documentId).order('created_at', { ascending: false }).order('id', { ascending: false })
  if (error) throw error
  if (!taken?.length) return Object.create(null)
  const { data: voorstellen, error: voorstelFout } = await client.from('agent_voorstellen').select(voorstelVelden)
    .in('opdracht_id', taken.map((t) => t.id))
  if (voorstelFout) throw voorstelFout
  return combineerAgentOpdrachten(taken, voorstellen)
}

export async function vraagGedeeldeAgent(notitieId, documentId, { client, ingeschakeld = GEDEELDE_AGENT_INGESCHAKELD }) {
  if (!geldigId(notitieId) || !geldigId(documentId)) throw new Error('ongeldige_opdracht')
  await controleerSessie(client, ingeschakeld)
  const { data, error } = await client.rpc('vraag_agent', { p_notitie: notitieId, p_document: documentId })
  if (error) throw error
  if (!geldigId(data)) throw new Error('opdracht_niet_bevestigd')
  return data
}

export async function beoordeelGedeeldeAgent(voorstelId, besluit, { client, ingeschakeld = GEDEELDE_AGENT_INGESCHAKELD, bekekenVoorstel }) {
  if (!geldigId(voorstelId) || !['goedgekeurd', 'afgewezen'].includes(besluit)) throw new Error('ongeldige_beoordeling')
  await controleerSessie(client, ingeschakeld)
  const p_review_hash = await vingerafdrukVoorstel(voorstelId, bekekenVoorstel)
  const p_actie = besluit === 'goedgekeurd' ? 'toepassen' : 'afwijzen'
  const { data, error } = await client.rpc('beoordeel_agentvoorstel', { p_voorstel: voorstelId, p_actie, p_reden: '', p_review_hash })
  if (error) throw error
  if (data !== (p_actie === 'toepassen' ? 'toegepast' : 'afgewezen')) throw new Error('beoordeling_niet_bevestigd')
  return data
}
