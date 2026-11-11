import React, { useMemo } from 'react'
import { DAG_NAMEN } from '../lib/data'
import { StatusStip } from './basis'
import { Icoon } from './Icoon'
import { useRovingTabindex } from '../hooks/useRovingTabindex'
import { Tip } from './tip'

const VAST = [
  { id: '#/', icoon: 'overzicht', titel: 'Werkblad' },
  { id: '#/status', icoon: 'dagdeel', titel: 'Stand van zaken' },
  { id: '#/planning', icoon: 'planning', titel: 'Planning' },
  { id: '#/bronnen', icoon: 'bronnen', titel: 'Bronnen' },
]

export function Zijbalk({ route, naar, blokken, bronnen, beslissingen, voorstellen }) {
  const perDag = useMemo(() => {
    const m = {}
    for (const b of blokken) {
      if (b.id === 'algemeen' || b.id === 'bronnen') continue
      m[b.dag] = m[b.dag] || []
      m[b.dag].push(b)
    }
    return m
  }, [blokken])

  const openBesl = beslissingen.filter((b) => b.status !== 'beslist').length
  const openVoorstel = voorstellen.filter((v) => v.status === 'open').length
  const kernbronnen = bronnen.filter((b) => b.status === 'kernbron').length

  // Eén tabstop voor de hele navigatie; pijlen en j/k verplaatsen de focus.
  const ids = useMemo(() => {
    const uit = VAST.map((v) => v.id)
    for (const dag of [0, 1, 2, 3, 4]) for (const b of perDag[dag] || []) uit.push(`#/blok/${b.id}`)
    return uit
  }, [perDag])

  const { itemProps, lijstProps } = useRovingTabindex(ids, { beginId: route })

  const teller = (id, aantal, extra = '') => {
    if (aantal == null) return null
    return <span className="zij-teller">{extra ? `${aantal}${extra}` : aantal}</span>
  }

  const zijItem = (id, inhoud, titel, extra) => (
    <button
      key={id}
      className={`zij-item ${route === id ? 'actief' : ''}`}
      onClick={() => naar(id)}
      aria-current={route === id ? 'page' : undefined}
      {...itemProps(id)}
    >
      {inhoud}
      {titel && (
        <Tip tekst={titel} kant="rechts">
          <span className="titel-tekst">{titel}</span>
        </Tip>
      )}
      {extra}
    </button>
  )

  return (
    <nav className="zijbalk" aria-label="Navigatie" {...lijstProps}>
      <div className="zij-sectie">
        {VAST.map((v) =>
          zijItem(
            v.id,
            <span className="zij-icoon">
              <Icoon naam={v.icoon} maat={15} />
            </span>,
            v.titel,
            v.id === '#/planning'
              ? teller(v.id, openBesl + openVoorstel > 0 ? openBesl + openVoorstel : null)
              : v.id === '#/bronnen'
                ? teller(v.id, kernbronnen || bronnen.length, kernbronnen ? '★' : '')
                : null,
          ),
        )}
      </div>

      {[0, 1, 2, 3, 4].map((dag) => {
        const rows = perDag[dag] || []
        if (!rows.length) return null
        return (
          <div className="zij-sectie" key={dag}>
            <div className="zij-titel">{DAG_NAMEN[dag]}</div>
            {rows.map((b) =>
              zijItem(
                `#/blok/${b.id}`,
                <span className="code">{b.code}</span>,
                b.titel,
                <StatusStip status={b.status} />,
              ),
            )}
          </div>
        )
      })}
    </nav>
  )
}
