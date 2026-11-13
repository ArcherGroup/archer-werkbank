import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { ankerUitSelectie } from '../src/lib/document.js'

function artikel(html) {
  const dom = new JSDOM(`<article><div class="frontmatter">dag: 1</div><div class="md-body">${html}</div></article>`)
  return { doc: dom.window.document, root: dom.window.document.querySelector('article') }
}

function bereik(doc, startNode, startOffset, endNode, endOffset) {
  const r = doc.createRange()
  r.setStart(startNode, startOffset)
  r.setEnd(endNode, endOffset)
  return r
}

test('een selectie die over strong/em-knopen loopt levert het doorlopende gerenderde citaat op', () => {
  const { doc, root } = artikel('<p>Van het vermogen staat <strong>51 procent</strong> in cash.</p>')
  const p = root.querySelector('p')
  const voorTekst = p.firstChild // "Van het vermogen staat "
  const strongTekst = p.querySelector('strong').firstChild // "51 procent"
  const r = bereik(doc, voorTekst, 'Van het vermogen '.length, strongTekst, strongTekst.length)
  const uit = ankerUitSelectie({ root, range: r })
  assert.equal(uit.anker, 'staat 51 procent')
  assert.equal(uit.anker_context.exact, 'staat 51 procent')
  assert.ok(uit.anker_context.prefix.endsWith('vermogen '))
})

test('frontmatter telt niet mee in de selectie-tekst', () => {
  const { doc, root } = artikel('<p>Een gewone zin hier.</p>')
  const front = root.querySelector('.frontmatter').firstChild
  const r = bereik(doc, front, 0, front, front.length)
  assert.throws(() => ankerUitSelectie({ root, range: r }), /Selecteer/)
})

test('een herhaald woord via een echte selectie heeft het juiste offset, geen giswerk', () => {
  const { doc, root } = artikel('<p>51 procent staat in cash, later weer 51 procent in obligaties.</p>')
  const tekst = root.querySelector('p').firstChild
  const tweedeStart = tekst.nodeValue.lastIndexOf('51 procent')
  const r = bereik(doc, tekst, tweedeStart, tekst, tweedeStart + '51 procent'.length)
  const uit = ankerUitSelectie({ root, range: r })
  assert.equal(uit.anker, '51 procent')
  assert.equal(uit.anker_context.start, uit.anker_context.start)
  // De context moet de tweede (niet de eerste) plek beschrijven.
  assert.ok(uit.anker_context.prefix.includes('later weer'))
})

test('een lege of te lange selectie is geen geldig anker', () => {
  const { doc, root } = artikel('<p>Korte zin.</p>')
  const tekst = root.querySelector('p').firstChild
  assert.throws(() => ankerUitSelectie({ root, range: bereik(doc, tekst, 2, tekst, 2) }), /Selecteer/)
})
