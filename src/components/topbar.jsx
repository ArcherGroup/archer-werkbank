import React from 'react'
import * as D from '../lib/data'
import { Icoon } from './Icoon'
import { Toets } from './tip'
import { MOD, ariaShortcut } from '../lib/keys'

const THEMA_LABEL = { auto: 'volgt het systeem', licht: 'licht', donker: 'donker' }
const THEMA_VOLGEND = { auto: 'licht', licht: 'donker', donker: 'auto' }

export function Topbar({ naam, online, thema, opThema, opZoeken, opHulp, opWissel, menuOpen = false, opMenu, commentsAan = false, commentsAantal = 0, opComments }) {
  const volgend = THEMA_VOLGEND[thema] ?? 'auto'
  const icoon = thema === 'auto' ? 'autoThema' : thema === 'licht' ? 'zon' : 'maan'
  const themaLabel = `Thema: ${THEMA_LABEL[thema] ?? 'volgt het systeem'} — klik voor ${THEMA_LABEL[volgend]}`

  return (
    <header className="topbar">
      <button type="button" className="mobiel-menu-knop" onClick={opMenu} aria-controls="hoofd-navigatie" aria-expanded={menuOpen} aria-label={menuOpen ? 'Navigatie sluiten' : 'Navigatie openen'}>
        <Icoon naam={menuOpen ? 'sluiten' : 'menu'} maat={20} />
      </button>
      <div className="merk">
        <span className="blokje" aria-hidden="true">
          A
        </span>
        <span className="merk-tekst">Werkbank · Masterclass februari 2027</span>
      </div>

      <button
        type="button"
        className={`comments-knop${commentsAan ? ' aan' : ''}`}
        onClick={opComments}
        aria-pressed={commentsAan}
        aria-label={`Comments ${commentsAan ? 'uitschakelen' : 'inschakelen'}`}
        title="Comments aan of uit (C)"
      >
        <Icoon naam="inhoud" maat={15} />
        <span className="comments-knop-tekst">Comments</span>
        {commentsAantal > 0 && <span className="comments-knop-tel">{commentsAantal}</span>}
      </button>

      <button className="zoekknop" onClick={opZoeken} aria-keyshortcuts={ariaShortcut('k')} aria-label="Zoeken en springen">
        <Icoon naam="zoeken" maat={14} />
        <span>Zoek of spring…</span>
        <Toets k="K" />
      </button>

      <div className="topbar-rechts">
        <div
          className="aanwezig"
          role="status"
          aria-label={online.length ? `Online: ${online.join(', ')}` : 'Niemand anders online'}
        >
          <span className="sr-only">
            {online.length ? `Online: ${online.join(', ')}` : 'Niemand anders online'}
          </span>
          {online.slice(0, 3).map((n) => (
            <span
              key={n}
              className="stip"
              style={{ background: D.kleurVoor(n) }}
              title={`${n} is online`}
              aria-hidden="true"
            >
              {D.initialen(n)}
            </span>
          ))}
          {online.length > 3 && (
            <span className="stip meer" title={online.slice(3).join(', ')} aria-hidden="true">
              +{online.length - 3}
            </span>
          )}
        </div>

        <button className="ik-knop" onClick={opWissel} title="Naam wisselen" aria-label={`Naam wisselen (nu ${naam})`}>
          <span className="stip" style={{ background: D.kleurVoor(naam) }} aria-hidden="true">
            {D.initialen(naam)}
          </span>
          <span className="ik-naam">{naam}</span>
        </button>

        <button className="ik-knop icoon-knop" onClick={opHulp} aria-label={`Sneltoetsen (${MOD}?)`} title="Sneltoetsen (?)">
          <Icoon naam="info" maat={16} />
        </button>

        <button
          className="ik-knop icoon-knop"
          onClick={() => opThema(volgend)}
          aria-label={themaLabel}
          title={themaLabel}
        >
          <Icoon naam={icoon} maat={16} />
        </button>
      </div>
    </header>
  )
}
