import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icoon } from './Icoon'
import { useEscape } from '../hooks/useEscape'
import { parseSpreektekst, tijdLabel } from '../lib/spreektekst'
import './oefen-modus.css'

const GROOTTES = ['klein', 'normaal', 'groot', 'extra']

/* **vet** en *cursief* in de podiumtekst; de rest blijft gewone tekst. */
function Inline({ tekst }) {
  const stukken = String(tekst).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return stukken.map((s, i) => {
    if (/^\*\*[^*]+\*\*$/.test(s)) return <strong key={i}>{s.slice(2, -2)}</strong>
    if (/^\*[^*]+\*$/.test(s)) return <em key={i}>{s.slice(1, -1)}</em>
    return <React.Fragment key={i}>{s}</React.Fragment>
  })
}

function Marker({ marker }) {
  const bevestigt = marker.soort === 'bevestigt'
  return (
    <span className={`oefen-badge ${bevestigt ? 'bevestigt' : 'controleren'}`} title={marker.tekst || undefined}>
      {bevestigt ? 'Anthony bevestigt' : 'Te controleren'}
      {bevestigt && marker.tekst ? <span className="oefen-badge-tekst">: {marker.tekst}</span> : null}
    </span>
  )
}

function Podium({ item, toonRegie, toonControle }) {
  return (
    <p className="oefen-podium">
      {item.delen.map((d, i) => {
        if (d.type === 'tekst') return <React.Fragment key={i}>{i > 0 ? ' ' : ''}<Inline tekst={d.tekst} /></React.Fragment>
        if (d.type === 'regie') return toonRegie ? <span key={i} className="oefen-cue inline" role="note"><span className="oefen-cue-punt" aria-hidden="true">▸</span>{d.tekst}</span> : null
        return toonControle ? <Marker key={i} marker={d} /> : null
      })}
    </p>
  )
}

/* De oefenweergave van een spreektekst: één passage tegelijk, de podiumtekst
   groot als teleprompter. Regie staat als zachte cue, controlepunten zijn
   standaard verborgen. Sluit met Esc of de knop. */
export function OefenModus({ markdown, titel = '', opSluit, startIndex = 0 }) {
  const { passages, totaalMinuten } = useMemo(() => parseSpreektekst(markdown), [markdown])
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(passages.length - 1, 0)))
  const [toonRegie, setToonRegie] = useState(true)
  const [toonControle, setToonControle] = useState(false)
  const [grootte, setGrootte] = useState(2)
  const tekstRef = useRef(null)
  const sluitRef = useRef(null)

  useEscape(() => { opSluit?.() }, true)
  useEffect(() => { sluitRef.current?.focus() }, [])
  useEffect(() => { tekstRef.current?.scrollTo?.({ top: 0 }) }, [index])

  const aantal = passages.length
  const passage = passages[index]
  const spring = (n) => setIndex(Math.min(Math.max(n, 0), Math.max(aantal - 1, 0)))

  useEffect(() => {
    const toets = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, aantal - 1)) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [aantal])

  const markersTotaal = passages.reduce((n, p) => n + p.markers, 0)
  const voortgang = aantal ? Math.round(((index + 1) / aantal) * 100) : 0

  return (
    <div className={`oefen oefen-${GROOTTES[grootte]}`} role="dialog" aria-modal="true" aria-label={`Oefenmodus${titel ? `: ${titel}` : ''}`}>
      <header className="oefen-kop">
        <div className="oefen-kop-titel">
          <span className="oefen-label">Oefenmodus</span>
          {titel && <span className="oefen-doc" title={titel}>{titel}</span>}
        </div>
        <div className="oefen-opties" role="group" aria-label="Weergave">
          <button type="button" className="oefen-knop" aria-pressed={toonRegie} onClick={() => setToonRegie((v) => !v)}>Regie</button>
          <button type="button" className="oefen-knop" aria-pressed={toonControle} onClick={() => setToonControle((v) => !v)}>
            Controlepunten{markersTotaal ? ` (${markersTotaal})` : ''}
          </button>
          <button type="button" className="oefen-knop vierkant" onClick={() => setGrootte((g) => Math.max(g - 1, 0))} disabled={grootte === 0} aria-label="Kleinere letters" title="Kleinere letters">A−</button>
          <button type="button" className="oefen-knop vierkant" onClick={() => setGrootte((g) => Math.min(g + 1, GROOTTES.length - 1))} disabled={grootte === GROOTTES.length - 1} aria-label="Grotere letters" title="Grotere letters">A+</button>
        </div>
        <button type="button" ref={sluitRef} className="knop oefen-sluit" onClick={() => opSluit?.()}>
          <Icoon naam="sluiten" maat={14} /> Sluit oefenmodus <kbd className="toets">Esc</kbd>
        </button>
      </header>

      {!aantal ? (
        <div className="oefen-leeg" role="status">
          <p>In deze tekst staan nog geen passages met podiumtekst.</p>
          <button type="button" className="knop" onClick={() => opSluit?.()}>Terug naar lezen</button>
        </div>
      ) : (
        <div className="oefen-lijf">
          <nav className="oefen-nav" aria-label="Passages">
            <ol>
              {passages.map((p, i) => (
                <li key={p.id}>
                  <button type="button" className={`oefen-nav-knop ${i === index ? 'aan' : ''} ${i < index ? 'klaar' : ''}`} aria-current={i === index ? 'location' : undefined} onClick={() => spring(i)}>
                    <span className="oefen-nav-nr">{String(i + 1).padStart(2, '0')}</span>
                    <span className="oefen-nav-titel">{p.titel}</span>
                    {p.minuten ? <span className="oefen-nav-tijd">{tijdLabel(p.minuten).replace('ca. ', '')}</span> : null}
                  </button>
                </li>
              ))}
            </ol>
            {totaalMinuten ? <p className="oefen-totaal">Totaal ca. {Math.round(totaalMinuten)} min</p> : null}
          </nav>

          <section className="oefen-scherm" aria-label="Podiumtekst">
            <div className="oefen-voortgang">
              <div className="oefen-voortgang-tekst" aria-live="polite">
                Passage {index + 1} van {aantal}
                {passage.minuten ? ` · ${tijdLabel(passage.minuten)}` : ''}
              </div>
              <div className="oefen-balk" role="progressbar" aria-valuemin={1} aria-valuemax={aantal} aria-valuenow={index + 1} aria-label="Voortgang door de passages">
                <span style={{ width: `${voortgang}%` }} />
              </div>
            </div>

            <div className="oefen-tekst" ref={tekstRef} tabIndex={-1}>
              <h2 className="oefen-passage-titel">{passage.titel}</h2>
              {passage.items.length === 0 && <p className="oefen-cue blok">In deze passage staat geen podiumtekst.</p>}
              {passage.items.map((it, i) => {
                if (it.type === 'podium') return <Podium key={i} item={it} toonRegie={toonRegie} toonControle={toonControle} />
                if (it.type === 'regie') return toonRegie ? <p key={i} className="oefen-cue blok" role="note"><span className="oefen-cue-punt" aria-hidden="true">▸</span>{it.tekst}</p> : null
                return toonControle ? <p key={i} className="oefen-marker-rij"><Marker marker={it} /></p> : null
              })}
            </div>

            <footer className="oefen-voet">
              <button type="button" className="knop" onClick={() => spring(index - 1)} disabled={index === 0}>← Vorige</button>
              {index + 1 < aantal
                ? <button type="button" className="knop primair" onClick={() => spring(index + 1)}>Volgende passage →</button>
                : <button type="button" className="knop primair" onClick={() => opSluit?.()}>Klaar · terug naar lezen</button>}
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
