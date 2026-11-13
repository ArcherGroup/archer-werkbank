import test from 'node:test'
import assert from 'node:assert/strict'

test('twee tabbladen die tegelijk offline bewaren verliezen geen van beide comments na herladen', async () => {
  const was = globalThis.localStorage
  const values = new Map()
  let tussenkomst = null
  globalThis.localStorage = {
    get length() { return values.size },
    key(i) { return [...values.keys()][i] ?? null },
    getItem(k) { return values.get(k) ?? null },
    setItem(k, v) {
      if (tussenkomst && k === 'werkbank_comment_wachtrij') { const f = tussenkomst; tussenkomst = null; f() }
      values.set(k, String(v))
    },
    removeItem(k) { values.delete(k) },
  }
  try {
    const a = await import('../src/lib/comment-wachtrij.js?gelijktijdig-a')
    const b = await import('../src/lib/comment-wachtrij.js?gelijktijdig-b')
    const maak = (id, auteur) => ({ lokaal_id: id, client_id: id, doel_type: 'document', doel_id: '16', tekst: `Bericht van ${auteur}`, auteur })
    tussenkomst = () => b.voegToeAanWachtrij(maak('lokaal-tab-b', 'Tweede lezer'))
    a.voegToeAanWachtrij(maak('lokaal-tab-a', 'Eerste lezer'))
    const herladen = await import('../src/lib/comment-wachtrij.js?na-herladen')
    assert.deepEqual(herladen.leesWachtrij().map(n => n.client_id).sort(), ['lokaal-tab-a', 'lokaal-tab-b'])
    assert.equal(herladen.opslagStatus().duurzaam, true)
  } finally {
    if (was === undefined) delete globalThis.localStorage
    else globalThis.localStorage = was
  }
})

/* Gedeelde opslag voor meerdere module-instanties, met een haak vóór elke schrijfactie. */
function deelOpslag() {
  const values = new Map()
  const haken = []
  globalThis.localStorage = {
    get length() { return values.size },
    key(i) { return [...values.keys()][i] ?? null },
    getItem(k) { return values.get(k) ?? null },
    setItem(k, v) { for (const h of [...haken]) h(k, 'set'); values.set(k, String(v)) },
    removeItem(k) { for (const h of [...haken]) h(k, 'remove'); values.delete(k) },
  }
  return { values, haken }
}
const maak = (id, extra = {}) => ({ lokaal_id: id, client_id: id, doel_type: 'document', doel_id: '16', tekst: `Bericht ${id}`, auteur: 'x', ...extra })
const metOpslag = (fn) => async () => {
  const was = globalThis.localStorage
  try { await fn(deelOpslag()) } finally { if (was === undefined) delete globalThis.localStorage; else globalThis.localStorage = was }
}

test('een ACK in tab A en een nieuw bericht in tab B tegelijk: geen opstanding en geen verlies', metOpslag(async (o) => {
  const a = await import('../src/lib/comment-wachtrij.js?ack-a')
  const b = await import('../src/lib/comment-wachtrij.js?ack-b')
  a.voegToeAanWachtrij(maak('lokaal-oud'))
  let eenmaal = false
  o.haken.push((k) => { if (!eenmaal && k.startsWith('werkbank_comment_kaart')) { eenmaal = true; b.voegToeAanWachtrij(maak('lokaal-nieuw')) } })
  await a.verwerkWachtrij(async (i) => { if (i.lokaal_id === 'lokaal-nieuw') throw new Error('offline'); return { id: 41 } })
  const na = await import('../src/lib/comment-wachtrij.js?ack-na')
  assert.deepEqual(na.leesWachtrij().map(n => n.lokaal_id), ['lokaal-nieuw'])
  assert.equal(na.zoekGedeeldId('lokaal-oud'), 41)
  assert.equal(b.zoekGedeeldId('lokaal-oud'), 41)
}))

test('verwijderen in tab A terwijl tab B bewaart laat het verwijderde item niet terugkomen', metOpslag(async () => {
  const a = await import('../src/lib/comment-wachtrij.js?del-a')
  const b = await import('../src/lib/comment-wachtrij.js?del-b')
  a.voegToeAanWachtrij(maak('lokaal-weg'))
  a.verwijderUitWachtrij('lokaal-weg')
  b.voegToeAanWachtrij(maak('lokaal-blijft'))
  const na = await import('../src/lib/comment-wachtrij.js?del-na')
  assert.deepEqual(na.leesWachtrij().map(n => n.lokaal_id), ['lokaal-blijft'])
}))

test('parallelle flushes in twee tabbladen houden elkaars kaartmapping en ouder-kind link', metOpslag(async (o) => {
  const a = await import('../src/lib/comment-wachtrij.js?par-a')
  const b = await import('../src/lib/comment-wachtrij.js?par-b')
  a.voegToeAanWachtrij(maak('lokaal-ouder-a'))
  b.voegToeAanWachtrij(maak('lokaal-ouder-b'))
  const [ra, rb] = await Promise.all([
    a.verwerkWachtrij(async (i) => ({ id: i.lokaal_id.endsWith('-a') ? 11 : 22 })),
    b.verwerkWachtrij(async (i) => ({ id: i.lokaal_id.endsWith('-a') ? 11 : 22 })),
  ])
  assert.equal(ra.fouten.length + rb.fouten.length, 0)
  const na = await import('../src/lib/comment-wachtrij.js?par-na')
  assert.equal(na.zoekGedeeldId('lokaal-ouder-a'), 11)
  assert.equal(na.zoekGedeeldId('lokaal-ouder-b'), 22)
  // een antwoord op een ouder die in het andere tabblad verstuurd is, vindt zijn ouder
  const k = b.voegToeAanWachtrij(maak('lokaal-kind', { parent_id: 'lokaal-ouder-a' }))
  assert.equal(b.alsNotitie(k.item).parent_id, 11)
  assert.equal(na.telWachtrij(), 1)
}))

test('een kaartregel van tab B tijdens het schrijven van een kaartregel van tab A gaat niet verloren', metOpslag(async (o) => {
  const a = await import('../src/lib/comment-wachtrij.js?kaart-a')
  const b = await import('../src/lib/comment-wachtrij.js?kaart-b')
  a.voegToeAanWachtrij(maak('lokaal-ka'))
  let eenmaal = false
  o.haken.push((k) => {
    if (eenmaal || !k.startsWith('werkbank_comment_kaart')) return
    eenmaal = true
    b.importeerWachtrij(JSON.stringify({ type: 'werkbank-comment-wachtrij', versie: 1, items: [], kaart: { 'lokaal-kb': 22 } }))
  })
  await a.verwerkWachtrij(async () => ({ id: 11 }))
  const na = await import('../src/lib/comment-wachtrij.js?kaart-na')
  assert.equal(na.zoekGedeeldId('lokaal-ka'), 11)
  assert.equal(na.zoekGedeeldId('lokaal-kb'), 22)
  assert.deepEqual(JSON.parse(o.values.get('werkbank_comment_kaart')).constructor, Object)
}))

test('een oude browser met alleen array en kaart wordt zonder verlies overgenomen en blijft geen bron', metOpslag(async (o) => {
  o.values.set('werkbank_comment_wachtrij', JSON.stringify([maak('lokaal-oud-1'), maak('lokaal-oud-2', { parent_id: 'lokaal-al' })]))
  o.values.set('werkbank_comment_kaart', JSON.stringify({ 'lokaal-al': 5 }))
  const a = await import('../src/lib/comment-wachtrij.js?mig-a')
  assert.deepEqual(a.leesWachtrij().map(n => n.lokaal_id), ['lokaal-oud-1', 'lokaal-oud-2'])
  assert.equal(a.zoekGedeeldId('lokaal-al'), 5)
  a.verwijderUitWachtrij('lokaal-oud-1')
  // de afgeleide cache die nog het oude item toont, mag het niet laten terugkomen
  o.values.set('werkbank_comment_wachtrij', JSON.stringify([maak('lokaal-oud-1')]))
  const b = await import('../src/lib/comment-wachtrij.js?mig-b')
  assert.deepEqual(b.leesWachtrij().map(n => n.lokaal_id), ['lokaal-oud-2'])
  assert.equal(JSON.parse(o.values.get('werkbank_comment_kaart'))['lokaal-al'], 5)
}))
