import React, { useMemo, useState } from 'react'
import * as D from '../lib/data'

export function BronnenPagina({ naar, bronnen, blokken, naam, herlaad, tik }) {
  const [filter, setFilter] = useState('alle') // alle | ongelezen | gelezen | kernbron
  const [blokFilter, setBlokFilter] = useState('')
  const [q, setQ] = useState('')
  const [toevoegen, setToevoegen] = useState(false)
  const [nieuwUrl, setNieuwUrl] = useState('')
  const [nieuwTitel, setNieuwTitel] = useState('')
  const [nieuwBlok, setNieuwBlok] = useState('')

  const gefilterd = useMemo(() => {
    const term = q.trim().toLowerCase()
    return bronnen.filter((b) => {
      if (filter !== 'alle' && b.status !== filter) return false
      if (blokFilter && b.blok_id !== blokFilter) return false
      if (term && !(`${b.titel} ${b.url}`.toLowerCase().includes(term))) return false
      return true
    })
  }, [bronnen, filter, blokFilter, q])

  const toe = async () => {
    if (!nieuwUrl.trim()) return
    await D.voegBronToe({ url: nieuwUrl.trim(), titel: nieuwTitel.trim(), blok_id: nieuwBlok || 'algemeen', auteur: naam })
    setToevoegen(false)
    setNieuwUrl('')
    setNieuwTitel('')
    herlaad?.()
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 860 }}>
          <div className="pagina-kop">
            <h1>Bronnen</h1>
            <div className="onder">
              <span>{bronnen.length} bronnen, {bronnen.filter((b) => b.status === 'kernbron').length} kernbronnen</span>
              <button className="knop zacht" onClick={() => setToevoegen((t) => !t)}>
                + Bron toevoegen
              </button>
            </div>
          </div>

          {toevoegen && (
            <div className="pl-kaart">
              <div className="kop">
                <div className="t">Nieuwe bron</div>
              </div>
              <input
                className="notitie-invoer"
                style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 8, display: 'block' }}
                placeholder="https://…"
                value={nieuwUrl}
                onChange={(e) => setNieuwUrl(e.target.value)}
              />
              <input
                style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 8, display: 'block' }}
                placeholder="Titel (mag leeg blijven)"
                value={nieuwTitel}
                onChange={(e) => setNieuwTitel(e.target.value)}
              />
              <select
                style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 10 }}
                value={nieuwBlok}
                onChange={(e) => setNieuwBlok(e.target.value)}
              >
                <option value="">Bij welk dagdeel hoort hij?</option>
                {blokken.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.titel}
                  </option>
                ))}
              </select>
              <button className="knop primair" onClick={toe} disabled={!nieuwUrl.trim()}>
                Toevoegen
              </button>
            </div>
          )}

          <div className="bron-filter">
            {['alle', 'ongelezen', 'gelezen', 'kernbron'].map((f) => (
              <button key={f} className={`fil ${filter === f ? 'aan' : ''}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
            <select
              className="fil"
              style={{ paddingRight: 26 }}
              value={blokFilter}
              onChange={(e) => setBlokFilter(e.target.value)}
            >
              <option value="">alle dagdelen</option>
              {blokken.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.titel}
                </option>
              ))}
            </select>
            <input
              className="fil"
              style={{ minWidth: 180 }}
              placeholder="zoek in titel of url…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="meta-klein" style={{ alignSelf: 'center' }}>
              {gefilterd.length} getoond
            </span>
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.7)' }}>
            {gefilterd.length === 0 && <div className="leeg-tekst" style={{ padding: 18 }}>Geen bronnen met deze filters.</div>}
            {gefilterd.slice(0, 200).map((b) => (
              <button key={b.id} className="bron-rij" onClick={() => naar(`#/bron/${b.id}`)}>
                <span className={`status-stip ${b.status}`} />
                <span className="midden">
                  <div className="t">{b.titel || b.url}</div>
                  <div className="u">
                    {b.url} {b.blok_id ? `· ${b.blok_id}` : ''} {b.opgehaald_op ? '· al opgehaald' : ''}
                  </div>
                </span>
              </button>
            ))}
            {gefilterd.length > 200 && <div className="leeg-tekst" style={{ padding: 12 }}>… en nog {gefilterd.length - 200}; gebruik de filters of het zoekveld.</div>}
          </div>
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Zo werkt de lezer</div>
        <div className="insp-kaart" style={{ lineHeight: 1.55 }}>
          Klik een bron open. De werkbank haalt de pagina op en toont de leesbare tekst naast je notitieveld. Je merkt een
          bron als <b>gelezen</b> of <b>kernbron</b>; die keuze zien Victor en Anthony meteen.
        </div>
      </aside>
    </>
  )
}
