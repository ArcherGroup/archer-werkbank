import React, { useEffect, useRef, useState } from 'react'

/* Naamvraag bij het eerste bezoek. Eén vraag, twee snelle keuzes, één veld.
   Focus staat meteen in het veld; Enter komt binnen. */

export function Naamvraag({ opNaam }) {
  const [naam, setNaam] = useState('')
  const invoer = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => invoer.current?.focus(), 40)
    return () => clearTimeout(t)
  }, [])

  const klaar = () => {
    const n = naam.trim()
    if (n) opNaam(n)
  }

  return (
    <div className="naam-achtergrond">
      <div className="naam-kaart" role="dialog" aria-labelledby="naam-t" aria-describedby="naam-u">
        <div className="naam-merk" aria-hidden="true">
          A
        </div>
        <h1 id="naam-t">Welkom in de werkbank</h1>
        <p id="naam-u">
          Wie ben je? Je naam komt bij je notities, bij het bewerken en bij wie er online staat. Hij blijft alleen op dit
          toestel bewaard.
        </p>

        <div className="naam-rij">
          {['Victor', 'Anthony'].map((n) => (
            <button key={n} className="knop" onClick={() => opNaam(n)}>
              Ik ben {n}
            </button>
          ))}
        </div>

        <div className="naam-veld">
          <label className="veldlabels" htmlFor="naam-invoer">
            Of typ je naam
          </label>
          <div className="naam-invoer-rij">
            <input
              id="naam-invoer"
              ref={invoer}
              value={naam}
              placeholder="bijvoorbeeld Victor"
              autoComplete="given-name"
              onChange={(e) => setNaam(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  klaar()
                }
              }}
            />
            <button className="knop primair" disabled={!naam.trim()} onClick={klaar}>
              Binnenkomen
            </button>
          </div>
          <div className="meta-klein">Enter komt binnen · je naam wissel je later in de bovenbalk.</div>
        </div>
      </div>
    </div>
  )
}
