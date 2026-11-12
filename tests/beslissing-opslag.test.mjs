import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite, D
before(async () => {
  vite = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  D = await vite.ssrLoadModule('/src/lib/data.js')
})
after(async () => { await vite?.close() })

function client(antwoord) {
  const log = []
  const query = {
    update(v) { log.push(['update', v]); return this },
    eq(k, v) { log.push(['eq', k, v]); return this },
    is(k, v) { log.push(['is', k, v]); return this },
    select(k) { log.push(['select', k]); return this },
    async maybeSingle() { return antwoord },
  }
  return { log, from(t) { log.push(['from', t]); return query } }
}

test('vastleggen controleert atomair de eerdere status en versie en leest het resultaat terug', async () => {
  assert.equal(typeof D.legBeslissingVast, 'function')
  const sb = client({ data: { id: 1, status: 'beslist', besluit: 'Keuze' }, error: null })
  const resultaat = await D.legBeslissingVast({ id: 1, status: 'open', updated_at: '2026-11-12T09:00:00Z' }, 'Keuze', sb)
  assert.equal(resultaat.status, 'beslist')
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'id' && r[2] === 1))
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'status' && r[2] === 'open'))
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'updated_at' && r[2] === '2026-11-12T09:00:00Z'))
  assert.ok(sb.log.some((r) => r[0] === 'select'))
})

test('een gelijktijdig gewijzigde beslissing kan niet stil worden overschreven', async () => {
  const sb = client({ data: null, error: null })
  await assert.rejects(D.legBeslissingVast({ id: 1, status: 'open', updated_at: 'oud' }, 'Nieuwe keuze', sb), /intussen gewijzigd/)
})

test('een afwijkend teruggelezen besluit wordt niet als succes gemeld', async () => {
  const sb = client({ data: { id: 1, status: 'beslist', besluit: 'ander besluit' }, error: null })
  await assert.rejects(D.legBeslissingVast({ id: 1, status: 'open', updated_at: 'oud' }, 'Juiste keuze', sb), /controle|verschilt/i)
})

test('een reeds gesloten beslissing stuurt geen update', async () => {
  const sb = client({ data: {}, error: null })
  await assert.rejects(D.legBeslissingVast({ id: 1, status: 'beslist' }, 'Nieuwe keuze', sb), /open beslissing/)
  assert.deepEqual(sb.log, [])
})
