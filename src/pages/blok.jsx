import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as D from '../lib/data'

import { Notities } from '../components/notities'
import { Icoon, SOORT_ICOON } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { Dialoog, InvoerDialoog } from '../components/dialoog'
import { vraagtStatusReview } from '../lib/blok-status'
import { vindBrief, stellingVoorDagdeel, doelVoorDagdeel } from '../lib/werkblad'
import { meld } from '../components/meldingen'
import { Voorbereidingsketen } from '../components/voorbereidingsketen'
import { DagdeelVisie } from '../components/dagdeel-visie'
import { bouwDagdeelVisie, stukkenVanDagdeel, vergelijkEigenaar } from '../lib/dagdeel-visie'
import { useEscape } from '../hooks/useEscape'

const VOLGORDE = { brief: 0, spreektekst: 1, slides: 2, werkboek: 3, oefening: 4, research: 5, bron: 6, algemeen: 7, overig: 8 }

export function BlokPagina({ blokId, naar, blokken, documentenMeta, bronnen = [], beslissingen = [], naam, herlaad, tik, geladen, gegevensBeschikbaar }) {
  const blok = blokken.find((b) => b.id === blokId)
  const [notities, setNotities] = useState([])
  const [notitiesGeladen, setNotitiesGeladen] = useState(false)
  const [notitiesOpen, setNotitiesOpen] = useState(false)
  const notitiesKnopRef = useRef(null)
  const notitiesPaneelRef = useRef(null)
  const stukkenPerBlok = useMemo(() => {
    const m = {}
    for (const b of Array.isArray(blokken) ? blokken : []) if (b?.id) m[b.id] = stukkenVanDagdeel(documentenMeta, b.id)
    return m
  }, [blokken, documentenMeta])
  const [brief, setBrief] = useState(null)
  const [briefStatus, setBriefStatus] = useState('laden')
  const [masterplan, setMasterplan] = useState(null)
  const [masterStatus, setMasterStatus] = useState('laden')
  const [aanHetMaken, setAanHetMaken] = useState(false)
  const [vraagOpen, setVraagOpen] = useState(false)
  const [nieuwDocId, setNieuwDocId] = useState(null)
  const [statusBezig, setStatusBezig] = useState(null)
  const [statusVraag, setStatusVraag] = useState(false)
  const [optimistisch, setOptimistisch] = useState(null)
  const sluitNotities = useCallback(() => { setNotitiesOpen(false); notitiesKnopRef.current?.focus() }, [])
  useEscape(sluitNotities, notitiesOpen)
  useEffect(() => { if (notitiesOpen) notitiesPaneelRef.current?.querySelector('.doc-notities-sluit')?.focus() }, [notitiesOpen])

  const herlaadNotities = useCallback(() => {
    if (!blok) return
    setNotitiesGeladen(false)
    D.laadNotities('blok', blok.id).then((lijst) => { setNotities(lijst); setNotitiesGeladen(true) }).catch(() => setNotitiesGeladen(false))
  }, [blok])

  useEffect(() => {
    herlaadNotities()
  }, [herlaadNotities, tik])

  const briefMeta = vindBrief(documentenMeta, blokId)
  const masterKandidaten = documentenMeta.filter((d) => d.titel === 'masterplan-februari-2027')
  const masterMeta = masterKandidaten.length === 1 ? masterKandidaten[0] : null
  useEffect(() => {
    if (!briefMeta?.id) { setBrief(null); setBriefStatus('ontbreekt'); return }
    let actief = true
    setBrief(null)
    setBriefStatus('laden')
    D.laadDocument(briefMeta.id).then((doc) => {
      if (!actief) return
      if (!doc || doc.id !== briefMeta.id || doc.blok_id !== blokId) { setBrief(null); setBriefStatus('fout'); return }
      setBrief(doc)
      setBriefStatus('klaar')
    }).catch(() => { if (actief) { setBrief(null); setBriefStatus('fout') } })
    return () => { actief = false }
  }, [briefMeta?.id, blokId, tik])

  useEffect(() => {
    if (blokId !== '1.3' || !masterMeta?.id) { setMasterplan(null); setMasterStatus('ontbreekt'); return }
    let actief = true
    setMasterplan(null)
    setMasterStatus('laden')
    D.laadDocument(masterMeta.id).then((doc) => {
      if (!actief) return
      if (!doc || doc.id !== masterMeta.id) { setMasterplan(null); setMasterStatus('fout'); return }
      setMasterplan(doc)
      setMasterStatus('klaar')
    }).catch(() => { if (actief) { setMasterplan(null); setMasterStatus('fout') } })
    return () => { actief = false }
  }, [masterMeta?.id, blokId, tik])

  // Sluit eerst de invoer en diens werkverliesbewaking; navigeer pas nadat
  // het nieuwe stuk aantoonbaar is aangemaakt.
  useEffect(() => {
    if (nieuwDocId == null || vraagOpen) return
    const id = nieuwDocId
    setNieuwDocId(null)
    naar(`#/doc/${id}`)
  }, [nieuwDocId, vraagOpen, naar])

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
  const stelling = stellingVoorDagdeel(brief, briefMeta, blok.id)
  const doel = doelVoorDagdeel(brief, briefMeta, blok.id)
  const visie = blokId === '1.3' ? bouwDagdeelVisie({ blok, blokken, documentenMeta, brief, masterplan }) : null
  const eigenaarVerschil = blokId === '1.3' ? vergelijkEigenaar({ blok, documentenMeta, brief }) : null
  const StukkenOmhulsel = visie ? 'details' : React.Fragment
  const ggrBeslissing = beslissingen.find((b) => /ggr/i.test(b.titel || '') && b.status !== 'beslist')

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
      setVraagOpen(false)
      setNieuwDocId(d.id)
    } catch {
      meld('Het stuk kon niet aangemaakt worden. Je titel blijft staan; probeer opnieuw.', { fout: true })
    } finally {
      setAanHetMaken(false)
    }
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen">
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
                  onClick={() => vraagtStatusReview(huidigeStatus, s) ? setStatusVraag(true) : zetStatus(s)}
                  aria-pressed={huidigeStatus === s}
                  disabled={statusBezig === s}
                >
                  {s}
                </button>
              ))}
            </div>
            <button type="button" ref={notitiesKnopRef} className="knop doc-notities-knop" aria-controls="blok-notities-paneel" aria-expanded={notitiesOpen} onClick={() => setNotitiesOpen(true)}>
              <Icoon naam="info" maat={14} /> Notities {notities.length ? `(${notities.length})` : ''}
            </button>
            <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={() => setVraagOpen(true)} disabled={aanHetMaken}>
              <Icoon naam="plus" maat={14} />
              Nieuw stuk
            </button>
          </div>

          {visie && <DagdeelVisie blok={blok} blokken={blokken} kaart={visie} naar={naar} stukkenPerBlok={stukkenPerBlok}
            masterplanId={masterMeta?.id} eigenaarVerschil={eigenaarVerschil} ggrBeslissing={ggrBeslissing}
            laden={briefStatus === 'laden' && gegevensBeschikbaar?.documenten !== false}
            fout={briefStatus === 'fout' || gegevensBeschikbaar?.documenten === false}
            masterLaden={masterStatus === 'laden' && gegevensBeschikbaar?.documenten !== false}
            masterFout={masterStatus === 'fout' || gegevensBeschikbaar?.documenten === false} />}

          <details className="vk-overzicht">
            <summary><strong>Voorbereiding van dit dagdeel</strong><span>Vraag · bronnen · stelling · lesinhoud · oefening · feedback · bijsturing</span></summary>
            <Voorbereidingsketen blok={blok} documentenMeta={gegevensBeschikbaar?.documenten === false ? undefined : documentenMeta}
              bronnen={gegevensBeschikbaar?.bronnen === false ? undefined : bronnen}
              notities={notitiesGeladen ? notities : undefined}
              doel={doel?.tekst} doelBron={doel?.bron}
              stelling={stelling?.tekst} stellingBron={stelling?.bron}
              beslissingen={gegevensBeschikbaar?.beslissingen === false ? undefined : beslissingen} geladen={geladen} naar={naar} opBlokPagina />
          </details>

          <StukkenOmhulsel {...(visie ? { className: 'dv-stukken' } : {})}>
            {visie && <summary>Alle stukken <span>{docs.length} {docs.length === 1 ? 'stuk' : 'stukken'}</span></summary>}
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
          </StukkenOmhulsel>
        </div>
      </main>

      <aside id="blok-notities-paneel" ref={notitiesPaneelRef} className={`inspector doc-inspector ${notitiesOpen ? 'open' : ''}`} aria-label="Notities bij dit dagdeel">
        <button type="button" className="knop doc-notities-sluit" onClick={sluitNotities}>Sluit notities</button>
        <div className="insp-titel">Notities bij dit dagdeel</div>
        <Notities doelType="blok" doelId={blok.id} auteur={naam} notities={notities} onWijzig={herlaadNotities} />
      </aside>

      <Dialoog
        open={statusVraag}
        titel={`${blok.code} definitief markeren?`}
        tekst="Controleer eerst de inhoud en open validaties met de eigenaar. De werkbank wijzigt alleen de status en valideert de inhoud of fiscale cijfers niet automatisch."
        actie="Als Final markeren"
        opAnnuleer={() => setStatusVraag(false)}
        opBevestig={() => { setStatusVraag(false); zetStatus('Final') }}
      />
      <InvoerDialoog
        open={vraagOpen}
        titel="Nieuw stuk in dit dagdeel"
        tekst="Een korte werktitel volstaat; je kunt hem later nog aanpassen in het stuk zelf."
        label="Titel van het stuk"
        placeholder="bijvoorbeeld feedback, aanvullingen of een werktitel"
        actie={aanHetMaken ? 'Bezig…' : 'Aanmaken'}
        bezig={aanHetMaken}
        opBevestig={(titel) => nieuwDocument(titel)}
        opAnnuleer={() => setVraagOpen(false)}
      />
    </>
  )
}
