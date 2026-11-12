import { test } from 'node:test'
import assert from 'node:assert/strict'

async function laad() {
  try { return await import('../src/lib/navigatie.js') } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
    throw e
  }
}

test('de al actieve route kiezen verandert geen goedkeuringsstatus, ook niet bij klad', async () => {
  const module = await laad()
  assert.equal(typeof module.beoordeelNavigatie, 'function', 'routecontrole ontbreekt')
  assert.equal(module.beoordeelNavigatie('#/', '#/', false), 'geen')
  assert.equal(module.beoordeelNavigatie('#/', '#/', true), 'geen')
  assert.equal(module.beoordeelNavigatie('#/', '', false), 'geen')
})

test('onbewaarde velden bewaken elkaar onafhankelijk', async () => {
  const { zetVies, wisVies, isVies } = await import('../src/lib/vies.js')
  wisVies()
  const stopEerste = zetVies(() => true)
  const stopTweede = zetVies(() => true)
  assert.equal(typeof stopEerste, 'function', 'elk veld moet uitsluitend zijn eigen bewaking kunnen opruimen')
  assert.equal(isVies(), true)
  stopEerste()
  assert.equal(isVies(), true, 'een ander onbewaard veld moet bewaakt blijven')
  stopTweede()
  assert.equal(isVies(), false)
})

test('een onbewaard veld bewaakt ook verversen en kan zichzelf afmelden', async () => {
  let module = {}
  try { module = await import('../src/hooks/useOnbewaard.js') } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e
  }
  assert.equal(typeof module.activeerOnbewaard, 'function', 'bewaking voor onbewaarde invoer ontbreekt')
  const { wisVies, isVies } = await import('../src/lib/vies.js')
  wisVies()
  const handlers = new Set()
  const venster = { addEventListener: (_, fn) => handlers.add(fn), removeEventListener: (_, fn) => handlers.delete(fn) }
  const stop = module.activeerOnbewaard(venster)
  assert.equal(isVies(), true)
  const gebeurtenis = { voorkomen: false, preventDefault() { this.voorkomen = true } }
  for (const fn of handlers) fn(gebeurtenis)
  assert.equal(gebeurtenis.voorkomen, true)
  stop()
  assert.equal(isVies(), false)
  assert.equal(handlers.size, 0)
})

test('doorklikpad bewaart de werkelijke route en herstelt browsergeschiedenis', async () => {
  const module = await laad()
  assert.equal(typeof module.bepaalSpoor, 'function')
  const begin = ['#/', '#/planning']
  const vooruit = module.bepaalSpoor(begin, null, '#/beslissing/1')
  assert.deepEqual(vooruit, ['#/', '#/planning', '#/beslissing/1'])
  assert.deepEqual(begin, ['#/', '#/planning'])
  assert.deepEqual(module.bepaalSpoor(vooruit, begin, '#/planning'), begin)
  assert.deepEqual(module.bepaalSpoor([], ['javascript:alert(1)'], '#/'), ['#/'])
})

test('het doorklikpad noemt de lokale agentproef bij naam', async () => {
  const module = await laad()
  assert.equal(module.naamVoorRoute('#/agent-proef'), 'Agentproef')
})

test('routes in het doorklikpad krijgen inhoudelijke namen', async () => {
  const module = await laad()
  assert.equal(typeof module.naamVoorRoute, 'function')
  const data = { beslissingen: [{ id: 1, titel: 'Het GGR-anker' }], documentenMeta: [{ id: 72, titel: 'spreektekst', blok_id: '4.4' }] }
  assert.equal(module.naamVoorRoute('#/planning', data), 'Planning')
  assert.equal(module.naamVoorRoute('#/beslissing/1', data), 'Het GGR-anker')
  assert.equal(module.naamVoorRoute('#/doc/72', data), '4.4 · spreektekst')
})

test('de vorige vergelijking blijft geselecteerd wanneer je terugkomt', async () => {
  const m = await laad()
  assert.equal(typeof m.herstelVergelijking, 'function')
  assert.equal(m.herstelVergelijking('4.4'), '4.4')
  assert.equal(m.herstelVergelijking('onbekend'), '1.3')
  assert.equal(m.herstelVergelijking(null), '1.3')
})

test('losgemaakte pagina mag een opgeslagen scrollpositie niet wissen', async () => {
  const module = await laad()
  assert.equal(typeof module.slaScrollBijAfsluitenOp, 'function')
  const posities = { '#/': 500 }
  module.slaScrollBijAfsluitenOp(posities, '#/', { isConnected: false, scrollTop: 0 })
  assert.equal(posities['#/'], 500)
  module.slaScrollBijAfsluitenOp(posities, '#/', { isConnected: true, scrollTop: 400 })
  assert.equal(posities['#/'], 400)
})

test('een dagdeel definitief maken vraagt eerst om bevestiging', async () => {
  let m = {}
  try { m = await import('../src/lib/blok-status.js') } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }
  assert.equal(typeof m.vraagtStatusReview, 'function')
  assert.equal(m.vraagtStatusReview('Review', 'Final'), true)
  assert.equal(m.vraagtStatusReview('Final', 'Final'), false)
  assert.equal(m.vraagtStatusReview('Concept', 'Review'), false)
})

test('een gewijzigd invoervenster vraagt bij sluiten eerst bevestiging', async () => {
  let m = {}
  try { m = await import('../src/lib/dialoog.js') } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }
  assert.equal(typeof m.vraagtAfsluiten, 'function')
  assert.equal(m.vraagtAfsluiten('Klad', ''), true)
  assert.equal(m.vraagtAfsluiten('  ', ''), true)
  assert.equal(m.vraagtAfsluiten('Ongewijzigd', 'Ongewijzigd'), false)
})

test('een andere route vraagt alleen bevestiging bij onbewaarde tekst', async () => {
  const module = await laad()
  assert.equal(typeof module.beoordeelNavigatie, 'function')
  assert.equal(module.beoordeelNavigatie('#/bronnen', '#/', true), 'vraag')
  assert.equal(module.beoordeelNavigatie('#/bronnen', '#/', false), 'ga')
  assert.equal(module.beoordeelNavigatie('', '#/', true), 'geen')
})
