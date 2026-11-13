/* Het "quote selector"-anker voor een comment: niet alleen de aangehaalde
   frase, maar ook een stukje ervoor en erna. Zo blijft een comment vindbaar
   als dezelfde frase meer dan eens voorkomt, en weet de werkbank eerlijk te
   zeggen wanneer een passage is gewijzigd in plaats van een willekeurige
   andere match te tonen.

   Alles hier werkt op platte, gerenderde tekst en offsets daarin — nooit op
   de ruwe markdown-string, want die kent opmaaktekens die de lezer niet ziet. */

const RAND = 28

export function maakAnkerContext(volledigeTekst, start, end, { documentVersie = null, sectieId = null, randLengte = RAND } = {}) {
  const tekst = String(volledigeTekst ?? '')
  return {
    exact: tekst.slice(start, end),
    prefix: tekst.slice(Math.max(0, start - randLengte), start),
    suffix: tekst.slice(end, end + randLengte),
    start,
    end,
    document_versie: documentVersie ?? null,
    ...(sectieId ? { sectie_id: sectieId } : {}),
  }
}

function alleVoorkomens(tekst, frase) {
  const plekken = []
  if (!frase) return plekken
  let i = tekst.indexOf(frase)
  while (i !== -1) {
    plekken.push(i)
    i = tekst.indexOf(frase, i + 1)
  }
  return plekken
}

/* Meerdere voorkomens: de omgeving (prefix/suffix) en, als niets anders
   beslist, de afstand tot de oorspronkelijke positie bepalen de winnaar.
   Zonder enige aanwijzing blijft het dubbelzinnig — liever eerlijk niets
   vinden dan de verkeerde zin aanwijzen. */
export function vindAnkerBereik(volledigeTekst, ankerContext) {
  const tekst = String(volledigeTekst ?? '')
  const exact = ankerContext?.exact
  if (typeof exact !== 'string' || !exact) return null
  const prefix = ankerContext.prefix || ''
  const suffix = ankerContext.suffix || ''
  const hint = Number.isInteger(ankerContext.start) ? ankerContext.start : null
  const plekken = alleVoorkomens(tekst, exact)
  if (plekken.length === 0) return null
  if (plekken.length === 1) return { start: plekken[0], end: plekken[0] + exact.length }

  let beste = null
  let besteScore = -Infinity
  for (const p of plekken) {
    const voorStuk = tekst.slice(Math.max(0, p - prefix.length), p)
    const naStuk = tekst.slice(p + exact.length, p + exact.length + suffix.length)
    let score = 0
    if (prefix && voorStuk === prefix) score += 4
    else if (prefix && prefix.length >= 6 && voorStuk.endsWith(prefix.slice(-8))) score += 1
    if (suffix && naStuk === suffix) score += 4
    else if (suffix && suffix.length >= 6 && naStuk.startsWith(suffix.slice(0, 8))) score += 1
    if (hint != null) score -= Math.min(1, Math.abs(p - hint) / Math.max(1, tekst.length))
    if (score > besteScore) {
      besteScore = score
      beste = p
    }
  }
  // Geen enkele omgeving klopte en er was geen bruikbare hint: niet gokken.
  if (besteScore <= 0 && hint == null) return null
  return { start: beste, end: beste + exact.length }
}

/* Is de omgeving van een gewijzigde frase toch nog terug te vinden? Dan is het
   geen onbekende passage maar een gewijzigde: dat verschil is de melding waard. */
function omgevingHerkenbaar(tekst, ankerContext) {
  const prefix = (ankerContext?.prefix || '').trim()
  const suffix = (ankerContext?.suffix || '').trim()
  if (prefix.length >= 8 && tekst.includes(prefix)) return true
  if (suffix.length >= 8 && tekst.includes(suffix)) return true
  return false
}

/* De status van één comment-anker tegen de huidige, gerenderde tekst:
   - geen: een algemene comment zonder anker
   - gevonden: het anker (via context of legacy) wijst naar precies één plek
   - dubbelzinnig: een legacy anker zonder context komt meer dan eens voor
   - gewijzigd: de frase zelf is niet meer terug te vinden, maar de omgeving wel
   - onbekend: niets van dit alles is nog terug te vinden */
export function ankerStatus(volledigeTekst, notitie) {
  const tekst = String(volledigeTekst ?? '')
  const ctx = notitie?.anker_context
  if (ctx && typeof ctx.exact === 'string' && ctx.exact) {
    const bereik = vindAnkerBereik(tekst, ctx)
    if (bereik) return { status: 'gevonden', bereik }
    if (omgevingHerkenbaar(tekst, ctx)) return { status: 'gewijzigd', bereik: null }
    return { status: 'onbekend', bereik: null }
  }
  if (notitie?.anker) {
    const plekken = alleVoorkomens(tekst, notitie.anker)
    if (plekken.length === 1) return { status: 'gevonden', bereik: { start: plekken[0], end: plekken[0] + notitie.anker.length } }
    if (plekken.length > 1) return { status: 'dubbelzinnig', bereik: null }
    return { status: 'onbekend', bereik: null }
  }
  return { status: 'geen', bereik: null }
}
