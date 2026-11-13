import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite, D
before(async () => {
  vite = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  D = await vite.ssrLoadModule('/src/lib/data.js')
})
after(async () => { await vite?.close() })

/* Een nagebootste Supabase-client met een notities-tabel in het geheugen.
   `cap` is de servermaximum per verzoek (zoals max-rows), `faal` laat een verzoek mislukken. */
function nepClient({ rijs = [], cap = Infinity, faalOpPagina = null, negeerRange = false, geenReadback = false, upsertFout = null } = {}) {
  const log = []
  const tabel = rijs.map((r) => ({ ...r }))
  let volgendId = Math.max(0, ...tabel.map((r) => Number(r.id) || 0)) + 1
  let paginaTeller = 0
  const client = {
    log, tabel,
    from(naam) {
      log.push(['from', naam])
      const q = { filters: [], orders: [], bereik: null }
      q.select = (k) => { log.push(['select', k]); q.soort = 'select'; return q }
      q.eq = (k, v) => { log.push(['eq', k, v]); q.filters.push([k, v]); return q }
      q.order = (k, o = {}) => { log.push(['order', k, o]); q.orders.push([k, o.ascending !== false]); return q }
      q.range = (a, b) => { log.push(['range', a, b]); q.bereik = [a, b]; return q }
      q.limit = (n) => { log.push(['limit', n]); q.max = n; return q }
      q.upsert = async (payload, opties) => {
        log.push(['upsert', payload, opties])
        if (upsertFout) return { data: null, error: upsertFout }
        const bestaat = tabel.some((r) => r.client_id != null && r.client_id === payload.client_id)
        if (!bestaat) tabel.push({ id: volgendId++, created_at: '2026-11-13T10:00:00Z', ...payload })
        else if (!opties?.ignoreDuplicates) Object.assign(tabel.find((r) => r.client_id === payload.client_id), payload)
        return { data: null, error: null }
      }
      q.maybeSingle = async () => {
        const rijen = uitvoeren(q)
        if (geenReadback) return { data: null, error: null }
        return { data: rijen[0] ?? null, error: null }
      }
      q.then = (ok, nee) => {
        try {
          paginaTeller++
          if (faalOpPagina === paginaTeller) return Promise.resolve({ data: null, error: { message: 'pagina stuk' } }).then(ok, nee)
          return Promise.resolve({ data: uitvoeren(q), error: null }).then(ok, nee)
        } catch (e) { return Promise.reject(e).then(ok, nee) }
      }
      return q
    },
  }
  function uitvoeren(q) {
    let r = tabel.filter((x) => q.filters.every(([k, v]) => String(x[k]) === String(v)))
    for (const [k, asc] of [...q.orders].reverse()) {
      r = r.slice().sort((a, b) => {
        const x = a[k], y = b[k]
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
        return asc ? c : -c
      })
    }
    if (q.bereik && !negeerRange) r = r.slice(q.bereik[0], q.bereik[1] + 1)
    else if (q.bereik && negeerRange) r = r.slice(0, q.bereik[1] + 1)
    r = r.slice(0, cap)
    return r.map((x) => ({ ...x }))
  }
  return client
}

const comment = (extra = {}) => ({
  lokaal_id: 'lokaal-1-aaaa', doel_type: 'document', doel_id: 9, tekst: 'Zet de procenten erbij.', auteur: 'Hermes',
  anker: '51 procent cash', anker_context: { exact: '51 procent cash', prefix: 'bijna ', suffix: ' van de', start: 12, end: 27, document_versie: 4 }, parent_id: null, ...extra,
})

/* ------------------------------------------------ bewaarNotitieIdempotent */

test('bewaarNotitieIdempotent maakt een notitie één keer aan via upsert met ignoreDuplicates en leest hem terug', async () => {
  const sb = nepClient()
  const rij = await D.bewaarNotitieIdempotent(comment(), sb)
  const up = sb.log.find((r) => r[0] === 'upsert')
  assert.ok(up, 'upsert gebruikt')
  assert.equal(up[2].onConflict, 'client_id')
  assert.equal(up[2].ignoreDuplicates, true)
  assert.equal(up[1].client_id, 'lokaal-1-aaaa')
  assert.equal(up[1].doel_id, '9')
  assert.equal(up[1].auteur, 'Hermes')
  assert.equal(up[1].anker, '51 procent cash')
  assert.deepEqual(up[1].anker_context, { exact: '51 procent cash', prefix: 'bijna ', suffix: ' van de', start: 12, end: 27, document_versie: 4 })
  assert.equal(up[1].parent_id, null)
  for (const k of ['id', 'lokaal', 'wachtend', 'lokaal_id', 'created_at']) assert.ok(!(k in up[1]) || k === 'created_at', `${k} niet meesturen`)
  assert.equal(rij.id, 1)
  assert.equal(rij.client_id, 'lokaal-1-aaaa')
  assert.equal(sb.tabel.length, 1)
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'client_id' && r[2] === 'lokaal-1-aaaa'), 'readback op client_id')
})

test('een tweede aanroep met dezelfde client_id maakt niets nieuws en overschrijft de bewaarde tekst niet', async () => {
  const sb = nepClient()
  const eerste = await D.bewaarNotitieIdempotent(comment(), sb)
  const tweede = await D.bewaarNotitieIdempotent(comment({ tekst: 'Heel andere tekst', auteur: 'Anthony' }), sb)
  assert.equal(sb.tabel.length, 1)
  assert.equal(tweede.id, eerste.id)
  assert.equal(tweede.tekst, 'Zet de procenten erbij.')
  assert.equal(tweede.auteur, 'Hermes')
})

test('client_id wint van lokaal_id, en zonder beide wordt er niets geschreven', async () => {
  const sb = nepClient()
  const rij = await D.bewaarNotitieIdempotent(comment({ client_id: 'lokaal-eigen-1' }), sb)
  assert.equal(rij.client_id, 'lokaal-eigen-1')
  const leeg = nepClient()
  await assert.rejects(() => D.bewaarNotitieIdempotent(comment({ lokaal_id: undefined }), leeg), /client_id/)
  assert.equal(leeg.log.filter((r) => r[0] === 'upsert').length, 0)
})

test('een lege tekst of onbekend doel wordt geweigerd zonder te schrijven', async () => {
  for (const extra of [{ tekst: '   ' }, { tekst: undefined }, { doel_type: 'rekening' }, { doel_id: '' }]) {
    const sb = nepClient()
    await assert.rejects(() => D.bewaarNotitieIdempotent(comment(extra), sb))
    assert.equal(sb.log.filter((r) => r[0] === 'upsert').length, 0)
  }
})

test('een ontbrekende terugleesrij of een upsertfout is een fout, geen succes', async () => {
  await assert.rejects(() => D.bewaarNotitieIdempotent(comment(), nepClient({ geenReadback: true })), /teruggelezen|terug/i)
  await assert.rejects(() => D.bewaarNotitieIdempotent(comment(), nepClient({ upsertFout: { message: 'rls' } })), (e) => e.message === 'rls')
})

test('een lokale ouder wordt via zijn client_id naar het echte nummer vertaald, en anders is het een fout', async () => {
  const sb = nepClient({ rijs: [{ id: 41, client_id: 'lokaal-0-wortel', tekst: 'wortel', auteur: 'Victor', doel_type: 'document', doel_id: '9', created_at: '2026-11-13T09:00:00Z' }] })
  const kind = await D.bewaarNotitieIdempotent(comment({ parent_id: 'lokaal-0-wortel' }), sb)
  assert.equal(kind.parent_id, 41)
  const up = sb.log.find((r) => r[0] === 'upsert')
  assert.equal(up[1].parent_id, 41)

  const sb2 = nepClient()
  await assert.rejects(() => D.bewaarNotitieIdempotent(comment({ parent_id: 'lokaal-onbekend' }), sb2), /ouder/)
  assert.equal(sb2.log.filter((r) => r[0] === 'upsert').length, 0)

  const sb3 = nepClient()
  const echt = await D.bewaarNotitieIdempotent(comment({ parent_id: 17 }), sb3)
  assert.equal(echt.parent_id, 17)
})

test('verschillende auteurs met dezelfde tekst en dezelfde tijd blijven allebei bestaan', async () => {
  const sb = nepClient()
  await D.bewaarNotitieIdempotent(comment({ lokaal_id: 'lokaal-1-a', auteur: 'Victor' }), sb)
  await D.bewaarNotitieIdempotent(comment({ lokaal_id: 'lokaal-2-b', auteur: 'Anthony' }), sb)
  assert.deepEqual(sb.tabel.map((r) => r.auteur), ['Victor', 'Anthony'])
})

/* ------------------------------------------------ volledige, stabiel gepagineerde reads */

const veel = (n) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, doel_type: 'document', doel_id: '9', auteur: 'Victor', tekst: `t${i + 1}`,
  // veel gelijke tijdstempels om de tie-break op id af te dwingen
  created_at: `2026-11-12T10:${String(Math.floor(i / 5)).padStart(2, '0')}:00Z`,
}))

test('laadNotitiesAlles haalt alle pagina’s op, ook als de server minder teruggeeft dan gevraagd', async () => {
  const sb = nepClient({ rijs: veel(23), cap: 4 })
  const alles = await D.laadNotitiesAlles({ client: sb })
  assert.equal(alles.length, 23)
  assert.deepEqual(alles.map((r) => r.id), Array.from({ length: 23 }, (_, i) => i + 1))
  assert.equal(new Set(alles.map((r) => r.id)).size, 23)
})

test('laadNotitiesAlles stopt pas bij een echt lege pagina en vraagt dus een extra pagina', async () => {
  const sb = nepClient({ rijs: veel(8), cap: 4 })
  await D.laadNotitiesAlles({ client: sb, paginaGrootte: 4 })
  const ranges = sb.log.filter((r) => r[0] === 'range')
  assert.deepEqual(ranges.map((r) => [r[1], r[2]]), [[0, 3], [4, 7], [8, 11]])
})

test('de volgende pagina begint bij het aantal ontvangen rijen, niet bij de gevraagde paginagrootte', async () => {
  const sb = nepClient({ rijs: veel(10), cap: 3 })
  const alles = await D.laadNotitiesAlles({ client: sb, paginaGrootte: 1000 })
  assert.equal(alles.length, 10)
  const ranges = sb.log.filter((r) => r[0] === 'range').map((r) => r[1])
  assert.deepEqual(ranges, [0, 3, 6, 9, 10])
})

test('laadNotitiesAlles sorteert stabiel op created_at en dan id', async () => {
  const sb = nepClient({ rijs: veel(12).reverse(), cap: 5 })
  const alles = await D.laadNotitiesAlles({ client: sb })
  const orders = sb.log.filter((r) => r[0] === 'order').slice(0, 2)
  assert.deepEqual(orders.map((o) => [o[1], o[2].ascending]), [['created_at', true], ['id', true]])
  assert.deepEqual(alles.map((r) => r.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('laadNotitiesAlles geeft geen afgekapte lijst terug als een pagina faalt', async () => {
  const sb = nepClient({ rijs: veel(10), cap: 4, faalOpPagina: 2 })
  await assert.rejects(() => D.laadNotitiesAlles({ client: sb }), (e) => e.message === 'pagina stuk')
})

test('een server die range negeert levert een fout op in plaats van eindeloos of dubbel laden', async () => {
  const sb = nepClient({ rijs: veel(10), cap: 4, negeerRange: true })
  await assert.rejects(() => D.laadNotitiesAlles({ client: sb, paginaGrootte: 4 }), /pagin/i)
})

test('laadNotitiesAlles zonder argumenten blijft bestaan als functie met dezelfde naam', () => {
  assert.equal(typeof D.laadNotitiesAlles, 'function')
  assert.equal(typeof D.laadNotities, 'function')
  assert.equal(typeof D.laadAlleNotities, 'function')
  assert.equal(typeof D.voegNotitieToe, 'function')
})

test('laadNotities filtert op doel, pagineert volledig en blijft nieuwste eerst', async () => {
  const rijs = [...veel(9), { id: 50, doel_type: 'blok', doel_id: '1.3', auteur: 'X', tekst: 'ander', created_at: '2026-11-12T10:00:00Z' }]
  const sb = nepClient({ rijs, cap: 2 })
  const uit = await D.laadNotities('document', 9, { client: sb })
  assert.equal(uit.length, 9)
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'doel_type' && r[2] === 'document'))
  assert.ok(sb.log.some((r) => r[0] === 'eq' && r[1] === 'doel_id' && r[2] === '9'))
  assert.deepEqual(uit.map((r) => r.id), [9, 8, 7, 6, 5, 4, 3, 2, 1])
})

test('laadNotities kan ook oplopend', async () => {
  const sb = nepClient({ rijs: veel(5), cap: 2 })
  const uit = await D.laadNotities('document', 9, { client: sb, oplopend: true })
  assert.deepEqual(uit.map((r) => r.id), [1, 2, 3, 4, 5])
})
