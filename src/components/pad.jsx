import React from 'react'
import { padVoorRoute } from '../lib/pad'
import './pad.css'

/* Het pad bovenaan zegt waar je staat in de masterclass, niet waar je vandaan kwam:
   Werkbank › Dag 1 · de spiegel › 1.3 · ETF's › werkboek, met de positie erbij. */
export function Pad({ route, naar, blokken, documentenMeta, bronnen, dagTitels, opTerug }) {
  const pad = padVoorRoute(route, { blokken, documentenMeta, bronnen, dagTitels })
  const laatste = pad.delen.length - 1
  return (
    <nav className="plek-pad" aria-label="Plek in de masterclass">
      <span className="plek-label">Plek</span>
      <ol className="plek-delen">
        {pad.delen.map((deel, i) => (
          <li key={`${deel.label}-${i}`}>
            {deel.route && i !== laatste ? (
              <button type="button" className={`plek-knop${deel.titel ? ' plek-dagdeel' : ''}`} title={deel.titel || deel.label} onClick={() => naar(deel.route)}>{deel.label}</button>
            ) : (
              <span className={i === laatste ? 'plek-huidig' : 'plek-stil'} aria-current={i === laatste ? 'page' : undefined} title={deel.titel || deel.label}>{deel.label}</span>
            )}
          </li>
        ))}
      </ol>
      {pad.positie && (
        <>
          <span className="plek-positie plek-positie-lang" title="Waar dit dagdeel staat in de vierdaagse">{pad.positie}</span>
          <span className="plek-positie plek-positie-kort" title="Waar dit dagdeel staat in de vierdaagse">{pad.positieKort || pad.positie}</span>
        </>
      )}
      {opTerug && (
        <button type="button" className="plek-terug" onClick={opTerug} aria-label="Terug naar de vorige pagina" title="Terug">
          ←
        </button>
      )}
    </nav>
  )
}