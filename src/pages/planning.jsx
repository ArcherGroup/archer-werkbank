import React, { useState } from 'react'
import * as D from '../lib/data'
import { Pill } from '../components/basis'

export function PlanningPagina({ naar, beslissingen, validaties, voorstellen, naam, herlaad }) {
  const [vSoort, setVSoort] = useState('research')
  const [vTitel, setVTitel] = useState('')
  const [vDetail, setVDetail] = useState('')

  const beslis = async (b) => {
    const besluit = prompt(`Wat is het besluit over "${b.titel}"?`, b.besluit || '')
    if (besluit === null) return
    await D.zetBeslissing(b.id, { status: 'beslist', besluit })
    herlaad?.()
  }

  const heropen = async (b) => {
    await D.zetBeslissing(b.id, { status: 'open', besluit: null })
    herlaad?.()
  }

  const klaarValidatie = async (v, klaar) => {
    await D.zetValidatie(v.id, { status: klaar ? 'klaar' : 'open' })
    herlaad?.()
  }

  const voorstelToe = async () => {
    if (!vTitel.trim()) return
    await D.voegVoorstelToe({ soort: vSoort, titel: vTitel.trim(), detail: vDetail.trim(), auteur: naam })
    setVTitel('')
    setVDetail('')
    herlaad?.()
  }

  const zetVoorstelStatus = async (v, status) => {
    await D.zetVoorstel(v.id, { status })
    herlaad?.()
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 820 }}>
          <div className="pagina-kop">
            <h1>Planning</h1>
            <div className="onder">
              <span>beslissingen, validaties en voorstellen voor de hele editie</span>
            </div>
          </div>

          <div className="insp-titel">Open beslissingen</div>
          {beslissingen.filter((b) => b.status !== 'beslist').length === 0 && (
            <div className="leeg-tekst">Geen open beslissingen.</div>
          )}
          {beslissingen
            .filter((b) => b.status !== 'beslist')
            .map((b) => (
              <div className="pl-kaart" key={b.id}>
                <div className="kop">
                  <div className="t">{b.titel}</div>
                  <Pill soort="Concept">open</Pill>
                </div>
                <div className="d">{b.detail}</div>
                <div className="acties">
                  <button className="knop primair" onClick={() => beslis(b)}>
                    Beslecht
                  </button>
                  <span className="meta-klein" style={{ alignSelf: 'center' }}>
                    eigenaar {b.eigenaar}
                  </span>
                </div>
              </div>
            ))}

          {beslissingen.filter((b) => b.status === 'beslist').length > 0 && (
            <>
              <div className="insp-titel">Beslecht</div>
              {beslissingen
                .filter((b) => b.status === 'beslist')
                .map((b) => (
                  <div className="pl-kaart" key={b.id} style={{ opacity: 0.85 }}>
                    <div className="kop">
                      <div className="t">{b.titel}</div>
                      <Pill soort="Final">beslist</Pill>
                    </div>
                    <div className="d">{b.besluit}</div>
                    <div className="acties">
                      <button className="knop zacht" onClick={() => heropen(b)}>
                        Heropen
                      </button>
                    </div>
                  </div>
                ))}
            </>
          )}

          <div className="insp-titel" style={{ marginTop: 26 }}>
            Validaties
          </div>
          {validaties.map((v) => (
            <div className="pl-kaart" key={v.id} style={{ opacity: v.status === 'klaar' ? 0.7 : 1 }}>
              <div className="kop">
                <div className="t">{v.onderwerp}</div>
                <Pill soort={v.status === 'klaar' ? 'Final' : 'Concept'}>{v.status}</Pill>
              </div>
              <div className="d">
                {v.wie} · {v.wanneer}
                {v.detail ? ` · ${v.detail}` : ''}
              </div>
              <div className="acties">
                {v.status !== 'klaar' ? (
                  <button className="knop" onClick={() => klaarValidatie(v, true)}>
                    ✓ Gevalideerd
                  </button>
                ) : (
                  <button className="knop zacht" onClick={() => klaarValidatie(v, false)}>
                    Heropen
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="insp-titel" style={{ marginTop: 26 }}>
            Voorstellen
          </div>
          <div className="pl-kaart">
            <div className="kop">
              <div className="t">Nieuw voorstel</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                ['research', '🔎 nieuwe research'],
                ['verschuiving', '↔️ verschuiving in de opbouw'],
                ['inhoud', '✏️ inhoudelijke aanvulling'],
                ['vraag', '❓ vraag voor het team'],
              ].map(([v, label]) => (
                <button key={v} className={`fil ${vSoort === v ? 'aan' : ''}`} onClick={() => setVSoort(v)}>
                  {label}
                </button>
              ))}
            </div>
            <input
              style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 8 }}
              placeholder="Korte titel"
              value={vTitel}
              onChange={(e) => setVTitel(e.target.value)}
            />
            <textarea
              style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', minHeight: 70, marginBottom: 10, resize: 'vertical' }}
              placeholder="Wat wil je voorstellen of vragen? Hoe concreter, hoe sneller het opgepakt wordt."
              value={vDetail}
              onChange={(e) => setVDetail(e.target.value)}
            />
            <button className="knop primair" onClick={voorstelToe} disabled={!vTitel.trim()}>
              Voorstel toevoegen
            </button>
          </div>

          {voorstellen.length === 0 && <div className="leeg-tekst">Nog geen voorstellen.</div>}
          {voorstellen.map((v) => (
            <div className="pl-kaart" key={v.id} style={{ opacity: v.status === 'open' ? 1 : 0.65 }}>
              <div className="kop">
                <Pill soort="accent">{v.soort}</Pill>
                <div className="t">{v.titel}</div>
                <Pill soort={v.status === 'open' ? 'Concept' : 'Final'}>{v.status}</Pill>
              </div>
              {v.detail && <div className="d">{v.detail}</div>}
              <div className="acties">
                <span className="meta-klein" style={{ alignSelf: 'center' }}>
                  {v.auteur} · {D.datumKort(v.created_at)}
                </span>
                {v.status === 'open' ? (
                  <button className="knop" onClick={() => zetVoorstelStatus(v, 'gedaan')}>
                    ✓ Gedaan
                  </button>
                ) : (
                  <button className="knop zacht" onClick={() => zetVoorstelStatus(v, 'open')}>
                    Heropen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Waarvoor dient dit</div>
        <div className="insp-kaart" style={{ lineHeight: 1.55 }}>
          Alles wat uit de studie komt en een keuze of actie vraagt, komt hier samen. Beslissingen zijn van jou; validaties
          wachten op Jurgen, Anthony of Bjorn. Voorstellen — nieuwe research, een verschuiving of een inhoudelijke
          aanvulling — kan iedereen toevoegen.
        </div>
      </aside>
    </>
  )
}
