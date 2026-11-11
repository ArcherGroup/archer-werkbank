import React, { useEffect, useMemo, useState } from 'react'
import * as D from '../lib/data'
import { DAG_NAMEN } from '../lib/data'
import { Pill } from '../components/basis'

export function OverzichtPagina({ naar, blokken, documentenMeta, bronnen, beslissingen, validaties, voorstellen, tik }) {
  const [recent, setRecent] = useState([])

  useEffect(() => {
    D.laadAlleNotities().then(setRecent).catch(() => {})
  }, [tik])

  const klaar = blokken.filter((b) => b.status === 'Review' || b.status === 'Final').length
  const totaal = blokken.filter((b) => b.id !== 'algemeen' && b.id !== 'bronnen').length
  const researchDocs = documentenMeta.filter((d) => d.soort === 'research')
  const bytes = researchDocs.reduce((s, d) => s + (d.bytes || 0), 0)
  const openBesl = beslissingen.filter((b) => b.status !== 'beslist')
  const openValid = validaties.filter((v) => v.status !== 'klaar')

  const groepen = useMemo(() => {
    const m = {}
    for (const b of blokken) {
      if (b.id === 'algemeen' || b.id === 'bronnen') continue
      m[b.dag] = m[b.dag] || []
      m[b.dag].push(b)
    }
    return m
  }, [blokken])

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 860 }}>
          <div className="pagina-kop">
            <h1>De hele editie in één beeld</h1>
            <div className="onder">
              <span>{klaar} van {totaal} dagdelen uitgewerkt</span>
              <span>·</span>
              <span>{researchDocs.length} researchbestanden · {D.bytesLeesbaar(bytes)}</span>
              <span>·</span>
              <span>{bronnen.length} bronnen · {bronnen.filter((b) => b.status === 'kernbron').length} kernbronnen</span>
            </div>
          </div>

          {openBesl.length > 0 && (
            <div className="pl-kaart" style={{ borderColor: 'rgba(0,0,255,0.25)', background: 'linear-gradient(0deg, rgba(237,237,255,0.5), rgba(237,237,255,0.5))' }}>
              <div className="kop">
                <span style={{ fontSize: 17 }}>🧭</span>
                <div className="t">
                  {openBesl.length} beslissing{openBesl.length > 1 ? 'en' : ''} wacht{openBesl.length > 1 ? 'en' : ''} op jou
                </div>
                <button className="knop primair" onClick={() => naar('#/planning')}>
                  Bekijk
                </button>
              </div>
              <div className="d">{openBesl.map((b) => b.titel).join(' · ')}</div>
            </div>
          )}

          {[0, 1, 2, 3, 4].map((dag) => (
            <div key={dag}>
              <div className="insp-titel" style={{ marginTop: 24 }}>
                {DAG_NAMEN[dag]}
              </div>
              <div className="doc-lijst">
                {(groepen[dag] || []).map((b) => {
                  const docs = documentenMeta.filter((d) => d.blok_id === b.id)
                  return (
                    <button key={b.id} className="doc-kaart" onClick={() => naar(`#/blok/${b.id}`)}>
                      <span className="soort">{b.code.split('.')[0] === b.code ? '📅' : '📌'}</span>
                      <span className="midden">
                        <div className="naam">
                          {b.code} · {b.titel}
                        </div>
                        <div className="meta">
                          {docs.length > 0
                            ? `${docs.length} stukken · ${docs.map((d) => d.soort).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`
                            : 'nog niets uitgewerkt'}
                          {b.spreker ? ` · spreker ${b.spreker}` : ''}
                        </div>
                      </span>
                      <Pill soort={b.status}>{b.status}</Pill>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="insp-titel" style={{ marginTop: 26 }}>
            Recente notities
          </div>
          {recent.length === 0 && <div className="leeg-tekst">Nog geen notities. Open een stuk en schrijf er een.</div>}
          {recent.slice(0, 6).map((n) => (
            <div className="notitie" key={n.id}>
              <div className="kop">
                <span className="wie" style={{ background: D.kleurVoor(n.auteur) }}>
                  {D.initialen(n.auteur)}
                </span>
                <b>{n.auteur}</b>
                <span>
                  {n.doel_type} {n.doel_id} · {D.datumKort(n.created_at)}
                </span>
              </div>
              <div className="tekst">{n.tekst.slice(0, 220)}</div>
            </div>
          ))}
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Stand van de studie</div>
        <div className="insp-kaart">
          <div className="insp-rij">
            <span className="k">Dagdelen uitgewerkt</span>
            <span className="v">{klaar} / {totaal}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Researchbestanden</span>
            <span className="v">{researchDocs.length}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Bronnen</span>
            <span className="v">{bronnen.length}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Kernbronnen</span>
            <span className="v">{bronnen.filter((b) => b.status === 'kernbron').length}</span>
          </div>
        </div>
        <div className="insp-titel">Open punten</div>
        <div className="insp-kaart">
          {openBesl.length === 0 && openValid.length === 0 && <div className="leeg-tekst">Niets open. Mooi zo.</div>}
          {openBesl.map((b) => (
            <div className="insp-rij" key={`b${b.id}`}>
              <span className="k">Beslissing</span>
              <span className="v">{b.titel}</span>
            </div>
          ))}
          {openValid.map((v) => (
            <div className="insp-rij" key={`v${v.id}`}>
              <span className="k">{v.wie}</span>
              <span className="v">{v.onderwerp}</span>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
