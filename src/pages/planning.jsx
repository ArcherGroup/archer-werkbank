import React, { useState } from 'react'
import * as D from '../lib/data'
import { Pill } from '../components/basis'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { InvoerDialoog } from '../components/dialoog'
import { meld } from '../components/meldingen'

const SOORTEN = [
  ['research', 'Research', 'research'],
  ['verschuiving', 'Verschuiving', 'vernieuwen'],
  ['inhoud', 'Aanvulling', 'bewerken'],
  ['vraag', 'Vraag', 'info'],
]

export function PlanningPagina({ naar, beslissingen, validaties, voorstellen, naam, herlaad, geladen }) {
  const [vSoort, setVSoort] = useState('research')
  const [vTitel, setVTitel] = useState('')
  const [vDetail, setVDetail] = useState('')
  const [beslisVraag, setBeslisVraag] = useState(null) // de beslissing die om een besluit vraagt
  const [bezig, setBezig] = useState(false)

  const open = beslissingen.filter((b) => b.status !== 'beslist')
  const beslist = beslissingen.filter((b) => b.status === 'beslist')

  if (!geladen)
    return (
      <>
        <main className="hoofd">
          <div className="hoofd-binnen">
            <div className="pagina-kop">
              <Skelet breedte="18%" hoogte={27} straal={7} />
              <div style={{ height: 11 }} />
              <Skelet breedte="48%" hoogte={12} />
            </div>
            <div style={{ height: 24 }} />
            <Skelet breedte="34%" hoogte={11} />
            <div style={{ height: 14 }} />
            <SkeletAlinea lijnen={7} />
          </div>
        </main>
        <aside className="inspector">
          <div className="insp-titel">Waarvoor dient dit</div>
          <Skelet breedte="100%" hoogte={140} straal={10} />
        </aside>
      </>
    )

  const beslis = async (besluit) => {
    const b = beslisVraag
    if (!b) return
    setBezig(true)
    try {
      await D.zetBeslissing(b.id, { status: 'beslist', besluit })
      meld('Beslissing vastgelegd.')
      setBeslisVraag(null)
      herlaad?.()
    } catch {
      meld('De beslissing kon niet bewaard worden. Probeer opnieuw.', { fout: true })
    } finally {
      setBezig(false)
    }
  }

  const heropen = async (b) => {
    try {
      await D.zetBeslissing(b.id, { status: 'open', besluit: null })
      herlaad?.()
    } catch {
      meld('Heropenen mislukte. Probeer opnieuw.', { fout: true })
    }
  }

  const klaarValidatie = async (v, klaar) => {
    try {
      await D.zetValidatie(v.id, { status: klaar ? 'klaar' : 'open' })
      herlaad?.()
    } catch {
      meld('De validatie kon niet bijgewerkt worden.', { fout: true })
    }
  }

  const voorstelToe = async () => {
    const titel = vTitel.trim()
    if (!titel || bezig) return
    setBezig(true)
    try {
      await D.voegVoorstelToe({ soort: vSoort, titel, detail: vDetail.trim(), auteur: naam })
      meld('Voorstel toegevoegd.')
      setVTitel('')
      setVDetail('')
      herlaad?.()
    } catch {
      meld('Het voorstel kon niet bewaard worden. Probeer opnieuw.', { fout: true })
    } finally {
      setBezig(false)
    }
  }

  const zetVoorstelStatus = async (v, status) => {
    try {
      await D.zetVoorstel(v.id, { status })
      herlaad?.()
    } catch {
      meld('Bijwerken mislukte. Probeer opnieuw.', { fout: true })
    }
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
          {open.length === 0 ? (
            <LegeStaat icoon="vinkje" titel="Geen open beslissingen" uitleg="Alles wat op een keuze wachtte, is beslist." compact />
          ) : (
            open.map((b) => (
              <div className="pl-kaart" key={b.id}>
                <div className="kop">
                  <div className="t">{b.titel}</div>
                  <Pill soort="Concept">open</Pill>
                </div>
                <div className="d">{b.detail}</div>
                <div className="acties">
                  <button className="knop primair" onClick={() => setBeslisVraag(b)}>
                    Beslechten
                  </button>
                  <span className="meta-klein" style={{ alignSelf: 'center' }}>
                    eigenaar {b.eigenaar}
                  </span>
                </div>
              </div>
            ))
          )}

          {beslist.length > 0 && (
            <>
              <div className="insp-titel">Beslecht</div>
              {beslist.map((b) => (
                <div className="pl-kaart beslist-kaart" key={b.id}>
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
          {validaties.length === 0 && <LegeStaat icoon="vinkje" titel="Geen validaties" uitleg="Er wachten geen cijfers of aannames op een externe controle." compact />}
          {validaties.map((v) => (
            <div className={`pl-kaart ${v.status === 'klaar' ? 'beslist-kaart' : ''}`} key={v.id}>
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
                    <Icoon naam="vinkje" maat={13} />
                    Gevalideerd
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
            <div className="seg" role="group" aria-label="Soort voorstel" style={{ marginBottom: 12 }}>
              {SOORTEN.map(([v, label, icoon]) => (
                <button key={v} className={`fil ${vSoort === v ? 'aan' : ''}`} onClick={() => setVSoort(v)} aria-pressed={vSoort === v}>
                  <Icoon naam={icoon} maat={13} />
                  {label}
                </button>
              ))}
            </div>
            <div className="veld">
              <label className="veldlabels" htmlFor="vs-titel">
                Korte titel
              </label>
              <input id="vs-titel" value={vTitel} onChange={(e) => setVTitel(e.target.value)} placeholder="Waar gaat het over?" />
            </div>
            <div className="veld">
              <label className="veldlabels" htmlFor="vs-detail">
                Toelichting (mag leeg blijven)
              </label>
              <textarea
                id="vs-detail"
                value={vDetail}
                onChange={(e) => setVDetail(e.target.value)}
                placeholder="Wat wil je voorstellen of vragen? Hoe concreter, hoe sneller het opgepakt wordt."
              />
            </div>
            <div className="acties">
              <button className="knop primair" onClick={voorstelToe} disabled={!vTitel.trim() || bezig}>
                {bezig ? 'Toevoegen…' : 'Voorstel toevoegen'}
              </button>
            </div>
          </div>

          {voorstellen.length === 0 && (
            <LegeStaat
              icoon="inhoud"
              titel="Nog geen voorstellen"
              uitleg="Nieuwe research, een verschuiving in de opbouw of een inhoudelijke aanvulling: zet het hier neer, dan gaat het niet verloren."
              compact
            />
          )}
          {voorstellen.map((v) => (
            <div className={`pl-kaart ${v.status !== 'open' ? 'beslist-kaart' : ''}`} key={v.id}>
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
                    <Icoon naam="vinkje" maat={13} />
                    Gedaan
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

      <InvoerDialoog
        open={!!beslisVraag}
        titel={beslisVraag ? `Besluit over “${beslisVraag.titel}”` : ''}
        tekst="Wat er ook uit komt: schrijf het op, dan is het voor iedereen duidelijk en hoeft niemand er nog naar te vragen."
        label="Het besluit"
        placeholder="bijvoorbeeld: we houden de keynote op 50 minuten"
        beginwaarde={beslisVraag?.besluit ?? ''}
        actie={bezig ? 'Bewaren…' : 'Vastleggen'}
        opBevestig={beslis}
        opAnnuleer={() => setBeslisVraag(null)}
      />
    </>
  )
}
