import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sleutelVoorKlad, leesKlad, bewaarKlad, wisKlad } from '../src/lib/comment-draft.js'

/* Een concept per auteur, per doel en per gesprek: zo verliest niemand zijn
   half geschreven antwoord doordat de walkthrough en het paneel dezelfde
   comment allebei tonen, of doordat iemand even de modal sluit. */

function nepOpslag() {
  const kaart = new Map()
  return {
    getItem: (k) => (kaart.has(k) ? kaart.get(k) : null),
    setItem: (k, v) => kaart.set(k, String(v)),
    removeItem: (k) => kaart.delete(k),
  }
}

test('de sleutel is uniek per auteur, doel en gesprek (root-id of "nieuw")', () => {
  const a = sleutelVoorKlad({ auteur: 'Victor', doelType: 'document', doelId: 9, threadId: null })
  const b = sleutelVoorKlad({ auteur: 'Victor', doelType: 'document', doelId: 9, threadId: 5 })
  const c = sleutelVoorKlad({ auteur: 'Anthony', doelType: 'document', doelId: 9, threadId: null })
  assert.notEqual(a, b)
  assert.notEqual(a, c)
})

test('bewaarKlad en leesKlad geven dezelfde tekst terug, ook na "navigeren" (opnieuw lezen)', () => {
  const opslag = nepOpslag()
  const sleutel = sleutelVoorKlad({ auteur: 'Victor', doelType: 'document', doelId: 9, threadId: null })
  bewaarKlad(sleutel, 'Dit is nog niet verstuurd', { opslag })
  assert.equal(leesKlad(sleutel, { opslag }), 'Dit is nog niet verstuurd')
})

test('wisKlad ruimt alleen dat ene concept op, de rest blijft staan', () => {
  const opslag = nepOpslag()
  const a = sleutelVoorKlad({ auteur: 'Victor', doelType: 'document', doelId: 9, threadId: null })
  const b = sleutelVoorKlad({ auteur: 'Victor', doelType: 'document', doelId: 9, threadId: 5 })
  bewaarKlad(a, 'concept a', { opslag })
  bewaarKlad(b, 'concept b', { opslag })
  wisKlad(a, { opslag })
  assert.equal(leesKlad(a, { opslag }), '')
  assert.equal(leesKlad(b, { opslag }), 'concept b')
})

test('zonder opslag (geblokkeerd) faalt het stil: geen duurzame garantie, geen crash', () => {
  const sleutel = sleutelVoorKlad({ auteur: 'Victor', doelType: 'document', doelId: 9, threadId: null })
  assert.doesNotThrow(() => bewaarKlad(sleutel, 'tekst', { opslag: null }))
  assert.equal(leesKlad(sleutel, { opslag: null }), '')
})

test('een leeg concept wist zichzelf in plaats van een lege regel te bewaren', () => {
  const opslag = nepOpslag()
  const sleutel = sleutelVoorKlad({ auteur: 'Victor', doelType: 'document', doelId: 9, threadId: null })
  bewaarKlad(sleutel, 'eerst wat tekst', { opslag })
  bewaarKlad(sleutel, '   ', { opslag })
  assert.equal(leesKlad(sleutel, { opslag }), '')
})
