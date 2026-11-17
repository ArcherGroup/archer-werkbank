/* Rekenlaag van de dagdeelvisie: de gegevens voor het overzicht van één dagdeel op drie niveaus
   (dagdeel, dag, vier dagen).

   Alleen invoer, geen netwerk, geen opslag, geen eigen oordeel. Wat hier uitkomt staat in de
   aangereikte objecten, anders is het null of een lege lijst. Er is geen inhoud van een dagdeel of
   van het masterplan ingebakken: alleen de vorm van de bronnen is bekend.

   bouwDagdeelVisie({ blok, blokken, documentenMeta, brief, masterplan })
   - blok            { id, code, dag }; zonder bruikbaar id is er niets te tonen (alles leeg)
   - blokken         alle dagdelen { id, code, titel, dag, volgorde }
   - documentenMeta  [{ id, blok_id, soort, titel }]
   - brief           het geladen document { id, blok_id, inhoud }. Het wordt alleen gelezen als het de unieke
                     brief van dit dagdeel is (zoals vindBrief): hetzelfde id als in documentenMeta én
                     blok_id = blok.id. Een brief van een ander dagdeel, of eentje die niet zegt waar hij
                     bij hoort, levert niets op.
   - masterplan      het geladen document { inhoud } (of de tekst zelf)

   Uitvoer, altijd met deze acht velden:
   - doel, boodschap  eerste alinea van ## Doel en ## Kernboodschap in de brief, of null
   - tijdvakken       [{ id, begin, einde, minuten, vorm, titel, detail }] uit de genummerde regels van
                      ## Opbouw, in de vorm `1. **14:00 tot 14:10: titel (10 min, vorm).** detail`.
                      id is de plaats in de lijst (1, 2, …). Een deel dat ontbreekt of niet klopt is null:
                      minuten en vorm komen alleen uit de haakjes, nooit uit de tijden. Tijden die niet
                      bestaan of tegenspreken (einde niet na begin) worden niet getoond en niet gerepareerd.
   - bronnen          [{ id, soort, titel, route }]: alle stukken van dit dagdeel van de soorten brief,
                      spreektekst, slides en werkboek, in die volgorde en binnen een soort op titel. Elk stuk
                      toont zijn eigen titel; er wordt er geen uitgekozen.
   - dagdelen         [{ id, code, titel, route }] van dezelfde dag als blok.dag, gesorteerd op volgorde als
                      alle dagdelen er een hebben, anders op code (1.4 vóór 1.10); zonder algemeen en bronnen
   - dagen            [{ dag, titel }] uit koppen `### Dag N · titel`; een dag met twee verschillende titels
                      wordt weggelaten
   - rodeDraad        de ene blockquote in sectie `2. De rode draad in één zin`
   - plek             { ggr, gebouw } uit de enige tabelrij in het masterplan waarvan de eerste kolom met
                      exact blok.code begint (1.3 is niet 1.30 en niet 1.3.1). De kolommen worden op hun
                      kop herkend: ggr, steen of gebouw. Twee rijen of een dubbelzinnige kolom geeft null.
                      null als beide delen ontbreken.
   Alle teksten zijn platte tekst: opmaak, html, onzichtbare en omkerende tekens vallen weg en lange
   teksten worden afgekapt met een …. De invoer wordt niet gewijzigd. */

import { haalSectie, vindBrief } from './werkblad.js'

const MAX = { doel: 300, boodschap: 600, detail: 400, titel: 120, vorm: 40, code: 40, cel: 200, draad: 300 }
const SOORTEN = ['brief', 'spreektekst', 'slides', 'werkboek']
const GEEN_DAGDEEL = ['algemeen', 'bronnen']
const RODE_DRAAD = '2. De rode draad in één zin'

const isObject = (w) => w !== null && typeof w === 'object' && !Array.isArray(w)
const heeftId = (w) => (typeof w === 'number' && Number.isFinite(w)) || (typeof w === 'string' && w.trim() !== '')
const zelfde = (a, b) => heeftId(a) && heeftId(b) && String(a).trim() === String(b).trim()
const route = (soort, id) => `#/${soort}/${encodeURIComponent(String(id).trim())}`
const leeg = () => ({ doel: null, boodschap: null, tijdvakken: [], bronnen: [], dagdelen: [], dagen: [], rodeDraad: null, plek: null })

/* ------------------------------------------------------------------ tekst */

// Omkerende en onzichtbare tekens kunnen een tekst anders laten lezen dan hij is: ze vallen weg.
function schoon(w) {
  return (typeof w === 'string' ? w : '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Markdown en html naar platte tekst. Een "<" voor een spatie of cijfer is geen tag en blijft staan.
function plat(w) {
  return schoon(
    (typeof w === 'string' ? w : '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?[A-Za-z][^>]*>/g, '')
      .replace(/\*\*|__|~~|`/g, '')
      .replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|[.,;:!?)]|$)/g, '$1$2'),
  )
}

function kort(tekst, max) {
  const tekens = Array.from(tekst)
  if (tekens.length <= max) return tekst
  let knip = tekens.slice(0, max - 1).join('')
  const spatie = knip.lastIndexOf(' ')
  if (spatie > max / 2) knip = knip.slice(0, spatie)
  return `${knip.replace(/[\s,;:.\-–—]+$/, '')}…`
}

const leesTekst = (w, max) => kort(plat(w), max) || null

function eersteAlinea(sectie, max) {
  for (const alinea of sectie.split(/\n[ \t]*\n/)) {
    const regels = alinea.split('\n')
      .filter((regel) => !/^\s*#{1,6}\s/.test(regel))
      .map((regel) => regel.replace(/^\s*(?:>\s?)+/, '').replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+/, ''))
    const tekst = leesTekst(regels.join(' '), max)
    if (tekst) return tekst
  }
  return null
}

/* ------------------------------------------------------------------ stukken en dagdelen */

// Alleen objecten met een bruikbaar id; een id dat dubbel voorkomt telt één keer (de eerste).
function metId(lijst) {
  if (!Array.isArray(lijst)) return null
  const gezien = new Set()
  return lijst.filter((x) => {
    if (!isObject(x) || !heeftId(x.id)) return false
    const sleutel = String(x.id).trim()
    if (gezien.has(sleutel)) return false
    gezien.add(sleutel)
    return true
  })
}

function leesBrief(brief, metas, blokId) {
  if (!isObject(brief) || !metas || typeof brief.inhoud !== 'string') return null
  const meta = vindBrief(metas, blokId)
  return meta && zelfde(brief.id, meta.id) && zelfde(brief.blok_id, blokId) ? brief.inhoud : null
}

function leesBronnen(metas, blokId) {
  if (!metas) return []
  const volgorde = (a, b) => SOORTEN.indexOf(a.soort) - SOORTEN.indexOf(b.soort) ||
    schoon(a.titel).localeCompare(schoon(b.titel), 'nl', { numeric: true, sensitivity: 'base' }) ||
    String(a.id).localeCompare(String(b.id), 'nl', { numeric: true })
  return metas
    .filter((d) => zelfde(d.blok_id, blokId) && SOORTEN.includes(d.soort))
    .sort(volgorde)
    .map((d) => ({ id: d.id, soort: d.soort, titel: leesTekst(d.titel, MAX.titel), route: route('doc', d.id) }))
}

function leesDagdelen(blokken, dag) {
  if (!Array.isArray(blokken) || !heeftId(dag)) return []
  const lijst = metId(blokken).filter((b) => !GEEN_DAGDEEL.includes(String(b.id).trim()) && zelfde(b.dag, dag))
  const sleutel = (b) => schoon(b.code) || String(b.id).trim()
  const opCode = (a, b) => sleutel(a).localeCompare(sleutel(b), 'nl', { numeric: true, sensitivity: 'base' }) ||
    String(a.id).localeCompare(String(b.id), 'nl', { numeric: true })
  // Eén sleutel voor iedereen: een mengeling van volgorde en code zou geen vaste volgorde geven.
  const opVolgorde = lijst.every((b) => typeof b.volgorde === 'number' && Number.isFinite(b.volgorde))
  lijst.sort(opVolgorde ? (a, b) => a.volgorde - b.volgorde || opCode(a, b) : opCode)
  return lijst.map((b) => ({ id: String(b.id).trim(), code: leesTekst(b.code, MAX.code), titel: leesTekst(b.titel, MAX.titel), route: route('blok', b.id) }))
}

/* ------------------------------------------------------------------ de opbouw van de brief */

function leesTijd(w) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(w ?? '')
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

// `**14:00 tot 14:10: titel (10 min, vorm).** detail`: elk deel dat er niet is of niet klopt wordt null.
function leesTijdvak(punt, id) {
  const vet = /^\*\*(.+?)\*\*\s*(.*)$/.exec(punt)
  let kop = vet ? vet[1] : ''
  const detail = leesTekst((vet ? vet[2] : punt).replace(/^[.:;,\-–—\s]+/, ''), MAX.detail)

  let begin = null
  let einde = null
  const tijd = /^(\d{1,2}:\d{2})\s+tot\s+(\d{1,2}:\d{2})\s*(?::\s*(.*?))?[.\s]*$/.exec(kop)
  if (tijd) {
    begin = leesTijd(tijd[1])
    einde = leesTijd(tijd[2])
    if (!begin || !einde || einde <= begin) begin = einde = null
    kop = tijd[3] ?? ''
  }
  kop = kop.replace(/[.\s]+$/, '')

  let minuten = null
  let vorm = null
  const duur = /\(\s*(\d{1,4})\s*min(?:uten|\.)?\s*(?:[,;]\s*([^()]*?))?\s*\)\s*$/i.exec(kop)
  if (duur && Number(duur[1]) >= 1 && Number(duur[1]) <= 1440) {
    minuten = Number(duur[1])
    vorm = leesTekst(duur[2], MAX.vorm)
    kop = kop.slice(0, duur.index)
  }
  return { id, begin, einde, minuten, vorm, titel: leesTekst(kop, MAX.titel), detail }
}

function leesOpbouw(inhoud) {
  const punten = []
  let open = false
  for (const regel of haalSectie(inhoud, 'Opbouw').split('\n')) {
    const punt = /^ {0,2}\d{1,3}[.)]\s+(\S.*)$/.exec(regel)
    if (punt) {
      punten.push(punt[1].trim())
      open = true
    } else if (open && regel.trim() !== '' && !/^\s*(?:[-*+]\s|\d{1,3}[.)]\s|#|>|\||```)/.test(regel)) {
      punten[punten.length - 1] += ` ${regel.trim()}` // de regel loopt door
    } else {
      open = false
    }
  }
  return punten.map((punt, i) => leesTijdvak(punt, i + 1))
}

/* Het overall begin- en einduur van een dagdeel uit zijn brief, voor de dagtijdlijn.
   Alleen tijdvakken met een geldig begin en einde tellen; zonder tijd is er geen schema.
   De minuten worden opgeteld voor zover de brief ze geeft (dag 1 heeft enkel minuten). */
export function schemaUitBrief(inhoud) {
  const tv = leesOpbouw(typeof inhoud === 'string' ? inhoud : '')
  const tijden = tv.filter((t) => t.begin && t.einde)
  const minuten = tv.reduce((s, t) => s + (t.minuten || 0), 0)
  if (!tijden.length) return minuten > 0 ? { begin: null, einde: null, minuten } : null
  const begin = tijden.map((t) => t.begin).sort()[0]
  const einde = tijden.map((t) => t.einde).sort().slice(-1)[0]
  return { begin, einde, minuten: minuten || null }
}

/* ------------------------------------------------------------------ het masterplan */

/* Dezelfde dagkoppen als in de visie, maar als losse lijst voor het pad bovenaan. */
export function dagenUitMasterplan(masterTekst) {
  const tekst = typeof masterTekst === 'string' ? masterTekst : ''
  if (!tekst.trim()) return []
  return leesDagen(tekst)
}

function leesDagen(masterTekst) {
  const titels = new Map()
  for (const regel of masterTekst.split(/\r?\n/)) {
    const kop = /^###\s+Dag\s+(\d{1,2})\s*·\s*(.+?)\s*#*\s*$/i.exec(regel)
    const titel = kop && leesTekst(kop[2], MAX.titel)
    if (!titel) continue
    const dag = Number(kop[1])
    titels.set(dag, [...(titels.get(dag) ?? []), titel])
  }
  return [...titels]
    .filter(([, lijst]) => new Set(lijst).size === 1)
    .map(([dag, lijst]) => ({ dag, titel: lijst[0] }))
    .sort((a, b) => a.dag - b.dag)
}

function leesRodeDraad(masterTekst) {
  const citaten = []
  let huidig = null
  for (const regel of haalSectie(masterTekst, RODE_DRAAD).split('\n')) {
    const citaat = /^ {0,3}>\s?(.*)$/.exec(regel)
    if (!citaat) huidig = null
    else {
      if (!huidig) citaten.push((huidig = []))
      huidig.push(citaat[1])
    }
  }
  return citaten.length === 1 ? leesTekst(citaten[0].join(' '), MAX.draad) : null
}

const splitsRij = (regel) => regel.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((cel) => cel.replace(/\\\|/g, '|').trim())

// Een tabel is een kopregel, een scheidingsregel (|---|---|) en de rijen die daarop volgen.
function leesTabellen(tekst) {
  const regels = tekst.split(/\r?\n/)
  const tabellen = []
  for (let i = 0; i < regels.length; i += 1) {
    if (!/^\s*\|/.test(regels[i]) || !/^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(regels[i + 1] ?? '')) continue
    const tabel = { koppen: splitsRij(regels[i]).map(plat), rijen: [] }
    let j = i + 2
    for (; j < regels.length && /^\s*\|/.test(regels[j]); j += 1) tabel.rijen.push(splitsRij(regels[j]))
    tabellen.push(tabel)
    i = j - 1
  }
  return tabellen
}

// De code staat vooraan en wordt niet doorgezet: na 1.3 volgt geen letter, cijfer of ".4".
function beginMetCode(cel, code) {
  const tekst = plat(cel)
  return tekst.startsWith(code) && !/^(?:[\p{L}\p{N}]|[.,/\-–]\d)/u.test(tekst.slice(code.length))
}

function leesPlek(masterTekst, code) {
  if (!code) return null
  const treffers = leesTabellen(masterTekst).flatMap((tabel) => tabel.rijen.filter((rij) => beginMetCode(rij[0], code)).map((rij) => ({ tabel, rij })))
  if (treffers.length !== 1) return null
  const { tabel, rij } = treffers[0]
  const waarde = (patroon) => {
    const kolommen = tabel.koppen.flatMap((kop, i) => (i > 0 && patroon.test(kop) ? [i] : []))
    const tekst = kolommen.length === 1 && kolommen[0] < rij.length ? leesTekst(rij[kolommen[0]], MAX.cel) : null
    return tekst && !/^[-–—]+$/.test(tekst) ? tekst : null
  }
  const plek = { ggr: waarde(/ggr/i), gebouw: waarde(/steen|gebouw/i) }
  return plek.ggr || plek.gebouw ? plek : null
}

/* De eigenaar kan op twee plaatsen verschillen. Maak dat zichtbaar zonder
   te kiezen; een dubbele brief of dubbele eigenaaraanduiding is onbekend. */
export function vergelijkEigenaar(invoer) {
  const { blok, documentenMeta, brief } = isObject(invoer) ? invoer : {}
  if (!isObject(blok) || !heeftId(blok.id)) return null
  const dagdeel = leesTekst(blok.eigenaar, 100)
  const inhoud = leesBrief(brief, metId(documentenMeta), String(blok.id).trim())
  if (!dagdeel || inhoud === null) return null
  const inleiding = inhoud.split(/^##\s/m, 1)[0]
  const treffers = [...inleiding.matchAll(/\*\*Eigenaar:\*\*\s*([^\n*]+?)(?=\.\s*\*\*|\n|$)/gi)]
  if (treffers.length !== 1) return null
  const uitBrief = leesTekst(treffers[0][1].replace(/[.,;]\s*$/, ''), 100)
  if (!uitBrief || dagdeel.localeCompare(uitBrief, 'nl', { sensitivity: 'base' }) === 0) return null
  return { dagdeel, brief: uitBrief, bron: route('doc', brief.id) }
}

/* ------------------------------------------------------------------ stukken bij een dagdeel */

// De volgorde waarin een dagdeel zijn stukken toont: eerst wat de les draagt, dan de rest.
const VOLGORDE_STUK = ['brief', 'spreektekst', 'slides', 'werkboek', 'oefening', 'research', 'bron', 'algemeen', 'overig']
const rang = (soort) => {
  const i = VOLGORDE_STUK.indexOf(soort)
  return i === -1 ? VOLGORDE_STUK.length : i
}

// Alle stukken van één dagdeel, in vaste volgorde; wat niet bij dit dagdeel hoort blijft weg.
export function stukkenVanDagdeel(metas, blokId) {
  const lijst = metId(metas)
  if (!lijst || !heeftId(blokId)) return []
  return lijst
    .filter((d) => zelfde(d.blok_id, blokId))
    .sort((a, b) => rang(a.soort) - rang(b.soort) ||
      schoon(a.titel).localeCompare(schoon(b.titel), 'nl', { numeric: true, sensitivity: 'base' }) ||
      String(a.id).localeCompare(String(b.id), 'nl', { numeric: true }))
    .map((d) => ({ id: d.id, soort: d.soort, titel: leesTekst(d.titel, MAX.titel), route: route('doc', d.id) }))
}

// Welk soort stuk hoort bij de vorm van een onderdeel? Alleen deze drie vormen zijn bekend;
// bij een andere of ontbrekende vorm wordt niets aan het onderdeel gehangen.
const BIJ_VORM = {
  luisteren: ['spreektekst', 'slides'],
  doen: ['werkboek', 'oefening'],
  beslissen: ['werkboek'],
}

export function stukkenBijTijdvak(stukken, tijdvak) {
  const soorten = BIJ_VORM[schoon(tijdvak?.vorm).toLowerCase()] || []
  if (!soorten.length || !Array.isArray(stukken)) return []
  return stukken
    .filter((s) => isObject(s) && heeftId(s.id) && soorten.includes(s.soort))
    .sort((a, b) => soorten.indexOf(a.soort) - soorten.indexOf(b.soort) ||
      schoon(a.titel).localeCompare(schoon(b.titel), 'nl', { numeric: true, sensitivity: 'base' }))
    .map((s) => ({ id: s.id, soort: s.soort, titel: leesTekst(s.titel, MAX.titel) || s.soort, route: s.route || route('doc', s.id) }))
}

/* ------------------------------------------------------------------ samenstellen */

export function bouwDagdeelVisie(invoer) {
  const { blok, blokken, documentenMeta, brief, masterplan } = isObject(invoer) ? invoer : {}
  if (!isObject(blok) || !heeftId(blok.id)) return leeg()

  const blokId = String(blok.id).trim()
  const metas = metId(documentenMeta)
  const briefTekst = leesBrief(brief, metas, blokId)
  const master = typeof masterplan === 'string' ? masterplan : isObject(masterplan) && typeof masterplan.inhoud === 'string' ? masterplan.inhoud : ''

  return {
    doel: briefTekst === null ? null : eersteAlinea(haalSectie(briefTekst, 'Doel'), MAX.doel),
    boodschap: briefTekst === null ? null : eersteAlinea(haalSectie(briefTekst, 'Kernboodschap'), MAX.boodschap),
    tijdvakken: briefTekst === null ? [] : leesOpbouw(briefTekst),
    bronnen: leesBronnen(metas, blokId),
    dagdelen: leesDagdelen(blokken, blok.dag),
    dagen: leesDagen(master),
    rodeDraad: leesRodeDraad(master),
    plek: leesPlek(master, schoon(blok.code)),
  }
}
