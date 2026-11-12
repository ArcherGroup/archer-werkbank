/* Curated source relationships: absence or ambiguity is never a guessed link. */
const CONFIG = {
  'het ggr-anker': [
    { sleutel: 'masterplan', titel: 'masterplan-februari-2027', blok: 'algemeen', label: 'Masterplan', kop: '2. De rode draad in één zin' },
    { sleutel: 'ggr', titel: 'spreektekst', blok: '4.4', label: 'Spreektekst 4.4', kop: 'Open punten voor Anthony, Bjorn en Victor' },
  ],
  'de acht criteria': [
    { sleutel: 'criteria', titel: 'criteria', blok: 'algemeen', label: 'Voorstel acht criteria', kop: 'De acht criteria' },
  ],
  'het a3-template vermogensplan': [
    { sleutel: 'zones', titel: 'werkboek', blok: '4.4', label: 'Werkboek 4.4', kop: 'Zes zones' },
    { sleutel: 'template', titel: 'A3-template-vermogensplan', blok: '4.4', label: 'A3-oefening', kop: '' },
  ],
}

function normaliseer(s) {
  return String(s ?? '').normalize('NFKC').trim().toLocaleLowerCase('nl-BE')
}

export function beslissingenBijDocument(document, beslissingen = [], documenten = [document]) {
  if (!document) return []
  return beslissingen.filter((beslissing) =>
    bronnenVoorBeslissing(beslissing, documenten).some((bron) => bron.document && String(bron.document.id) === String(document.id)),
  )
}

export function leesBrontabel(tekst) {
  const regels = String(tekst ?? '').split(/\r?\n/)
  const begin = regels.findIndex((regel) => /^\s*\|/.test(regel))
  const lijnen = []
  for (let i = begin; i >= 0 && i < regels.length && /^\s*\|/.test(regels[i]); i += 1) lijnen.push(regels[i])
  if (lijnen.length < 2 || !/^\s*\|[\s:|\-]+\|\s*$/.test(lijnen[1])) return { koppen: [], rijen: [] }
  const cellen = (regel) => regel.trim().split('|').slice(1, -1).map((cel) =>
    cel.trim().replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|`/g, ''),
  )
  return { koppen: cellen(lijnen[0]), rijen: lijnen.slice(2).map(cellen) }
}

export function bewijsAanwezig(optie, tekst) {
  if (!optie) return false
  if (!optie.bron) return true
  if (optie.bron === 'ggr') return /\b0[,.]3\b/.test(tekst || '') && /\b0[,.]6\b/.test(tekst || '') && /anker/i.test(tekst || '') && /mix/i.test(tekst || '')
  if (optie.bron === 'criteria') return leesBrontabel(tekst).rijen.length === 8
  if (optie.bron === 'zones') return leesBrontabel(tekst).rijen.length === 6
  return false
}

export function optiesVoorBeslissing(beslissing) {
  const keuze = normaliseer(beslissing?.titel)
  const opties = {
    'het ggr-anker': [
      { id: 'ggr-03', titel: '0,3% als rode-draadanker', uitleg: 'Sluit aan bij het masterplan. Het cijfer 0,6% blijft een afzonderlijk rekenvoorbeeld met zijn eigen mix.', bron: 'ggr' },
      { id: 'ggr-06', titel: '0,6% als rode-draadanker', uitleg: 'Sluit aan bij het model in 4.4. Het masterplan en de opening moeten dan op dezelfde keuze afgestemd worden.', bron: 'ggr' },
    ],
    'de acht criteria': [
      { id: 'criteria-basis', titel: 'De acht criteria als basis gebruiken', uitleg: 'Gebruik het huidige voorstel in de activablokken; controleer de invulling per dagdeel.', bron: 'criteria' },
      { id: 'criteria-aanpassen', titel: 'Het voorstel voor de criteria aanpassen', uitleg: 'Beschrijf welke criteria je wilt wijzigen. Het brondocument verandert niet automatisch.', bron: 'criteria' },
    ],
    'het a3-template vermogensplan': [
      { id: 'a3-basis', titel: 'De zes voorgestelde zones uitwerken', uitleg: 'Gebruik het werkboek en het bestaande concept als basis voor een invulbaar A3.', bron: 'zones' },
      { id: 'a3-aanpassen', titel: 'De indeling van het A3 aanpassen', uitleg: 'Beschrijf wat aan het voorstel moet veranderen voordat het wordt ontworpen.', bron: 'zones' },
    ],
  }[keuze] || []
  return [...opties, { id: 'eigen', titel: 'Een andere keuze', uitleg: 'Formuleer zelf een alternatief.', bron: null }]
}

export function bronnenVoorBeslissing(beslissing, documenten = []) {
  const specs = CONFIG[normaliseer(beslissing?.titel)] || []
  return specs.map((spec) => {
    const matches = documenten.filter((d) => d.blok_id === spec.blok && normaliseer(d.titel) === normaliseer(spec.titel))
    return { ...spec, document: matches.length === 1 ? matches[0] : null }
  })
}
