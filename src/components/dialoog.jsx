import React, { useEffect, useRef, useState } from 'react'
import { useEscape } from '../hooks/useEscape'
import { useFocusTrap } from '../hooks/useFocusTrap'

/* Dialogen volgens de APG-regels:
   - titel beschrijft de situatie concreet ("Versie 3 terugzetten?")
   - de knop is een werkwoord dat de uitkomst benoemt ("Terugzetten")
   - "Annuleer" heet altijd "Annuleer", maximaal één destructieve knop
   - Escape en klik-buiten annuleren allebei
   - focus gaat naar de kaart en terug naar de oproeper bij sluiten */

export function Dialoog({ open, titel, tekst, actie = 'Bevestig', opBevestig, opAnnuleer, verscheurend = false }) {
  const kaart = useRef(null)
  const terug = useRef(null)

  useEscape(() => opAnnuleer?.(), open)
  useFocusTrap(kaart, open)

  useEffect(() => {
    if (!open) return
    terug.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    kaart.current?.focus()
    return () => {
      if (terug.current?.isConnected) terug.current.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="dialoog-achtergrond"
      onMouseDown={(e) => e.target === e.currentTarget && opAnnuleer?.()}
    >
      <div
        className="dialoog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dl-t"
        ref={kaart}
        tabIndex={-1}
      >
        <h2 id="dl-t">{titel}</h2>
        {tekst && <p>{tekst}</p>}
        <div className="knoppen">
          <button className="knop" onClick={opAnnuleer}>
            Annuleer
          </button>
          <button
            className={`knop ${verscheurend ? 'verscheurend' : 'primair'}`}
            onClick={opBevestig}
            autoFocus={false}
          >
            {actie}
          </button>
        </div>
      </div>
    </div>
  )
}

/* InvoerDialoog: vervangt window.prompt met dezelfde regels (bv. nieuw stuk). */
export function InvoerDialoog({
  open,
  titel,
  tekst,
  label,
  placeholder = '',
  beginwaarde = '',
  actie = 'Toevoegen',
  opBevestig,
  opAnnuleer,
}) {
  const [waarde, setWaarde] = useState(beginwaarde)
  const invoer = useRef(null)
  const terug = useRef(null)
  const kaart = useRef(null)

  useEscape(() => opAnnuleer?.(), open)
  useFocusTrap(kaart, open)

  useEffect(() => {
    if (!open) return
    terug.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setWaarde(beginwaarde)
    const t = setTimeout(() => invoer.current?.focus(), 30)
    return () => {
      clearTimeout(t)
      if (terug.current?.isConnected) terug.current.focus?.()
    }
  }, [open, beginwaarde])

  if (!open) return null

  const klaar = () => {
    const w = waarde.trim()
    if (w) opBevestig?.(w)
  }

  return (
    <div
      className="dialoog-achtergrond"
      onMouseDown={(e) => e.target === e.currentTarget && opAnnuleer?.()}
    >
      <div className="dialoog" role="dialog" aria-modal="true" aria-labelledby="iv-t" ref={kaart} tabIndex={-1}>
        <h2 id="iv-t">{titel}</h2>
        {tekst && <p>{tekst}</p>}
        {label && <label className="veldlabels">{label}</label>}
        <input
          ref={invoer}
          value={waarde}
          placeholder={placeholder}
          onChange={(e) => setWaarde(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              klaar()
            }
          }}
        />
        <div className="knoppen">
          <button className="knop" onClick={opAnnuleer}>
            Annuleer
          </button>
          <button className="knop primair" onClick={klaar} disabled={!waarde.trim()}>
            {actie}
          </button>
        </div>
      </div>
    </div>
  )
}
