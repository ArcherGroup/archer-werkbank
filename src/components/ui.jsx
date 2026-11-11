import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sb, SB_URL, SB_KEY } from '../lib/supabase'
import { kleurVoor, initialen } from '../lib/data'

/* kleine bouwstenen die overal terugkomen */

export function Pill({ kinderen, soort }) {
  return <span className={`pill ${soort ?? 'stil'}`}>{kinderen}</span>
}

export function StatusStip({ status }) {
  return <span className={`stip-status ${status || 'Leeg'}`} title={status} />
}

export function Notities({ doelType, doelId, auteur, notities, onWijzig, compact = false }) {
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)

  const bewaar = async () => {
    const t = tekst.trim()
    if (!t) return
    setBezig(true)
    try {
      await sb.from('notities').insert({ doel_type: doelType, doel_id: String(doelId), tekst: t, auteur })
      setTekst('')
      onWijzig?.()
    } finally {
      setBezig(false)
    }
  }

  const verwijder = async (id) => {
    await sb.from('notities').delete().eq('id', id)
    onWijzig?.()
  }

  const eigen = notities ?? []

  return (
    <div>
      <div className="notitie-invoer">
        <textarea
          value={tekst}
          placeholder="Schrijf een notitie, zichtbaar voor iedereen…"
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) bewaar()
          }}
        />
        <div className="rij">
          <span className="meta-klein">{tekst.trim() ? '⌘⏎ om te bewaren' : ''}</span>
          <button className="knop primair" onClick={bewaar} disabled={!tekst.trim() || bezig}>
            {bezig ? 'Bewaren…' : 'Notitie bewaren'}
          </button>
        </div>
      </div>
      {eigen.length === 0 && <div className="leeg-tekst">Nog geen notities hier.</div>}
      {eigen.map((n) => (
        <div className="notitie" key={n.id}>
          <div className="kop">
            <span className="wie" style={{ background: kleurVoor(n.auteur) }}>
              {initialen(n.auteur)}
            </span>
            <b>{n.auteur}</b>
            <span>{new Date(n.created_at).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <button className="weg" title="Verwijderen" onClick={() => verwijder(n.id)}>
              wis
            </button>
          </div>
          <div className="tekst">{n.tekst}</div>
        </div>
      ))}
    </div>
  )
}

export function Kruimel({ delen, naar }) {
  return (
    <div className="kruimel">
      {delen.map((d, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="scheiding">›</span>}
          {d.naar ? (
            <button onClick={() => naar(d.naar)}>{d.tekst}</button>
          ) : (
            <span>{d.tekst}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/* het ⌘K-palet: zoeken over alles en springen */

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

export function Naamvraag({ opNaam }) {
  const [naam, setNaam] = useState('')
  return (
    <div className="naam-achtergrond">
      <div className="naam-kaart">
        <h2>Welkom in de werkbank</h2>
        <p>
          Wie ben je? Je naam komt bij je notities, bij het bewerken en bij wie er online staat. Hij blijft alleen op dit
          toestel bewaard.
        </p>
        <div className="naam-rij">
          {['Victor', 'Anthony'].map((n) => (
            <button key={n} className="knop" onClick={() => opNaam(n)}>
              Ik ben {n}
            </button>
          ))}
        </div>
        <input
          value={naam}
          placeholder="Of typ je naam…"
          onChange={(e) => setNaam(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && naam.trim() && opNaam(naam.trim())}
        />
        <button className="knop primair" disabled={!naam.trim()} onClick={() => opNaam(naam.trim())}>
          Binnenkomen
        </button>
      </div>
    </div>
  )
}
