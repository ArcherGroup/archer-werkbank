import React, { useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '../lib/supabase'

/* Het ⌘K-palet: zoeken in alles en springen. */

export function Palet({ open, opSluiten, blokken, documentenMeta, bronnen, naar }) {
  const [q, setQ] = useState('')
  const [keuze, setKeuze] = useState(0)
  const [inhoudsHits, setInhoudsHits] = useState([])
  const [aanHetZoeken, setAanHetZoeken] = useState(false)
  const invoer = useRef(null)
  const zoekTimer = useRef(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setKeuze(0)
      setInhoudsHits([])
      setTimeout(() => invoer.current?.focus(), 30)
    }
  }, [open])

  // inhoudelijk zoeken (FTS) met een korte vertraging
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 3) {
      setInhoudsHits([])
      return
    }
    setAanHetZoeken(true)
    clearTimeout(zoekTimer.current)
    zoekTimer.current = setTimeout(async () => {
      try {
        const { data } = await sb.rpc('zoek_inhoud', { q: term })
        setInhoudsHits(data ?? [])
      } catch {
        setInhoudsHits([])
      } finally {
        setAanHetZoeken(false)
      }
    }, 260)
    return () => clearTimeout(zoekTimer.current)
  }, [q, open])

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    const uit = []
    const past = (s) => !term || String(s ?? '').toLowerCase().includes(term)

    // blokken
    const bl = blokken.filter((b) => past(b.code) || past(b.titel))
    if (bl.length) {
      uit.push({ groep: 'Dagdelen' })
      for (const b of bl.slice(0, term ? 6 : 8)) {
        uit.push({
          id: `blok-${b.id}`,
          icoon: '📅',
          titel: `${b.code} · ${b.titel}`,
          sub: `${b.status}${b.spreker ? ' · ' + b.spreker : ''}`,
          actie: () => naar(`#/blok/${b.id}`),
        })
      }
    }

    // documenten
    const docs = documentenMeta.filter((d) => past(d.titel) || past(d.soort))
    if (docs.length) {
      uit.push({ groep: 'Documenten' })
      for (const d of docs.slice(0, term ? 8 : 3).slice(0, 8)) {
        uit.push({
          id: `doc-${d.id}`,
          icoon: d.soort === 'research' ? '🔎' : d.soort === 'spreektekst' ? '🎤' : d.soort === 'slides' ? '🖼️' : d.soort === 'werkboek' ? '✏️' : '📄',
          titel: d.titel,
          sub: `blok ${d.blok_id} · ${d.soort} · ${d.bewerkt_door ? 'bewerkt door ' + d.bewerkt_door : 'niet bewerkt'}`,
          actie: () => naar(`#/doc/${d.id}`),
        })
      }
    }

    // bronnen
    const br = bronnen.filter((b) => past(b.titel) || past(b.url))
    if (br.length && (term || true)) {
      uit.push({ groep: 'Bronnen' })
      for (const b of br.slice(0, term ? 8 : 4)) {
        uit.push({
          id: `bron-${b.id}`,
          icoon: '🔗',
          titel: b.titel || b.url,
          sub: b.url,
          actie: () => naar(`#/bron/${b.id}`),
        })
      }
    }

    // vaste plekken
    const plekken = [
      { icoon: '🏠', titel: 'Overzicht', sub: 'de hele editie in één beeld', actie: () => naar('#/'), altijd: true },
      { icoon: '🔗', titel: 'Bronnen', sub: 'alle bronnen, filterbaar', actie: () => naar('#/bronnen'), altijd: true },
      { icoon: '🧭', titel: 'Planning', sub: 'beslissingen, validaties, voorstellen', actie: () => naar('#/planning'), altijd: true },
    ]
    const pl = plekken.filter((p) => past(p.titel))
    if (pl.length) {
      uit.push({ groep: 'Ga naar' })
      for (const p of pl) uit.push({ id: `plek-${p.titel}`, ...p })
    }

    // inhoudshits
    if (inhoudsHits.length) {
      uit.push({ groep: q.trim().length >= 3 ? `In de inhoud (${inhoudsHits.length})` : 'In de inhoud' })
      for (const h of inhoudsHits.slice(0, 8)) {
        uit.push({
          id: `hit-${h.document_id}`,
          icoon: '💬',
          titel: h.titel,
          sub: (h.snippet || '').replace(/<</g, '').replace(/>>/g, '').slice(0, 120),
          actie: () => naar(`#/doc/${h.document_id}`),
        })
      }
    }

    return uit
  }, [q, blokken, documentenMeta, bronnen, inhoudsHits, naar])

  const kiesbaar = items.filter((i) => !i.groep)

  useEffect(() => {
    setKeuze(0)
  }, [q, items.length])

  const kies = (i) => {
    const echte = i ?? kiesbaar[keuze]
    if (echte) {
      opSluiten()
      echte.actie()
    }
  }

  const toets = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setKeuze((k) => Math.min(k + 1, kiesbaar.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setKeuze((k) => Math.max(k - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      kies()
    } else if (e.key === 'Escape') {
      opSluiten()
    }
  }

  if (!open) return null
  let teller = -1

  return (
    <div className="palet-achtergrond" onMouseDown={(e) => e.target === e.currentTarget && opSluiten()}>
      <div className="palet" role="dialog" aria-label="Zoeken en springen">
        <input
          ref={invoer}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={toets}
          placeholder="Zoek in alles: blokken, documenten, bronnen, inhoud…"
        />
        <div className="palet-lijst">
          {items.length === 0 && (
            <div className="leeg-tekst" style={{ padding: 18 }}>
              {aanHetZoeken ? 'Zoeken…' : 'Niets gevonden.'}
            </div>
          )}
          {items.map((i) => {
            if (i.groep)
              return (
                <div className="palet-groep" key={`g-${i.groep}`}>
                  {i.groep}
                </div>
              )
            teller += 1
            const idx = teller
            const aan = idx === keuze
            return (
              <button
                key={i.id}
                className={`palet-item ${aan ? 'aan' : ''}`}
                onMouseEnter={() => setKeuze(idx)}
                onClick={() => kies(i)}
              >
                <span className="soort-icoon">{i.icoon}</span>
                <span className="midden">
                  <div className="t">{i.titel}</div>
                  {i.sub && <div className="s">{i.sub}</div>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* naamvraag bij het eerste bezoek */
