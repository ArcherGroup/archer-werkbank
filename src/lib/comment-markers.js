/* Comment-pinnen in een gerenderd markdown-artikel.

   We lezen de hele tekst van het artikel plat, over alle knopen heen (ook
   <strong>, <em>, <a> en tabellen), en zoeken daarin waar elk comment-anker
   staat. Dat bereik zetten we om in een of meer <mark>-stukken — meerdere
   als het anker over knopen heen loopt — met daarachter één genummerde pin.
   Zo zie je op het scherm waar een comment hoort, zonder de opmaak van het
   stuk aan te passen en zonder dat twee comments op dezelfde plek elkaar in
   de weg zitten. */

import { vindAnkerBereik } from './quote-anker.js'

export function ruimAnkersOp(root) {
  if (!root) return
  for (const pin of root.querySelectorAll('button.comment-pin')) pin.remove()
  for (const mark of root.querySelectorAll('mark.comment-anker')) {
    const ouder = mark.parentNode
    if (!ouder) continue
    while (mark.firstChild) ouder.insertBefore(mark.firstChild, mark)
    ouder.removeChild(mark)
  }
  // Tekstknopen die aan weerszijden van een opgeruimde mark stonden, horen
  // weer één knoop te zijn — anders vindt de volgende ronde zijn ankers niet.
  root.normalize?.()
}

/* Alle tekstknopen van het artikel, als één platte string met voor elke
   knoop zijn start- en eindoffset daarin. Knopnummers (de pins zelf) en hun
   titel/aria-tekst horen daar nooit bij, anders vervuilt een eerdere pin de
   zoektocht van de volgende ronde. */
export function bouwTekstIndex(root) {
  const knopen = []
  let tekst = ''
  if (!root) return { tekst, knopen }
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode(node) {
      if (node.parentElement?.closest('button.comment-pin, .frontmatter')) return 2 /* REJECT */
      return 1 /* ACCEPT */
    },
  })
  let node = walker.nextNode()
  while (node) {
    const waarde = node.nodeValue || ''
    if (waarde) {
      knopen.push({ node, start: tekst.length, end: tekst.length + waarde.length })
      tekst += waarde
    }
    node = walker.nextNode()
  }
  return { tekst, knopen }
}

/* Welk stukje van welke tekstknoop valt (ten minste gedeeltelijk) binnen
   [start, end)? Een knoop die er helemaal buiten valt, leveren we niet op. */
function knopenInBereik(knopen, start, end) {
  const uit = []
  for (const k of knopen) {
    const a = Math.max(start, k.start)
    const b = Math.min(end, k.end)
    if (a < b) uit.push({ node: k.node, lokaalStart: a - k.start, lokaalEnd: b - k.start })
  }
  return uit
}

/* Legacy: een platte ankertekst zonder quote-context. Werkt alleen als hij
   precies één keer voorkomt — anders zou gokken de verkeerde zin aanwijzen. */
function legacyBereik(tekst, anker) {
  const doel = String(anker || '').trim()
  if (!doel) return null
  const eerste = tekst.indexOf(doel)
  if (eerste < 0) return null
  if (tekst.indexOf(doel, eerste + 1) >= 0) return null
  return { start: eerste, end: eerste + doel.length }
}

function bereikVoorComment(tekst, c) {
  if (c.anker_context && typeof c.anker_context.exact === 'string' && c.anker_context.exact) {
    return vindAnkerBereik(tekst, c.anker_context) || legacyBereik(tekst, c.anker || c.anker_context.exact)
  }
  return legacyBereik(tekst, c.anker)
}

export function markeerAnkers(root, comments = [], { opKlik, opOnopgelost } = {}) {
  if (!root) return 0
  ruimAnkersOp(root)
  const lijst = (comments || []).filter((c) => c && c.anker && !c.opgelost && c.parent_id == null)

  const { tekst, knopen: index } = bouwTekstIndex(root)
  const opgelost = []
  const onopgelost = []
  for (const c of lijst) {
    const bereik = bereikVoorComment(tekst, c)
    if (bereik) opgelost.push({ comment: c, bereik })
    else onopgelost.push(c)
  }
  if (onopgelost.length && typeof opOnopgelost === 'function') opOnopgelost(onopgelost)
  if (!opgelost.length) return 0

  // Per tekstknoop: welke comments bestrijken welk lokaal stukje? Overlappen
  // twee comments hetzelfde stukje, dan krijgt dat stukje beide id's op één
  // mark — geneste marks zouden het stuk kapot splitsen en zijn dat niet waard.
  const perKnoop = new Map()
  for (const { comment, bereik } of opgelost) {
    for (const stuk of knopenInBereik(index, bereik.start, bereik.end)) {
      if (!perKnoop.has(stuk.node)) perKnoop.set(stuk.node, [])
      perKnoop.get(stuk.node).push({ id: String(comment.id), lokaalStart: stuk.lokaalStart, lokaalEnd: stuk.lokaalEnd })
    }
  }

  const marksPerId = new Map()
  for (const [node, stukken] of perKnoop) {
    const grenzen = new Set([0, node.nodeValue.length])
    for (const s of stukken) { grenzen.add(s.lokaalStart); grenzen.add(s.lokaalEnd) }
    const gesorteerd = [...grenzen].sort((a, b) => a - b)
    // Van achter naar voren splitsen: splitText op een eerdere offset verandert
    // de latere offsets in hetzelfde stuk niet.
    let huidig = node
    const segmenten = []
    for (let i = gesorteerd.length - 1; i > 0; i -= 1) {
      const grens = gesorteerd[i - 1]
      if (grens === 0) { segmenten.unshift(huidig); break }
      const nieuw = huidig.splitText(grens)
      segmenten.unshift(nieuw)
      huidig = node
    }
    if (segmenten.length === 0) segmenten.push(node)
    for (let i = 0; i < gesorteerd.length - 1; i += 1) {
      const van = gesorteerd[i]
      const tot = gesorteerd[i + 1]
      const ids = stukken.filter((s) => s.lokaalStart <= van && s.lokaalEnd >= tot).map((s) => s.id)
      if (!ids.length) continue
      const seg = segmenten[i]
      if (!seg || !seg.parentNode) continue
      const mark = root.ownerDocument.createElement('mark')
      mark.className = 'comment-anker'
      mark.dataset.comment = [...new Set(ids)].join(' ')
      seg.parentNode.insertBefore(mark, seg)
      mark.appendChild(seg)
      for (const id of ids) {
        if (!marksPerId.has(id)) marksPerId.set(id, [])
        marksPerId.get(id).push(mark)
      }
    }
  }

  // Eén pin per comment, na het laatste mark-stuk van dat comment in leesorde.
  for (const { comment } of opgelost) {
    const id = String(comment.id)
    const marks = marksPerId.get(id)
    if (!marks || !marks.length) continue
    const laatste = marks.reduce((a, b) => (a.compareDocumentPosition(b) & 4 /* FOLLOWING */ ? b : a))
    const pin = root.ownerDocument.createElement('button')
    pin.type = 'button'
    pin.className = 'comment-pin'
    pin.dataset.comment = id
    pin.setAttribute('aria-label', `Comment ${comment.auteur || ''}: ${String(comment.tekst || '').slice(0, 60)}`)
    pin.title = `${comment.auteur || 'Iemand'}: ${comment.tekst || ''}`
    if (typeof opKlik === 'function') pin.addEventListener('click', (e) => { e.preventDefault(); opKlik(comment.id) })
    laatste.after(pin)
  }

  // Nummer in leesorde, niet in de volgorde waarin de comments zijn geschreven.
  const pins = [...root.querySelectorAll('button.comment-pin')].sort((a, b) => {
    const r = a.compareDocumentPosition(b)
    return r & 4 /* FOLLOWING */ ? -1 : r & 2 /* PRECEDING */ ? 1 : 0
  })
  pins.forEach((pin, i) => { pin.textContent = String(i + 1) })

  return opgelost.length
}
