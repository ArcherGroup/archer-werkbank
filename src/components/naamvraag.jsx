import React, { useState } from 'react'

/* Naamvraag bij het eerste bezoek. */

export function Naamvraag({ opNaam }) {
  const [naam, setNaam] = useState('')
  return (
    <div className="naam-achtergrond">
      <div className="naam-kaart">
        <h2>Welkom in de werkbank</h2>
        <p>
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
        <input
          value={naam}
          placeholder="Of typ je naam…"
          onChange={(e) => setNaam(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && naam.trim() && opNaam(naam.trim())}
        />
        <button className="knop primair" disabled={!naam.trim()} onClick={() => opNaam(naam.trim())}>
          Binnenkomen
        </button>
      </div>
    </div>
  )
}
