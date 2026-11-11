import React, { useEffect, useMemo, useState } from 'react'
import * as D from '../lib/data'
import { DAG_NAMEN } from '../lib/data'
import { Pill } from '../components/basis'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'

export function OverzichtPagina({ naar, blokken, documentenMeta, bronnen, beslissingen, validaties, voorstellen, tik, geladen }) {
  const [recent, setRecent] = useState([])

  useEffect(() => {
    D.laadAlleNotities().then(setRecent).catch(() => {})
  }, [tik])

  const klaar = blokken.filter((b) => b.status === 'Review' || b.status === 'Final').length
  const totaal = blokken.filter((b) => b.id !== 'algemeen' && b.id !== 'bronnen').length
  const researchDocs = documentenMeta.filter((d) => d.soort === 'research')
  const bytes = researchDocs.reduce((s, d) => s + (d.bytes || 0), 0)
  const kernbronnen = bronnen.filter((b) => b.status === 'kernbron').length
  const openBesl = beslissingen.filter((b) => b.status !== 'beslist')
  const openValid = validaties.filter((v) => v.status !== 'klaar')
  const percentage = totaal ? Math.round((klaar / totaal) * 100) : 0

  const groepen = useMemo(() => {
    const m = {}
    for (const b of blokken) {
      if (b.id === 'algemeen' || b.id === 'bronnen') continue
      m[b.dag] = m[b.dag] || []
      m[b.dag].push(b)
    }
    return m
  }, [blokken])

  // Nog niets geladen: toon de vorm van het scherm, niet een leeg scherm met
  // misleidende nullen. Zo blijft de eerste indruk rustig.
  if (!geladen) {
    return (
      <>
        <main className="hoofd">
          <div className="hoofd-binnen" style={{ maxWidth: 860 }}>
            <div className="pagina-kop">
              <Skelet breedte="52%" hoogte={27} straal={7} />
              <div style={{ height: 11 }} />
              <Skelet breedte="64%" hoogte={12} />
            </div>
            <div style={{ height: 26 }} />
            <Skelet breedte="100%" hoogte={118} straal={10} />
            <div style={{ height: 28 }} />
            <SkeletAlinea lijnen={7} />
          </div>
        </main>
        <aside className="inspector">
          <div className="insp-titel">Stand van de studie</div>
          <Skelet breedte="100%" hoogte={126} straal={10} />
          <div className="insp-titel">Open punten</div>
          <Skelet breedte="100%" hoogte={94} straal={10} />
        </aside>
      </>
    )
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 860 }}>
          <div className="pagina-kop">
            <h1>De hele editie in één beeld</h1>
            <div className="onder">
              <span className="cijfers">
                {klaar} van {totaal} dagdelen uitgewerkt
              </span>
              <span className="scheiding">·</span>
              <span className="cijfers">
                {researchDocs.length} researchbestanden · {D.bytesLeesbaar(bytes)}
              </span>
              <span className="scheiding">·</span>
              <span className="cijfers">
                {bronnen.length} bronnen · {kernbronnen} kernbronnen
              </span>
            </div>
          </div>

          <div className="pl-kaart stand-kaart">
            <div className="kop">
              <div className="t">Stand van de voorbereiding</div>
              <span className="meta-klein cijfers">{percentage}%</span>
            </div>
            <div
              className="vorderbalk"
              role="progressbar"
              aria-valuenow={klaar}
              aria-valuemin={0}
              aria-valuemax={totaal}
              aria-label="Dagdelen uitgewerkt"
            >
              <span style={{ width: `${percentage}%` }} />
            </div>
            <div className="stand-rijen">
              <div className="insp-rij">
                <span className="k">Uitgewerkt</span>
                <span className="v cijfers">
                  {klaar} / {totaal}
                </span>
              </div>
              <div className="insp-rij">
                <span className="k">Research</span>
                <span className="v cijfers">{researchDocs.length}</span>
              </div>
              <div className="insp-rij">
                <span className="k">Bronnen</span>
                <span className="v cijfers">{bronnen.length}</span>
              </div>
              <div className="insp-rij">
                <span className="k">Open punten</span>
                <span className="v cijfers">{openBesl.length + openValid.length}</span>
              </div>
            </div>
          </div>

          {openBesl.length > 0 && (
            <div className="pl-kaart wacht-kaart">
              <div className="kop">
                <span className="kaart-icoon">
                  <Icoon naam="planning" maat={17} />
                </span>
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

          {[0, 1, 2, 3, 4].map((dag) => {
            const rij = groepen[dag] || []
            if (!rij.length) return null
            return (
              <div key={dag}>
                <div className="insp-titel" style={{ marginTop: 24 }}>
                  {DAG_NAMEN[dag]}
                </div>
                <div className="doc-lijst">
                  {rij.map((b) => {
                    const docs = documentenMeta.filter((d) => d.blok_id === b.id)
                    const soorten = docs.map((d) => d.soort).filter((v, i, a) => a.indexOf(v) === i)
                    return (
                      <button key={b.id} className="doc-kaart" onClick={() => naar(`#/blok/${b.id}`)}>
                        <span className="soort">
                          <Icoon naam={b.code.split('.')[0] === b.code ? 'dagdeel' : 'document'} maat={16} />
                        </span>
                        <span className="midden">
                          <div className="naam">
                            {b.code} · {b.titel}
                          </div>
                          <div className="meta">
                            {docs.length > 0 ? `${docs.length} stukken · ${soorten.join(', ')}` : 'nog niets uitgewerkt'}
                            {b.spreker ? ` · spreker ${b.spreker}` : ''}
                          </div>
                        </span>
                        <Pill soort={b.status}>{b.status}</Pill>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="insp-titel" style={{ marginTop: 26 }}>
            Recente notities
          </div>
          {recent.length === 0 ? (
            <LegeStaat
              icoon="inhoud"
              titel="Nog geen notities"
              uitleg="Open een stuk of een dagdeel en schrijf wat op. Alles wat je hier noteert, ziet de ander meteen."
              compact
            />
          ) : (
            recent.slice(0, 6).map((n) => (
              <div className="notitie" key={n.id}>
                <div className="kop">
                  <span className="wie" style={{ background: D.kleurVoor(n.auteur) }}>
                    {D.initialen(n.auteur)}
                  </span>
                  <b>{n.auteur}</b>
                  <span className="meta-klein">
                    {n.doel_type} {n.doel_id} · {D.datumKort(n.created_at)}
                  </span>
                </div>
                <div className="tekst">{n.tekst.slice(0, 220)}</div>
              </div>
            ))
          )}
        </div>
      </main>

      <aside className="inspector">
        <div className="insp-titel">Open punten</div>
        <div className="insp-kaart open-punten">
          {openBesl.length === 0 && openValid.length === 0 && <div className="leeg-tekst">Niets open. Mooi zo.</div>}
          {openBesl.map((b) => (
            <div className="punt" key={`b${b.id}`}>
              <span className="k">Beslissing</span>
              <span className="v">{b.titel}</span>
            </div>
          ))}
          {openValid.map((v) => (
            <div className="punt" key={`v${v.id}`}>
              <span className="k">{v.wie}</span>
              <span className="v">{v.onderwerp}</span>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
