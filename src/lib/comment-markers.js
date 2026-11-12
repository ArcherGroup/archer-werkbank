/* Comment-pinnen in een gerenderd markdown-artikel.

   We zoeken de aangehaalde zin als tekst in het artikel, zetten er een mark
   omheen en hangen er een genummerde pin achter. Zo zie je op het scherm waar
   een comment hoort, zonder de opmaak van het stuk aan te passen.

   Alleen tekstknopen worden gebruikt. Een anker dat over een link of een
   element heen loopt, slaan we over: liever geen pin dan een stuk kapot. */

export function ruimAnkersOp(root) {
  if (!root) return
  for (const pin of root.querySelectorAll('button.comment-pin')) pin.remove()
  for (const mark of root.querySelectorAll('mark.comment-anker')) {
    const ouder = mark.parentNode
    if (!ouder) continue
    while (mark.firstChild) ouder.insertBefore(mark.firstChild, mark)
    ouder.removeChild(mark)
  }
}

function vindBereik(root, tekst) {
  const doel = String(tekst || '').trim()
  if (!doel) return null
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
  let node = walker.nextNode()
  while (node) {
    const waarde = node.nodeValue || ''
    const i = waarde.indexOf(doel)
    if (i !== -1) {
      const bereik = root.ownerDocument.createRange()
      bereik.setStart(node, i)
      bereik.setEnd(node, i + doel.length)
      return bereik
    }
    node = walker.nextNode()
  }
  return null
}

export function markeerAnkers(root, comments = [], { opKlik } = {}) {
  if (!root) return 0
  ruimAnkersOp(root)
  let geplaatst = 0
  for (const c of comments) {
    if (!c || !c.anker || c.opgelost || c.parent_id != null) continue
    const bereik = vindBereik(root, c.anker)
    if (!bereik) continue
    const mark = root.ownerDocument.createElement('mark')
    mark.className = 'comment-anker'
    mark.dataset.comment = String(c.id)
    try {
      bereik.surroundContents(mark)
    } catch {
      continue // het anker loopt over meerdere elementen: niet forceren
    }
    const pin = root.ownerDocument.createElement('button')
    pin.type = 'button'
    pin.className = 'comment-pin'
    pin.dataset.comment = String(c.id)
    pin.setAttribute('aria-label', `Comment ${c.auteur || ''}: ${String(c.tekst || '').slice(0, 60)}`)
    pin.title = `${c.auteur || 'Iemand'}: ${c.tekst || ''}`
    pin.textContent = String(geplaatst + 1)
    if (typeof opKlik === 'function') pin.addEventListener('click', (e) => { e.preventDefault(); opKlik(c.id) })
    mark.after(pin)
    geplaatst += 1
  }
  // Nummer in leesorde, niet in de volgorde waarin de comments zijn geschreven.
  let nummer = 0
  for (const pin of root.querySelectorAll('button.comment-pin')) {
    nummer += 1
    pin.textContent = String(nummer)
  }
  return geplaatst
}