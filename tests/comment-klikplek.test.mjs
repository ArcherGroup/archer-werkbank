import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { plekVanKlik } from '../src/lib/secties.js'

test('commentpinnummers worden geen onderdeel van de bewaarde leesplek', () => {
  const dom = new JSDOM('<p>Een belegger kent zijn <mark>jaarlijkse kosten</mark><button class="comment-pin">1</button> en kiest bewust.</p>')
  const uit = plekVanKlik({ markdown:'## Kosten\n\nEen belegger kent zijn jaarlijkse kosten en kiest bewust.',element:dom.window.document.querySelector('p'),documentId:16,gebruiker:'Test' })
  assert.equal(uit.fragment,'Een belegger kent zijn jaarlijkse kosten en kiest bewust.')
  dom.window.close()
})
