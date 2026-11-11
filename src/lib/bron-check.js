/* Herken expliciete firewall- of verificatiepagina's. Een HTTP 200 betekent
   niet noodzakelijk dat de bron zelf werd opgehaald. Alleen duidelijke
   signalen tellen mee, zodat gewone artikelen niet te snel worden afgekeurd. */
export function isBronBlokkade(titel, tekst) {
  const kop = String(titel ?? '').trim().toLowerCase()
  const begin = String(tekst ?? '').slice(0, 1600).toLowerCase()
  return /^(access denied|challenge validation|just a moment|attention required|robot check|verify you are human)\b/.test(kop) ||
    /your request was blocked by.{0,100}web application firewall/.test(begin) ||
    /^(challenge validation|access denied|checking your browser)\s*[.!…]*$/.test(begin.trim())
}

/* Ook oudere cache kan een foutpagina bevatten. Laat die nooit doorgaan voor
   de bron, maar geef de lezer een expliciete status en een weg naar buiten. */
export function zichtbareBronnen(bronnen, limiet = 200) {
  const lijst = Array.isArray(bronnen) ? bronnen : []
  const aantal = Math.max(0, Math.floor(Number(limiet) || 0))
  const items = lijst.slice(0, aantal)
  return { items, totaal: lijst.length, resterend: Math.max(0, lijst.length - items.length) }
}

export function veiligeBronUrl(adres) {
  if (typeof adres !== 'string' || adres !== adres.trim()) return null
  try {
    const u = new URL(adres)
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password) return null
    return adres
  } catch {
    return null
  }
}

export function doorverwezenAdres(oorspronkelijk, eindadres) {
  const a = veiligeBronUrl(oorspronkelijk)
  const b = veiligeBronUrl(eindadres)
  return a && b && a !== b ? b : null
}

export function isPdfBron(url) {
  try {
    return /\.pdf$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

export function isOnderhoudspagina(tekst) {
  const t = String(tekst ?? '').trim().toLowerCase()
  return t.length < 1500 && /(?:currently doing|currently undergoing|wegens|en phase de)\s+(?:gepland\s+)?(?:maintenance|onderhoud|maintenance work)/.test(t)
}

export function beoordeelBronCache(bron) {
  if (isPdfBron(bron?.url) || bron?.soort === 'pdf') return { type: 'pdf' }
  if (isOnderhoudspagina(bron?.pagina_tekst)) {
    return { type: 'onbeschikbaar', uitleg: 'De website meldde tijdelijk onderhoud. Probeer het originele adres.' }
  }
  if (isBronBlokkade(bron?.pagina_titel, bron?.pagina_tekst)) {
    return {
      type: 'geblokkeerd',
      uitleg: 'De website toont een beveiligingscontrole in plaats van de bron. Probeer het originele adres.',
    }
  }
  if (bron?.fout) return { type: 'fout', uitleg: String(bron.fout) }
  if (bron?.pagina_tekst?.trim()) return { type: 'tekst', tekst: bron.pagina_tekst }
  return { type: 'leeg' }
}
