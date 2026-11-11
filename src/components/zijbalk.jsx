import React, { useMemo } from 'react'
import * as D from '../lib/data'
import { DAG_NAMEN } from '../lib/data'
import { StatusStip } from './basis'

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

  const is = (p) => route === p

  return (
    <aside className="zijbalk">
      <div className="zij-sectie">
        <button className={`zij-item ${is('#/') || is('#/') ? (route === '#/' ? 'actief' : '') : ''}`} onClick={() => naar('#/')}>
          <span className="code">⛁</span>
          <span className="titel-tekst">Overzicht</span>
        </button>
        <button className={`zij-item ${route === '#/planning' ? 'actief' : ''}`} onClick={() => naar('#/planning')}>
          <span className="code">🧭</span>
          <span className="titel-tekst">Planning</span>
          {openBesl + openVoorstel > 0 && <span className="zij-teller">{openBesl + openVoorstel}</span>}
        </button>
        <button className={`zij-item ${route === '#/bronnen' ? 'actief' : ''}`} onClick={() => naar('#/bronnen')}>
          <span className="code">🔗</span>
          <span className="titel-tekst">Bronnen</span>
          <span className="zij-teller">{kernbronnen ? `${kernbronnen}★` : bronnen.length}</span>
        </button>
      </div>

      {[0, 1, 2, 3, 4].map((dag) => {
        const rows = perDag[dag] || []
        if (!rows.length) return null
        return (
          <div className="zij-sectie" key={dag}>
            <div className="zij-titel">{DAG_NAMEN[dag]}</div>
            {rows.map((b) => (
              <button
                key={b.id}
                className={`zij-item ${route === `#/blok/${b.id}` ? 'actief' : ''}`}
                onClick={() => naar(`#/blok/${b.id}`)}
                title={`${b.titel} · ${b.status}`}
              >
                <span className="code">{b.code}</span>
                <span className="titel-tekst">{b.titel}</span>
                <StatusStip status={b.status} />
              </button>
            ))}
          </div>
        )
      })}
    </aside>
  )
}
