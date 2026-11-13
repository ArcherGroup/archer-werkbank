import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maakAnkerContext, vindAnkerBereik, ankerStatus } from '../src/lib/quote-anker.js'

/* De kern van "welke passage bedoelde deze comment eigenlijk": een citaat met
   wat ervoor en erna staat, zodat een herhaald woord niet zomaar de eerste
   de beste match wordt en een licht gewijzigde tekst toch herkend wordt. */

const TEKST = 'Van het vermogen staat 51 procent in cash. Eén procent staat in ETF\'s. Later staat nog eens 51 procent in obligaties.'

test('maakAnkerContext snijdt het citaat en de rand eromheen uit op offsets', () => {
  const start = TEKST.indexOf('51 procent in cash')
  const end = start + '51 procent in cash'.length
  const ctx = maakAnkerContext(TEKST, start, end, { documentVersie: 3 })
  assert.equal(ctx.exact, '51 procent in cash')
  assert.equal(ctx.start, start)
  assert.equal(ctx.end, end)
  assert.equal(ctx.document_versie, 3)
  assert.ok(TEKST.slice(0, start).endsWith(ctx.prefix))
  assert.ok(TEKST.slice(end).startsWith(ctx.suffix))
})

test('een unieke frase wordt altijd gevonden, ook zonder rand', () => {
  const bereik = vindAnkerBereik(TEKST, { exact: 'ETF\'s' })
  assert.deepEqual(bereik, { start: TEKST.indexOf("ETF's"), end: TEKST.indexOf("ETF's") + "ETF's".length })
})

test('een herhaalde frase wordt met de rand onderscheiden, niet met de eerste match', () => {
  const tweedeStart = TEKST.lastIndexOf('51 procent')
  const ctx = maakAnkerContext(TEKST, tweedeStart, tweedeStart + '51 procent'.length)
  const bereik = vindAnkerBereik(TEKST, ctx)
  assert.equal(bereik.start, tweedeStart, 'de tweede 51 procent moet gevonden worden, niet de eerste')
})

test('zonder enige rand of hint blijft een dubbelzinnige frase onopgelost', () => {
  const bereik = vindAnkerBereik(TEKST, { exact: '51 procent' })
  assert.equal(bereik, null)
})

test('ankerStatus: gevonden via anker_context', () => {
  const start = TEKST.indexOf("ETF's")
  const ctx = maakAnkerContext(TEKST, start, start + "ETF's".length)
  const status = ankerStatus(TEKST, { anker: "ETF's", anker_context: ctx })
  assert.equal(status.status, 'gevonden')
  assert.equal(status.bereik.start, start)
})

test('ankerStatus: legacy platte anker werkt nog als hij uniek is', () => {
  const status = ankerStatus(TEKST, { anker: "ETF's", anker_context: null })
  assert.equal(status.status, 'gevonden')
})

test('ankerStatus: legacy platte anker die dubbel voorkomt is dubbelzinnig, geen giswerk', () => {
  const status = ankerStatus(TEKST, { anker: '51 procent', anker_context: null })
  assert.equal(status.status, 'dubbelzinnig')
})

test('ankerStatus: een gewijzigde passage meldt zich eerlijk, geen stille hernoeming', () => {
  const ctx = { exact: '51 procent in contanten', prefix: 'vermogen staat ', suffix: '. Eén procent' }
  const status = ankerStatus(TEKST, { anker: '51 procent in contanten', anker_context: ctx })
  assert.equal(status.status, 'gewijzigd')
})

test('ankerStatus: zonder enig anker is het een algemene comment', () => {
  const status = ankerStatus(TEKST, { anker: null, anker_context: null })
  assert.equal(status.status, 'geen')
})
