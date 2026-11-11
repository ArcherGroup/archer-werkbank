import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as D from '../lib/data'
import { Kruimel } from '../components/basis'
import { Notities } from '../components/notities'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { meld } from '../components/meldingen'

export function BronPagina({ bronId, naar, naam, herlaad, tik }) {
  const [bron, setBron] = useState(null)
  const [geladen, setGeladen] = useState(false)
  const [notities, setNotities] = useState([])
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState('')
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
      if (!ververs && bron.pagina_tekst) return
      setLaden(true)
      setFout('')
      try {
        const r = await D.leesBron(bron.url)
        if (r.fout) {
          setFout(r.fout)
          await D.bewaarBronPagina(bron.id, { fout: r.fout })
        } else {
          await D.bewaarBronPagina(bron.id, { pagina_titel: r.titel, pagina_tekst: r.tekst })
          meld('Bron opgehaald.')
        }
        await herlaadBron()
        herlaad?.()
      } catch (e) {
        setFout('De pagina kon niet opgehaald worden. Controleer je verbinding en probeer opnieuw.')
      } finally {
        setLaden(false)
      }
    },
    [bron, laden, herlaadBron, herlaad],
  )

  // Eerste bezoek aan een bron die nog niet opgehaald is: één keer automatisch.
  useEffect(() => {
    if (!bron || opgehaald.current) return
    if (bron.pagina_tekst || bron.fout) return
    opgehaald.current = true
    haalOp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bron?.id])

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
          <Kruimel
            naar={naar}
            delen={[
              { tekst: 'Overzicht', naar: '#/' },
              { tekst: 'Bronnen', naar: '#/bronnen' },
              { tekst: (bron.titel || bron.url).slice(0, 60) },
            ]}
          />
          <div className="lezer-bron">
            <div className="titel" title={bron.pagina_titel || bron.titel || bron.url}>
              {bron.pagina_titel || bron.titel || bron.url}
            </div>
            <div className="url">
              <a href={bron.url} target="_blank" rel="noreferrer">
                {bron.url}
                <Icoon naam="extern" maat={11} />
              </a>
            </div>
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
              <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={() => haalOp(true)} disabled={laden}>
                <Icoon naam="vernieuwen" maat={13} className={laden ? 'draait' : undefined} />
                {laden ? 'Ophalen…' : 'Opnieuw ophalen'}
              </button>
            </div>
          </div>

          {laden && (
            <div className="lezer-laden">
              <div className="meta-klein" style={{ marginBottom: 12 }}>
                De pagina wordt opgehaald…
              </div>
              <SkeletAlinea lijnen={8} />
            </div>
          )}

          {fout && !laden && (
            <div className="foutkaart" role="alert">
              <div className="kop">
                <Icoon naam="waarschuwing" maat={14} />
                Ophalen mislukte
              </div>
              <div>{fout}</div>
              <div className="acties">
                <button className="knop" onClick={() => haalOp(true)}>
                  Opnieuw proberen
                </button>
                <a className="knop zacht" href={bron.url} target="_blank" rel="noreferrer">
                  Open de pagina zelf
                  <Icoon naam="extern" maat={12} />
                </a>
              </div>
            </div>
          )}

          {!laden && bron.pagina_tekst && <div className="lezer-tekst">{bron.pagina_tekst.slice(0, 120000)}</div>}

          {!laden && !bron.pagina_tekst && !fout && (
            <LegeStaat
              icoon="bronnen"
              titel="Nog niets opgehaald"
              uitleg="Haal de pagina op om de leesbare tekst hier naast je notities te krijgen."
              acties={
                <button className="knop primair" onClick={() => haalOp(true)}>
                  Nu ophalen
                </button>
              }
              compact
            />
          )}
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
              <span className="k">Opgehaald</span>
              <span className="v cijfers">{D.datumKort(bron.opgehaald_op)}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
