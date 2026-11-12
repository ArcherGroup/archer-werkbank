import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { combineerAgentOpdrachten, vraagGedeeldeAgent, beoordeelGedeeldeAgent, statusGedeeldeAgent, vingerafdrukVoorstel } from '../src/lib/agent-api.js'

const bekeken = { voorstel_id: 7, document_versie: 2, oorspronkelijk: 'oud €', voorstel: 'nieuw 🌱', uitleg: 'Aanpassing.' }
function verwachteHash() {
  const velden = ['7', '2', bekeken.oorspronkelijk, bekeken.voorstel, bekeken.uitleg]
  const bericht = velden.map((v) => `${Buffer.byteLength(v, 'utf8')}:${v}`).join('')
  return createHash('sha256').update(bericht, 'utf8').digest('hex')
}

test('de vingerafdruk omvat precies de getoonde versie en teksten, ook bij unicode', async () => {
  assert.equal(await vingerafdrukVoorstel(7, bekeken), verwachteHash())
  await assert.rejects(vingerafdrukVoorstel(8, bekeken), /ongeldige_beoordeling/)
})

test('status en resultaat worden gekoppeld zonder een beoordeling te verzinnen', () => {
  const taken = [{ id: 2, notitie_id: 8, document_id: 12, status: 'klaar' }]
  const voorstellen = [{ id: 7, opdracht_id: 2, status: 'voorgesteld', soort: 'wijziging', oorspronkelijk: 'oud', voorstel: 'nieuw' }]
  const map = combineerAgentOpdrachten(taken, voorstellen)
  assert.equal(map[8].status, 'klaar')
  assert.equal(map[8].voorstel_id, 7)
  assert.equal(map[8].beoordeling, null)
  assert.equal(map[8].oorspronkelijk, 'oud')
})

test('een beslissing toont het door de database teruggegeven resultaat', () => {
  const map = combineerAgentOpdrachten([{ id: 2, notitie_id: 8, status: 'klaar' }], [{ id: 7, opdracht_id: 2, status: 'toegepast', soort: 'wijziging' }])
  assert.equal(map[8].status, 'klaar')
  assert.equal(map[8].beoordeling.besluit, 'toegepast')
})

test('de standaard uitgeschakelde agent doet nooit een backendaanroep', async () => {
  let calls = 0
  const client = { auth: { getSession: () => { calls++; throw Error('mocht niet') } }, rpc: () => { calls++; throw Error('mocht niet') } }
  await assert.rejects(vraagGedeeldeAgent(8, 12, { client, ingeschakeld: false }), /agent_niet_vrijgegeven/)
  await assert.rejects(beoordeelGedeeldeAgent(7, 'goedgekeurd', { client, ingeschakeld: false }), /agent_niet_vrijgegeven/)
  assert.equal(calls, 0)
})

test('een UI-goedkeuring is een expliciete serveractie en moet bevestigd terugkomen', async () => {
  const calls = []
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u' }, access_token: 'test' } }, error: null }) },
    rpc: async (naam, data) => { calls.push({ naam, data }); return { data: 'toegepast', error: null } } }
  assert.equal(await beoordeelGedeeldeAgent(7, 'goedgekeurd', { client, ingeschakeld: true, bekekenVoorstel: bekeken }), 'toegepast')
  assert.deepEqual(calls, [{ naam: 'beoordeel_agentvoorstel', data: { p_voorstel: 7, p_actie: 'toepassen', p_reden: '', p_review_hash: verwachteHash() } }])
})

test('een niet-bevestigde beoordeling wordt nooit als toegepast getoond', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u' }, access_token: 'test' } } }) },
    rpc: async () => ({ data: null, error: null }) }
  await assert.rejects(beoordeelGedeeldeAgent(7, 'goedgekeurd', { client, ingeschakeld: true, bekekenVoorstel: bekeken }), /beoordeling_niet_bevestigd/)
})

test('activering komt uit de database en wordt niet aangenomen', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u' }, access_token: 'test' } } }) },
    rpc: async () => ({ data: false, error: null }) }
  assert.equal(await statusGedeeldeAgent({ client, ingeschakeld: true }), false)
})

test('naam of sessie zonder access-token is geen echte inlog', async () => {
  let calls = 0
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }) }, rpc: () => { calls++ } }
  await assert.rejects(vraagGedeeldeAgent(8, 12, { client, ingeschakeld: true }), /niet_ingelogd/)
  assert.equal(calls, 0)
})
