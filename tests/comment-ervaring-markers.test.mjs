import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { markeerAnkers, ruimAnkersOp, bouwTekstIndex } from '../src/lib/comment-markers.js'

const artikel = (html) => {
  const dom = new JSDOM(`<article id="md">${html}</article>`)
  return dom.window.document.getElementById('md')
}

const BASIS = '<p>Van het vermogen staat <strong>51 procent</strong> in cash. Eén procent staat in <em>ETF\'s</em>. Later staat nog eens 51 procent in obligaties.</p>'
const note = (id, extra = {}) => ({ id, auteur: 'Victor', tekst: `comment ${id}`, opgelost: false, parent_id: null, ...extra })

test('bouwTekstIndex rijgt tekst uit meerdere knopen aaneen, als platte tekst', () => {
  const root = artikel(BASIS)
  const { tekst } = bouwTekstIndex(root)
  assert.match(tekst, /Van het vermogen staat 51 procent in cash\. Eén procent staat in ETF's\./)
})

test('een selectie die over strong/em-knopen loopt krijgt toch één doorlopend anker', () => {
  const root = artikel(BASIS)
  const { tekst } = bouwTekstIndex(root)
  const frase = 'staat 51 procent in cash'
  const start = tekst.indexOf(frase)
  const n = note(1, { anker: frase, anker_context: { exact: frase, prefix: tekst.slice(Math.max(0, start - 20), start), suffix: tekst.slice(start + frase.length, start + frase.length + 20), start } })
  const aantal = markeerAnkers(root, [n])
  assert.equal(aantal, 1)
  const marks = [...root.querySelectorAll('mark.comment-anker[data-comment~="1"]')]
  assert.ok(marks.length >= 2, 'het anker loopt over meerdere knopen, dus meerdere mark-stukken')
  assert.equal(marks.map((m) => m.textContent).join(''), frase)
  assert.equal(root.querySelectorAll('button.comment-pin').length, 1, 'precies één pin voor dit ene anker')
})

test('een herhaalde frase met anker_context pakt de juiste van de twee, niet de eerste', () => {
  const root = artikel(BASIS)
  const { tekst } = bouwTekstIndex(root)
  const tweedeStart = tekst.lastIndexOf('51 procent')
  const ctx = {
    exact: '51 procent',
    prefix: tekst.slice(tweedeStart - 20, tweedeStart),
    suffix: tekst.slice(tweedeStart + 10, tweedeStart + 30),
    start: tweedeStart,
  }
  const n = note(1, { anker: '51 procent', anker_context: ctx })
  markeerAnkers(root, [n])
  const mark = root.querySelector('mark.comment-anker')
  // De eerste 51 procent zit in een <strong>; de tweede staat in gewone tekst.
  assert.equal(mark.closest('strong'), null, 'moet de tweede (losse) 51 procent zijn, niet die in de <strong>')
})

test('twee overlappende comments geven allebei een pin, zonder een mark in een mark', () => {
  const root = artikel('<p>Van het vermogen staat 51 procent in cash en nog wat.</p>')
  const { tekst } = bouwTekstIndex(root)
  const a = note('a', { anker: '51 procent in cash', anker_context: { exact: '51 procent in cash', start: tekst.indexOf('51 procent in cash') } })
  const b = note('b', { anker: 'procent in cash en nog', anker_context: { exact: 'procent in cash en nog', start: tekst.indexOf('procent in cash en nog') } })
  markeerAnkers(root, [a, b])
  assert.equal(root.querySelectorAll('button.comment-pin').length, 2, 'beide comments krijgen een pin')
  for (const mark of root.querySelectorAll('mark.comment-anker')) {
    assert.equal(mark.querySelector('mark'), null, 'geen geneste marks')
  }
})

test('een onopgeloste ankertekst wordt gemeld, niet stilletjes overgeslagen', () => {
  const root = artikel(BASIS)
  let gemeld = null
  const n = note(1, { anker: 'tekst die hier niet staat', anker_context: { exact: 'tekst die hier niet staat' } })
  const aantal = markeerAnkers(root, [n], { opOnopgelost: (lijst) => { gemeld = lijst } })
  assert.equal(aantal, 0)
  assert.ok(Array.isArray(gemeld) && gemeld.length === 1 && gemeld[0].id === 1)
})

test('oude, platte ankers zonder context werken nog steeds (achterwaarts compatibel)', () => {
  const root = artikel(BASIS)
  const aantal = markeerAnkers(root, [note(1, { anker: "ETF's" })])
  assert.equal(aantal, 1)
  assert.equal(root.querySelector('mark.comment-anker').textContent, "ETF's")
})

test('opnieuw markeren ruimt eerst alles op, ook bij meerdere mark-stukken per comment', () => {
  const root = artikel(BASIS)
  const voor = root.innerHTML
  const { tekst } = bouwTekstIndex(root)
  const frase = 'staat 51 procent in cash'
  const start = tekst.indexOf(frase)
  const n = note(1, { anker: frase, anker_context: { exact: frase, start } })
  markeerAnkers(root, [n])
  markeerAnkers(root, [n])
  assert.equal(root.querySelectorAll('button.comment-pin').length, 1)
  ruimAnkersOp(root)
  assert.equal(root.innerHTML, voor)
})

test('pinnummers lopen in leesorde, niet in volgorde van de comment-lijst', () => {
  const root = artikel(BASIS)
  const { tekst } = bouwTekstIndex(root)
  const later = note(2, { anker: '51 procent in obligaties', anker_context: { exact: '51 procent in obligaties', start: tekst.indexOf('51 procent in obligaties') } })
  const eerder = note(1, { anker: "ETF's", anker_context: { exact: "ETF's", start: tekst.indexOf("ETF's") } })
  markeerAnkers(root, [later, eerder])
  const pins = [...root.querySelectorAll('button.comment-pin')]
  assert.equal(pins[0].dataset.comment, '1')
  assert.equal(pins[1].dataset.comment, '2')
})
