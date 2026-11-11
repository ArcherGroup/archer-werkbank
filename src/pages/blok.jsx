import React, { useCallback, useEffect, useState } from 'react'
import * as D from '../lib/data'
import { Kruimel } from '../components/basis'
import { Notities } from '../components/notities'
import { Icoon, SOORT_ICOON } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { InvoerDialoog } from '../components/dialoog'
import { meld } from '../components/meldingen'

const VOLGORDE = { brief: 0, spreektekst: 1, slides: 2, werkboek: 3, oefening: 4, research: 5, bron: 6, algemeen: 7, overig: 8 }

export function BlokPagina({ blokId, naar, blokken, documentenMeta, naam, herlaad, tik, geladen }) {
  const blok = blokken.find((b) => b.id === blokId)
  const [notities, setNotities] = useState([])
  const [aanHetMaken, setAanHetMaken] = useState(false)
  const [vraagOpen, setVraagOpen] = useState(false)
  const [statusBezig, setStatusBezig] = useState(null)
  const [optimistisch, setOptimistisch] = useState(null)

  const herlaadNotities = useCallback(() => {
    if (blok) D.laadNotities('blok', blok.id).then(setNotities).catch(() => {})
  }, [blok])

  useEffect(() => {
    herlaadNotities()
  }, [herlaadNotities, tik])

  // Eerst de vorm van het dagdeel, dan pas de echte inhoud: geen valse
  // "dit dagdeel bestaat niet" tijdens het laden.
  if (!geladen)
    return (
      <>
        <main className="hoofd">
          <div className="hoofd-binnen">
            <Skelet breedte="42%" hoogte={12} />
            <div style={{ height: 18 }} />
            <Skelet breedte="56%" hoogte={27} straal={7} />
            <div style={{ height: 10 }} />
            <Skelet breedte="38%" hoogte={12} />
            <div style={{ height: 22 }} />
            <Skelet breedte="100%" hoogte={34} straal={8} />
            <div style={{ height: 20 }} />
            <SkeletAlinea lijnen={6} />
          </div>
        </main>
        <aside className="inspector">
          <div className="insp-titel">Notities bij dit dagdeel</div>
          <Skelet breedte="100%" hoogte={120} straal={10} />
        </aside>
      </>
    )

  if (!blok)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <LegeStaat
            icoon="waarschuwing"
            titel="Dit dagdeel bestaat niet"
            uitleg="De link klopt niet meer of het dagdeel is hernoemd."
            acties={
              <button className="knop primair" onClick={() => naar('#/')}>
                Terug naar het overzicht
              </button>
            }
          />
        </div>
      </main>
    )

  const docs = documentenMeta
    .filter((d) => d.blok_id === blok.id)
    .sort((a, b) => (VOLGORDE[a.soort] ?? 9) - (VOLGORDE[b.soort] ?? 9) || a.titel.localeCompare(b.titel))

  const huidigeStatus = optimistisch ?? blok.status

  const zetStatus = async (s) => {
    if (s === huidigeStatus) return
    setOptimistisch(s)
    setStatusBezig(s)
    try {
      await D.zetBlokStatus(blok.id, s)
      herlaad()
    } catch {
      setOptimistisch(null)
      meld('De status kon niet bewaard worden. Probeer opnieuw.', { fout: true })
    } finally {
      setStatusBezig(null)
    }
  }

  const nieuwDocument = async (titel) => {
    setAanHetMaken(true)
    try {
      const d = await D.voegDocumentToe({ blok_id: blok.id, soort: 'overig', titel, auteur: naam })
      meld('Stuk aangemaakt.')
      naar(`#/doc/${d.id}`)
    } catch {
      meld('Het stuk kon niet aangemaakt worden. Probeer opnieuw.', { fout: true })
    } finally {
      setAanHetMaken(false)
      setVraagOpen(false)
    }
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen">
          <Kruimel
            naar={naar}
            delen={[
              { tekst: 'Werkblad', naar: '#/' },
              { tekst: `Dag ${blok.dag}`, naar: '#/status' },
              { tekst: `${blok.code} · ${blok.titel}` },
            ]}
          />
          <div className="pagina-kop">
            <h1>
              {blok.code} · {blok.titel}
            </h1>
            <div className="onder">
              {blok.spreker && <span>Spreker: {blok.spreker}</span>}
              {blok.eigenaar && <span>· Eigenaar: {blok.eigenaar}</span>}
              {blok.notitie && <span>· {blok.notitie}</span>}
            </div>
          </div>

          <div className="statusbalk">
            <div className="statusgroep" role="group" aria-label="Status van dit dagdeel">
              {['Leeg', 'Concept', 'Review', 'Final'].map((s) => (
                <button
                  key={s}
                  className={`statusknop ${huidigeStatus === s ? 'aan' : ''}`}
                  onClick={() => zetStatus(s)}
                  aria-pressed={huidigeStatus === s}
                  disabled={statusBezig === s}
                >
                  {s}
                </button>
              ))}
            </div>
            <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={() => setVraagOpen(true)} disabled={aanHetMaken}>
              <Icoon naam="plus" maat={14} />
              Nieuw stuk
            </button>
          </div>

          <div className="doc-lijst">
            {docs.length === 0 && (
              <LegeStaat
                icoon="document"
                titel="Nog geen stukken in dit dagdeel"
                uitleg="Maak er een aan met “Nieuw stuk”, of laat de assistent research doen en vul daarna de brief, spreektekst, slides en het werkboek aan."
                acties={
                  <button className="knop primair" onClick={() => setVraagOpen(true)}>
                    Eerste stuk aanmaken
                  </button>
                }
              />
            )}
            {docs.map((d) => (
              <button key={d.id} className="doc-kaart" onClick={() => naar(`#/doc/${d.id}`)} title={d.titel}>
                <span className="soort">
                  <Icoon naam={SOORT_ICOON[d.soort] || 'paperclip'} maat={16} />
                </span>
                <span className="midden">
                  <div className="naam">{d.titel}</div>
                  <div className="meta">
                    {d.soort}
                    {d.bytes ? ` · ${D.bytesLeesbaar(d.bytes)}` : ''}
                    {d.bewerkt_door ? ` · bewerkt door ${d.bewerkt_door}` : ''}
                    {d.updated_at ? ` · ${D.datumKort(d.updated_at)}` : ''}
                  </div>
                </span>
                <span className="pijl">
                  <Icoon naam="chevronRechts" maat={15} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>

      <aside className="inspector">
        <div className="insp-titel">Notities bij dit dagdeel</div>
        <Notities doelType="blok" doelId={blok.id} auteur={naam} notities={notities} onWijzig={herlaadNotities} />
      </aside>

      <InvoerDialoog
        open={vraagOpen}
        titel="Nieuw stuk in dit dagdeel"
        tekst="Een korte werktitel volstaat; je kunt hem later nog aanpassen in het stuk zelf."
        label="Titel van het stuk"
        placeholder="bijvoorbeeld feedback, aanvullingen of een werktitel"
        actie={aanHetMaken ? 'Bezig…' : 'Aanmaken'}
        opBevestig={(titel) => nieuwDocument(titel)}
        opAnnuleer={() => setVraagOpen(false)}
      />
    </>
  )
}
