import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as D from '../lib/data'

import { Notities } from '../components/notities'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { meld } from '../components/meldingen'
import { beoordeelBronCache, veiligeBronUrl, doorverwezenAdres } from '../lib/bron-check'

/* De oorsprongslink blijft bereikbaar bij een fout, een PDF of een geblokkeerde
   site. Een opgeslagen firewall- of onderhoudspagina is nooit broninhoud. */
export function BronInhoud({ bron, opgehaald = null, fout = '', laden = false, opOpnieuw }) {
  const cache = beoordeelBronCache(bron)
  const toestand = opgehaald?.tekst ? { type: 'tekst', tekst: opgehaald.tekst } : cache
  const adres = veiligeBronUrl(bron?.url)
  const uitleg = fout || (['geblokkeerd', 'onbeschikbaar', 'fout'].includes(toestand.type) ? toestand.uitleg : '')

  if (laden) {
    return (
      <div className="lezer-laden" role="status">
        <div className="meta-klein" style={{ marginBottom: 12 }}>De pagina wordt opgehaald…</div>
        <SkeletAlinea lijnen={8} />
      </div>
    )
  }

  if (toestand.type === 'pdf') {
    return (
      <div className="pl-kaart">
        <div className="kop"><div className="t">Dit is een PDF</div></div>
        <div className="d">Open het document op de website van de uitgever. Sommige websites laten het niet in een ander venster insluiten.</div>
        {adres && <div className="acties"><a className="knop primair" href={adres} target="_blank" rel="noopener noreferrer">PDF openen <Icoon naam="extern" maat={12} /></a></div>}
      </div>
    )
  }

  if (uitleg) {
    return (
      <div className="foutkaart" role="alert">
        <div className="kop"><Icoon naam="waarschuwing" maat={14} /> De bron is hier niet leesbaar</div>
        <div>{uitleg}</div>
        {!fout && !opgehaald && <div className="meta-klein">Dit is een eerder opgeslagen melding. Probeer opnieuw voor de huidige toestand.</div>}
        <div className="acties">
          {adres && <a className="knop primair" href={adres} target="_blank" rel="noopener noreferrer">Open de originele bron <Icoon naam="extern" maat={12} /></a>}
          {opOpnieuw && <button className="knop" onClick={opOpnieuw}>Opnieuw proberen</button>}
        </div>
      </div>
    )
  }

  if (toestand.type === 'tekst') {
    return (
      <>
        <p className="meta-klein">{opgehaald?.tekst
          ? 'Net opgehaald, alleen in dit venster; deze tekst is niet in de gedeelde werkbank opgeslagen.'
          : 'Eerder opgeslagen tekst; de pagina kan intussen verouderd zijn.'}</p>
        <div className="lezer-tekst">{toestand.tekst.slice(0, 120000)}</div>
        {toestand.tekst.length > 120000 && <p className="meta-klein">Een deel van de tekst wordt getoond. Open de originele bron voor de volledige pagina.</p>}
      </>
    )
  }

  return (
    <LegeStaat
      icoon="bronnen"
      titel="Nog geen leesbare tekst"
      uitleg={adres ? 'Probeer de tekst op te halen of open het originele adres.' : 'Deze bron heeft geen geldig webadres.'}
      acties={opOpnieuw && adres ? <button className="knop" onClick={opOpnieuw}>Tekst ophalen</button> : null}
      compact
    />
  )
}

export function BronPagina({ bronId, naar, naam, herlaad, tik }) {
  const [bron, setBron] = useState(null)
  const [geladen, setGeladen] = useState(false)
  const [notities, setNotities] = useState([])
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState('')
  const [vers, setVers] = useState(null)
  const [optimistisch, setOptimistisch] = useState(null)
  const opgehaald = useRef(false)

  const herlaadBron = useCallback(async () => {
    try {
      const b = await D.laadBron(bronId)
      setBron(b)
    } catch {
      setBron(null)
    } finally {
      setGeladen(true)
    }
  }, [bronId])

  useEffect(() => {
    setGeladen(false)
    herlaadBron()
    D.laadNotities('bron', bronId).then(setNotities).catch(() => {})
  }, [herlaadBron, bronId, tik])

  const haalOp = useCallback(
    async (ververs = false) => {
      if (!bron || laden) return
      const adres = veiligeBronUrl(bron.url)
      const cache = beoordeelBronCache(bron)
      if (!adres) {
        setFout('Deze bron heeft geen geldig webadres.')
        return
      }
      // PDF's worden door de bestaande serverlezer als HTML verwerkt. Open het
      // originele bestand, in plaats van onleesbare PDF-bytes te tonen.
      if (cache.type === 'pdf') return
      if (!ververs && cache.type !== 'leeg') return
      setLaden(true)
      setFout('')
      try {
        const resultaat = await D.leesBron(adres)
        if (resultaat.fout) {
          setFout(resultaat.fout)
        } else {
          setVers(resultaat)
        }
        // Alleen lokaal in dit venster. Een bron openen schrijft niet langer
        // ongemerkt een foutpagina of een tijdelijke uitlezing naar de database.
      } catch {
        setFout('De pagina kon niet opgehaald worden. Open de originele bron of probeer opnieuw.')
      } finally {
        setLaden(false)
      }
    },
    [bron, laden],
  )

  // Haal alleen nieuwe webpagina's op. Een eerder opgeslagen fout of PDF
  // krijgt eerst een duidelijke uitleg en de originele link.
  useEffect(() => {
    if (!bron || bron.id !== bronId || opgehaald.current) return
    if (beoordeelBronCache(bron).type !== 'leeg') return
    opgehaald.current = true
    haalOp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bron?.id, bronId])

  if (!bron && geladen)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <LegeStaat
            icoon="bronnen"
            titel="Deze bron is er niet (meer)"
            uitleg="De link klopt niet meer, of de bron is verwijderd."
            acties={
              <button className="knop primair" onClick={() => naar('#/bronnen')}>
                Naar alle bronnen
              </button>
            }
          />
        </div>
      </main>
    )

  if (!bron)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <Skelet breedte="42%" hoogte={20} />
          <div style={{ height: 10 }} />
          <Skelet breedte="66%" hoogte={12} />
          <div style={{ height: 26 }} />
          <SkeletAlinea lijnen={7} />
        </div>
      </main>
    )

  const status = optimistisch ?? bron.status
  const cacheStatus = beoordeelBronCache(bron)
  const adres = veiligeBronUrl(bron.url)
  const eindadres = doorverwezenAdres(adres, vers?.url)
  const titel = vers?.titel || (cacheStatus.type === 'tekst' ? bron.pagina_titel : '') || bron.titel || bron.url

  const zetStatus = async (s) => {
    if (s === status) return
    setOptimistisch(s)
    try {
      await D.zetBronStatus(bron.id, s)
      await herlaadBron()
      herlaad?.()
    } catch {
      setOptimistisch(null)
      meld('De status kon niet bewaard worden. Probeer opnieuw.', { fout: true })
    }
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen">
          <div className="lezer-bron">
            <h1 className="titel" title={titel}>{titel}</h1>
            <div className="url">
              {adres ? <a href={adres} target="_blank" rel="noopener noreferrer">{adres}<Icoon naam="extern" maat={11} /></a> : 'Ongeldig bronadres'}
            </div>
            {eindadres && (
              <div className="url" style={{ marginTop: 6 }}>
                Doorverwezen naar: <a href={eindadres} target="_blank" rel="noopener noreferrer">{eindadres}<Icoon naam="extern" maat={11} /></a>
              </div>
            )}
            <div className="lezer-acties">
              <div className="statusgroep" role="group" aria-label="Status van deze bron">
                {[
                  ['ongelezen', 'Ongelezen'],
                  ['gelezen', 'Gelezen'],
                  ['kernbron', 'Kernbron'],
                ].map(([s, label]) => (
                  <button
                    key={s}
                    className={`statusknop ${status === s ? 'aan' : ''}`}
                    onClick={() => zetStatus(s)}
                    aria-pressed={status === s}
                  >
                    {s === 'kernbron' && <Icoon naam="ster" maat={12} />}
                    {label}
                  </button>
                ))}
              </div>
              {adres && (
                <a className="knop primair" style={{ marginLeft: 'auto' }} href={adres} target="_blank" rel="noopener noreferrer">
                  Origineel openen <Icoon naam="extern" maat={13} />
                </a>
              )}
              {cacheStatus.type !== 'pdf' && (
                <button className="knop zacht" onClick={() => haalOp(true)} disabled={laden || !adres}>
                  <Icoon naam="vernieuwen" maat={13} className={laden ? 'draait' : undefined} />
                  {laden ? 'Ophalen…' : 'Tekst opnieuw ophalen'}
                </button>
              )}
            </div>
          </div>

          <BronInhoud bron={bron} opgehaald={vers} fout={fout} laden={laden} opOpnieuw={() => haalOp(true)} />
        </div>
      </main>

      <aside className="inspector breed">
        <div className="insp-titel">Jouw notitie bij deze bron</div>
        <Notities
          doelType="bron"
          doelId={bron.id}
          auteur={naam}
          notities={notities}
          onWijzig={() => D.laadNotities('bron', bron.id).then(setNotities)}
        />
        <div className="insp-titel">Details</div>
        <div className="insp-kaart">
          <div className="insp-rij">
            <span className="k">Dagdeel</span>
            <span className="v">{bron.blok_id}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Status</span>
            <span className="v">{status}</span>
          </div>
          {bron.opgehaald_op && (
            <div className="insp-rij">
              <span className="k">Eerder opgeslagen</span>
              <span className="v cijfers">{D.datumKort(bron.opgehaald_op)}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
