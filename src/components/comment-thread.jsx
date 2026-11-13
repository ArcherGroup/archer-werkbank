import React, { useEffect, useId, useRef, useState } from 'react'
import { Icoon } from './Icoon'
import { kleurVoor, initialen } from '../lib/data'
import { kort, statusVan } from '../lib/comments'
import { ankerStatus } from '../lib/quote-anker'
import { AgentComment } from './agent-comment'
import { sleutelVoorKlad, leesKlad, bewaarKlad, wisKlad } from '../lib/comment-draft'
import { useOnbewaard } from '../hooks/useOnbewaard'
import './comment-thread.css'

/* Is deze wortel nog maar lokaal, zonder een echt serverrecord? Dan heeft hij
   geen bruikbaar id om een besluit (oplossen/afwijzen) aan de API te hangen —
   dat zou een verzonnen lokaal id als echte comment-id versturen. */
function nogNietVerstuurd(root) {
  return root?.lokaal === true || root?.wachtend === true || /^(tmp-|lokaal-)/.test(String(root?.id ?? ''))
}

/* Eén comment met zijn gesprek: de vraag, alle antwoorden, en dan de knoppen.
   Eerst praten, dan beslissen: oplossen, afwijzen met een reden, of de agent
   laten voorstellen wat hij zou doen. Afgewezen is geen verwijdering. Er is
   bewust geen permanente verwijder-knop: dat zou het gesprek stilletjes laten
   verdwijnen in plaats van het op te lossen, af te wijzen of te heropenen. */
export function CommentThread({
  thread, naam = '', documentId = null, agent = null, compact = false,
  lichaamTekst = null, lokaalBesluitMogelijk = false,
  opAntwoord, opLos, opAfwijzen, opHeropenen, opToon,
}) {
  const root = thread?.root
  const kladSleutel = sleutelVoorKlad({ auteur: naam, doelType: root?.doel_type || 'document', doelId: root?.doel_id || documentId || '', threadId: root?.client_id || root?.id })
  const [tekst, setTekst] = useState(() => leesKlad(kladSleutel))
  const vorigeKladSleutel = useRef(kladSleutel)
  const redenId = useId()
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [afwijzenOpen, setAfwijzenOpen] = useState(false)
  const [reden, setReden] = useState('')
  useOnbewaard(!!tekst.trim() || !!reden.trim() || bezig)
  useEffect(() => {
    if (vorigeKladSleutel.current === kladSleutel) return
    vorigeKladSleutel.current = kladSleutel
    setTekst(leesKlad(kladSleutel))
  }, [kladSleutel])
  if (!root) return null

  const status = statusVan(root)
  const dicht = status !== 'open'
  const reacties = Array.isArray(root.reacties) ? root.reacties : []
  const onbewaard = nogNietVerstuurd(root) && !lokaalBesluitMogelijk
  const anker = lichaamTekst != null ? ankerStatus(lichaamTekst, root) : null

  const antwoord = async () => {
    const t = tekst.trim()
    if (!t || bezig || !opAntwoord) return
    setBezig(true); setFout('')
    try {
      await opAntwoord(root, t)
      setTekst('')
      wisKlad(kladSleutel)
    } catch {
      setFout('Versturen mislukte. Je tekst staat er nog.')
    } finally { setBezig(false) }
  }

  const los = async () => {
    if (!opLos) return
    setBezig(true); setFout('')
    try { await opLos(root) } catch { setFout('Oplossen mislukte.') } finally { setBezig(false) }
  }

  const wijsAf = async () => {
    if (!opAfwijzen || !reden.trim()) return
    setBezig(true); setFout('')
    try {
      await opAfwijzen(root, reden.trim())
      setAfwijzenOpen(false)
      setReden('')
    } catch { setFout('Afwijzen mislukte.') } finally { setBezig(false) }
  }

  const heropen = async () => {
    if (!opHeropenen) return
    setBezig(true); setFout('')
    try { await opHeropenen(root) } catch { setFout('Heropenen mislukte.') } finally { setBezig(false) }
  }

  return (
    <article className={`thread ${compact ? 'compact' : ''} ${dicht ? 'dicht' : ''}`} data-status={status}>
      <header className="thread-kop">
        <span className="thread-wie" style={{ background: kleurVoor(root.auteur) }} aria-hidden="true">{initialen(root.auteur)}</span>
        <b>{root.auteur}</b>
        <span className="thread-datum">{datum(root.created_at)}</span>
        {(root.lokaal === true || root.wachtend === true) && (
          <span className="thread-status lokaal" title="Deze comment staat in je browser en gaat automatisch naar de werkbank zodra dat kan">lokaal bewaard</span>
        )}
        {status === 'opgelost' && <span className="thread-status opgelost">opgelost{root.opgelost_door ? ` · ${root.opgelost_door}` : ''}</span>}
        {status === 'afgewezen' && <span className="thread-status afgewezen">afgewezen{root.afgewezen_door ? ` · ${root.afgewezen_door}` : ''}</span>}
      </header>

      {root.anker ? (
        <>
          {anker?.status === 'gevonden' && opToon && (
            <button type="button" className="thread-citaat thread-toon" onClick={() => opToon(root)} title="Naar deze zin in het stuk">“{kort(root.anker, 90)}” <span aria-hidden="true">↗</span></button>
          )}
          {(anker?.status !== 'gevonden' || !opToon) && (
            <blockquote className="thread-citaat">“{kort(root.anker, 120)}”</blockquote>
          )}
          {anker && anker.status !== 'gevonden' && anker.status !== 'geen' && (
            <p className="thread-ankerstatus" role="status">
              {anker.status === 'gewijzigd' && 'Passage gewijzigd — de omgeving staat er nog, de precieze tekst niet meer.'}
              {anker.status === 'dubbelzinnig' && 'Deze zin komt vaker voor; de precieze plek is niet meer eenduidig.'}
              {anker.status === 'onbekend' && 'Deze passage is niet meer terug te vinden in het stuk.'}
            </p>
          )}
        </>
      ) : (
        <p className="thread-algemeen">Algemene comment — niet aan een passage gekoppeld.</p>
      )}

      <p className="thread-tekst">{root.tekst}</p>

      {reacties.length > 0 && (
        <div className="thread-gesprek" role="log" aria-label="Gesprek">
          {reacties.map((r) => (
            <div key={r.id} className={`thread-bubbel ${r.auteur === naam ? 'eigen' : ''}`}>
              <span className="thread-bubbel-wie">
                {r.auteur} · {datum(r.created_at)}
                {nogNietVerstuurd(r) && <span className="thread-bubbel-lokaal" title="Deze reactie staat nog alleen in je eigen browser">lokaal</span>}
              </span>
              <p>{r.tekst}</p>
            </div>
          ))}
        </div>
      )}

      {root.afwijs_reden && <p className="thread-reden">Reden: {root.afwijs_reden}</p>}

      {!dicht && opAntwoord && (
        <div className="thread-antwoord">
          <input
            value={tekst}
            onChange={(e) => { setTekst(e.target.value); bewaarKlad(kladSleutel, e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); antwoord() } }}
            placeholder={`Antwoord aan ${root.auteur}…`}
            aria-label="Antwoord in dit gesprek"
            readOnly={bezig}
          />
          <button type="button" className="thread-stuur" onClick={antwoord} disabled={!tekst.trim() || bezig} aria-label="Antwoord versturen">
            <Icoon naam="pijlOmhoog" maat={15} />
          </button>
        </div>
      )}

      {fout && <p className="thread-fout" role="alert">{fout}</p>}

      <div className="thread-acties">
        {!dicht && opLos && (
          <button type="button" className="knop thread-los" onClick={los} disabled={bezig || onbewaard} title={onbewaard ? 'Eerst synchroniseren voordat dit opgelost kan worden' : undefined}>
            <Icoon naam="vinkje" maat={13} /> Los op
          </button>
        )}
        {!dicht && opAfwijzen && !afwijzenOpen && (
          <button type="button" className="knop zacht thread-afwijs" onClick={() => setAfwijzenOpen(true)} disabled={bezig || onbewaard} title={onbewaard ? 'Eerst synchroniseren voordat dit afgewezen kan worden' : undefined}>
            <Icoon naam="sluiten" maat={13} /> Wijs af
          </button>
        )}
        {dicht && opHeropenen && (
          <button type="button" className="knop zacht" onClick={heropen} disabled={bezig || onbewaard} title={onbewaard ? 'Eerst synchroniseren voordat dit heropend kan worden' : undefined}>Heropen</button>
        )}
        {!dicht && onbewaard && (opLos || opAfwijzen) && (
          <span className="thread-sync-hint">Eerst synchroniseren — dit gesprek staat nog alleen lokaal.</span>
        )}
      </div>

      {afwijzenOpen && (
        <div className="thread-afwijsvraag">
          <label htmlFor={redenId}>Waarom wijs je dit af? Dit blijft bij het gesprek staan.</label>
          <input
            id={redenId}
            value={reden}
            onChange={(e) => setReden(e.target.value)}
            placeholder="Bv. hoort bij 2.1, niet bij 1.3"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); wijsAf() } }}
          />
          <div className="thread-afwijsacties">
            <button type="button" className="knop zacht" onClick={() => { setAfwijzenOpen(false); setReden('') }}>Annuleer</button>
            <button type="button" className="knop" onClick={wijsAf} disabled={bezig || !reden.trim()}>Wijs af</button>
          </div>
        </div>
      )}

      {!dicht && agent && documentId != null && agent.beschikbaar !== true && <p className="thread-agent-hint"><strong>Agent nog niet actief.</strong> Het volledige gesprek blijft bewaard. Er wordt nu niets automatisch uitgevoerd of aangepast.</p>}
      {!dicht && agent?.beschikbaar === true && documentId != null && (
        <details className="thread-agent">
          <summary>Laat de agent dit oplossen</summary>
          <AgentComment
            notitie={root}
            documentId={documentId}
            beschikbaar={agent?.beschikbaar === true}
            ingelogd={agent?.ingelogd === true}
            opdracht={agent?.opdrachten?.[root.id] ?? null}
            opStart={agent?.start}
            opBeoordeel={agent?.beoordeel}
          />
        </details>
      )}
    </article>
  )
}

function datum(iso) {
  try {
    return new Date(iso).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}