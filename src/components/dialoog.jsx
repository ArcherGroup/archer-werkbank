import React, { useEffect, useRef, useState } from 'react'
import { useEscape } from '../hooks/useEscape'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useOnbewaard } from '../hooks/useOnbewaard'
import { vraagtAfsluiten } from '../lib/dialoog'

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
  bezig = false,
  opBevestig,
  opAnnuleer,
}) {
  const [waarde, setWaarde] = useState(beginwaarde)
  const [afsluitVraag, setAfsluitVraag] = useState(false)
  const invoer = useRef(null)
  const terug = useRef(null)
  const kaart = useRef(null)
  const aangepast = vraagtAfsluiten(waarde, beginwaarde)
  useOnbewaard(open && aangepast)

  const sluit = () => {
    if (bezig) return
    if (afsluitVraag) { setAfsluitVraag(false); return }
    if (aangepast) setAfsluitVraag(true)
    else opAnnuleer?.()
  }
  useEscape(sluit, open)
  useFocusTrap(kaart, open)

  useEffect(() => {
    if (!open) return
    terug.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setWaarde(beginwaarde)
    setAfsluitVraag(false)
    const t = setTimeout(() => invoer.current?.focus(), 30)
    return () => {
      clearTimeout(t)
      if (terug.current?.isConnected) terug.current.focus?.()
    }
  }, [open, beginwaarde])

  useEffect(() => {
    if (!open) return
    if (afsluitVraag) kaart.current?.focus()
    else invoer.current?.focus()
  }, [open, afsluitVraag])

  if (!open) return null

  const klaar = () => {
    if (bezig) return
    const w = waarde.trim()
    if (w) opBevestig?.(w)
  }

  return (
    <div
      className="dialoog-achtergrond"
      onMouseDown={(e) => e.target === e.currentTarget && sluit()}
    >
      <div className="dialoog" role={afsluitVraag ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="iv-t" ref={kaart} tabIndex={-1}>
        {afsluitVraag ? <>
          <h2 id="iv-t">Invoer weggooien?</h2>
          <p>Je hebt tekst ingevuld die nog niet bewaard is.</p>
          <div className="knoppen">
            <button className="knop" onClick={() => setAfsluitVraag(false)}>Verder bewerken</button>
            <button className="knop verscheurend" onClick={opAnnuleer}>Weggooien</button>
          </div>
        </> : <>
          <h2 id="iv-t">{titel}</h2>
          {tekst && <p>{tekst}</p>}
          {label && <label className="veldlabels" htmlFor="iv-invoer">{label}</label>}
          <input
            id="iv-invoer"
            readOnly={bezig}
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
            <button className="knop" onClick={sluit} disabled={bezig}>Annuleer</button>
            <button className="knop primair" onClick={klaar} disabled={!waarde.trim() || bezig}>{actie}</button>
          </div>
        </>}
      </div>
    </div>
  )
}
