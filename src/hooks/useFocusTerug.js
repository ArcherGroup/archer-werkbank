import { useEffect, useRef } from 'react'

// Onthoudt wie de focus had toen de laag opende en zet die terug bij sluiten.
// APG-dialoogregel: "focus returns to the element that invoked the dialog" —
// behalve als dat element verdwenen is; kies dan een logische terugval.
export function useFocusTerug(open, terugval) {
  const vorige = useRef(null)
  const val = useRef(terugval)
  val.current = terugval

  useEffect(() => {
    if (!open) return
    vorige.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const doel = vorige.current
      // Alleen terugzetten als het element nog bestaat (realtime kan het
      // weggehaald hebben) én focusbaar is; anders de terugval.
      if (doel && doel.isConnected && typeof doel.focus === 'function') doel.focus()
      else val.current?.()?.focus?.()
    }
  }, [open])
}
