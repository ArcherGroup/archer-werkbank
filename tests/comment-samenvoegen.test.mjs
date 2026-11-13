import test from 'node:test'
import assert from 'node:assert/strict'
let voegCommentsSamen
try { ({ voegCommentsSamen } = await import('../src/lib/comment-samenvoegen.js')) } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }

test('gedeeltelijke synchronisatie houdt ongestuurde antwoorden aan de echte wortel gekoppeld', () => {
  assert.equal(typeof voegCommentsSamen, 'function', 'Veilig samenvoegen ontbreekt')
  const server = [{ id: 40, client_id: 'lokaal-ouder', tekst: 'Gedeelde wortel' }]
  const lokaal = [
    { id: 'lokaal-ouder', client_id: 'lokaal-ouder', tekst: 'Gedeelde wortel', lokaal: true },
    { id: 'lokaal-reactie', client_id: 'lokaal-reactie', parent_id: 'lokaal-ouder', tekst: 'Nog niet gedeeld', lokaal: true },
  ]
  const uit = voegCommentsSamen(server, lokaal)
  assert.equal(uit.length, 2)
  assert.equal(uit[0].id, 40)
  assert.equal(uit[1].parent_id, 40)
  assert.equal(uit[1].lokaal, true)
  assert.equal(lokaal[1].parent_id, 'lokaal-ouder', 'Originele wachtrij niet veranderen')
})
