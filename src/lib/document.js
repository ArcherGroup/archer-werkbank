import { bouwTekstIndex } from './comment-markers.js'
import { maakAnkerContext } from './quote-anker.js'

/* Een download vanuit de editor moet ook onbevestigde tekst meenemen. */
export function inhoudVoorDownload(modus, klad, opgeslagen) {
  return modus === 'bewerk' ? (klad ?? '') : (opgeslagen ?? '')
}

function eersteTekstIn(node) {
  if (node.nodeType === 3) return node
  if (node.nodeType !== 1) return null
  for (const kind of node.childNodes) {
    const t = eersteTekstIn(kind)
    if (t) return t
  }
  return null
}

function laatsteTekstIn(node) {
  if (node.nodeType === 3) return node
  if (node.nodeType !== 1) return null
  for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
    const t = laatsteTekstIn(node.childNodes[i])
    if (t) return t
  }
  return null
}

/* Een klik- of sleeppositie in de DOM (knoop + kind-offset) omzetten naar een
   offset in de platte, gerenderde tekst van `bouwTekstIndex`. Werkt zowel op
   tekstknopen zelf (het gewone geval) als op elementknopen (bv. wanneer de
   browser een selectie afrondt op een <p> in plaats van zijn tekst). */
function offsetVoorPunt(knopen, container, offset) {
  if (!container) return null
  if (container.nodeType === 3) {
    const k = knopen.find((x) => x.node === container)
    if (!k) return null
    return k.start + Math.max(0, Math.min(offset, container.nodeValue.length))
  }
  const kinderen = container.childNodes
  if (offset < kinderen.length) {
    const vanaf = eersteTekstIn(kinderen[offset])
    if (vanaf) {
      const k = knopen.find((x) => x.node === vanaf)
      if (k) return k.start
    }
  }
  for (let i = Math.min(offset, kinderen.length) - 1; i >= 0; i -= 1) {
    const laatste = laatsteTekstIn(kinderen[i])
    if (laatste) {
      const k = knopen.find((x) => x.node === laatste)
      if (k) return k.end
    }
  }
  return null
}

/* Een echte tekstselectie in het gerenderde artikel omzetten in een comment-
   anker: de gerenderde tekst zelf (niet de ruwe markdown, want die kent
   opmaaktekens die de lezer nooit ziet) plus een quote-context met de rand
   erbij, zodat een herhaalde zin zijn eigen plek houdt. Frontmatter en de
   pin-knoppen van bestaande comments tellen nooit mee. */
export function ankerUitSelectie({ root, range, documentVersie = null, sectieId = null }) {
  if (!root || !range) throw new Error('Selecteer een stuk tekst om een comment aan te koppelen.')
  const { tekst, knopen } = bouwTekstIndex(root)
  const start = offsetVoorPunt(knopen, range.startContainer, range.startOffset)
  const eind = offsetVoorPunt(knopen, range.endContainer, range.endOffset)
  if (start == null || eind == null || eind <= start) {
    throw new Error('Selecteer een kort fragment uit de tekst van het stuk.')
  }
  const exact = tekst.slice(start, eind)
  if (!exact.trim() || exact.length > 2000) {
    throw new Error('Selecteer een kort fragment uit de tekst van het stuk.')
  }
  return { anker: exact, anker_context: maakAnkerContext(tekst, start, eind, { documentVersie, sectieId }) }
}

export function valideerNotitieAnker(inhoud, selectie) {
  if (typeof inhoud !== 'string' || typeof selectie !== 'string' || !selectie.trim() || selectie.length > 2000) {
    throw new Error('Selecteer een kort fragment uit het document.')
  }
  const eerste = inhoud.indexOf(selectie)
  if (eerste < 0 || inhoud.indexOf(selectie, eerste + 1) >= 0) {
    throw new Error('Selecteer één uniek, doorlopend fragment zonder verborgen opmaak.')
  }
  return selectie
}

export function voegInterneLinkIn(tekst, begin, einde, label, route) {
  if (typeof tekst !== 'string' || !Number.isInteger(begin) || !Number.isInteger(einde) || begin < 0 || einde < begin || einde > tekst.length || !/^#\/(doc|bron)\/[1-9]\d*$/.test(route)) {
    throw new Error('De interne link of selectie is ongeldig.')
  }
  const selectie = tekst.slice(begin, einde) || String(label ?? '')
  if (!selectie.trim() || /[\r\n]/.test(selectie)) throw new Error('Selecteer tekst op één regel voor de link.')
  const veiligLabel = selectie.replace(/\\/g, '\\\\').replace(/([\[\]])/g, '\\$1')
  const invoeging = `[${veiligLabel}](${route})`
  return { tekst: tekst.slice(0, begin) + invoeging + tekst.slice(einde), positie: begin + invoeging.length }
}
