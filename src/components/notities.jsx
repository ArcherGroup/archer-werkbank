import React, { useEffect, useRef, useState } from 'react'
import * as D from '../lib/data'
import * as W from '../lib/comment-wachtrij'

import { CommentThread } from './comment-thread'
import { groepeerReacties } from '../lib/comments'
import { sleutelVoorKlad, leesKlad, bewaarKlad, wisKlad } from '../lib/comment-draft'
import { useOnbewaard } from '../hooks/useOnbewaard'

const koppeling = (v) => typeof v === 'string' ? { anker: v, anker_context: null } : v?.anker ? v : null
function leesKoppeling(key) {
  try { return koppeling(JSON.parse(leesKlad(key + ':anker') || 'null')) } catch { return null }
}

export function Notities({ doelType, doelId, auteur, notities = [], onWijzig, compact = false,
  anker = null, onAnkerWissen, agent = null, opToon = null, opAntwoord = null,
  opLos = null, opAfwijzen = null, opHeropenen = null, opBewaren = null,
  geselecteerdId = null, opSelecteer = null, opGeplaatst = null, focusTeller = 0, lichaamTekst = null,
}) {
  const key = sleutelVoorKlad({ auteur, doelType, doelId })
  const [tekst, setTekst] = useState(() => leesKlad(key))
  const [gekoppeld, setGekoppeld] = useState(() => koppeling(anker) || leesKoppeling(key))
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [melding, setMelding] = useState('')
  const [geheugenMelding, setGeheugenMelding] = useState(false)
  const [laatstePlaatsing, setLaatstePlaatsing] = useState(null)
  const invoerRef = useRef(null)
  const lijstRef = useRef(null)
  const vorigeKey = useRef(key)
  const vorigeSelectie = useRef(null)
  const vorigeFocus = useRef(0)
  useOnbewaard(!!tekst.trim() || bezig)

  useEffect(() => {
    if (laatstePlaatsing == null) return
    const bevestigd = notities.some((n) => !n.lokaal && !n.wachtend && [n.client_id, n.id].some((id) => id != null && String(id) === laatstePlaatsing))
    if (bevestigd) { setGeheugenMelding(false); setMelding('Gedeeld met de werkbank.') }
  }, [laatstePlaatsing, notities])

  useEffect(() => {
    if (vorigeKey.current === key) return
    vorigeKey.current = key
    setTekst(leesKlad(key)); setGekoppeld(leesKoppeling(key)); setFout(''); setMelding('')
  }, [key])
  useEffect(() => {
    if (anker) { const k = koppeling(anker); setGekoppeld(k); bewaarKlad(key + ':anker', JSON.stringify(k)) }
  }, [anker, key])
  useEffect(() => {
    if (!focusTeller || focusTeller === vorigeFocus.current) return
    vorigeFocus.current = focusTeller
    if (!anker) { setGekoppeld(null); wisKlad(key + ':anker') }
    invoerRef.current?.focus()
  }, [focusTeller, anker, key])
  useEffect(() => {
    if (geselecteerdId == null || vorigeSelectie.current === String(geselecteerdId)) return
    const el = [...(lijstRef.current?.querySelectorAll('[data-thread-key]') || [])].find((n) => n.dataset.threadKey === String(geselecteerdId) || n.dataset.threadId === String(geselecteerdId))
    const paneel = el?.closest('.inspector')
    if (el && paneel) { paneel.scrollTop += el.getBoundingClientRect().top - paneel.getBoundingClientRect().top - 20; vorigeSelectie.current = String(geselecteerdId) }
  }, [geselecteerdId, notities])

  const losmaken = () => { setGekoppeld(null); wisKlad(key + ':anker'); onAnkerWissen?.(anker) }
  const schrijf = (value) => { setTekst(value); bewaarKlad(key, value) }
  const bewaar = async () => {
    const t = tekst.trim()
    if (!t || bezig) return
    setBezig(true); setFout(''); setMelding('')
    const payload = { doel_type: doelType, doel_id: String(doelId), tekst: t, auteur, anker: gekoppeld?.anker || null, anker_context: gekoppeld?.anker_context || null }
    try {
      let resultaat
      if (opBewaren) resultaat = await opBewaren(payload)
      else {
        const lokaal = W.voegToeAanWachtrij({ ...payload, lokaal_id: W.lokaalId() })
        await W.verwerkWachtrij((rij) => D.bewaarNotitieIdempotent(rij))
        const id = W.zoekGedeeldId(lokaal.item.lokaal_id)
        resultaat = id ? { lokaal: false, data: { ...payload, id, client_id: lokaal.item.client_id } } : { lokaal: true, item: W.alsNotitie(lokaal.item), opslagBeperkt: W.opslagStatus().duurzaam === false }
      }
      const rij = resultaat?.data || resultaat?.item
      setLaatstePlaatsing(rij ? String(rij.client_id || rij.id) : null)
      setTekst(''); wisKlad(key); losmaken()
      const geheugen = resultaat?.lokaal === true && resultaat?.opslagBeperkt === true
      setGeheugenMelding(geheugen)
      setMelding(geheugen ? 'Alleen tijdelijk in het geheugen, niet duurzaam bewaard. Houd dit tabblad open en exporteer je comments.' : resultaat?.lokaal ? 'Op dit toestel bewaard. Het delen is nog niet bevestigd.' : 'Gedeeld met de werkbank.')
      onWijzig?.()
      if (rij) opGeplaatst?.(rij)
    } catch {
      setFout('Niet bevestigd. Je tekst blijft in het invoerveld staan. Probeer opnieuw.')
    } finally { setBezig(false) }
  }

  const groepen = groepeerReacties(notities)
  const geselecteerd = groepen.find((n) => String(n.id) === String(geselecteerdId) || String(n.client_id || '') === String(geselecteerdId))
  const zichtbaar = geselecteerd ? [geselecteerd] : groepen
  const toonInvoer = geselecteerdId == null || !!gekoppeld

  return <div className="notities-blok">
    {geselecteerd && <div className="doc-comment-keuze"><button type="button" className="knop zacht" onClick={() => opSelecteer?.(null)}>Alle gesprekken ({groepen.length})</button></div>}
    {toonInvoer && <div className="notitie-invoer">
      {gekoppeld ? <div className="notitie-anker"><span>Bij geselecteerde tekst</span><blockquote>{gekoppeld.anker}</blockquote><button type="button" className="knop zacht" onClick={losmaken} disabled={bezig}>Selectie losmaken</button></div> : <p className="doc-comment-hulp">Algemene comment. Selecteer tekst in het stuk als je een precieze passage wilt bespreken.</p>}
      <textarea ref={invoerRef} readOnly={bezig} value={tekst} placeholder="Schrijf je comment…" aria-label="Nieuwe comment" onChange={(e) => schrijf(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); bewaar() } }} />
      {fout && <p className="veld-fout" role="alert">{fout}</p>}
      <div className="rij"><span className="meta-klein">{tekst.trim() ? '⌘⏎ om te plaatsen' : ''}</span><button type="button" className="knop primair" onClick={bewaar} disabled={!tekst.trim() || bezig}>{bezig ? 'Plaatsen…' : 'Comment plaatsen'}</button></div>
    </div>}
    {melding && <p className={`doc-comment-bewaring${geheugenMelding ? ' veld-fout' : ''}`} role={geheugenMelding ? 'alert' : 'status'}>{melding}</p>}
    {!groepen.length && !compact && <p className="leeg-notities">Nog geen gesprekken. Selecteer een passage en kies Comment toevoegen, of plaats hierboven een algemene comment.</p>}
    <div ref={lijstRef}>
      {zichtbaar.map((root) => <div className={`doc-gesprek-keuze${geselecteerd === root ? ' geselecteerd' : ''}`} key={root.client_id || root.id} data-thread-key={root.client_id || root.id} data-thread-id={root.id}>
        <CommentThread thread={{ root }} naam={auteur} documentId={doelType === 'document' ? doelId : null} agent={doelType === 'document' ? agent : null} compact={compact} lichaamTekst={lichaamTekst} opToon={opToon} opAntwoord={opAntwoord} opLos={opLos} opAfwijzen={opAfwijzen} opHeropenen={opHeropenen} />
      </div>)}
    </div>
  </div>
}
