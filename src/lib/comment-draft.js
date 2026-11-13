/* Een concept-comment of -antwoord dat nog niet verstuurd is, overleeft
   navigatie, het open/dicht klappen van de modal en een realtime-wijziging
   elders. Eén gesprek heeft één concept, of dat gesprek nu in het paneel of
   in de walkthrough wordt getoond: de sleutel is per auteur, per doel en per
   gesprek (de wortel-id, of "nieuw" voor een nog te beginnen comment). */

const VOORVOEGSEL = 'werkbank_klad_comment'

export function sleutelVoorKlad({ auteur = '', doelType = '', doelId = '', threadId = null } = {}) {
  return `${VOORVOEGSEL}:${auteur}:${doelType}:${doelId}:${threadId == null ? 'nieuw' : threadId}`
}

function veiligeOpslag(opslag) {
  if (opslag) return opslag
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function leesKlad(sleutel, { opslag } = {}) {
  const s = veiligeOpslag(opslag)
  if (!s) return ''
  try {
    return s.getItem(sleutel) || ''
  } catch {
    return ''
  }
}

export function bewaarKlad(sleutel, tekst, { opslag } = {}) {
  const s = veiligeOpslag(opslag)
  if (!s) return
  try {
    if (String(tekst ?? '').trim()) s.setItem(sleutel, tekst)
    else s.removeItem(sleutel)
  } catch {
    /* geblokkeerde of volle opslag: het concept blijft in elk geval in het veld staan */
  }
}

export function wisKlad(sleutel, { opslag } = {}) {
  const s = veiligeOpslag(opslag)
  if (!s) return
  try {
    s.removeItem(sleutel)
  } catch {
    /* niets te wissen als de opslag toch al niet werkte */
  }
}
