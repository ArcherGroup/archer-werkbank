import React, { useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '../lib/supabase'
import { Icoon, SOORT_ICOON } from './Icoon'
import { useEscape } from '../hooks/useEscape'
import { useFocusTrap } from '../hooks/useFocusTrap'

/* Het ⌘K-palet: zoeken in alles en springen.
   Patroon: één invoerveld dat de lijst bestuurt (combobox + listbox), focus
   blijft in het veld, pijlen verplaatsen de actieve optie via
   aria-activedescendant. Enter opent, Escape en klik-buiten sluiten. */

const VASTE_PLEKKEN = [
  { icoon: 'overzicht', titel: 'Werkblad', sub: 'rode draad en vergelijking tussen edities', naar: '#/' },
  { icoon: 'dagdeel', titel: 'Stand van zaken', sub: 'voortgang van de editie', naar: '#/status' },
  { icoon: 'bronnen', titel: 'Bronnen', sub: 'alle bronnen, filterbaar', naar: '#/bronnen' },
  { icoon: 'planning', titel: 'Planning', sub: 'beslissingen, validaties, voorstellen', naar: '#/planning' },
]

function Markeer({ tekst, term }) {
  if (!term) return tekst
  const i = String(tekst ?? '').toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return tekst
  return (
    <>
      {tekst.slice(0, i)}
      <mark>{tekst.slice(i, i + term.length)}</mark>
      {tekst.slice(i + term.length)}
    </>
  )
}

/* Bronnen zonder eigen titel krijgen een leesbare URL in plaats van twee keer
   dezelfde lange link. */
function netteUrl(url) {
  try {
    const u = new URL(url)
    const pad = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')
    return (u.hostname.replace(/^www\./, '') + pad).slice(0, 80)
  } catch {
    return String(url ?? '').slice(0, 80)
  }
}

export function Palet({ open, opSluiten, blokken, documentenMeta, bronnen, naar }) {
  const [q, setQ] = useState('')
  const [keuze, setKeuze] = useState(0)
  const [inhoudsHits, setInhoudsHits] = useState([])
  const [aanHetZoeken, setAanHetZoeken] = useState(false)
  const [zoekfout, setZoekfout] = useState(false)
  const invoer = useRef(null)
  const zoekTimer = useRef(null)
  const kaart = useRef(null)
  const terug = useRef(null)

  useEscape(() => opSluiten?.(), open)
  useFocusTrap(kaart, open)

  useEffect(() => {
    if (!open) return
    terug.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQ('')
    setKeuze(0)
    setInhoudsHits([])
    setZoekfout(false)
    const t = setTimeout(() => invoer.current?.focus(), 30)
    return () => {
      clearTimeout(t)
      if (terug.current?.isConnected) terug.current.focus?.()
    }
  }, [open])

  // inhoudelijk zoeken (FTS) met een korte vertraging
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    setZoekfout(false)
    if (term.length < 3) {
      setInhoudsHits([])
      setAanHetZoeken(false)
      return
    }
    setAanHetZoeken(true)
    clearTimeout(zoekTimer.current)
    zoekTimer.current = setTimeout(async () => {
      try {
        const { data, error } = await sb.rpc('zoek_inhoud', { q: term })
        if (error) throw error
        setInhoudsHits(data ?? [])
      } catch {
        setInhoudsHits([])
        setZoekfout(true)
      } finally {
        setAanHetZoeken(false)
      }
    }, 260)
    return () => clearTimeout(zoekTimer.current)
  }, [q, open])

  const term = q.trim().toLowerCase()

  const items = useMemo(() => {
    const uit = []
    const past = (s) => !term || String(s ?? '').toLowerCase().includes(term)

    const bl = blokken.filter((b) => past(b.code) || past(b.titel))
    if (bl.length) {
      uit.push({ groep: 'Dagdelen' })
      for (const b of bl.slice(0, term ? 6 : 8)) {
        uit.push({
          id: `blok-${b.id}`,
          icoon: b.code.split('.')[0] === b.code ? 'dagdeel' : 'document',
          titel: `${b.code} · ${b.titel}`,
          sub: `${b.status}${b.spreker ? ' · ' + b.spreker : ''}`,
          actie: () => naar(`#/blok/${b.id}`),
        })
      }
    }

    const docs = documentenMeta.filter((d) => past(d.titel) || past(d.soort))
    if (docs.length) {
      uit.push({ groep: 'Documenten' })
      for (const d of docs.slice(0, term ? 8 : 3)) {
        uit.push({
          id: `doc-${d.id}`,
          icoon: SOORT_ICOON[d.soort] || 'document',
          titel: d.titel,
          sub: `blok ${d.blok_id} · ${d.soort} · ${d.bewerkt_door ? 'bewerkt door ' + d.bewerkt_door : 'niet bewerkt'}`,
          actie: () => naar(`#/doc/${d.id}`),
        })
      }
    }

    // Inhoud vóór bronnen: een treffer in een stuk is meestal waardevoller dan
    // een link die toevallig de zoekterm in zijn URL heeft.
        if (inhoudsHits.length) {
          uit.push({ groep: `In de inhoud (${inhoudsHits.length})` })
          for (const h of inhoudsHits.slice(0, 8)) {
            uit.push({
              id: `hit-${h.document_id}`,
              icoon: 'inhoud',
              titel: h.titel,
              sub: (h.snippet || '').replace(/<</g, '').replace(/>>/g, '').slice(0, 120),
              actie: () => naar(`#/doc/${h.document_id}`),
            })
          }
        }

        const br = bronnen.filter((b) => past(b.titel) || past(b.url))
        if (br.length) {
          uit.push({ groep: 'Bronnen' })
          for (const b of br.slice(0, term ? 4 : 4)) {
            const titel = (b.titel || '').trim()
            const heeftEigenTitel = titel && titel !== b.url
            uit.push({
              id: `bron-${b.id}`,
              icoon: 'bronnen',
              titel: heeftEigenTitel ? titel : netteUrl(b.url),
              sub: heeftEigenTitel ? b.url : '',
              actie: () => naar(`#/bron/${b.id}`),
            })
          }
        }

        const pl = VASTE_PLEKKEN.filter((p) => past(p.titel))
        if (pl.length) {
          uit.push({ groep: 'Ga naar' })
          for (const p of pl) uit.push({ id: `plek-${p.titel}`, ...p, actie: () => naar(p.naar) })
        }

        return uit
  }, [term, blokken, documentenMeta, bronnen, inhoudsHits, naar])

  const kiesbaar = items.filter((i) => !i.groep)

  useEffect(() => {
    setKeuze(0)
  }, [term, items.length])

  const kies = (i) => {
    const echte = i ?? kiesbaar[keuze]
    if (echte) {
      opSluiten?.()
      echte.actie()
    }
  }

  const toets = (e) => {
    if (e.isComposing) return
    const laatste = kiesbaar.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setKeuze((k) => (k >= laatste ? 0 : k + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setKeuze((k) => (k <= 0 ? laatste : k - 1))
        break
      case 'Home':
        e.preventDefault()
        setKeuze(0)
        break
      case 'End':
        e.preventDefault()
        setKeuze(Math.max(0, laatste))
        break
      case 'Enter':
        e.preventDefault()
        kies()
        break
      case 'Escape':
        e.preventDefault()
        opSluiten?.()
        break
      case 'Tab':
        opSluiten?.()
        break
      default:
        break
    }
  }

  if (!open) return null

  let teller = -1
  const actiefId = kiesbaar[keuze] ? `pal-${kiesbaar[keuze].id}` : undefined
  const leeg = items.length === 0

  return (
    <div className="palet-achtergrond" onMouseDown={(e) => e.target === e.currentTarget && opSluiten?.()}>
      <div className="palet" role="dialog" aria-modal="true" aria-label="Zoeken en springen" ref={kaart} tabIndex={-1}>
        <div className="palet-veld">
          <Icoon naam="zoeken" maat={15} />
          <input
            ref={invoer}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={toets}
            placeholder="Zoek in alles: dagdelen, stukken, bronnen, inhoud…"
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-lijst"
            aria-activedescendant={actiefId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button className="palet-wis" onClick={() => setQ('')} aria-label="Zoekterm wissen" title="Wissen">
              <Icoon naam="sluiten" maat={13} />
            </button>
          )}
        </div>

        <div className="palet-lijst" id="pal-lijst" role="listbox" aria-label="Resultaten">
          {leeg && (
            <div className="palet-leeg">
              {aanHetZoeken ? (
                <>
                  <Icoon naam="laden" maat={16} className="draait" />
                  Inhoud doorzoeken…
                </>
              ) : zoekfout ? (
                <>
                  <Icoon naam="waarschuwing" maat={16} />
                  Het inhoudelijk zoeken lukte niet. Probeer het zo opnieuw.
                </>
              ) : (
                <>
                  <Icoon naam="zoeken" maat={16} />
                  <div>
                    <div className="leeg-titel">Niets gevonden voor “{q.trim()}”</div>
                    <div className="leeg-uitleg">Probeer een korter woord, of zoek op een code zoals 3.1.</div>
                  </div>
                  <button className="knop" onClick={() => setQ('')}>
                    Zoekterm wissen
                  </button>
                </>
              )}
            </div>
          )}

          {items.map((i) => {
            if (i.groep)
              return (
                <div className="palet-groep" key={`g-${i.groep}`} role="presentation">
                  {i.groep}
                </div>
              )
            teller += 1
            const idx = teller
            const aan = idx === keuze
            return (
              <button
                key={i.id}
                id={`pal-${i.id}`}
                role="option"
                aria-selected={aan}
                className={`palet-item ${aan ? 'aan' : ''}`}
                onMouseEnter={() => setKeuze(idx)}
                onClick={() => kies(i)}
                tabIndex={-1}
              >
                <span className="soort-icoon">
                  <Icoon naam={i.icoon} maat={15} />
                </span>
                <span className="midden">
                  <div className="t">
                    <Markeer tekst={i.titel} term={term} />
                  </div>
                  {i.sub && (
                    <div className="s">
                      <Markeer tekst={i.sub} term={term} />
                    </div>
                  )}
                </span>
                {aan && (
                  <span className="palet-enter">
                    <Icoon naam="enter" maat={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="palet-voet">
          <span>
            <kbd className="toets">↑↓</kbd> kiezen
          </span>
          <span>
            <kbd className="toets">⏎</kbd> openen
          </span>
          <span>
            <kbd className="toets">esc</kbd> sluiten
          </span>
        </div>
      </div>
    </div>
  )
}
