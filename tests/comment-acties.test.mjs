import test from 'node:test'
import assert from 'node:assert/strict'
let zetCommentStatus
try { ({ zetCommentStatus } = await import('../src/lib/comment-acties.js')) } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }

function clientMetTeruglezing(terug) {
  const calls = []
  const rij = { id: 7, doel_type: 'document', doel_id: '16', opgelost: false, afgewezen: false, auteur: 'Eerste schrijver', tekst: 'Bewaar dit gesprek' }
  return { calls, rij, from(tabel) {
    let patch = null
    const q = {
      update(p) { patch = p; calls.push(['update', tabel]); return q },
      select() { calls.push(['lees', tabel]); return q },
      eq(k, v) { calls.push(['eq', k, v]); return q },
      single() { return Promise.resolve({ data: terug ? { ...rij, ...terug } : { ...rij }, error: null }) },
      then(resolve, reject) { Object.assign(rij, patch); return Promise.resolve({ error: null }).then(resolve, reject) },
    }
    return q
  } }
}

test('een commentstatus wordt pas bevestigd na exacte teruglezing van dat gesprek', async () => {
  assert.equal(typeof zetCommentStatus, 'function', 'Bevestigde statusovergang ontbreekt')
  const c = clientMetTeruglezing()
  const rij = await zetCommentStatus(c, c.rij, 'opgelost', 'Reviewer')
  assert.equal(rij.opgelost, true)
  assert.equal(rij.opgelost_door, 'Reviewer')
  assert.equal(rij.tekst, 'Bewaar dit gesprek')
  assert.equal(rij.auteur, 'Eerste schrijver')
  assert.ok(c.calls.some(([a]) => a === 'lees'))
  assert.equal(c.calls.filter(([a, k, v]) => a === 'eq' && k === 'id' && v === 7).length, 2)
})

test('dezelfde opgeslagen tijd in PostgreSQL-notatie geldt als bevestiging', async () => {
  const c = clientMetTeruglezing({ opgelost_op: '2026-11-13T11:00:00+00:00' })
  const rij = await zetCommentStatus(c, c.rij, 'opgelost', 'Reviewer', '', new Date('2026-11-13T11:00:00Z'))
  assert.equal(rij.opgelost, true)
})
