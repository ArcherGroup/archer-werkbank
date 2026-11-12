import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icoon } from './Icoon'
import { kleurVoor, initialen } from '../lib/data'
import { filterComments, groepeerReacties, herkomst, kort, sorteerVoorWalkthrough } from '../lib/comments'
import { useEscape } from '../hooks/useEscape'
import './walkthrough.css'

/* Presentatormodus: één comment per scherm, groot en rustig, met de plek
   erboven en de reacties als een gesprek eronder. Pijlen gaan verder,
   Escape sluit, Enter in het tekstveld verstuurt. */
export function Walkthrough({
  open = false, notities = [], blokken = [], documentenMeta = [], bronnen = [],
  blokId = null, dag = null, bereik = 'dagdeel', startId = null, naam = 'Victor',
  opSluiten, opOpenPlek, opLos, opAntwoord, titel = '',
}) {
  const ctx = { blokken, documentenMeta, bronnen }
  const [index, setIndex] = useState(0)
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const veld = useRef(null)

  const lijst = useMemo(() => {
    const zichtbaar = filterComments(notities, { ...ctx, bereik, blokId, dag, toonOpgelost: false })
    return groepeerReacties(sorteerVoorWalkthrough(zichtbaar, ctx))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notities, bereik, blokId, dag, blokken, documentenMeta, bronnen])

  useEffect(() => {
    if (!open) return
    const i = startId != null ? lijst.findIndex((n) => String(n.id) === String(startId)) : 0
    setIndex(i >= 0 ? i : 0)
    setTekst('')
    setFout('')
  }, [open, startId, lijst])

  const huidig = lijst[index] || null
  const laatste = index >= lijst.length - 1
  const eerste = index <= 0

  const verder = () => setIndex((i) => Math.min(lijst.length - 1, i + 1))
  const terug = () => setIndex((i) => Math.max(0, i - 1))

  useEscape(() => opSluiten?.(), open)

  useEffect(() => {
    if (!open) return
    const f = (e) => {
      const inVeld = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]')
      if (e.key === 'ArrowRight' && !inVeld) { e.preventDefault(); verder() }
      else if (e.key === 'ArrowLeft' && !inVeld) { e.preventDefault(); terug() }
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  })

  if (!open) return null

  const losOp = async (n) => {
    setBezig(true)
    setFout('')
    try {
      await opLos?.(n)
      if (!laatste) verder()
      else if (lijst.length > 1) setIndex((i) => Math.max(0, i - 1))
      else opSluiten?.()
    } catch {
      setFout('Oplossen mislukte. De comment staat er nog.')
    } finally {
      setBezig(false)
    }
  }

  const antwoord = async () => {
    const t = tekst.trim()
    if (!t || !huidig || bezig) return
    setBezig(true)
    setFout('')
    try {
      await opAntwoord?.(huidig, t)
      setTekst('')
      veld.current?.focus()
    } catch {
      setFout('Versturen mislukte. Je tekst staat er nog.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="wt-scherm" role="dialog" aria-modal="true" aria-label="Walkthrough in comments">
      <div className="wt-balk">
        <span className="wt-oog">Walkthrough in comments</span>
        <span className="wt-stand">{lijst.length ? `${index + 1} / ${lijst.length}` : '0 / 0'}</span>
        {titel && <span className="wt-scope">{titel}</span>}
        <button type="button" className="wt-sluit" onClick={opSluiten} aria-label="Walkthrough sluiten" title="Sluiten (Esc)">
          <Icoon naam="sluiten" maat={16} />
        </button>
      </div>

      {!huidig && (
        <div className="wt-kaart wt-leeg">
          <h2>Geen open comments in dit bereik</h2>
          <p>Zet de balk op Alles, of schrijf eerst een comment bij een passage.</p>
          <button className="knop" onClick={opSluiten}>Terug naar de werkbank</button>
        </div>
      )}

      {huidig && (
        <article className="wt-kaart" aria-live="polite">
          <div className="wt-kop">
            <span className="wt-herkomst">{herkomst(huidig, ctx)}</span>
            {huidig.opgelost && <span className="wt-opgelost">opgelost</span>}
          </div>

          {huidig.anker
            ? <blockquote className="wt-citaat">{huidig.anker}</blockquote>
            : <p className="wt-geen-anker">Deze comment hangt aan het hele {huidig.doel_type === 'blok' ? 'dagdeel' : 'stuk'}.</p>}

          <div className="wt-comment">
            <span className="wt-wie" style={{ background: kleurVoor(huidig.auteur) }} aria-hidden="true">{initialen(huidig.auteur)}</span>
            <div>
              <div className="wt-meta"><b>{huidig.auteur}</b><span>{datum(huidig.created_at)}</span></div>
              <p>{huidig.tekst}</p>
            </div>
          </div>

          {huidig.reacties?.length > 0 && (
            <div className="wt-draad" aria-label="Reacties">
              {huidig.reacties.map((r) => (
                <div key={r.id} className={`wt-bubbel ${r.auteur === naam ? 'eigen' : ''}`}>
                  <span className="wt-bubbel-wie">{r.auteur} · {datum(r.created_at)}</span>
                  <p>{r.tekst}</p>
                </div>
              ))}
            </div>
          )}

          {fout && <p className="wt-fout" role="alert">{fout}</p>}

          <div className="wt-acties">
            <button type="button" className="knop" onClick={() => opOpenPlek?.(huidig)}>
              <Icoon naam="extern" maat={14} /> Open op de plek
            </button>
            <button type="button" className="knop wt-los" onClick={() => losOp(huidig)} disabled={bezig}>
              <Icoon naam="vinkje" maat={14} /> {bezig ? 'Bezig…' : 'Los op'}
            </button>
            <div className="wt-pijlen">
              <button type="button" className="wt-pijl" onClick={terug} disabled={eerste} aria-label="Vorige comment">←</button>
              <button type="button" className="wt-pijl" onClick={verder} disabled={laatste} aria-label="Volgende comment">→</button>
            </div>
          </div>

          <div className="wt-antwoord">
            <input
              ref={veld}
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); antwoord() } }}
              placeholder={`Antwoord aan ${huidig.auteur}…`}
              aria-label="Antwoord op deze comment"
              readOnly={bezig}
            />
            <button type="button" className="wt-stuur" onClick={antwoord} disabled={!tekst.trim() || bezig} aria-label="Antwoord versturen">
              <Icoon naam="pijlOmhoog" maat={16} />
            </button>
          </div>
        </article>
      )}

      <div className="wt-voet">
        <span>← → om te bladeren</span>
        <span>Esc om te sluiten</span>
        <span>Enter om te antwoorden</span>
      </div>
    </div>
  )
}

function datum(iso) {
  try {
    return new Date(iso).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}