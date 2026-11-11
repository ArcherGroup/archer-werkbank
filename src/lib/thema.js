// Thema: licht, donker of volgt het systeem. De keuze blijft op dit toestel.
// Het werkelijke thema staat altijd als data-thema op <html>, zodat de CSS
// één blok per thema nodig heeft (geen dubbele media query-blokken).
import { useCallback, useEffect, useState } from 'react'

const SLEUTEL = 'werkbank-thema'

export function leesThema() {
  try {
    const t = localStorage.getItem(SLEUTEL)
    return t === 'licht' || t === 'donker' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

function systeemDonker() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function werkelijkThema(thema) {
  return thema === 'auto' ? (systeemDonker() ? 'donker' : 'licht') : thema
}

export function pasThemaToe(thema) {
  document.documentElement.dataset.thema = werkelijkThema(thema)
}

function bewaar(thema) {
  try {
    if (thema === 'auto') localStorage.removeItem(SLEUTEL)
    else localStorage.setItem(SLEUTEL, thema)
  } catch {
    /* private mode: alleen de sessie onthoudt het */
  }
}

// [thema, kies]: thema is 'auto' | 'licht' | 'donker'; volgt het systeem
// zolang het 'auto' is.
export function gebruikThema() {
  const [thema, setThema] = useState(leesThema)

  useEffect(() => {
    pasThemaToe(thema)
    if (thema !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const f = () => pasThemaToe('auto')
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [thema])

  const kies = useCallback((t) => {
    bewaar(t)
    setThema(t)
  }, [])

  return [thema, kies]
}
