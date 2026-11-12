import React, { useEffect, useRef } from 'react'
import { Icoon } from './Icoon'
import { Toets } from './tip'
import { useEscape } from '../hooks/useEscape'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { MOD } from '../lib/keys'

/* Hulp (?): alle sneltoetsen op één kaart. */

const RIJEN = [
  { wat: 'Zoeken en springen', toets: 'K' },
  { wat: 'Deze hulp', toets: null, los: '?' },
  { wat: 'Sluiten / annuleren', toets: null, los: 'Esc' },
  { wat: 'Door een lijst gaan', toets: null, los: '↑ ↓ of j k' },
  { wat: 'Openen', toets: null, los: '⏎' },
  { wat: 'Eerste of laatste in een lijst', toets: null, los: 'Home / End' },
  { wat: 'Stuk bewaren (in de bewerker)', toets: 'S' },
  { wat: 'Notitie bewaren', toets: null, los: `${MOD}⏎` },
  { wat: 'Comments aan of uit', toets: null, los: 'C' },
  { wat: 'Walkthrough: vorige en volgende', toets: null, los: '← →' },
]

export function Hulp({ open, opSluiten }) {
  const kaart = useRef(null)
  const terug = useRef(null)

  useEscape(() => opSluiten?.(), open)
  useFocusTrap(kaart, open)

  useEffect(() => {
    if (!open) return
    terug.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const t = setTimeout(() => kaart.current?.focus(), 30)
    return () => {
      clearTimeout(t)
      if (terug.current?.isConnected) terug.current.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="dialoog-achtergrond"
      onMouseDown={(e) => e.target === e.currentTarget && opSluiten?.()}
    >
      <div
        className="dialoog hulp-kaart"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hulp-t"
        ref={kaart}
        tabIndex={-1}
      >
        <h2 id="hulp-t">Sneltoetsen</h2>
        <p>Alles wat je met het toetsenbord kunt doen, zonder de muis.</p>
        <div>
          {RIJEN.map((r) => (
            <div className="hulp-rij" key={r.wat}>
              <span className="wat">{r.wat}</span>
              <span>
                {r.toets ? <Toets k={r.toets} /> : <kbd className="toets">{r.los}</kbd>}
              </span>
            </div>
          ))}
        </div>
        <div className="knoppen">
          <button className="knop primair" onClick={() => opSluiten?.()}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  )
}