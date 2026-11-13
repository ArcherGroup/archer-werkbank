/* Het werkboek in stukken knippen op zijn eigen koppen, zodat je met grote tags
   door het stuk kunt gaan en een comment altijd zijn context kan tonen.
   Alle vergelijkingen gebeuren op platte tekst: opmaakstreepjes mogen nooit
   bepalen of een zin gevonden wordt. */

const MAX_TITEL = 70
const MAX_CONTEXT = 420

function plat(tekst) {
  return String(tekst ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function slug(tekst) {
  return plat(tekst)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'deel'
}

/* Alle koppen van niveau 2 en 3, in leesorde, met hun regelbereik erbij. */
function koppen(markdown) {
  const regels = String(markdown ?? '').split(/\r?\n/)
  const gezien = new Map()
  const uit = []
  regels.forEach((regel, i) => {
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(regel)
    if (!m) return
    const titel = plat(m[2]).slice(0, MAX_TITEL)
    if (!titel) return
    const basis = slug(titel)
    const aantal = (gezien.get(basis) ?? 0) + 1
    gezien.set(basis, aantal)
    uit.push({ id: aantal === 1 ? basis : `${basis}-${aantal}`, niveau: m[1].length, titel, van: i })
  })
  uit.forEach((s, i) => { s.tot = i + 1 < uit.length ? uit[i + 1].van - 1 : regels.length - 1 })
  return uit
}

export function leesSecties(markdown) {
  return koppen(markdown).map(({ id, niveau, titel, van }) => ({ id, niveau, titel, regel: van }))
}

function tekstVanSectie(markdown, sectie) {
  const regels = String(markdown ?? '').split(/\r?\n/)
  return plat(regels.slice(sectie.van, sectie.tot + 1).join('\n'))
}

/* In welk stuk staat deze zin? Eerst exact, dan op de eerste veertig tekens,
   zodat een afgekapte kliktekst toch zijn stuk vindt. */
export function sectieVoorAnker(markdown, anker, secties) {
  const doel = plat(anker)
  if (!doel) return null
  const lijst = koppen(markdown)
  const gezocht = [doel, doel.slice(0, 40)].filter((t) => t.length >= 12)
  for (const term of gezocht) {
    for (const s of lijst) {
      if (tekstVanSectie(markdown, s).includes(term)) {
        const gevonden = (Array.isArray(secties) ? secties : leesSecties(markdown)).find((x) => x.id === s.id)
        return gevonden || { id: s.id, niveau: s.niveau, titel: s.titel, regel: s.van }
      }
    }
  }
  return null
}

function alineas(markdown) {
  return String(markdown ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/* Een lang stuk tekst netjes afknippen: niet midden in een woord of zin. */
function knipLinks(tekst, max) {
  const s = String(tekst ?? '')
  if (s.length <= max) return s
  const stuk = s.slice(-max)
  const grens = stuk.indexOf('. ')
  if (grens >= 0 && stuk.length - grens > 80) return stuk.slice(grens + 2)
  return stuk
}

function knipRechts(tekst, max) {
  const s = String(tekst ?? '')
  if (s.length <= max) return s
  const stuk = s.slice(0, max)
  const grens = stuk.lastIndexOf('. ')
  if (grens >= 0 && grens > 80) return stuk.slice(0, grens + 1)
  return stuk
}

/* Begint de tekst midden in een woord of zin, schuif dan naar de eerste zinsgrens. */
function netteStart(tekst) {
  const s = String(tekst ?? '')
  if (!s) return s
  if (/^[A-ZÀ-Ý0-9"“(]/.test(s)) return s
  const grens = s.indexOf('. ')
  if (grens >= 0 && s.length - grens > 60) return s.slice(grens + 2)
  return s
}

/* De alinea met het anker, met de alinea ervoor en erna, zodat de lezer ziet
   waar de zin in het stuk staat. Geeft `sectieId` de voorkeur aan het stuk waar
   de comment echt bij hoort: hetzelfde anker kan vaker in een stuk staan. */
export function contextVoorAnker(markdown, anker, { sectieId = null } = {}) {
  const doel = plat(anker)
  if (!doel) return null
  let bron = String(markdown ?? '')
  if (sectieId) {
    const s = koppen(bron).find((k) => k.id === sectieId)
    if (s) {
      const regels = bron.split(/\r?\n/)
      bron = regels.slice(s.van, s.tot + 1).join('\n')
    }
  }
  const alle = alineas(bron)
  const platte = alle.map(plat)
  let index = platte.findIndex((p) => p.includes(doel))
  if (index < 0) index = platte.findIndex((p) => p.includes(doel.slice(0, 40)))
  if (index < 0) return null
  const eigen = platte[index]
  const binnen = eigen.indexOf(doel) >= 0 ? eigen.indexOf(doel) : eigen.indexOf(doel.slice(0, 40))
  const voor = netteStart(knipLinks(eigen.slice(0, binnen), MAX_CONTEXT))
  const na = knipRechts(eigen.slice(binnen + doel.length), MAX_CONTEXT)
  // Een kop is geen contextzin: die wordt de titel van het stuk, niet de alinea ervoor.
  const isKop = (i) => /^#{1,3}\s/.test(String(alle[i] ?? '').trim())
  let boven = index - 1
  while (boven >= 0 && isKop(boven)) boven -= 1
  const ervoor = boven >= 0 ? netteStart(knipLinks(platte[boven], MAX_CONTEXT)) : ''
  let titelIndex = index - 1
  while (titelIndex >= 0 && !isKop(titelIndex)) titelIndex -= 1
  const sectieTitel = titelIndex >= 0 ? plat(String(alle[titelIndex]).replace(/^#{1,3}\s*/, '')) : ''
  const erna = index + 1 < platte.length && !isKop(index + 1) ? knipRechts(platte[index + 1], MAX_CONTEXT) : ''
  return { voor, anker: doel, na, ervoor, erna, sectieTitel, alinea: index + 1, alineas: alle.length }
}

/* Waar stond de vorige klik? Bewaar het stuk en de zin, geen pixelpositie:
   dezelfde plek moet ook kloppen na een herschrijving. */
export function plekVanKlik({ markdown, element, documentId, gebruiker = '', nu = new Date().toISOString() }) {
  const tekst = String(markdown ?? '')
  const leesElement = element?.cloneNode ? element.cloneNode(true) : element
  leesElement?.querySelectorAll?.('button.comment-pin').forEach((pin) => pin.remove())
  const fragment = plat(leesElement?.textContent).slice(0, 90)
  if (!fragment) return null
  const secties = leesSecties(tekst)
  const sectie = sectieVoorAnker(tekst, fragment, secties)
  return {
    document_id: String(documentId ?? ''),
    gebruiker: String(gebruiker ?? '').slice(0, 40),
    sectie: sectie ? sectie.id : '',
    fragment,
    created_at: nu,
  }
}
/* Alle alinea's van één stuk, plat, zonder de kop zelf. Zo kan de walkthrough
   het hele stuk tonen in plaats van alleen de zin eromheen. */
export function sectieAlineas(markdown, sectieId) {
  const s = koppen(markdown).find((k) => k.id === sectieId)
  if (!s) return []
  const regels = String(markdown ?? '').split(/\r?\n/)
  const deel = regels.slice(s.van + 1, s.tot + 1).join('\n')
  // Een opsomming is geen alinea maar een reeks punten: elk punt apart, anders
  // valt de helft van het stuk weg in de walkthrough.
  return alineas(deel)
    .flatMap((p) => (/^\s*[-*•]\s+/m.test(p)
      ? p.split(/\r?\n/).map((r) => plat(r.replace(/^\s*[-*•]\s+/, ''))).filter(Boolean)
      : [plat(p)]))
    .filter(Boolean)
}
