import React, { useEffect, useRef } from 'react'
import { Icoon } from './Icoon'
import './werkboek-balk.css'

/* Grote tags boven het werkboek: elk stuk van het stuk is één tag. De pijlen
   gaan naar de vorige of volgende tag, de actieve tag loopt mee met het scrollen.
   Rechts staat waar de vorige lezer klikte en de walkthrough met context. */
export function WerkboekBalk({
  secties = [], actiefId = null, opSectie, opVorige, opVolgende,
  laatste = null, opLaatste, aantalComments = 0, opWalkthrough,
}) {
  const rij = useRef(null)
  const eerste = !secties.length || actiefId === secties[0]?.id
  const laatsteTag = !secties.length || actiefId === secties[secties.length - 1]?.id

  useEffect(() => {
    const knop = rij.current?.querySelector('[aria-current="location"]')
    if (knop?.scrollIntoView) knop.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [actiefId])

  if (!secties.length) return null

  return (
    <nav className="wb-balk" aria-label="Door het werkboek">
      <div className="wb-pijlen">
        <button type="button" className="wb-pijl" onClick={opVorige} disabled={eerste} aria-label="Vorige tag" title="Vorige tag">←</button>
        <button type="button" className="wb-pijl" onClick={opVolgende} disabled={laatsteTag} aria-label="Volgende tag" title="Volgende tag">→</button>
      </div>

      <ol className="wb-tags" ref={rij}>
        {secties.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`wb-tag ${s.niveau === 3 ? 'diep' : ''} ${actiefId === s.id ? 'aan' : ''}`}
              aria-current={actiefId === s.id ? 'location' : undefined}
              title={s.titel}
              onClick={() => opSectie?.(s)}
            >
              <span className="wb-nr">{String(i + 1).padStart(2, '0')}</span>
              <span className="wb-titel">{s.titel}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wb-rechts">
        {laatste && (
          <button type="button" className="wb-klik" onClick={opLaatste} title={`Laatste klik van ${laatste.gebruiker || 'de vorige lezer'}: ${laatste.fragment}`}>
            <Icoon naam="cursor" maat={12} />
            <span className="wb-klik-label">Laatste klik</span>
            <span className="wb-klik-wie">{laatste.gebruiker || 'vorige lezer'}</span>
          </button>
        )}
        <button type="button" className="knop primair wb-start" onClick={opWalkthrough} disabled={!aantalComments}>
          <Icoon naam="chevronRechts" maat={14} /> Walkthrough{aantalComments ? ` · ${aantalComments}` : ''}
        </button>
      </div>
    </nav>
  )
}