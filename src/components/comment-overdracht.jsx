import React, { useId, useRef, useState } from 'react'
import * as W from '../lib/comment-wachtrij'
import './comment-overdracht.css'

export function CommentOverdracht({ aantal = 0, opImport = null }) {
  const id = useId()
  const bestandRef = useRef(null)
  const [klaar, setKlaar] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [bericht, setBericht] = useState('')
  const [fout, setFout] = useState('')

  const exporteer = () => {
    setFout(''); setBericht('')
    try {
      const inhoud = W.exporteerWachtrij()
      const url = URL.createObjectURL(new Blob([inhoud], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `werkbank-comments-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBericht('Bestand gemaakt. Open de online werkbank en importeer het daar. Je lokale comments blijven hier ook bewaard.')
    } catch {
      setFout('Exporteren lukte niet. Je comments blijven hier staan. Probeer opnieuw en sluit dit tabblad nog niet.')
    }
  }

  const leesBestand = async (e) => {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    setFout(''); setBericht(''); setKlaar(null)
    try {
      if (bestand.size > 2 * 1024 * 1024) throw new Error('te_groot')
      const inhoud = await bestand.text()
      const voorbeeld = W.leesImportVoorbeeld(inhoud)
      if (!voorbeeld.ok || voorbeeld.afgewezen.length || voorbeeld.kaartAfgewezen) throw new Error('ongeldige_export')
      setKlaar({ inhoud, aantal: voorbeeld.aantal, naam: bestand.name })
    } catch {
      setFout('Dit is geen geldig werkbank-commentbestand, of het bestand is te groot. Er is niets geïmporteerd. Kies de JSON-export uit de werkbank.')
    } finally {
      e.target.value = ''
    }
  }

  const importeer = async () => {
    if (!klaar || bezig || !opImport) return
    setBezig(true); setFout('')
    try {
      const resultaat = await opImport(klaar.inhoud)
      setKlaar(null)
      setBericht(resultaat?.bericht || 'Comments overgenomen. De bewaarmelding toont wat al gedeeld is en wat nog lokaal wacht.')
    } catch {
      setFout('Overnemen kon niet worden bevestigd. Je oorspronkelijke bestand blijft bruikbaar. Probeer opnieuw; dezelfde export maakt geen dubbele berichten.')
    } finally { setBezig(false) }
  }

  return (
    <details className="co-overdracht">
      <summary>Comments meenemen</summary>
      <div className="co-inhoud">
        <p id={`${id}-uitleg`}>Werk je nog in een lokale preview of op een ander toestel? Exporteer de nog niet gedeelde comments en importeer het bestand in de online werkbank. Namen, antwoorden en oorspronkelijke tijden gaan mee.</p>
        <div className="co-acties">
          <button type="button" className="knop zacht" onClick={exporteer} disabled={aantal < 1 || bezig} aria-describedby={`${id}-uitleg`}>Exporteren{aantal > 0 ? ` (${aantal})` : ''}</button>
          <button type="button" className="knop zacht" onClick={() => bestandRef.current?.click()} disabled={bezig}>Importeren</button>
          <input ref={bestandRef} className="co-bestand" type="file" accept=".json,application/json" aria-label="Werkbank-commentbestand kiezen" onChange={leesBestand} disabled={bezig} />
        </div>
        {aantal < 1 && <p className="co-hint">Er staan op dit toestel geen comments klaar voor export. Gedeelde gesprekken blijven in de werkbank staan.</p>}
        {klaar && <section className="co-bevestig" aria-label="Commentimport controleren">
          <strong>{klaar.aantal} bericht{klaar.aantal === 1 ? '' : 'en'} in {klaar.naam}</strong>
          <p>Deze berichten worden aan de werkbank toegevoegd, niet over bestaande gesprekken geschreven. Ze zijn na synchronisatie zichtbaar voor de andere gebruikers.</p>
          <div className="co-acties">
            <button type="button" className="knop" disabled={bezig || !opImport} onClick={importeer}>{bezig ? 'Overnemen…' : 'Importeer en deel'}</button>
            <button type="button" className="knop zacht" disabled={bezig} onClick={() => setKlaar(null)}>Annuleer</button>
          </div>
        </section>}
        {bericht && <p className="co-bericht" role="status">{bericht}</p>}
        {fout && <p className="co-fout" role="alert">{fout}</p>}
      </div>
    </details>
  )
}
