/* Een spreektekst in stukken voor de oefenmodus.
   Conventies in de markdown:
   - podiumtekst (wat de spreker zegt): blockquote-regels `> ...`
   - regie (wat de spreker doet): `*[Pauze.]*`
   - markers: `**[TE CONTROLEREN]**` en `**[ANTHONY BEVESTIGT: ...]**`
   - passages: `## 3.1 Opening (ca. 10 minuten)`
   Hergebruikt leesSecties voor de ids, zodat dezelfde passage in lees- en
   oefenmodus dezelfde sprongdoel heeft. */

import { leesSecties } from './secties.js'

// Marker eerst: `**[X]**` bevat zelf het patroon `*[X]*` van regie.
const TOKEN = /\*\*\[\s*(TE CONTROLEREN|ANTHONY BEVESTIGT)\s*:?\s*([^\]]*)\]\*\*|\*\[([^\]]*)\]\*/gi
const TIJD = /\s*\(\s*ca\.?\s*(\d+(?:[.,]\d+)?)\s*(min(?:uut|uten)?|uur|u)\.?\s*\)\s*$/i

export function leesTijd(titel) {
  const m = TIJD.exec(String(titel ?? ''))
  if (!m) return { titel: String(titel ?? '').trim(), minuten: null }
  const getal = Number(m[1].replace(',', '.'))
  const minuten = /^u/i.test(m[2]) ? Math.round(getal * 60) : getal
  return { titel: String(titel).slice(0, m.index).trim(), minuten }
}

/* Eén alinea (regels al aan elkaar geplakt) in delen: tekst, regie, marker. */
export function splitsDelen(tekst) {
  const delen = []
  let van = 0
  const bron = String(tekst ?? '').replace(/\s+/g, ' ')
  TOKEN.lastIndex = 0
  let m
  while ((m = TOKEN.exec(bron))) {
    const voor = bron.slice(van, m.index)
    if (voor.trim()) delen.push({ type: 'tekst', tekst: voor.trim() })
    if (m[1]) {
      const soort = /^TE/i.test(m[1]) ? 'controleren' : 'bevestigt'
      delen.push({ type: 'marker', soort, tekst: m[2].trim() })
    } else {
      delen.push({ type: 'regie', tekst: m[3].trim() })
    }
    van = m.index + m[0].length
  }
  const rest = bron.slice(van)
  if (rest.trim()) delen.push({ type: 'tekst', tekst: rest.trim() })
  return delen
}

/* Alinea's binnen een passage: aaneengesloten blockquote-regels vormen één
   alinea van podiumtekst; een lege `>`-regel of lege regel splitst. */
function alineaBlokken(regels) {
  const blokken = []
  let huidig = null
  const sluit = () => { if (huidig) { blokken.push(huidig); huidig = null } }
  for (const regel of regels) {
    const quote = /^\s{0,3}>\s?(.*)$/.exec(regel)
    if (quote) {
      const inhoud = quote[1].trim()
      if (!inhoud) { sluit(); continue }
      if (!huidig || !huidig.podium) { sluit(); huidig = { podium: true, regels: [] } }
      huidig.regels.push(inhoud)
    } else if (!regel.trim()) {
      sluit()
    } else {
      if (!huidig || huidig.podium) { sluit(); huidig = { podium: false, regels: [] } }
      huidig.regels.push(regel.trim())
    }
  }
  sluit()
  return blokken
}

function itemsVan(regels) {
  const items = []
  for (const blok of alineaBlokken(regels)) {
    const delen = splitsDelen(blok.regels.join(' '))
    if (blok.podium) {
      if (!delen.some((d) => d.type === 'tekst')) {
        // Alleen regie of markers in een quote: geen spreektekst, wel cues.
        delen.forEach((d) => items.push(d.type === 'regie' ? { type: 'regie', tekst: d.tekst } : { type: 'marker', soort: d.soort, tekst: d.tekst }))
      } else {
        items.push({ type: 'podium', delen })
      }
    } else {
      // Buiten een quote is tekst commentaar, geen podium; cues blijven.
      delen.forEach((d) => {
        if (d.type === 'regie') items.push({ type: 'regie', tekst: d.tekst })
        else if (d.type === 'marker') items.push({ type: 'marker', soort: d.soort, tekst: d.tekst })
      })
    }
  }
  return items
}

export function parseSpreektekst(markdown) {
  const tekst = String(markdown ?? '')
  const regels = tekst.split(/\r?\n/)
  const koppen = leesSecties(tekst).filter((s) => s.niveau === 2)
  const passages = []
  const maak = (id, rauw, van, tot) => {
    const { titel, minuten } = leesTijd(rauw)
    const items = itemsVan(regels.slice(van, tot))
    const woorden = items.reduce((n, it) => n + (it.type === 'podium'
      ? it.delen.filter((d) => d.type === 'tekst').reduce((w, d) => w + (d.tekst.match(/\S+/g) || []).length, 0)
      : 0), 0)
    return {
      id, titel, minuten, items, woorden,
      markers: items.reduce((n, it) => n + (it.type === 'marker' ? 1 : it.type === 'podium' ? it.delen.filter((d) => d.type === 'marker').length : 0), 0),
    }
  }
  const eerste = koppen.length ? koppen[0].regel : regels.length
  const voorwoord = maak('begin', 'Begin', 0, eerste)
  if (voorwoord.items.length) passages.push(voorwoord)
  koppen.forEach((k, i) => {
    // Titel uit de ruwe regel: leesSecties kapt lange koppen af en de tijd staat achteraan.
    const rauw = String(regels[k.regel] ?? '').replace(/^#{2,3}\s+/, '').replace(/\s*#*\s*$/, '').replace(/\*\*?|`/g, '')
    passages.push(maak(k.id, rauw || k.titel, k.regel + 1, i + 1 < koppen.length ? koppen[i + 1].regel : regels.length))
  })
  const totaalMinuten = passages.reduce((n, p) => n + (p.minuten || 0), 0)
  return { passages, totaalMinuten, aantal: passages.length }
}

export function isSpreektekst(doc) {
  return String(doc?.soort ?? '').toLowerCase() === 'spreektekst'
}

export function tijdLabel(minuten) {
  if (!minuten) return ''
  if (minuten >= 90 && minuten % 30 === 0) return `ca. ${minuten / 60} uur`
  return `ca. ${String(minuten).replace('.', ',')} min`
}
