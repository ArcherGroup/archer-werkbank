import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icoon } from './Icoon'
import { groepeerReacties, kort } from '../lib/comments'
import { contextVoorAnker, sectieVoorAnker, sectieAlineas } from '../lib/secties'
import { CommentThread } from './comment-thread'
import { useEscape } from '../hooks/useEscape'
import './werkboek-walkthrough.css'

/* Walkthrough met context: links staat het stuk zelf, met de aangehaalde zin
   gemarkeerd en de alinea's eromheen, rechts de comment met het gesprek.
   Eerst praten, dan beslissen: oplossen, afwijzen of de agent laten voorstellen. */
export function WerkboekWalkthrough({
  open = false, notities = [], body = '', secties = [], naam = 'Victor', titel = '',
  startId = null, opSluiten, opSpring, opLos, opAntwoord, opAfwijzen, opHeropenen,
}) {
  const [index, setIndex] = useState(0)
  const contextRef = useRef(null)

  // Eerst groeperen, dan pas de gesloten eruit: anders verliezen de wortels hun reacties.
  const lijst = useMemo(
    () => groepeerReacties(notities).filter((n) => n.opgelost !== true && n.afgewezen !== true),
    [notities],
  )

  useEffect(() => {
    if (!open) return
    const i = startId != null ? lijst.findIndex((n) => String(n.id) === String(startId)) : 0
    setIndex(i >= 0 ? i : 0)
  }, [open, startId, lijst])

  const huidig = lijst[index] || null
  const sectie = useMemo(() => (huidig?.anker ? sectieVoorAnker(body, huidig.anker, secties) : null), [huidig, body, secties])
  // Hetzelfde anker kan vaker in het stuk staan; de context volgt het stuk van de comment.
  const context = useMemo(() => (huidig?.anker ? contextVoorAnker(body, huidig.anker, { sectieId: sectie?.id }) : null), [huidig, body, sectie])
  // Het hele stuk staat links, niet alleen de zin: je leest waar de comment in valt.
  const alineas = useMemo(() => (sectie ? sectieAlineas(body, sectie.id) : []), [sectie, body])
  const eerste = index <= 0
  const laatste = index >= lijst.length - 1

  // Zet de gemarkeerde zin meteen in beeld: context die je moet zoeken is geen context.
  useEffect(() => {
    const zet = () => {
      const box = contextRef.current
      const mark = box?.querySelector('.ww-anker')
      if (!box || !mark || box.clientHeight === 0) return
      const top = mark.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
      box.scrollTop = Math.max(0, top - box.clientHeight / 2 + 24)
    }
    zet()
    const t = setTimeout(zet, 220)
    window.addEventListener('resize', zet)
    return () => { clearTimeout(t); window.removeEventListener('resize', zet) }
  }, [index, context, open])

  useEscape(() => opSluiten?.(), open)

  useEffect(() => {
    if (!open) return
    const f = (e) => {
      const inVeld = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]')
      if (e.key === 'ArrowRight' && !inVeld) { e.preventDefault(); setIndex((i) => Math.min(lijst.length - 1, i + 1)) }
      else if (e.key === 'ArrowLeft' && !inVeld) { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)) }
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [open, lijst.length])

  if (!open) return null

  return (
    <div className="ww-scherm" role="dialog" aria-modal="true" aria-label="Walkthrough met context">
      <div className="ww-kop">
        <span className="ww-oog">Walkthrough met context</span>
        <span className="ww-stand">{lijst.length ? `${index + 1} / ${lijst.length}` : '0 / 0'}</span>
        {titel && <span className="ww-scope">{titel}</span>}
        <button type="button" className="ww-sluit" onClick={opSluiten} aria-label="Walkthrough sluiten" title="Sluiten (Esc)">
          <Icoon naam="sluiten" maat={16} />
        </button>
      </div>

      {/* De comments zelf: klik er een aan om van gesprek te wisselen. */}
      <div className="ww-lijst" role="list" aria-label="Comments in dit stuk">
        {lijst.map((n, i) => (
          <button
            type="button"
            role="listitem"
            key={n.id}
            className={`ww-chip ${i === index ? 'aan' : ''}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => setIndex(i)}
            title={n.tekst}
          >
            <span className="ww-chip-nr">{i + 1}</span>
            <span className="ww-chip-tekst">{kort(n.tekst, 42)}</span>
            {n.reacties?.length > 0 && <span className="ww-chip-tel">{n.reacties.length}</span>}
          </button>
        ))}
      </div>

      {!huidig && (
        <div className="ww-leeg">
          <h2>Nog geen open comments in dit stuk</h2>
          <p>Selecteer een zin in het stuk en schrijf er een comment bij. Die verschijnt dan hier, met de zin erbij.</p>
          <button className="knop" onClick={opSluiten}>Terug naar het stuk</button>
        </div>
      )}

      {huidig && (
        <div className="ww-vlak">
          <section className="ww-context" aria-label="Het stuk rond deze comment">
            <div className="ww-context-kop">
              <span className="ww-context-label">In het stuk</span>
              {sectie && <span className="ww-context-sectie">{sectie.titel}</span>}
            </div>
            {context ? (
              <div className="ww-tekst" ref={contextRef}>
                {alineas.length > 0 ? alineas.map((alinea, i) => {
                  const waar = context.anker ? alinea.indexOf(context.anker) : -1
                  if (waar < 0) return <p key={i} className="ww-ver">{alinea}</p>
                  return (
                    <p key={i} className="ww-hier">
                      {alinea.slice(0, waar)}
                      <mark className="ww-anker">{context.anker}</mark>
                      {alinea.slice(waar + context.anker.length)}
                    </p>
                  )
                }) : (
                  <>
                    {context.ervoor && <p className="ww-ver">{context.ervoor}</p>}
                    <p className="ww-hier">
                      {context.voor}
                      <mark className="ww-anker">{context.anker}</mark>
                      {context.na}
                    </p>
                    {context.erna && <p className="ww-ver">{context.erna}</p>}
                  </>
                )}
              </div>
            ) : (
              <p className="ww-geen">Deze comment hangt niet aan een zin in de tekst.</p>
            )}
            <button type="button" className="knop ww-spring" onClick={() => opSpring?.(huidig)}>
              <Icoon naam="cursor" maat={14} /> Toon in het stuk
            </button>
          </section>

          <section className="ww-comment" aria-live="polite">
            <CommentThread
              thread={{ root: huidig }}
              naam={naam}
              opLos={opLos}
              opAntwoord={opAntwoord}
              opAfwijzen={opAfwijzen}
              opHeropenen={opHeropenen}
            />
            <div className="ww-acties">
              <span className="ww-hint">Eerst het gesprek, dan de beslissing.</span>
              <div className="ww-pijlen">
                <button type="button" className="ww-pijl" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={eerste} aria-label="Vorige comment">←</button>
                <button type="button" className="ww-pijl" onClick={() => setIndex((i) => Math.min(lijst.length - 1, i + 1))} disabled={laatste} aria-label="Volgende comment">→</button>
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="ww-voet">
        <span>← → om te bladeren</span>
        <span>Esc om te sluiten</span>
        <span>Enter om te antwoorden</span>
      </div>
    </div>
  )
}