import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { markeerAnkers, ruimAnkersOp } from '../src/lib/comment-markers.js'

const artikel = () => {
  const dom = new JSDOM('<article id="md"><p>Van het vermogen staat 51 procent in cash. Eén procent staat in ETF\'s.</p><p>De kosten van 0,1 tot 0,3 procent maken het verschil.</p></article>')
  return dom.window.document.getElementById('md')
}

const note = (id, anker, extra = {}) => ({ id, auteur: 'Victor', tekst: `comment ${id}`, anker, opgelost: false, parent_id: null, ...extra })

test('een anker krijgt een mark en een genummerde pin', () => {
  const root = artikel()
  const aantal = markeerAnkers(root, [note(1, '51 procent in cash'), note(2, 'De kosten van 0,1 tot 0,3 procent')])
  assert.equal(aantal, 2)
  assert.equal(root.querySelectorAll('mark.comment-anker').length, 2)
  assert.equal(root.querySelectorAll('button.comment-pin').length, 2)
  assert.equal(root.querySelector('mark.comment-anker').textContent, '51 procent in cash')
  assert.equal(root.querySelector('button.comment-pin').textContent, '1')
  assert.equal(root.querySelectorAll('button.comment-pin')[1].textContent, '2')
})

test('opnieuw markeren ruimt de oude pinnen eerst op, zonder tekst te verliezen', () => {
  const root = artikel()
  const voor = root.textContent
  markeerAnkers(root, [note(1, '51 procent in cash')])
  markeerAnkers(root, [note(1, '51 procent in cash')])
  assert.equal(root.querySelectorAll('mark.comment-anker').length, 1)
  assert.equal(root.querySelectorAll('button.comment-pin').length, 1)
  ruimAnkersOp(root)
  assert.equal(root.textContent, voor)
})

test('opgeloste comments, reacties en onbekende ankers krijgen geen pin', () => {
  const root = artikel()
  const aantal = markeerAnkers(root, [
    note(1, '51 procent in cash', { opgelost: true }),
    note(2, 'De kosten van 0,1 tot 0,3 procent', { parent_id: 9 }),
    note(3, 'staat niet in de tekst'),
    note(4, null),
  ])
  assert.equal(aantal, 0)
  assert.equal(root.querySelectorAll('button.comment-pin').length, 0)
})

test('ruimAnkersOp geeft de oorspronkelijke tekst terug', () => {
  const root = artikel()
  const voor = root.innerHTML
  markeerAnkers(root, [note(1, '51 procent in cash'), note(2, 'De kosten van 0,1 tot 0,3 procent')])
  ruimAnkersOp(root)
  assert.equal(root.querySelectorAll('button.comment-pin').length, 0)
  assert.equal(root.querySelectorAll('mark.comment-anker').length, 0)
  assert.equal(root.innerHTML, voor)
})

test('de pin meldt zijn comment bij een klik', () => {
  const root = artikel()
  let geklikt = null
  markeerAnkers(root, [note(7, '51 procent in cash')], { opKlik: (id) => { geklikt = id } })
  root.querySelector('button.comment-pin').dispatchEvent(new root.ownerDocument.defaultView.Event('click', { bubbles: true }))
  assert.equal(geklikt, 7)
})