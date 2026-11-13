import React from 'react'
import { Icoon } from './Icoon'
import { kleurVoor, initialen } from '../lib/data'
import { BEREIKEN, filterComments, groepeerReacties, kort, telOpen } from '../lib/comments'
import './comments-balk.css'

/* De comments-balk loopt onder de topbar, over elke pagina heen. Hij toont alleen
   wat binnen het gekozen bereik valt en opent een comment op zijn plek. */
export function CommentsBalk({
  notities = [], blokken = [], documentenMeta = [], bronnen = [],
  blokId = null, dag = null, bereik = 'dagdeel', opBereik,
  toonOpgelost = false, opToonOpgelost, opOpen, opWalkthrough, opSluiten, titel = '', hulpmiddelen = null,
}) {
  const ctx = { blokken, documentenMeta, bronnen }
  const zichtbaar = filterComments(notities, { ...ctx, bereik, blokId, dag, toonOpgelost })
  const groep = groepeerReacties(zichtbaar)
  const open = telOpen(notities)

  return (
    <section className="cbalk" aria-label="Comments">
      <div className="cbalk-kop">
        <span className="cbalk-titel">
          <Icoon naam="inhoud" maat={14} /> Comments
          <b className="cbalk-teller">{open}</b>
        </span>
        <div className="cbalk-bereik" role="group" aria-label="Bereik van de comments">
          {BEREIKEN.map((b) => (
            <button type="button" key={b.id} aria-pressed={bereik === b.id} onClick={() => opBereik?.(b.id)}>{b.label}</button>
          ))}
        </div>
        {titel && <span className="cbalk-scope">{titel}</span>}
        <label className="cbalk-schakel">
          <input type="checkbox" aria-label="Toon opgelost of afgewezen gesprekken" checked={toonOpgelost} onChange={(e) => opToonOpgelost?.(e.target.checked)} />
          <span title="Toon opgeloste en afgewezen gesprekken">Afgehandeld</span>
        </label>
        <button type="button" className="knop primair cbalk-start" onClick={opWalkthrough} disabled={!groep.length}>
          <Icoon naam="chevronRechts" maat={14} /> Walkthrough
        </button>
        <button type="button" className="cbalk-sluit" onClick={opSluiten} aria-label="Comments sluiten" title="Comments sluiten (C)">
          <Icoon naam="sluiten" maat={15} />
        </button>
      </div>
      {hulpmiddelen && <div className="cbalk-hulpmiddelen">{hulpmiddelen}</div>}
      <div className="cbalk-rij" role="list">
        {groep.length === 0 && (
          <p className="cbalk-leeg">
            Nog geen open comments in dit bereik. Selecteer tekst in een stuk en schrijf er een, of zet het bereik op Alles.
          </p>
        )}
        {groep.map((n) => (
          <button type="button" role="listitem" className="cchip" key={n.id} onClick={() => opOpen?.(n)} title={n.tekst}>
            <span className="cchip-wie" style={{ background: kleurVoor(n.auteur) }} aria-hidden="true">{initialen(n.auteur)}</span>
            <span className="cchip-midden">
              <b>{kort(n.tekst, 90)}</b>
              {n.anker && <small>“{kort(n.anker, 64)}”</small>}
            </span>
            {n.reacties?.length > 0 && <span className="cchip-tel" title={`${n.reacties.length} reacties`}>{n.reacties.length}</span>}
            <Icoon naam="chevronRechts" maat={13} />
          </button>
        ))}
      </div>
    </section>
  )
}