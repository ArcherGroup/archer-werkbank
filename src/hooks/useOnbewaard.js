import { useEffect } from 'react'
import { zetVies } from '../lib/vies.js'

/* Elke invoer bewaakt zichzelf, zonder andere velden vrij te geven. */
export function activeerOnbewaard(venster) {
  const stopBewaking = zetVies(() => true)
  const waarschuw = (e) => { e.preventDefault(); e.returnValue = '' }
  venster.addEventListener('beforeunload', waarschuw)
  return () => {
    stopBewaking()
    venster.removeEventListener('beforeunload', waarschuw)
  }
}

export function useOnbewaard(actief) {
  useEffect(() => {
    if (!actief) return
    return activeerOnbewaard(window)
  }, [actief])
}
