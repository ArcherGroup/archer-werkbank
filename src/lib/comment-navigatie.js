/* Pure comment-navigatie: waar hoort een comment-anker in de huidige, platte
   tekst? Geen DOM, geen React, geen I/O — werkt op dezelfde platte string als
   bouwTekstIndex() oplevert. Offsets zijn in die originele tekst.

   Statussen:
   - gevonden: precies één plek
   - meerdere: het anker komt meer dan eens voor en niets onderscheidt ze
   - gewijzigd: de frase zelf is weg, maar de oude historiek-tekst toont dat de
     omgeving nu eenduidig past -> begrensde huidige passage
   - onbekend: niets betrouwbaar terug te vinden
   - geen: algemene comment zonder anker

   We mappen weergegeven woorden met willekeurige spaties (ook NBSP) gelijk-
   waardig op de originele offsets, en gokken nooit op algemene betekenis of de
   eerste woorden. */

import { vindAnkerBereik } from './quote-anker.js'

const RAND = 28
const MIN_CONTEXT = 6
const MAX_GAT = 400

function isWit(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v' || ch === '\u00a0'
}

/* Platte tekst met elke witruimte-run tot één spatie, plus een kaart van
   genormaliseerde index -> originele index (begin van de run). */
function normaliseerMetKaart(tekst) {
  const orig = String(tekst ?? '')
  let norm = ''
  const kaart = []
  let i = 0
  while (i < orig.length) {
    if (isWit(orig[i])) {
      const begin = i
      while (i < orig.length && isWit(orig[i])) i += 1
      norm += ' '
      kaart.push(begin)
    } else {
      norm += orig[i]
      kaart.push(i)
      i += 1
    }
  }
  kaart.push(orig.length)
  return { norm, kaart, orig }
}

/* Alle plekken waar `frase` voorkomt, witruimte-tolerant, teruggegeven als
   offsets in de originele tekst. */
function vindWitruimtePlekken(tekst, frase) {
  const doel = String(frase ?? '').replace(/[\s\u00a0]+/g, ' ').trim()
  if (!doel) return []
  const { norm, kaart, orig } = normaliseerMetKaart(tekst)
  const uit = []
  let i = norm.indexOf(doel)
  while (i !== -1) {
    const start = kaart[i]
    const eNorm = i + doel.length
    const end = eNorm >= norm.length ? orig.length : kaart[eNorm]
    uit.push({ start, end })
    i = norm.indexOf(doel, i + 1)
  }
  return uit
}

function kant(tekst, stuk, rand) {
  const tr = vindWitruimtePlekken(tekst, stuk)
  if (tr.length !== 1) return null
  return rand === 'voor' ? tr[0].end : tr[0].start
}

/* Begrensde huidige passage: voor- én na-context van de oude unieke vindplaats
   moeten nu elk precies één keer voorkomen en elkaar niet overlappen. Anders
   niets teruggeven dan een eerlijk 'weet ik niet'. */
function begrensdePassage(tekst, voor, na) {
  if (!voor || voor.length < MIN_CONTEXT || !na || na.length < MIN_CONTEXT) return null
  const voorEind = kant(tekst, voor, 'voor')
  const naStart = kant(tekst, na, 'na')
  if (voorEind == null || naStart == null) return null
  if (voorEind > naStart) return null
  if (naStart - voorEind > MAX_GAT) return null
  return { start: voorEind, end: naStart }
}

/* Eenduidig herstel: zoek in de oude historiek-teksten de tekst waarin het
   anker uniek was, neem de stabiele voor/na-omgeving daaruit, en kijk of die
   omgeving in de huidige tekst één begrensde passage aanwijst. */
function herstelViaHistoriek(tekst, frase, historiek) {
  const doel = String(frase ?? '').trim()
  if (!doel) return null
  for (const oud of historiek || []) {
    const oudeTekst = String(oud ?? '')
    const plekken = vindWitruimtePlekken(oudeTekst, doel)
    if (plekken.length !== 1) continue
    const p = plekken[0]
    const voor = oudeTekst.slice(Math.max(0, p.start - RAND), p.start).replace(/[\s\u00a0]+$/, '')
    const na = oudeTekst.slice(p.end, p.end + RAND).replace(/^[\s\u00a0]+/, '')
    const bereik = begrensdePassage(tekst, voor, na)
    if (bereik) return bereik
    // Een redactie kan ook het lidwoord én de rest van de zin vervangen.
    // Alleen een lang, uniek en gelijk begin van dezelfde alinea is dan nog
    // een betrouwbare terugweg. Geen korte trefwoorden of semantische gok.
    const beginOud = oudeTekst.lastIndexOf('\n', p.start - 1) + 1
    let prefix = oudeTekst.slice(beginOud, p.start).trimEnd()
    for (let stap = 0; stap < 4; stap += 1) {
      if (prefix.length < 48 || prefix.trim().split(/\s+/).length < 8) break
      const hits = vindWitruimtePlekken(tekst, prefix)
      if (hits.length === 1) {
        const begin = tekst.lastIndexOf('\n', hits[0].start - 1) + 1
        const volgende = tekst.indexOf('\n', hits[0].end)
        const einde = volgende < 0 ? tekst.length : volgende
        if (!tekst.slice(begin, hits[0].start).trim() && einde - begin <= 1000 && einde > hits[0].end) return { start: begin, end: einde }
      }
      prefix = prefix.replace(/\s+\S+\s*$/, '').trimEnd()
    }
  }
  return null
}

export function zoekCommentPassages(tekst, notitie, { historiek = [] } = {}) {
  const t = String(tekst ?? '')
  const ctx = notitie?.anker_context
  const heeftCtx = Boolean(ctx && typeof ctx.exact === 'string' && ctx.exact)
  const anker = typeof notitie?.anker === 'string' ? notitie.anker : ''

  if (!heeftCtx && !anker) {
    return { status: 'geen', plekken: [], melding: 'Algemene comment zonder tekstanker.' }
  }

  if (heeftCtx) {
    const viaBestaand = vindAnkerBereik(t, ctx)
    if (viaBestaand) return { status: 'gevonden', plekken: [viaBestaand], melding: 'Passage eenduidig gevonden.' }

    const plekken = vindWitruimtePlekken(t, ctx.exact)
    if (plekken.length === 1) return { status: 'gevonden', plekken, melding: 'Passage eenduidig gevonden.' }
    if (plekken.length > 1) {
      return { status: 'meerdere', plekken, melding: `Het anker komt ${plekken.length} keer voor; niet eenduidig.` }
    }

    const hersteld = herstelViaHistoriek(t, ctx.exact, historiek)
    if (hersteld) {
      return { status: 'gewijzigd', plekken: [hersteld], melding: 'De passage is gewijzigd; de omgeving klopt nog, bereik bij benadering.' }
    }
    return { status: 'onbekend', plekken: [], melding: 'Passage is niet betrouwbaar terug te vinden in de huidige tekst.' }
  }

  const plekken = vindWitruimtePlekken(t, anker)
  if (plekken.length === 1) return { status: 'gevonden', plekken, melding: 'Passage eenduidig gevonden.' }
  if (plekken.length > 1) {
    return { status: 'meerdere', plekken, melding: `Het anker komt ${plekken.length} keer voor; niet eenduidig.` }
  }

  const hersteld = herstelViaHistoriek(t, anker, historiek)
  if (hersteld) {
    return { status: 'gewijzigd', plekken: [hersteld], melding: 'De passage is gewijzigd; de omgeving klopt nog, bereik bij benadering.' }
  }
  return { status: 'onbekend', plekken: [], melding: 'Passage is niet betrouwbaar terug te vinden in de huidige tekst.' }
}
