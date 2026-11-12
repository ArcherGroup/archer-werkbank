import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite, D
before(async () => {
  vite = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  D = await vite.ssrLoadModule('/src/lib/data.js')
})
after(async () => { await vite?.close() })

function client(huidig, opgeslagen) {
  const log = []
  const q = {
    select(k) { log.push(['select', k]); return this },
    eq(k, v) { log.push(['eq', k, v]); return this },
    is(k, v) { log.push(['is', k, v]); return this },
    update(v) { log.push(['update', v]); return this },
    async single() { return { data: huidig, error: null } },
    async maybeSingle() { return { data: opgeslagen, error: null } },
  }
  return { log, from(t) { log.push(['from', t]); if (t === 'documenten_historiek') return { async insert(v) { log.push(['historiek', v]); return { error: null } } }; return q } }
}

test('download bij een mislukte bewerking bevat het klad, niet de oude serverversie', async () => {
  let m = {}
  try { m = await import('../src/lib/document.js') } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }
  assert.equal(typeof m.inhoudVoorDownload, 'function')
  assert.equal(m.inhoudVoorDownload('bewerk', 'Mijn onbewaarde tekst', 'Oude tekst'), 'Mijn onbewaarde tekst')
  assert.equal(m.inhoudVoorDownload('lees', 'Klad', 'Oude tekst'), 'Oude tekst')
})

test('een paginalink gebruikt geselecteerde tekst en bewaart de rest van het document', async () => {
  let m = {}
  try { m = await import('../src/lib/document.js') } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }
  assert.equal(typeof m.voegInterneLinkIn, 'function')
  assert.deepEqual(m.voegInterneLinkIn('Lees deze bron verder', 5, 14, 'Titel', '#/doc/74'), { tekst: 'Lees [deze bron](#/doc/74) verder', positie: 26 })
  assert.throws(() => m.voegInterneLinkIn('x', 0, 1, 'x', 'javascript:alert(1)'), /link/i)
})

test('een elders gewijzigd document wordt niet overschreven en krijgt geen onnodige historiek', async () => {
  assert.equal(typeof D.bewaarDocumentVeilig, 'function')
  const sb = client({ id: 2, versie: 2, inhoud: 'Collega', updated_at: 'nieuw' }, null)
  await assert.rejects(D.bewaarDocumentVeilig({ id: 2, versie: 1, inhoud: 'Oud', updated_at: 'oud' }, 'Mijn tekst', 'Victor', sb), /gewijzigd/i)
  assert.equal(sb.log.some((r) => r[0] === 'update' || r[0] === 'historiek'), false)
})

test('een geldige documentupdate bewaakt versie en tijdstip en controleert de teruggelezen inhoud', async () => {
  const doc = { id: 2, versie: 1, inhoud: 'Oud', updated_at: 'oud' }
  const sb = client(doc, { id: 2, versie: 2, inhoud: 'Mijn tekst' })
  const resultaat = await D.bewaarDocumentVeilig(doc, 'Mijn tekst', 'Victor', sb)
  assert.equal(resultaat.inhoud, 'Mijn tekst')
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'versie' && r[2] === 1))
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'updated_at' && r[2] === 'oud'))
})

test('een gelijktijdige update na de eerste controle geeft een conflict', async () => {
  const doc = { id: 2, versie: 1, inhoud: 'Oud', updated_at: 'oud' }
  const sb = client(doc, null)
  await assert.rejects(D.bewaarDocumentVeilig(doc, 'Mijn tekst', 'Victor', sb), /intussen gewijzigd/i)
})
