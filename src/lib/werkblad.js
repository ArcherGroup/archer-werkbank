/* Maak het werkblad uit actuele brondocumenten. Ontbrekende secties blijven
   leeg: de interface mag geen inhoud verzinnen als een bron ontbreekt. */
function normaliseerKop(kop) {
  return String(kop ?? '').replace(/[*_`]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('nl-BE')
}

export function haalSectie(markdown, titel) {
  if (typeof markdown !== 'string' || !titel) return ''
  const regels = markdown.replace(/\r\n/g, '\n').split('\n')
  const gewenst = normaliseerKop(titel)
  let begin = -1
  let niveau = 0
  for (let i = 0; i < regels.length; i += 1) {
    const kop = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(regels[i])
    if (kop && normaliseerKop(kop[2]) === gewenst) {
      begin = i + 1
      niveau = kop[1].length
      break
    }
  }
  if (begin < 0) return ''
  let einde = regels.length
  for (let i = begin; i < regels.length; i += 1) {
    const kop = /^(#{1,6})\s+/.exec(regels[i])
    if (kop && kop[1].length <= niveau) {
      einde = i
      break
    }
  }
  return regels.slice(begin, einde).join('\n').trim()
}

function eersteAlineaUitSectie(markdown, kop) {
  const sectie = haalSectie(markdown, kop)
  if (!sectie) return null
  const eersteAlinea = sectie.split(/\n\s*\n/).find((alinea) => alinea.trim()) || ''
  const tekst = eersteAlinea.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|__|`/g, '').replace(/^\s*>\s?/gm, '').replace(/\s+/g, ' ').trim()
  return tekst || null
}

export function kernboodschapVoorKeten(markdown) {
  return eersteAlineaUitSectie(markdown, 'Kernboodschap')
}

function tekstVoorDagdeel(document, briefMeta, blokId, kop) {
  if (!document || !briefMeta || document.id !== briefMeta.id || document.blok_id !== blokId || briefMeta.blok_id !== blokId) return null
  const tekst = eersteAlineaUitSectie(document.inhoud, kop)
  return tekst ? { tekst, bron: { id: briefMeta.id } } : null
}

export function stellingVoorDagdeel(document, briefMeta, blokId) {
  return tekstVoorDagdeel(document, briefMeta, blokId, 'Kernboodschap')
}

export function doelVoorDagdeel(document, briefMeta, blokId) {
  return tekstVoorDagdeel(document, briefMeta, blokId, 'Doel')
}

export function vorigeDagen(markdown) {
  const tekst = haalSectie(markdown, 'Hergebruik uit september')
  const nummers = Array.from(tekst.matchAll(/\bdag\s*([0-4])\b/gi), (m) => Number(m[1]))
  return [...new Set(nummers)]
}

export function maakVergelijking(markdown) {
  return {
    kern: haalSectie(markdown, 'Kernboodschap'),
    stam: haalSectie(markdown, 'De plek in de stam'),
    september: haalSectie(markdown, 'Hergebruik uit september'),
    nietMeer: haalSectie(markdown, 'Niet meer doen'),
    feedback: haalSectie(markdown, 'Lessen uit de Telegram-feedback') || haalSectie(markdown, 'Lessen uit de Telegram feedback'),
    controle: haalSectie(markdown, 'Te controleren'),
  }
}

export function vindBrief(documenten, blokId) {
  const passende = (Array.isArray(documenten) ? documenten : []).filter(
    (d) => d.blok_id === blokId && d.soort === 'brief' && normaliseerKop(d.titel) === 'brief',
  )
  return passende.length === 1 ? passende[0] : null
}

export function haalLagen(markdown) {
  const sectie = haalSectie(markdown, '2. De rode draad in één zin')
  return sectie.split('\n')
    .filter((regel) => /^\s*\|/.test(regel))
    .map((regel) => regel.split('|').slice(1, -1).map((cel) => cel.trim()))
    .filter((cellen) => cellen.length >= 3 && /^\*\*[ABCD]\s*·/.test(cellen[0]))
    .map(([naam, uitleg, waar]) => ({ naam: naam.replace(/\*\*/g, ''), uitleg, waar }))
}

export function eerstePunten(tekst, limiet = 2) {
  if (typeof tekst !== 'string' || limiet <= 0) return []
  return tekst.replace(/\r\n/g, '\n').split('\n')
    .map((regel) => /^\s*(?:\d+[.)]|[-*])\s+(.+?)\s*$/.exec(regel)?.[1])
    .filter(Boolean)
    .slice(0, limiet)
}
