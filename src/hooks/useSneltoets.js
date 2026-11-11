import { useEffect, useRef } from 'react'
import { metMod, kaleToets, inInvoerveld } from '../lib/keys'

// Registreert een globale sneltoets met de platform-modifier (⌘ of Ctrl).
// Standaard doet hij niets als de focus in een invoerveld zit; zet
// `ookInInvoerveld: true` voor toetsen als ⌘K die overal moeten werken.
export function useSneltoets(toets, handler, { ookInInvoerveld = false, shift = false } = {}) {
  const laatste = useRef(handler)
  laatste.current = handler

  useEffect(() => {
    const opToets = (e) => {
      if (e.defaultPrevented || e.isComposing) return // IME of al afgehandeld
      if (!ookInInvoerveld && inInvoerveld(e.target)) return
      if (!metMod(e) || e.altKey || e.shiftKey !== shift) return
      if (kaleToets(e) !== toets) return
      e.preventDefault() // houd adresbalk (⌘K) en "pagina opslaan" (⌘S) tegen
      laatste.current(e)
    }
    document.addEventListener('keydown', opToets)
    return () => document.removeEventListener('keydown', opToets)
  }, [toets, ookInInvoerveld, shift])
}
