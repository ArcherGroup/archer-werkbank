// Eén plek voor alles wat met toetsen en platform te maken heeft.

// userAgentData.platform is de moderne variant (Chromium); platform is de
// brede terugval. Beide zijn "best effort" — de modifier-labels zijn een hint,
// nooit een gedragsvoorwaarde.
const platform =
  (typeof navigator !== 'undefined' && (navigator.userAgentData?.platform || navigator.platform)) || ''
export const isApple = /mac|iphone|ipad|ipod/i.test(platform)

// Weergave: ⌘ op Apple, Ctrl elders.
export const MOD = isApple ? '⌘' : 'Ctrl'
// Voor aria-keyshortcuts kent de spec 'Meta' (= Command) en 'Control'.
const MOD_ARIA = isApple ? 'Meta' : 'Control'

export function ariaShortcut(toets, { shift = false, alt = false } = {}) {
  return [MOD_ARIA, ...(alt ? ['Alt'] : []), ...(shift ? ['Shift'] : []), toets].join('+')
}

// Is de platform-modifier ingedrukt? Nooit `metaKey || ctrlKey` mengen:
// op macOS is Ctrl+K een controleteken, op Windows is Meta+K de Windows-toets.
export function metMod(e) {
  return isApple ? e.metaKey : e.ctrlKey
}

// Toets zonder case-verrassingen: met Caps Lock geeft e.key 'K' terug.
export function kaleToets(e) {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key
}

// Zit de focus in iets waar de gebruiker typt? (globale lettertoetsen overslaan)
export function inInvoerveld(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
