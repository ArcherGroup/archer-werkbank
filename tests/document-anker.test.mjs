import test from 'node:test'
import assert from 'node:assert/strict'
import { valideerNotitieAnker } from '../src/lib/document.js'

test('één letterlijk fragment kan aan een notitie worden gekoppeld', () => {
  assert.equal(valideerNotitieAnker('Begin. Unieke zin. Einde.', 'Unieke zin.'), 'Unieke zin.')
})

test('lege, te lange, dubbele en niet-letterlijke selecties zijn geen veilig anker', () => {
  for (const selectie of ['', ' ', 'x'.repeat(2001), 'dubbel', 'vette tekst']) {
    assert.throws(() => valideerNotitieAnker('dubbel en dubbel, **vette** tekst', selectie))
  }
})
