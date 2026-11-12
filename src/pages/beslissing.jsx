import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as D from '../lib/data'
import { bronnenVoorBeslissing, optiesVoorBeslissing, bewijsAanwezig, leesBrontabel } from '../lib/beslissing-review'
import { haalSectie, eerstePunten } from '../lib/werkblad'
import { useOnbewaard } from '../hooks/useOnbewaard'
import { Kruimel, Pill } from '../components/basis'
import { LegeStaat } from '../components/leegstaat'
import './beslissing.css'

function gewoon(tekst) {
  return String(tekst ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|`/g, '').trim()
}

function passage(spec, doc) {
  if (!spec.kop) return ''
  const tekst = haalSectie(doc?.inhoud || '', spec.kop)
  if (spec.sleutel === 'ggr') return eerstePunten(tekst, 100).find((p) => /GGR-anker/i.test(p)) || ''
  return tekst
}

function Bronkaart({ spec, staat, naar }) {
  const inhoud = staat?.tekst || ''
  const tabel = leesBrontabel(inhoud)
  return (
    <section className="besl-bron" aria-label={spec.label}>
      <div className="besl-bron-kop">
        <strong>{spec.label}</strong>
        {spec.document?.versie != null && <span className="meta-klein">versie {spec.document.versie}</span>}
      </div>
      {!spec.document && <p className="besl-hulp">Dit stuk is niet uniek beschikbaar in de werkbank.</p>}
      {spec.document && (!staat || staat.status === 'laden') && <p role="status" className="besl-hulp">Bron wordt geladen…</p>}
      {staat?.status === 'fout' && <p role="alert" className="besl-fout">De bron kon niet geladen worden. Open het stuk of probeer later opnieuw.</p>}
      {staat?.status === 'verouderd' && <p role="alert" className="besl-fout">Dit stuk is intussen gewijzigd. Herlaad de pagina om het opnieuw te beoordelen.</p>}
      {staat?.status === 'klaar' && spec.kop && !inhoud && <p className="besl-hulp">De verwachte sectie is niet gevonden in dit stuk.</p>}
      {staat?.status === 'klaar' && inhoud && tabel.koppen.length > 0 && (
        <div className="besl-tabel-wrap"><table className="besl-tabel"><thead><tr>{tabel.koppen.map((kop, i) => <th key={i} scope="col">{kop}</th>)}</tr></thead><tbody>{tabel.rijen.map((rij, i) => <tr key={i}>{rij.map((cel, j) => <td key={j}>{cel}</td>)}</tr>)}</tbody></table></div>
      )}
      {staat?.status === 'klaar' && inhoud && !tabel.koppen.length && <p className="besl-passage">{gewoon(inhoud)}</p>}
      {staat?.status === 'klaar' && !spec.kop && <p className="besl-hulp">Het bestaande concept staat in dit stuk.</p>}
      {spec.document && <button className="knop zacht" onClick={() => naar(`#/doc/${spec.document.id}`)}>Open volledig stuk</button>}
    </section>
  )
}

export function BeslissingPagina({ beslissingId, beslissingen = [], documentenMeta = [], naar, herlaad, geladen }) {
  const beslissing = beslissingen.find((b) => String(b.id) === String(beslissingId))
  const specs = useMemo(() => bronnenVoorBeslissing(beslissing, documentenMeta), [beslissing?.titel, documentenMeta])
  const opties = useMemo(() => optiesVoorBeslissing(beslissing), [beslissing?.titel])
  const signatuur = specs.map((s) => `${s.sleutel}:${s.document?.id || ''}:${s.document?.versie || ''}:${s.document?.updated_at || ''}`).join('|')
  const vorigeSignatuur = useRef(null)
  const [bronData, setBronData] = useState({})
  const [start, setStart] = useState(null)
  const [gekozen, setGekozen] = useState('')
  const [eigen, setEigen] = useState('')
  const [motivatie, setMotivatie] = useState('')
  const [bronGewijzigd, setBronGewijzigd] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [succes, setSucces] = useState(false)

  useOnbewaard(!!(gekozen || eigen.trim() || motivatie.trim()) || bezig)

  useEffect(() => {
    if (beslissing && !start) setStart({ id: beslissing.id, updated_at: beslissing.updated_at ?? null })
  }, [beslissing?.id, start])

  useEffect(() => {
    if (!beslissing) return
    if (vorigeSignatuur.current !== null && vorigeSignatuur.current !== signatuur && gekozen) {
      setGekozen('')
      setBronGewijzigd(true)
    }
    vorigeSignatuur.current = signatuur
    let actief = true
    setBronData(Object.fromEntries(specs.map((s) => [s.sleutel, { status: s.document ? 'laden' : 'ontbreekt' }])))
    for (const spec of specs) {
      if (!spec.document) continue
      D.laadDocument(spec.document.id).then((doc) => {
        if (!actief) return
        const verouderd = spec.document.versie != null && doc.versie != null && spec.document.versie !== doc.versie
        setBronData((vorig) => ({ ...vorig, [spec.sleutel]: { status: verouderd ? 'verouderd' : 'klaar', tekst: passage(spec, doc) } }))
      }).catch(() => {
        if (actief) setBronData((vorig) => ({ ...vorig, [spec.sleutel]: { status: 'fout' } }))
      })
    }
    return () => { actief = false }
  }, [beslissing?.id, signatuur])

  if (!geladen) return <main className="hoofd"><div className="hoofd-binnen"><p role="status">De beslissing wordt geladen…</p></div></main>
  if (!beslissing) return <main className="hoofd"><div className="hoofd-binnen"><LegeStaat icoon="waarschuwing" titel="Deze beslissing is niet gevonden" uitleg="De link klopt niet meer of de beslissing is verwijderd." acties={<button className="knop" onClick={() => naar('#/planning')}>Terug naar planning</button>} /></div></main>

  const optie = opties.find((o) => o.id === gekozen)
  const bron = optie?.bron ? bronData[optie.bron] : null
  const onderbouwd = optie && (!optie.bron || (bron?.status === 'klaar' && bewijsAanwezig(optie, bron.tekst)))
  const keuzeTekst = gekozen === 'eigen' ? eigen.trim() : optie?.titel || ''
  const gewijzigd = !!start && (start.updated_at !== (beslissing.updated_at ?? null) || beslissing.status !== 'open')
  const kanVastleggen = !!(keuzeTekst && motivatie.trim() && onderbouwd && start && !gewijzigd && !bezig)

  const vastleggen = async () => {
    if (!kanVastleggen) return
    setBezig(true)
    setFout('')
    try {
      await D.legBeslissingVast({ ...beslissing, updated_at: start.updated_at }, `${keuzeTekst}\nMotivering: ${motivatie.trim()}`)
      setGekozen('')
      setEigen('')
      setMotivatie('')
      setSucces(true)
      await herlaad?.()
    } catch (e) {
      const bericht = e?.message || ''
      setFout(bericht.includes('intussen gewijzigd') || bericht.includes('teruggelezen beslissing')
        ? bericht
        : 'De opslag kon niet worden bevestigd. Controleer de actuele stand; je invoer staat nog klaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen besl-binnen">
          <Kruimel naar={naar} delen={[{ tekst: 'Werkblad', naar: '#/' }, { tekst: 'Planning', naar: '#/planning' }, { tekst: beslissing.titel }]} />
          <header className="besl-kop">
            <div className="besl-eyebrow">Beslissing beoordelen</div>
            <h1>{beslissing.titel}</h1>
            <p>{beslissing.detail || 'Er is nog geen toelichting bij deze beslissing.'}</p>
            <div className="besl-meta"><Pill soort={beslissing.status === 'beslist' ? 'Final' : 'Concept'}>{beslissing.status}</Pill><span>Eigenaar: {beslissing.eigenaar || 'niet opgegeven'}</span><span>{beslissing.deadline ? `Deadline: ${beslissing.deadline}` : 'Geen deadline vastgelegd'}</span></div>
          </header>
          {succes && <div role="status" className="besl-succes">Je keuze is vastgelegd. De gekoppelde stukken zijn niet automatisch aangepast.</div>}
          {gewijzigd && !succes && <div role="alert" className="besl-fout">Deze beslissing is intussen gewijzigd. Herlaad de pagina en beoordeel de actuele stand opnieuw.</div>}
          {beslissing.besluit && <section className="besl-bestaand"><strong>{beslissing.status === 'beslist' ? 'Vastgelegd besluit' : 'Eerder vastgelegd besluit'}</strong><p>{beslissing.besluit}</p></section>}
          {beslissing.status === 'open' && !succes && (
            <section className="besl-sectie" aria-labelledby="besl-opties">
              <div className="besl-eyebrow">Jouw keuze</div><h2 id="besl-opties">Wat beslissen we?</h2>
              <p>De onderstaande mogelijkheden zijn voorstellen. Alleen jij legt een keuze vast.</p>
              {bronGewijzigd && <p role="alert" className="besl-fout">Een gekoppelde bron veranderde. Lees de actuele passage en kies opnieuw.</p>}
              <fieldset className="besl-opties"><legend className="sr-only">Kies één mogelijkheid</legend>
                {opties.map((o) => {
                  const data = o.bron && bronData[o.bron]
                  const beschikbaar = !o.bron || (data?.status === 'klaar' && bewijsAanwezig(o, data.tekst))
                  return <label key={o.id} className={`besl-optie ${gekozen === o.id ? 'gekozen' : ''} ${beschikbaar ? '' : 'uit'}`}>
                    <input type="radio" name="beslissing" value={o.id} checked={gekozen === o.id} disabled={!beschikbaar || bezig} onChange={() => { setGekozen(o.id); setBronGewijzigd(false) }} />
                    <span><strong>{o.titel}</strong><small>{o.uitleg}</small>{!beschikbaar && <small>De bijbehorende bron is nog niet beschikbaar of wijkt af.</small>}</span>
                  </label>
                })}
              </fieldset>
              {gekozen === 'eigen' && <div className="veld"><label className="veldlabels" htmlFor="besl-eigen">Eigen keuze</label><textarea id="besl-eigen" readOnly={bezig} value={eigen} onChange={(e) => setEigen(e.target.value)} placeholder="Omschrijf de keuze die je wilt vastleggen." /></div>}
              <div className="veld"><label className="veldlabels" htmlFor="besl-motivatie">Motivering</label><textarea id="besl-motivatie" readOnly={bezig} value={motivatie} onChange={(e) => setMotivatie(e.target.value)} placeholder="Waarom kies je hiervoor? Wat moet er nog gebeuren?" /></div>
              {fout && <p role="alert" className="besl-fout">{fout}</p>}
              <button className="knop primair" disabled={!kanVastleggen} onClick={vastleggen}>{bezig ? 'Bewaren…' : 'Vastleggen'}</button>
              <p className="besl-hulp">Vastleggen bewaart alleen de keuze en motivering. De documenten en het A3-bestand worden hierdoor niet automatisch aangepast. Er is nog geen besluitgeschiedenis of geverifieerde identiteit.</p>
            </section>
          )}
          <section className="besl-sectie" aria-labelledby="besl-bronnen">
            <div className="besl-eyebrow">Ter onderbouwing</div><h2 id="besl-bronnen">Bronnen en context</h2>
            <p>Dit zijn bestaande werkdocumenten en voorstellen. Controleer de context vóór je kiest.</p>
            {specs.length === 0 && <p className="besl-hulp">Voor deze beslissing zijn nog geen specifieke bronnen gekoppeld.</p>}
            <div className="besl-bronnen">{specs.map((s) => <Bronkaart key={s.sleutel} spec={s} staat={bronData[s.sleutel]} naar={naar} />)}</div>
          </section>
        </div>
      </main>
      <aside className="inspector"><div className="insp-titel">Zo gebruik je dit dossier</div><div className="insp-kaart">Lees de context, vergelijk de mogelijkheden en leg pas daarna je keuze vast. De werkbank heeft voorlopig open lees- en schrijfrechten.</div><button className="knop zacht" onClick={() => naar('#/planning')}>Terug naar planning</button></aside>
    </>
  )
}
