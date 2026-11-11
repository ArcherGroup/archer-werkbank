import React, { useCallback, useEffect, useState } from 'react'
import * as D from '../lib/data'
import { Kruimel } from '../components/basis'
import { Notities } from '../components/notities'

export function BronPagina({ bronId, naar, naam, herlaad, tik }) {
  const [bron, setBron] = useState(null)
  const [notities, setNotities] = useState([])
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState('')

  const herlaadBron = useCallback(() => {
    D.laadBron(bronId).then(setBron).catch(() => setBron(null))
  }, [bronId])

  useEffect(() => {
    herlaadBron()
    D.laadNotities('bron', bronId).then(setNotities).catch(() => {})
  }, [herlaadBron, bronId, tik])

  const haalOp = async (ververs = false) => {
    if (!bron) return
    setLaden(true)
    setFout('')
    try {
      const r = await D.leesBron(bron.url)
      if (r.fout) {
        setFout(r.fout)
        await D.bewaarBronPagina(bron.id, { fout: r.fout })
      } else {
        await D.bewaarBronPagina(bron.id, { pagina_titel: r.titel, pagina_tekst: r.tekst })
      }
      herlaadBron()
      herlaad?.()
    } catch (e) {
      setFout(String(e.message || e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    if (bron && !bron.pagina_tekst && !bron.fout && !laden) haalOp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bron?.id])

  if (!bron)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <div className="leeg-melding">Deze bron is er niet (meer).</div>
        </div>
      </main>
    )

  const zetStatus = async (s) => {
    await D.zetBronStatus(bron.id, s)
    herlaadBron()
    herlaad?.()
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
            <div className="titel">{bron.pagina_titel || bron.titel || bron.url}</div>
            <div className="url">
              <a href={bron.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                {bron.url}
              </a>
            </div>
            <div className="lezer-acties">
              {['ongelezen', 'gelezen', 'kernbron'].map((s) => (
                <button key={s} className={`statusknop ${bron.status === s ? 'aan' : ''}`} onClick={() => zetStatus(s)}>
                  {s === 'kernbron' ? '★ kernbron' : s}
                </button>
              ))}
              <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={() => haalOp(true)} disabled={laden}>
                {laden ? 'Ophalen…' : '↻ Opnieuw ophalen'}
              </button>
            </div>
          </div>

          {laden && <div className="leeg-melding">De pagina wordt opgehaald…</div>}
          {fout && !laden && (
            <div className="pl-kaart" style={{ borderColor: 'rgba(192,50,33,0.3)' }}>
              <div className="t">Ophalen mislukte</div>
              <div className="d">{fout}</div>
              <button className="knop" onClick={() => haalOp(true)}>
                Opnieuw proberen
              </button>
            </div>
          )}
          {!laden && bron.pagina_tekst && (
            <div className="lezer-tekst">{bron.pagina_tekst.slice(0, 120000)}</div>
          )}
          {!laden && !bron.pagina_tekst && !fout && <div className="leeg-melding">Nog niets opgehaald.</div>}
        </div>
      </main>
      <aside className="inspector breed">
        <div className="insp-titel">Jouw notitie bij deze bron</div>
        <Notities doelType="bron" doelId={bron.id} auteur={naam} notities={notities} onWijzig={() => D.laadNotities('bron', bron.id).then(setNotities)} />
        <div className="insp-titel">Details</div>
        <div className="insp-kaart">
          <div className="insp-rij">
            <span className="k">Dagdeel</span>
            <span className="v">{bron.blok_id}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Status</span>
            <span className="v">{bron.status}</span>
          </div>
          {bron.opgehaald_op && (
            <div className="insp-rij">
              <span className="k">Opgehaald</span>
              <span className="v">{D.datumKort(bron.opgehaald_op)}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
