import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Icoon, SOORT_ICOON } from './Icoon'
import { StatusStip } from './basis'
import { bouwDagdeelVisie, stukkenBijTijdvak } from '../lib/dagdeel-visie'
import './dagdeel-visie.css'

/* Visuele laag bovenop de volledige werkstukken. Alle gegevens worden door de
   ouder aangeleverd; de component maakt geen nieuwe claims en schrijft niets.

   Drie niveaus, van breed naar smal: de vierdaagse, de dag en het dagdeel.
   Op elk niveau kun je doorklikken: van een dag naar zijn dagdelen, van een
   dagdeel naar zijn stukken, en van een onderdeel naar het stuk dat erbij hoort. */
function Pad({ route, naar, children, className = '', ...rest }) {
  return <a className={className} href={route} {...rest} onClick={(e) => {
    if (typeof naar !== 'function' || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    naar(route)
  }}>{children}</a>
}

function kort(tekst, max = 260) {
  const t = String(tekst ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const deel = t.slice(0, max)
  const spatie = deel.lastIndexOf(' ')
  return `${deel.slice(0, spatie > max / 2 ? spatie : max)}…`
}

const GROEPEN = [
  { id: 'dagdeel', label: 'Dagdeel' },
  { id: 'dag', label: 'Dag' },
  { id: 'vierdaagse', label: '4 dagen' },
]
const GEEN_DAGDEEL = ['algemeen', 'bronnen']
const aantal = (n, enkel, meer) => `${n} ${n === 1 ? enkel : meer}`

export function herstelVisieStand(geschiedenis, blok) {
  const basis = { niveau: 'dagdeel', dag: blok?.dag ?? null, gekozenId: null, open: null }
  const stand = geschiedenis?.__dagdeelVisie
  if (!stand || stand.blokId !== blok?.id) return basis
  return {
    niveau: GROEPEN.some((g) => g.id === stand.niveau) ? stand.niveau : basis.niveau,
    dag: Number.isInteger(stand.dag) && stand.dag >= 1 && stand.dag <= 4 ? stand.dag : basis.dag,
    gekozenId: Number.isInteger(stand.gekozenId) && stand.gekozenId > 0 ? stand.gekozenId : null,
    open: typeof stand.open === 'string' && stand.open.trim() ? stand.open : null,
  }
}

export function metVisieStand(geschiedenis, blokId, stand) {
  return { ...(geschiedenis || {}), __dagdeelVisie: { blokId, ...stand } }
}

/* Een dagdeel in de daglijst: dichtgeklapt een rij, opengeklapt de stukken en
   een doorklik. `open` wordt niet als React-prop gezet maar via de DOM
   bijgehouden, anders vecht React met de native details-toggle. */
function DagdeelWidget({ actief, code, titel, status, aantalTekst, open, opOpen, children, route, naar }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.open !== open) el.open = open
  }, [open])
  return (
    <details ref={ref} className={`dv-widget${actief ? ' actief' : ''}`} data-open={open ? 'ja' : 'nee'}
      onToggle={(e) => { if (e.currentTarget.open !== open) opOpen(e.currentTarget.open) }}>
      <summary>
        <span className="dv-widget-code">{code}</span>
        <span className="dv-widget-titel">{titel}{actief && <small>Huidig</small>}</span>
        {status && <StatusStip status={status} />}
        <span className="dv-widget-aantal">{aantalTekst}</span>
        <Icoon naam="chevronOnder" maat={14} />
      </summary>
      <div className="dv-widget-body">
        {children}
        {!actief && <Pad className="dv-widget-open" route={route} naar={naar}>Open het volledige dagdeel<Icoon naam="chevronRechts" maat={14} /></Pad>}
      </div>
    </details>
  )
}

export function DagdeelVisie({ blok, blokken = [], stukkenPerBlok, kaart = {}, dagSchema = {}, masterplanId, laden = false, fout = false, masterLaden = false, masterFout = false, eigenaarVerschil = null, ggrBeslissing = null, beginNiveau = null, beginOpen = null, naar }) {
  const basis = useId()
  const [stand, setStand] = useState(() => {
    const hersteld = herstelVisieStand(typeof window === 'undefined' ? null : window.history.state, blok)
    // Een expliciet gevraagd niveau wint van de standaard, maar nooit van de geschiedenis.
    const metNiveau = beginNiveau && GROEPEN.some((g) => g.id === beginNiveau) ? { ...hersteld, niveau: beginNiveau } : hersteld
    return beginOpen && !metNiveau.open ? { ...metNiveau, open: beginOpen } : metNiveau
  })
  const { niveau, dag, gekozenId, open } = stand
  const tijden = Array.isArray(kaart.tijdvakken) ? kaart.tijdvakken : []
  const dagen = Array.isArray(kaart.dagen) ? kaart.dagen : []
  const tijdvak = tijden.find((t) => String(t.id) === String(gekozenId)) || tijden[0]

  // De stukken van dit dagdeel: liefst de volledige lijst die de ouder per dagdeel aanlevert,
  // anders de vier kernstukken uit de rekenlaag.
  const stukken = useMemo(() => {
    const eigen = stukkenPerBlok?.[blok?.id]
    if (Array.isArray(eigen) && eigen.length) return eigen
    return Array.isArray(kaart.bronnen) ? kaart.bronnen : []
  }, [stukkenPerBlok, blok?.id, kaart.bronnen])
  const bij = useMemo(() => stukkenBijTijdvak(stukken, tijdvak), [stukken, tijdvak])

  const dagdelen = useMemo(() => bouwDagdeelVisie({ blok: { ...blok, dag }, blokken }).dagdelen, [blok, blokken, dag])
  const volledig = useMemo(() => {
    const m = {}
    for (const b of Array.isArray(blokken) ? blokken : []) if (b?.id) m[b.id] = b
    return m
  }, [blokken])
  const perDag = useMemo(() => {
    const m = {}
    for (const b of Array.isArray(blokken) ? blokken : []) {
      const d = Number(b?.dag)
      if (!b?.id || GEEN_DAGDEEL.includes(String(b.id)) || !Number.isInteger(d)) continue
      m[d] = (m[d] || 0) + 1
    }
    return m
  }, [blokken])
  const dagtitel = dagen.find((d) => String(d.dag) === String(dag))?.titel
  const eerste = tijden[0]
  const laatste = tijden[tijden.length - 1]
  const tijd = eerste?.begin && laatste?.einde ? `${eerste.begin} tot ${laatste.einde}` : ''
  const bronMaster = masterplanId != null ? `#/doc/${masterplanId}` : null

  const kies = (wijziging) => {
    const nieuweStand = { ...stand, ...wijziging }
    setStand(nieuweStand)
    try {
      if (typeof window !== 'undefined') window.history.replaceState(metVisieStand(window.history.state, blok?.id, nieuweStand), '')
    } catch { /* de kaart blijft bruikbaar als geschiedenis niet schrijfbaar is */ }
  }
  const kiesDag = (nieuweDag) => kies({ dag: nieuweDag, niveau: 'dag' })
  const stukLijst = (lijst, leeg) => lijst.length
    ? <div className="dv-chips">{lijst.map((s) => {
      const titel = s.titel || s.soort
      const toonSoort = String(titel).toLowerCase() !== String(s.soort).toLowerCase()
      return (
        <Pad key={`${s.soort}-${s.id}`} route={s.route} naar={naar} className="dv-chip" title={`${s.soort}: ${titel}`}>
          <Icoon naam={SOORT_ICOON[s.soort] || 'paperclip'} maat={13} />
          <span>{titel}</span>
          {toonSoort && <em>{s.soort}</em>}
        </Pad>
      )
    })}</div>
    : <p className="dv-melding">{leeg}</p>

  return (
    <section className="dv-overzicht" aria-labelledby={`${basis}-titel`}>
      <div className="dv-top">
        <h2 id={`${basis}-titel`}>Overzicht van het dagdeel</h2>
        <div className="dv-niveaus" role="group" aria-label="Kies het overzichtsniveau">
          {GROEPEN.map((groep) => (
            <button type="button" key={groep.id} aria-pressed={niveau === groep.id}
              aria-controls={`${basis}-inhoud`} onClick={() => groep.id === 'dag' ? kiesDag(niveau === 'dag' ? dag : blok?.dag) : kies({ niveau: groep.id })}>
              {groep.label}
            </button>
          ))}
        </div>
      </div>
      <div id={`${basis}-inhoud`}>
        {niveau === 'dagdeel' && (
          <div className="dv-paneel" data-niveau="dagdeel">
            {laden && <p className="dv-melding" role="status">Het dagdeel wordt geladen…</p>}
            {fout && <p className="dv-melding" role="alert">De brief kon niet geladen worden. De originele stukken blijven beschikbaar.</p>}
            {kaart.doel ? <p className="dv-doel">{kaart.doel}</p> : !laden && !fout && <p className="dv-melding">Het doel is nog niet beschikbaar in de brief.</p>}
            <div className="dv-meta">{tijd && <span>{tijd}</span>}{blok?.spreker && <span>Spreker: {blok.spreker}</span>}</div>
            {eigenaarVerschil && <div className="dv-verschil">
              <strong>Verschil om af te stemmen</strong>
              <span>Eigenaar · Dagdeel: {eigenaarVerschil.dagdeel} · Brief: {eigenaarVerschil.brief}</span>
              <Pad route={eigenaarVerschil.bron} naar={naar}>Bekijk de brief</Pad>
            </div>}
            {tijden.length > 0 ? (
              <div className="dv-opbouw">
                <section className="dv-volgorde" aria-labelledby={`${basis}-opbouw`}>
                  <h3 id={`${basis}-opbouw`}>Wat gebeurt er?</h3>
                  <div className="dv-stappen">
                    {tijden.map((t) => (
                      <button type="button" className="dv-stap" key={t.id} data-stap={t.id}
                        aria-pressed={tijdvak === t} onClick={() => kies({ gekozenId: t.id })}>
                        <span className="dv-punt" aria-hidden="true" />
                        <span className="dv-staptekst"><strong>{t.titel || 'Onderdeel'}</strong>{t.begin && t.einde && <small>{t.begin} tot {t.einde}</small>}</span>
                        {t.minuten != null && <span className="dv-duur">{t.minuten} min</span>}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="dv-detail" aria-live="polite" aria-label="Gekozen onderdeel">
                  {tijdvak && <><div className="dv-oog">{[tijdvak.vorm, tijdvak.minuten != null ? `${tijdvak.minuten} min` : null].filter(Boolean).join(' · ')}</div>
                    <h3>{tijdvak.titel || 'Onderdeel'}</h3>
                    {tijdvak.detail && <p>{kort(tijdvak.detail)}</p>}
                    {bij.length > 0 && <div className="dv-bij">
                      <span className="dv-oog">Bij dit onderdeel</span>
                      {bij.map((s) => <Pad key={`${s.soort}-${s.id}`} route={s.route} naar={naar}>{s.titel}{String(s.titel).toLowerCase() !== String(s.soort).toLowerCase() && <small>{s.soort}</small>}</Pad>)}
                    </div>}
                    <p className="dv-detailvoet">De volledige inhoud staat in de brondocumenten.</p></>}
                </section>
              </div>
            ) : !laden && !fout && <p className="dv-melding">Nog geen programma beschikbaar in de brief.</p>}
            {kaart.boodschap && <details className="dv-meer"><summary>Kernboodschap</summary><p>{kaart.boodschap}</p></details>}
            <div className="dv-bronnen">
              <span>Alle stukken van dit dagdeel{stukken.length ? ` (${stukken.length})` : ''}</span>
              {stukLijst(stukken, laden ? 'De stukken worden geladen…' : 'Er zijn nog geen stukken aan dit dagdeel gekoppeld.')}
            </div>
          </div>
        )}
        {niveau === 'dag' && (
          <div className="dv-paneel" data-niveau="dag">
            <div className="dv-oog">De dag · werktitel</div>
            <h3>Dag {dag}{dagtitel ? ` · ${dagtitel}` : ''}</h3>
            <p className="dv-subtitel">Open een dagdeel voor zijn stukken.{dagdelen.length ? ` ${aantal(dagdelen.length, 'dagdeel', 'dagdelen')} op deze dag.` : ''}</p>
            {dagen.length > 1 && <div className="dv-dagstrip" role="group" aria-label="Kies een dag">
              {dagen.map((d) => (
                <button type="button" key={d.dag} aria-pressed={String(dag) === String(d.dag)} onClick={() => kies({ dag: d.dag, niveau: 'dag' })}>Dag {d.dag}</button>
              ))}
            </div>}
            {dagdelen.some((b) => dagSchema[b.id]?.begin) && (
              <div className="dv-dagtijdlijn" aria-label="Dagindeling op tijd">
                {dagdelen
                  .filter((b) => dagSchema[b.id]?.begin)
                  .sort((a, b) => dagSchema[a.id].begin.localeCompare(dagSchema[b.id].begin))
                  .map((b) => (
                    <Pad key={b.id} className={`dv-tijdvlak${b.id === blok?.id ? ' actief' : ''}`} route={b.route} naar={naar}
                      title={`${b.code} · ${b.titel}`}>
                      <span className="dv-tijdvlak-code">{b.code}</span>
                      <strong>{dagSchema[b.id].begin} tot {dagSchema[b.id].einde}</strong>
                      <small>{b.titel}</small>
                    </Pad>
                  ))}
              </div>
            )}
            {dagdelen.length ? <div className="dv-daglijst">{dagdelen.map((b) => {
              const vanRij = Array.isArray(stukkenPerBlok?.[b.id]) ? stukkenPerBlok[b.id] : []
              return (
                <DagdeelWidget key={b.id} actief={b.id === blok?.id} code={b.code} titel={b.titel}
                  status={volledig[b.id]?.status} route={b.route} naar={naar}
                  aantalTekst={vanRij.length ? aantal(vanRij.length, 'stuk', 'stukken') : 'geen stukken'}
                  open={open === b.id} opOpen={(nuOpen) => kies({ open: nuOpen ? b.id : null })}>
                  {stukLijst(vanRij, 'Nog geen stukken in dit dagdeel.')}
                </DagdeelWidget>
              )
            })}</div> : <p className="dv-melding">Er zijn nog geen dagdelen voor deze dag beschikbaar.</p>}
          </div>
        )}
        {niveau === 'vierdaagse' && (
          <div className="dv-paneel" data-niveau="vierdaagse">
            <div className="dv-oog">Het geheel · werktitels</div>
            <h3>Vier dagen, één verhaal</h3>
            {masterLaden && <p className="dv-melding" role="status">Het masterplan wordt geladen…</p>}
            {masterFout && <p className="dv-melding" role="alert">Het masterplan kon niet geladen worden.</p>}
            {kaart.rodeDraad ? <p className="dv-doel">{kaart.rodeDraad}</p> : !masterLaden && !masterFout && <p className="dv-melding">De rode draad is nog niet beschikbaar in het masterplan.</p>}
            {ggrBeslissing && <p className="dv-melding">Het GGR-anker is nog een open keuze. <Pad route={`#/beslissing/${ggrBeslissing.id}`} naar={naar}>Bekijk de beslissing</Pad></p>}
            {dagen.length ? <div className="dv-dagen">{dagen.map((d) => (
              <button type="button" key={d.dag} className={String(d.dag) === String(blok?.dag) ? 'actief' : ''} onClick={() => kiesDag(d.dag)}>
                <span>Dag {d.dag} · {perDag[d.dag] ? aantal(perDag[d.dag], 'dagdeel', 'dagdelen') : 'nog leeg'}{String(d.dag) === String(blok?.dag) ? ' · huidig' : ''}</span><strong>{d.titel}</strong><small>Bekijk de dag →</small>
              </button>
            ))}</div> : !masterLaden && !masterFout && <p className="dv-melding">De dagindeling is nog niet beschikbaar.</p>}
            {kaart.plek && <div className="dv-plek"><h4>De plek van dit dagdeel</h4>{kaart.plek.gebouw && <p><strong>Het gebouw:</strong> {kaart.plek.gebouw}</p>}{kaart.plek.ggr && <p><strong>De meetlat:</strong> {kaart.plek.ggr}</p>}</div>}
            {bronMaster && <Pad className="dv-master" route={bronMaster} naar={naar}>Open het masterplan</Pad>}
          </div>
        )}
      </div>
    </section>
  )
}
