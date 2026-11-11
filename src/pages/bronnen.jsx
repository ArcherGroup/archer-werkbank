import React, { useMemo, useState } from 'react'
import * as D from '../lib/data'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { meld } from '../components/meldingen'

const FILTERS = [
  ['alle', 'Alle'],
  ['ongelezen', 'Ongelezen'],
  ['gelezen', 'Gelezen'],
  ['kernbron', 'Kernbron'],
]

export function BronnenPagina({ naar, bronnen, blokken, naam, herlaad, geladen }) {
  const [filter, setFilter] = useState('alle')
  const [blokFilter, setBlokFilter] = useState('')
  const [q, setQ] = useState('')
  const [toevoegen, setToevoegen] = useState(false)
  const [nieuwUrl, setNieuwUrl] = useState('')
  const [nieuwTitel, setNieuwTitel] = useState('')
  const [nieuwBlok, setNieuwBlok] = useState('')
  const [urlFout, setUrlFout] = useState('')
  const [bezig, setBezig] = useState(false)

  const kernbronnen = bronnen.filter((b) => b.status === 'kernbron').length

  const gefilterd = useMemo(() => {
    const term = q.trim().toLowerCase()
    return bronnen.filter((b) => {
      if (filter !== 'alle' && b.status !== filter) return false
      if (blokFilter && b.blok_id !== blokFilter) return false
      if (term && !`${b.titel} ${b.url}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [bronnen, filter, blokFilter, q])

  const heeftFilters = filter !== 'alle' || blokFilter || q.trim()

  if (!geladen)
    return (
      <>
        <main className="hoofd">
          <div className="hoofd-binnen">
            <div className="pagina-kop">
              <Skelet breedte="24%" hoogte={27} straal={7} />
              <div style={{ height: 11 }} />
              <Skelet breedte="44%" hoogte={12} />
            </div>
            <div style={{ height: 22 }} />
            <Skelet breedte="100%" hoogte={34} straal={8} />
            <div style={{ height: 18 }} />
            <SkeletAlinea lijnen={8} />
          </div>
        </main>
        <aside className="inspector">
          <div className="insp-titel">Bronnen</div>
          <Skelet breedte="100%" hoogte={120} straal={10} />
        </aside>
      </>
    )

  const wisFilters = () => {
    setFilter('alle')
    setBlokFilter('')
    setQ('')
  }

  const toe = async () => {
    const url = nieuwUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setUrlFout('Begin het adres met https:// of http://')
      return
    }
    setUrlFout('')
    setBezig(true)
    try {
      await D.voegBronToe({ url, titel: nieuwTitel.trim(), blok_id: nieuwBlok || 'algemeen', auteur: naam })
      meld('Bron toegevoegd.')
      setToevoegen(false)
      setNieuwUrl('')
      setNieuwTitel('')
      setNieuwBlok('')
      herlaad?.()
    } catch {
      meld('De bron kon niet toegevoegd worden. Probeer opnieuw.', { fout: true })
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 860 }}>
          <div className="pagina-kop">
            <h1>Bronnen</h1>
            <div className="onder">
              <span className="cijfers">
                {bronnen.length} bronnen, {kernbronnen} kernbronnen
              </span>
              <button className="knop zacht" onClick={() => setToevoegen((t) => !t)}>
                <Icoon naam={toevoegen ? 'sluiten' : 'plus'} maat={14} />
                {toevoegen ? 'Annuleer' : 'Bron toevoegen'}
              </button>
            </div>
          </div>

          {toevoegen && (
            <form
              className="pl-kaart"
              onSubmit={(e) => {
                e.preventDefault()
                toe()
              }}
            >
              <div className="kop">
                <div className="t">Nieuwe bron</div>
              </div>
              <div className="veld">
                <label className="veldlabels" htmlFor="bron-url">
                  Adres van de pagina
                </label>
                <input
                  id="bron-url"
                  value={nieuwUrl}
                  onChange={(e) => {
                    setNieuwUrl(e.target.value)
                    if (urlFout) setUrlFout('')
                  }}
                  onBlur={() => {
                    if (nieuwUrl.trim() && !/^https?:\/\//i.test(nieuwUrl.trim())) {
                      setUrlFout('Begin het adres met https:// of http://')
                    }
                  }}
                  placeholder="https://…"
                  inputMode="url"
                  autoComplete="url"
                  aria-invalid={!!urlFout}
                  aria-describedby={urlFout ? 'bron-url-fout' : undefined}
                />
                {urlFout && (
                  <div className="veld-fout" id="bron-url-fout" role="alert">
                    <Icoon naam="waarschuwing" maat={13} />
                    {urlFout}
                  </div>
                )}
              </div>
              <div className="veld">
                <label className="veldlabels" htmlFor="bron-titel">
                  Titel (mag leeg blijven)
                </label>
                <input id="bron-titel" value={nieuwTitel} onChange={(e) => setNieuwTitel(e.target.value)} placeholder="Waar gaat de pagina over?" />
              </div>
              <div className="veld">
                <label className="veldlabels" htmlFor="bron-blok">
                  Bij welk dagdeel hoort hij?
                </label>
                <select id="bron-blok" value={nieuwBlok} onChange={(e) => setNieuwBlok(e.target.value)}>
                  <option value="">Algemeen (geen dagdeel)</option>
                  {blokken.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.titel}
                    </option>
                  ))}
                </select>
              </div>
              <div className="acties">
                <button className="knop primair" type="submit" disabled={!nieuwUrl.trim() || bezig}>
                  {bezig ? 'Toevoegen…' : 'Toevoegen'}
                </button>
              </div>
            </form>
          )}

          <div className="bron-filter">
            <div className="seg" role="group" aria-label="Filter op status">
              {FILTERS.map(([f, label]) => (
                <button key={f} className={`fil ${filter === f ? 'aan' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                  {label}
                </button>
              ))}
            </div>
            <select className="fil" value={blokFilter} onChange={(e) => setBlokFilter(e.target.value)} aria-label="Filter op dagdeel">
              <option value="">Alle dagdelen</option>
              {blokken.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.titel}
                </option>
              ))}
            </select>
            <div className="zoekveld">
              <Icoon naam="zoeken" maat={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="zoek in titel of url…" aria-label="Zoek in bronnen" />
            </div>
            <span className="meta-klein cijfers" style={{ alignSelf: 'center' }}>
              {gefilterd.length} getoond
            </span>
          </div>

          <div className="bron-lijst">
            {gefilterd.length === 0 && (
              <LegeStaat
                icoon={heeftFilters ? 'filter' : 'bronnen'}
                titel={heeftFilters ? 'Geen bronnen met deze filters' : 'Nog geen bronnen'}
                uitleg={
                  heeftFilters
                    ? 'Er zijn wel bronnen, maar geen enkele voldoet aan de combinatie van status, dagdeel en zoekterm.'
                    : 'Voeg de eerste bron toe, of laat de assistent de research aanleveren.'
                }
                acties={
                  heeftFilters ? (
                    <button className="knop" onClick={wisFilters}>
                      Filters wissen
                    </button>
                  ) : (
                    <button className="knop primair" onClick={() => setToevoegen(true)}>
                      Bron toevoegen
                    </button>
                  )
                }
              />
            )}
            {gefilterd.slice(0, 200).map((b) => (
              <button key={b.id} className="bron-rij" onClick={() => naar(`#/bron/${b.id}`)} title={b.titel || b.url}>
                <span className={`status-stip ${b.status}`} role="img" aria-label={`Status: ${b.status}`} title={`Status: ${b.status}`} />
                <span className="midden">
                  <div className="t">{b.titel || b.url}</div>
                  <div className="u">
                    {b.url}
                    {b.blok_id ? ` · ${b.blok_id}` : ''}
                    {b.opgehaald_op ? ' · al opgehaald' : ''}
                  </div>
                </span>
                <Icoon naam="chevronRechts" maat={14} className="pijl" />
              </button>
            ))}
            {gefilterd.length > 200 && (
              <div className="leeg-tekst" style={{ padding: 12 }}>
                … en nog {gefilterd.length - 200}; gebruik de filters of het zoekveld.
              </div>
            )}
          </div>
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Zo werkt de lezer</div>
        <div className="insp-kaart" style={{ lineHeight: 1.55 }}>
          Klik een bron open. De werkbank haalt de pagina op en toont de leesbare tekst naast je notitieveld. Je merkt een
          bron als <b>gelezen</b> of <b>kernbron</b>; die keuze zien Victor en Anthony meteen.
        </div>
      </aside>
    </>
  )
}
