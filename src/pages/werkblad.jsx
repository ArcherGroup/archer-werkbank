import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as D from '../lib/data'
import { haalLagen, haalSectie, maakVergelijking, eerstePunten, vorigeDagen, vindBrief, stellingVoorDagdeel, doelVoorDagdeel } from '../lib/werkblad'
import { useOnbewaard } from '../hooks/useOnbewaard'
import { WERKBLOKKEN, herstelVergelijking } from '../lib/navigatie'
import { Dialoog } from '../components/dialoog'
import { Icoon } from '../components/Icoon'
import { OnderzoekPaneel } from './onderzoek'
import { Voorbereidingsketen } from '../components/voorbereidingsketen'
import { ZaalPreview } from '../components/zaal-preview'
import './werkblad.css'

function leesbaar(tekst) {
  return String(tekst ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|`/g, '').trim()
}

function Punten({ tekst, leeg }) {
  const punten = eerstePunten(tekst, 1000)
  if (!tekst) return <p className="wb-ontbreekt">{leeg}</p>
  if (!punten.length) return <p>{leesbaar(tekst)}</p>
  return (
    <>
      <ul>{punten.slice(0, 2).map((punt, i) => <li key={i}>{leesbaar(punt)}</li>)}</ul>
      {punten.length > 2 && (
        <details className="wb-meer">
          <summary>Toon alle {punten.length} punten</summary>
          <ul>{punten.slice(2).map((punt, i) => <li key={i}>{leesbaar(punt)}</li>)}</ul>
        </details>
      )}
    </>
  )
}

/* Deze vergelijking toont broninhoud, geen automatisch gegenereerd advies. */
export function VergelijkingInhoud({ brief, documentenMeta = [], naar }) {
  const inhoud = maakVergelijking(brief?.inhoud ?? '')
  const oudeDagen = vorigeDagen(brief?.inhoud ?? '')
  const oudeStukken = oudeDagen.map((dag) => documentenMeta.find((d) => d.titel === `dag${dag}-september-2026`)).filter(Boolean)
  return (
    <div className="wb-vergelijking">
      <div className="wb-vergelijking-grid">
        <section className="wb-vergelijk-kaart" aria-labelledby="wb-september">
          <div className="wb-eyebrow">September 2026</div>
          <h3 id="wb-september">Wat nemen we mee?</h3>
          <Punten tekst={inhoud.september} leeg="Dit werkdocument vermeldt geen hergebruik uit september." />
          {inhoud.nietMeer && <><h4>Wat doen we anders?</h4><Punten tekst={inhoud.nietMeer} /></>}
          {oudeStukken.length > 0 && <div className="wb-bronlinks">{oudeStukken.map((stuk) => <button key={stuk.id} className="knop zacht" onClick={() => naar?.(`#/doc/${stuk.id}`)}>Lees {stuk.titel}</button>)}</div>}
        </section>
        <section className="wb-vergelijk-kaart" aria-labelledby="wb-februari">
          <div className="wb-eyebrow">Februari 2027</div>
          <h3 id="wb-februari">De huidige aanpak</h3>
          <Punten tekst={inhoud.kern} leeg="Geen kernboodschap gevonden in dit werkdocument." />
          {inhoud.stam && <><h4>Plek in de rode draad</h4><Punten tekst={inhoud.stam} /></>}
          <button className="knop zacht" onClick={() => naar?.(`#/doc/${brief.id}`)}>Open het werkdocument</button>
        </section>
      </div>
      <section className="wb-controle" aria-labelledby="wb-controle-titel">
        <div className="wb-eyebrow">Nog te controleren</div>
        <h3 id="wb-controle-titel">Wat staat nog open?</h3>
        <Punten tekst={inhoud.controle} leeg="Geen controlesectie gevonden. Dat betekent niet dat de inhoud gevalideerd is." />
      </section>
      {inhoud.feedback && <details className="wb-details"><summary>Feedback uit de vorige editie</summary><Punten tekst={inhoud.feedback} /></details>}
      <p className="wb-bronnoot">Deze vergelijking komt uit het huidige werkdocument. Controlepunten blijven open tot de verantwoordelijke ze bevestigt.</p>
    </div>
  )
}

export function WerkbladPagina({ naam, naar, blokken = [], documentenMeta = [], bronnen = [], beslissingen = [], tik = 0, geladen, gegevensBeschikbaar, proefToegestaan = false, opActiefBlok, opComments, commentsAan = false }) {
  const [gekozen, setGekozen] = useState(() => {
    try { return herstelVergelijking(sessionStorage.getItem('werkbank_vergelijking')) } catch { return '1.3' }
  })
  const [masterplan, setMasterplan] = useState(null)
  const [masterFout, setMasterFout] = useState('')
  const [brief, setBrief] = useState(null)
  const [briefFout, setBriefFout] = useState('')
  const [briefLaden, setBriefLaden] = useState(false)
  const [notities, setNotities] = useState([])
  const [notitiesVan, setNotitiesVan] = useState(null)
  const [notitieFout, setNotitieFout] = useState('')
  const [klad, setKlad] = useState('')
  const [onderzoekVraag, setOnderzoekVraag] = useState('')
  const [bezig, setBezig] = useState(false)
  const [wachtOpBlok, setWachtOpBlok] = useState(null)

  const masterMeta = useMemo(() => documentenMeta.find((d) => d.titel === 'masterplan-februari-2027') || null, [documentenMeta])
  const briefMeta = useMemo(() => vindBrief(documentenMeta, gekozen), [documentenMeta, gekozen])
  const werkblokken = useMemo(() => WERKBLOKKEN.map((id) => blokken.find((b) => b.id === id)).filter(Boolean), [blokken])
  const huidigBlok = blokken.find((b) => b.id === gekozen)
  const ggrBeslissing = beslissingen.find((b) => /ggr/i.test(b.titel || '') && b.status !== 'beslist')

  useEffect(() => {
    try { sessionStorage.setItem('werkbank_vergelijking', gekozen) } catch { /* vergelijking blijft bruikbaar zonder opslag */ }
    opActiefBlok?.(gekozen)
  }, [gekozen, opActiefBlok])

  useEffect(() => {
    if (!masterMeta?.id) { setMasterplan(null); return }
    let actief = true
    setMasterFout('')
    D.laadDocument(masterMeta.id).then((doc) => { if (actief) setMasterplan(doc) }).catch(() => {
      if (actief) { setMasterplan(null); setMasterFout('Het masterplan kon niet geladen worden.') }
    })
    return () => { actief = false }
  }, [masterMeta?.id, tik])

  useEffect(() => {
    if (!briefMeta?.id) { setBrief(null); setBriefLaden(false); return }
    let actief = true
    setBrief(null)
    setBriefFout('')
    setBriefLaden(true)
    D.laadDocument(briefMeta.id).then((doc) => { if (actief) setBrief(doc) }).catch(() => {
      if (actief) setBriefFout('De brief kon niet geladen worden. Probeer het opnieuw.')
    }).finally(() => { if (actief) setBriefLaden(false) })
    return () => { actief = false }
  }, [briefMeta?.id, tik])

  const laadFeedback = useCallback(async () => {
    try {
      const lijst = await D.laadNotities('blok', gekozen)
      setNotities(lijst)
      setNotitiesVan(gekozen)
      setNotitieFout('')
    } catch {
      setNotitiesVan(null)
      setNotitieFout('De gedeelde feedback kon niet geladen worden.')
    }
  }, [gekozen])

  useEffect(() => {
    let actief = true
    setNotities([])
    setNotitiesVan(null)
    D.laadNotities('blok', gekozen).then((lijst) => { if (actief) { setNotities(lijst); setNotitiesVan(gekozen); setNotitieFout('') } }).catch(() => {
      if (actief) { setNotitiesVan(null); setNotitieFout('De gedeelde feedback kon niet geladen worden.') }
    })
    return () => { actief = false }
  }, [gekozen, tik])

  useOnbewaard(!!(klad.trim() || onderzoekVraag.trim()) || bezig)

  const kiesBlok = (id) => {
    if (id === gekozen || bezig) return
    if (klad.trim()) setWachtOpBlok(id)
    else setGekozen(id)
  }

  const bewaarFeedback = async (e) => {
    e.preventDefault()
    const tekst = klad.trim()
    if (!tekst || bezig) return
    setBezig(true)
    setNotitieFout('')
    try {
      await D.voegNotitieToe('blok', gekozen, tekst, naam)
      setKlad((huidig) => huidig.trim() === tekst ? '' : huidig)
      await laadFeedback()
    } catch {
      setNotitieFout('Feedback bewaren is niet gelukt. De tekst staat nog in het veld.')
    } finally {
      setBezig(false)
    }
  }

  const stelling = stellingVoorDagdeel(brief, briefMeta, gekozen)
  const doel = doelVoorDagdeel(brief, briefMeta, gekozen)
  const lagen = haalLagen(masterplan?.inhoud ?? '')
  const draad = haalSectie(masterplan?.inhoud ?? '', '2. De rode draad in één zin')
    .split('\n').find((regel) => /^\s*>/.test(regel))?.replace(/^\s*>\s*/, '') || ''

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen wb-binnen">
          <header className="wb-kop">
            <div className="wb-eyebrow">Werkblad masterclass</div>
            <h1>Van september naar februari</h1>
            <p>De rode draad, wat we meenemen uit de vorige editie en wat nog een keuze vraagt.</p>
          </header>

          <ZaalPreview />

          <section className="wb-stam" aria-labelledby="wb-stam-titel">
            <div className="wb-eyebrow">Het masterplan</div>
            <h2 id="wb-stam-titel">De rode draad</h2>
            {!geladen && <p className="wb-ontbreekt">Het masterplan wordt geladen…</p>}
            {geladen && !masterMeta && <p className="wb-ontbreekt">Het masterplan is niet beschikbaar in de werkbank.</p>}
            {masterFout && <p role="alert" className="wb-feedback-fout">{masterFout}</p>}
            {masterMeta && !masterplan && !masterFout && <p className="wb-ontbreekt">Het masterplan wordt geladen…</p>}
            {draad && <blockquote>{leesbaar(draad)}</blockquote>}
            {lagen.length > 0 && <details className="wb-lagen-details"><summary>Bekijk de vier lagen van het masterplan</summary><div className="wb-lagen">{lagen.map((laag) => <div className="wb-laag" key={laag.naam}><strong>{laag.naam}</strong><span>{leesbaar(laag.uitleg)}</span></div>)}</div></details>}
            {masterMeta && <div className="wb-stam-voet"><button className="knop zacht" onClick={() => naar(`#/doc/${masterMeta.id}`)}>Open het masterplan <Icoon naam="chevronRechts" maat={14} /></button><span className="meta-klein">Bron: huidig masterplan in de werkbank</span></div>}
          </section>

          {ggrBeslissing && <div className="wb-beslissing"><div className="wb-beslissing-tekst"><strong>{ggrBeslissing.titel}: nog te beslissen</strong><p>{ggrBeslissing.detail}</p></div><button className="knop" onClick={() => naar(`#/beslissing/${ggrBeslissing.id}`)}>Bekijk beslissing</button></div>}

          <div className="wb-sectie-kop">
            <div className="wb-eyebrow">Vergelijking per dagdeel</div>
            <h2>Wat verandert er in februari?</h2>
            <p>Kies een dagdeel om september, februari en de open controles naast elkaar te leggen. De vergelijking start met vier uitgewerkte dagdelen.</p>
          </div>
          <div className="wb-tabs" role="group" aria-label="Kies een dagdeel voor de vergelijking">
            {werkblokken.map((blok) => <button key={blok.id} className="wb-tab" aria-pressed={gekozen === blok.id} onClick={() => kiesBlok(blok.id)}>{blok.code} · {blok.titel}</button>)}
          </div>
          {briefLaden && <p role="status" className="wb-ontbreekt">De vergelijking wordt geladen…</p>}
          {briefFout && <p role="alert" className="wb-feedback-fout">{briefFout}</p>}
          {geladen && !briefMeta && <p className="wb-ontbreekt">Voor dit dagdeel is geen unieke brief beschikbaar in de werkbank.</p>}
          {brief && !briefLaden && <VergelijkingInhoud brief={brief} documentenMeta={documentenMeta} naar={naar} />}

          {huidigBlok && <details className="vk-overzicht">
            <summary><strong>Voorbereiding van {huidigBlok.code}</strong><span>Vraag · bronnen · stelling · lesinhoud · oefening · feedback · bijsturing</span></summary>
            <Voorbereidingsketen blok={huidigBlok} documentenMeta={gegevensBeschikbaar?.documenten === false ? undefined : documentenMeta}
              bronnen={gegevensBeschikbaar?.bronnen === false ? undefined : bronnen}
              notities={notitiesVan === gekozen ? notities : undefined}
              doel={doel?.tekst} doelBron={doel?.bron}
              stelling={stelling?.tekst} stellingBron={stelling?.bron}
              beslissingen={gegevensBeschikbaar?.beslissingen === false ? undefined : beslissingen} geladen={geladen} naar={naar} niveau={3} />
          </details>}

          {huidigBlok && <section className="wb-feedback" aria-labelledby="wb-feedback-titel">
            <div className="wb-eyebrow">Samen verder werken</div>
            <h3 id="wb-feedback-titel">Feedback bij {huidigBlok.code} · {huidigBlok.titel}</h3>
            <p>Noteer wat anders moet of nog uitgezocht moet worden. De werkbank is momenteel openbaar: iedereen kan deze notitie lezen of wijzigen.</p>
            <form onSubmit={bewaarFeedback}>
              <textarea aria-label="Feedback voor dit dagdeel" value={klad} onChange={(e) => setKlad(e.target.value)} placeholder="Bijvoorbeeld: dit voorbeeld ontbreekt, of deze vraag moet nog onderzocht worden." />
              {notitieFout && <p role="alert" className="wb-feedback-fout">{notitieFout}</p>}
              <div className="wb-feedback-acties"><button className="knop primair" type="submit" disabled={!klad.trim() || bezig}>{bezig ? 'Bewaren…' : 'Feedback bewaren'}</button></div>
            </form>
            {notities.slice(0, 4).map((notitie) => <div className="wb-feedback-item" key={notitie.id}><small>{notitie.auteur} · {D.datumKort(notitie.created_at)}</small>{notitie.tekst}</div>)}
          </section>}

          <OnderzoekPaneel vraag={onderzoekVraag} opVraagWijzig={setOnderzoekVraag} />

          <div className="wb-links"><button className="knop" onClick={() => naar('#/planning')}>Beslissingen en voorstellen</button><button className="knop" onClick={() => naar('#/status')}>Volledige stand van zaken</button><button className="knop zacht" onClick={() => naar('#/bronnen')}>Alle bronnen</button><button className="knop zacht" onClick={() => opComments?.()}>Comments bij {gekozen}{commentsAan ? ' · aan' : ''}</button>{proefToegestaan && <button className="knop zacht" onClick={() => naar('#/agent-proef')}>Probeer de commentaaragent</button>}</div>
        </div>
      </main>
      <Dialoog
        open={!!wachtOpBlok}
        titel="Feedback nog niet bewaard"
        tekst="Als je naar een ander dagdeel gaat, verdwijnt deze tekst. Je kunt ook eerst annuleren en de feedback bewaren."
        actie="Weggooien en wisselen"
        verscheurend
        opAnnuleer={() => setWachtOpBlok(null)}
        opBevestig={() => { const doel = wachtOpBlok; setKlad(''); setWachtOpBlok(null); if (doel) setGekozen(doel) }}
      />
    </>
  )
}
