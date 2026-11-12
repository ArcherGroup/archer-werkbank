/* Rekenlaag van de voorbereidingsketen: wat hangt er echt aan één dagdeel, per stap van de werkwijze
   vraag → bronnen → stelling → lesinhoud → oefening → feedback → bijsturing.

   Alleen invoer, geen netwerk, geen opslag, geen eigen oordeel. Wat hier uitkomt is wat er in de
   gegevens staat en niets anders:
   - 'aanwezig'  er hangt iets aan dit dagdeel. Dat zegt niets over de kwaliteit: er bestaat geen stand
                 "klaar" of "gevalideerd" en er wordt geen voortgang of percentage uitgerekend.
   - 'leeg'      de gegevens zijn aangeleverd en er hangt niets aan dit dagdeel (of alleen stukken van 0 bytes).
   - 'onbekend'  we kunnen het niet weten: de gegevens zijn niet aangeleverd, worden nog geladen, of de
                 werkbank legt dit niet vast. Onbekend is nooit "0".
   Velden die validatie zouden kunnen suggereren (status, gevalideerd, versie …) worden niet gelezen.

   bouwKeten({ blok, documentenMeta, bronnen, notities, beslissingen, stelling, geladen })
   - blok            { id, code?, titel? }; zonder bruikbaar id is er geen keten (blok: null)
   - documentenMeta  [{ id, blok_id, soort, titel, bytes }]
   - bronnen         [{ id, blok_id, document_id, titel, status }]
   - notities        notities van het dagdeel; { doel_type, doel_id } worden gecontroleerd als ze er zijn
   - beslissingen    alle beslissingen; ze horen bij een dagdeel via een expliciet blok_id of via de
                     bestaande bronkoppeling in beslissing-review.js, nooit op gevoel
   - doel            optioneel: het doel uit de bronbrief van dit dagdeel
   - doelBron        verwijst met { id } naar die brief
   - stelling        optioneel: kernboodschap door de ouder uit een bron gelezen
   - stellingBron    verwijst met { id } naar die brief
   - geladen         alleen een echte `false` betekent: nog aan het laden → alles onbekend
   Een gegeven dat geen lijst is (undefined, null, tekst) telt als niet aangeleverd. */

import { bronnenVoorBeslissing } from './beslissing-review.js'

export const KETEN_STAPPEN = [
  { id: 'vraag', naam: 'Vraag', doel: 'Waar moet dit dagdeel een antwoord op geven?', telt: 'Stukken van de soort brief.' },
  { id: 'bronnen', naam: 'Bronnen', doel: 'Wat is er verzameld om dat te onderbouwen?', telt: 'Bronnen van dit dagdeel (of van een stuk van dit dagdeel, als ze zelf geen dagdeel hebben), plus research- en bronstukken. De status van een bron (ongelezen, gelezen, kernbron) is een markering van het team, geen controle van de bron.' },
  { id: 'stelling', naam: 'Stelling', doel: 'Wat beweer je, en waar steunt dat op?', telt: 'Alleen een stelling die de werkbank aanlevert. De werkbank legt de stelling niet zelf apart vast.' },
  { id: 'lesinhoud', naam: 'Lesinhoud', doel: 'Wat wordt er uitgelegd en getoond?', telt: 'Stukken van de soort spreektekst en slides.' },
  { id: 'oefening', naam: 'Oefening', doel: 'Waarmee gaan deelnemers zelf aan de slag?', telt: 'Stukken van de soort werkboek en oefening.' },
  { id: 'feedback', naam: 'Feedback', doel: 'Wat is er teruggekomen?', telt: 'Notities bij dit dagdeel. De werkbank weet niet welke notities feedback zijn; ze worden alleen geteld.' },
  { id: 'bijsturing', naam: 'Bijsturing', doel: 'Wat doe je daardoor anders?', telt: 'Beslissingen die aan dit dagdeel hangen, open of vastgelegd.' },
]

const SOORTEN = {
  vraag: ['brief'],
  bronnen: ['research', 'bron'],
  lesinhoud: ['spreektekst', 'slides'],
  oefening: ['werkboek', 'oefening'],
}
const SOORT_LABEL = { brief: 'Brief', research: 'Research', bron: 'Bronstuk', spreektekst: 'Spreektekst', slides: 'Slides', werkboek: 'Werkboek', oefening: 'Oefening' }
const BRON_STATUSSEN = ['ongelezen', 'gelezen', 'kernbron']
const BESLISSING_STATUSSEN = ['open', 'beslist']
const MAX_STELLING = 280

const isLijst = Array.isArray
const isObject = (w) => w !== null && typeof w === 'object' && !Array.isArray(w)
const heeftId = (w) => (typeof w === 'number' && Number.isFinite(w)) || (typeof w === 'string' && w.trim() !== '')
const zelfde = (a, b) => heeftId(a) && heeftId(b) && String(a).trim() === String(b).trim()
const route = (soort, id) => `#/${soort}/${encodeURIComponent(String(id).trim())}`

/* Alles wat je leest moet zijn wat er staat: omkerende en onzichtbare tekens vallen weg, witruimte
   wordt één spatie. De uitvoer is platte tekst; opmaak of HTML wordt nooit uitgewerkt. */
function schoon(w) {
  return (typeof w === 'string' ? w : '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const kort = (tekst, max) => (tekst.length > max ? `${tekst.slice(0, max)}…` : tekst)
const tijdstip = (w) => {
  if (typeof w !== 'string' && !(w instanceof Date)) return null
  const d = new Date(w)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function leesBlok(blok) {
  if (!isObject(blok) || !heeftId(blok.id)) return null
  const id = String(blok.id).trim()
  return { id, code: schoon(blok.code), titel: schoon(blok.titel), route: route('blok', id) }
}

/* Alleen objecten met een bruikbaar id; een id dat dubbel voorkomt telt één keer (de eerste). */
function metId(lijst) {
  const gezien = new Set()
  return lijst.filter((x) => {
    if (!isObject(x) || !heeftId(x.id)) return false
    const sleutel = String(x.id).trim()
    if (gezien.has(sleutel)) return false
    gezien.add(sleutel)
    return true
  })
}

function stukItem(d) {
  const type = typeof d.soort === 'string' ? d.soort : null
  const bytes = typeof d.bytes === 'number' && Number.isFinite(d.bytes) && d.bytes >= 0 ? d.bytes : null
  return {
    soort: 'stuk',
    id: d.id,
    titel: schoon(d.titel) || (type && SOORT_LABEL[type]) || 'Stuk zonder titel',
    route: route('doc', d.id),
    type,
    label: (type && SOORT_LABEL[type]) || null,
    bytes,
    leeg: bytes === 0, // alleen een uitdrukkelijke 0 telt; een onbekende grootte is geen leeg stuk
  }
}

const volgorde = (soorten) => (a, b) =>
  soorten.indexOf(a.soort) - soorten.indexOf(b.soort) ||
  schoon(a.titel).localeCompare(schoon(b.titel), 'nl', { numeric: true, sensitivity: 'base' })

function stukken(docs, soorten) {
  return docs.filter((d) => soorten.includes(d.soort)).sort(volgorde(soorten)).map(stukItem)
}

/* Een bron hoort bij het dagdeel van haar eigen blok_id. Heeft ze er geen, dan telt het stuk waaraan ze
   hangt. Zegt ze zelf dat ze bij een ander dagdeel hoort, dan wint dat altijd. */
function bronItems(bronnen, docs, blokId) {
  const eigenDocs = new Set((docs ?? []).map((d) => String(d.id).trim()))
  return metId(bronnen)
    .filter((b) => (heeftId(b.blok_id) ? zelfde(b.blok_id, blokId) : docs !== null && heeftId(b.document_id) && eigenDocs.has(String(b.document_id).trim())))
    .map((b) => ({
      soort: 'bron',
      id: b.id,
      titel: schoon(b.titel) || 'Bron zonder titel',
      route: route('bron', b.id),
      status: BRON_STATUSSEN.includes(b.status) ? b.status : null,
    }))
}

function notitieStand(notities, blokId) {
  const eigen = notities.filter((n) => isObject(n) && (heeftId(n.id) || schoon(n.tekst) !== '') &&
    (n.doel_type === undefined || n.doel_type === null || n.doel_type === 'blok') &&
    (n.doel_id === undefined || n.doel_id === null || zelfde(n.doel_id, blokId)))
  let laatste = null
  for (const n of eigen) {
    const datum = tijdstip(n.created_at)
    if (datum && (!laatste || datum > laatste.datum)) laatste = { auteur: schoon(n.auteur), datum }
  }
  return { aantal: eigen.length, laatste }
}

/* Een beslissing heeft in de database geen dagdeel. Ze hoort bij dit dagdeel als ze het zelf zegt
   (blok_id) of als een van haar vaste bronstukken (beslissing-review.js) in dit dagdeel staat. */
function beslissingItems(beslissingen, alleDocs, blokId) {
  return metId(beslissingen)
    .filter((b) => zelfde(b.blok_id, blokId) ||
      (alleDocs !== null && bronnenVoorBeslissing(b, alleDocs).some((k) => k.document && zelfde(k.document.blok_id, blokId))))
    .map((b) => ({
      soort: 'beslissing',
      id: b.id,
      titel: schoon(b.titel) || 'Beslissing zonder titel',
      route: route('beslissing', b.id),
      status: BESLISSING_STATUSSEN.includes(b.status) ? b.status : null,
    }))
}

/* Eén stand uit wat er is gevonden. Stukken van 0 bytes tellen als aanwezig om naartoe te kunnen
   klikken, maar maken van een stap nog geen gevulde stap. */
function standVan(items) {
  if (items.length === 0) return { stand: 'leeg', reden: null }
  if (items.every((i) => i.leeg === true)) return { stand: 'leeg', reden: 'zonder-inhoud' }
  return { stand: 'aanwezig', reden: null }
}

const onbekend = (reden) => ({ stand: 'onbekend', reden, items: [], aantal: 0 })

export function bouwKeten({ blok, documentenMeta, bronnen, notities, beslissingen, doel, doelBron, stelling, stellingBron, geladen } = {}) {
  const dagdeel = leesBlok(blok)
  const klaarMetLaden = geladen !== false
  if (!dagdeel) return { blok: null, geladen: klaarMetLaden, stappen: [] }

  const alleDocs = isLijst(documentenMeta) ? metId(documentenMeta) : null
  const docs = alleDocs && alleDocs.filter((d) => zelfde(d.blok_id, dagdeel.id))
  const briefs = docs ? stukken(docs, SOORTEN.vraag) : []
  const zoekplek = briefs.find((b) => !b.leeg)

  const bouwStap = (def) => {
    if (!klaarMetLaden) return onbekend('laden')
    const { id } = def
    if (SOORTEN[id] && id !== 'bronnen') {
      if (!docs) return onbekend('niet-aangeleverd')
      const items = stukken(docs, SOORTEN[id])
      const doelStuk = id === 'vraag' && briefs.find((b) => zelfde(b.id, doelBron?.id))
      const doelTekst = doelStuk && typeof doel === 'string' ? kort(schoon(doel), MAX_STELLING) : ''
      return { ...standVan(items), items, aantal: items.length, ...(doelTekst ? { doelTekst, doelHerkomst: { route: doelStuk.route, titel: doelStuk.titel } } : {}) }
    }
    if (id === 'bronnen') {
      if (!docs && !isLijst(bronnen)) return onbekend('niet-aangeleverd')
      const items = [...(isLijst(bronnen) ? bronItems(bronnen, docs, dagdeel.id) : []), ...(docs ? stukken(docs, SOORTEN.bronnen) : [])]
      const reden = !docs || !isLijst(bronnen) ? 'onvolledig' : null
      const gevonden = standVan(items)
      return { ...gevonden, reden: gevonden.reden ?? reden, items, aantal: items.length }
    }
    if (id === 'stelling') {
      if (typeof stelling === 'string') {
        const tekst = kort(schoon(stelling), MAX_STELLING)
        const bron = briefs.find((b) => zelfde(b.id, stellingBron?.id))
        const herkomst = bron ? { route: bron.route, titel: bron.titel } : null
        return tekst
          ? { stand: 'aanwezig', reden: null, items: [], aantal: 1, tekst, herkomst, verwijzing: null }
          : { stand: 'leeg', reden: null, items: [], aantal: 0, tekst: '', herkomst: null, verwijzing: null }
      }
      return { ...onbekend('niet-vastgelegd'), tekst: '', verwijzing: zoekplek ? { route: zoekplek.route, titel: zoekplek.titel } : null }
    }
    if (id === 'feedback') {
      if (!isLijst(notities)) return { ...onbekend('niet-aangeleverd'), laatste: null, route: dagdeel.route }
      const { aantal, laatste } = notitieStand(notities, dagdeel.id)
      return { stand: aantal > 0 ? 'aanwezig' : 'leeg', reden: null, items: [], aantal, laatste, route: dagdeel.route }
    }
    // bijsturing
    if (!isLijst(beslissingen)) return onbekend('niet-aangeleverd')
    const items = beslissingItems(beslissingen, alleDocs, dagdeel.id)
    const gevonden = standVan(items)
    // Zonder de stukken kan de bronkoppeling niet beoordeeld worden: zeg dat er mogelijk meer bestaat.
    return { ...gevonden, reden: gevonden.reden ?? (alleDocs === null && beslissingen.length > 0 ? 'onvolledig' : null), items, aantal: items.length }
  }

  return {
    blok: dagdeel,
    geladen: klaarMetLaden,
    stappen: KETEN_STAPPEN.map((def) => ({ id: def.id, naam: def.naam, doel: def.doel, telt: def.telt, ...bouwStap(def) })),
  }
}
