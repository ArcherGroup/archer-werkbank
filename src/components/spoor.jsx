import React, { useEffect, useRef } from 'react'
import { naamVoorRoute } from '../lib/navigatie'

/* Echte klikgeschiedenis, geen verzonnen mappenhiërarchie. */
export function Spoor({ spoor, naar, gegevens }) {
  const balk = useRef(null)
  useEffect(() => {
    if (balk.current) balk.current.scrollLeft = balk.current.scrollWidth
  }, [spoor])
  if (!Array.isArray(spoor) || spoor.length < 2) return null
  return <nav ref={balk} className="spoor-pad" aria-label="Afgelegd doorklikpad">
    <span className="spoor-label">Pad</span>
    {spoor.map((route, i) => <React.Fragment key={`${route}-${i}`}>
      {i > 0 && <span className="spoor-scheiding" aria-hidden="true">›</span>}
      {i === spoor.length - 1
        ? <span className="spoor-huidig" aria-current="page">{naamVoorRoute(route, gegevens)}</span>
        : <button type="button" title={naamVoorRoute(route, gegevens)} onClick={() => naar(route, { spoor: spoor.slice(0, i + 1), herstelScroll: true })}>{naamVoorRoute(route, gegevens)}</button>}
    </React.Fragment>)}
  </nav>
}
