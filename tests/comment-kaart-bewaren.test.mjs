import test from 'node:test'
import assert from 'node:assert/strict'

/* Regressie: de kaart lokaal nummer -> echt nummer mocht nooit stil worden
   opgeruimd. De oude KAART_MAX=2000 gooide de oudste mapping weg, waardoor een
   later antwoord op een oude lokale wortel zijn ouder kwijtraakte. */

function deelOpslag() {
  const values = new Map()
  globalThis.localStorage = {
    get length() { return values.size },
    key(i) { return [...values.keys()][i] ?? null },
    getItem(k) { return values.get(k) ?? null },
    setItem(k, v) { values.set(k, String(v)) },
    removeItem(k) { values.delete(k) },
  }
  return values
}

const REGEL = 'werkbank_comment_kaart:regel:'

test('ruim 2000 kaartregels: geen enkele bevestigde mapping verdwijnt stil', async () => {
  const was = globalThis.localStorage
  const values = deelOpslag()
  try {
    values.set('werkbank_comment_opslag_versie', '2')
    // De oudste mapping is de lokale wortel van een oud gesprek.
    values.set(REGEL + 'lokaal-wortel', JSON.stringify({ t: 0, id: 5 }))
    for (let i = 1; i <= 2100; i++) values.set(REGEL + 'lokaal-o' + i, JSON.stringify({ t: i, id: 100 + i }))

    const a = await import('../src/lib/comment-wachtrij.js?kaart-groot-a')
    // Een nieuwe bevestigde mapping duwt het totaal ruim over de oude grens.
    const r = a.importeerWachtrij(JSON.stringify({ type: 'werkbank-comment-wachtrij', versie: 1, items: [], kaart: { 'lokaal-nieuw': 99999 } }))
    assert.equal(r.ok, true, r.fout)
    assert.equal(r.kaartAfgewezen, 0)

    // Niets opgeruimd: de oude wortel én de nieuwe mapping staan er allebei.
    assert.equal(a.zoekGedeeldId('lokaal-wortel'), 5)
    assert.equal(a.zoekGedeeldId('lokaal-nieuw'), 99999)
    const overgebleven = [...values.keys()].filter((k) => k.startsWith(REGEL))
    assert.equal(overgebleven.length, 2102)

    // Na herladen (nieuwe module) staat alles er nog, ook de oude wortel.
    const b = await import('../src/lib/comment-wachtrij.js?kaart-groot-b')
    assert.equal(b.zoekGedeeldId('lokaal-wortel'), 5)
    assert.equal(b.zoekGedeeldId('lokaal-nieuw'), 99999)
    assert.equal([...values.keys()].filter((k) => k.startsWith(REGEL)).length, 2102)

    // Een later antwoord op de oude lokale wortel vindt zijn ouder nog steeds.
    const k = b.voegToeAanWachtrij({ lokaal_id: 'lokaal-antwoord', client_id: 'lokaal-antwoord', doel_type: 'document', doel_id: '16', tekst: 'Antwoord op de oude wortel.', auteur: 'x', parent_id: 'lokaal-wortel' })
    assert.equal(b.alsNotitie(k.item).parent_id, 5)
    assert.equal(b.alsNotitie(k.item).lokaal_parent_id, 'lokaal-wortel')
  } finally {
    if (was === undefined) delete globalThis.localStorage
    else globalThis.localStorage = was
  }
})
