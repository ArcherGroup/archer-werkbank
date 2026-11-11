import React from 'react'
import * as D from '../lib/data'

export function Topbar({ naam, online, opZoeken, opWissel }) {
  return (
    <div className="topbar">
      <div className="merk">
        <span className="blokje">A</span> Werkbank · Masterclass februari 2027
      </div>
      <button className="zoekknop" onClick={opZoeken}>
        <span>Zoek of spring…</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="topbar-rechts">
        <div className="aanwezig">
          {online.slice(0, 5).map((n) => (
            <span key={n} className="stip" style={{ background: D.kleurVoor(n) }} title={`${n} is online`}>
              {D.initialen(n)}
            </span>
          ))}
        </div>
        <button className="ik-knop" onClick={opWissel} title="Naam wisselen">
          <span className="stip" style={{ background: D.kleurVoor(naam) }}>
            {D.initialen(naam)}
          </span>
          {naam}
        </button>
      </div>
    </div>
  )
}
