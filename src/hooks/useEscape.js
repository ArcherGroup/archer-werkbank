import { useEffect, useRef } from 'react'

// Module-stapel: [laag, laag, ...]; de laatste is de binnenste.
const stapel = []
let luistert = false

function afhandelaar(e) {
  if (e.key !== 'Escape') return
  if (e.isComposing || e.keyCode === 229) return // IME: Esc hoort bij de compositie
  const laag = stapel[stapel.length - 1]
  if (!laag) return
  const afgehandeld = laag.handler()
  if (afgehandeld === false) return // laag wilde Esc niet: laat native gedrag lopen
  e.preventDefault()
  e.stopImmediatePropagation() // geen tweede laag, geen React-handler erachter
}

// Eén listener voor de hele app; elke open laag duwt zichzelf op de stapel.
// De binnenste (laatst geopende) laag wint.
export function useEscape(handler, actief = true) {
  const laatste = useRef(handler)
  laatste.current = handler

  useEffect(() => {
    if (!actief) return
    const laag = { handler: () => laatste.current?.() }
    stapel.push(laag)
    if (!luistert) {
      // Capture-fase: vóór React's root-listener en vóór native dialogen.
      document.addEventListener('keydown', afhandelaar, true)
      luistert = true
    }
    return () => {
      const i = stapel.indexOf(laag)
      if (i !== -1) stapel.splice(i, 1)
      if (!stapel.length && luistert) {
        document.removeEventListener('keydown', afhandelaar, true)
        luistert = false
      }
    }
  }, [actief])
}
