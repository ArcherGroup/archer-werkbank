import React, { useCallback, useEffect, useState } from 'react'
import { veiligeBronUrl } from '../lib/bron-check'

const MELDINGEN = {
  geen_bewijs: 'De agent vond geen bron met een controleerbaar letterlijk citaat. Probeer een andere vraag.',
  ongeldige_uitvoer: 'De agent gaf geen leesbaar resultaat. Probeer opnieuw.',
  mislukt: 'Het onderzoek is mislukt. Er is geen resultaat bewaard.',
  timeout: 'Het onderzoek duurde te lang en is gestopt.',
  werker_ontbreekt: 'De lokale Hermes-werker is niet beschikbaar.',
  limiet_bereikt: 'De limiet voor deze lokale proef is bereikt.',
  bezig: 'De werker behandelt al een andere opdracht.',
}

export function OnderzoeksResultaat({ resultaat }) {
  if (!resultaat) return null
  if (resultaat.status !== 'klaar') return <p role="alert" className="wb-feedback-fout">{MELDINGEN[resultaat.status] || 'Het onderzoek kon niet worden afgerond.'}</p>
  const bronnen = (Array.isArray(resultaat.bronnen) ? resultaat.bronnen : []).filter((bron) => veiligeBronUrl(bron.url))
  if (!bronnen.length) return <p role="alert" className="wb-feedback-fout">Geen controleerbare bron om te tonen.</p>
  return (
    <section className="wb-onderzoek-resultaat" aria-labelledby="wb-onderzoek-resultaat-titel">
      <h3 id="wb-onderzoek-resultaat-titel">Gevonden bronnen</h3>
      <p>De bron is geopend en het citaat is letterlijk aangetroffen. De AI-duiding is nog niet inhoudelijk gecontroleerd.</p>
      {bronnen.map((bron) => (
        <article key={bron.url} className="wb-onderzoek-bron">
          <a href={veiligeBronUrl(bron.url)} target="_blank" rel="noopener noreferrer">{bron.titel || bron.url}</a>
          <blockquote>{bron.citaat}</blockquote>
          <details><summary>AI-duiding bekijken, nog te controleren</summary><p>{bron.claim}</p>{bron.datum && <small>Datum volgens de agent: {bron.datum}</small>}</details>
        </article>
      ))}
      {Array.isArray(resultaat.open_vragen) && resultaat.open_vragen.length > 0 && <details><summary>Vragen en beperkingen van de agent</summary><ul>{resultaat.open_vragen.map((vraag, i) => <li key={i}>{vraag}</li>)}</ul></details>}
      <p className="wb-bronnoot">Het resultaat is een voorstel, geen bevestigde fiscale of financiële informatie.</p>
    </section>
  )
}

/* De lokale proef ontvangt alleen een handmatig ingegeven openbare vraag.
   De gepubliceerde site heeft geen agent-endpoint zolang toegang open staat. */
export function OnderzoekPaneel({ lokaal = import.meta.env.DEV, vraag = '', opVraagWijzig = () => {} }) {
  const [verbinding, setVerbinding] = useState('controleren')
  const [resterend, setResterend] = useState(null)
  const [akkoord, setAkkoord] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [resultaat, setResultaat] = useState(null)
  const adres = `${import.meta.env.BASE_URL}api/lokaal-onderzoek`

  const controleer = useCallback(async () => {
    if (!lokaal) return
    setVerbinding('controleren')
    try {
      const antwoord = await fetch(`${adres}/status`, { cache: 'no-store' })
      const data = await antwoord.json()
      if (!antwoord.ok || data.status !== 'beschikbaar') throw new Error('offline')
      setResterend(data.resterend)
      setVerbinding('online')
    } catch {
      setVerbinding('offline')
    }
  }, [adres, lokaal])

  useEffect(() => { controleer() }, [controleer])

  const onderzoek = async (e) => {
    e.preventDefault()
    if (!lokaal || verbinding !== 'online' || !akkoord || vraag.trim().length < 10 || bezig) return
    setBezig(true)
    setResultaat(null)
    try {
      const antwoord = await fetch(adres, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Werkbank-Lokaal': '1' },
        body: JSON.stringify({ vraag: vraag.trim(), akkoord: true }),
      })
      const data = await antwoord.json()
      setResultaat(data)
      await controleer()
    } catch {
      setVerbinding('offline')
      setResultaat({ status: 'mislukt' })
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="wb-onderzoek" aria-labelledby="wb-onderzoek-titel">
      <div className="wb-eyebrow">Onderzoek</div>
      <h2 id="wb-onderzoek-titel">Een vraag laten uitzoeken</h2>
      {!lokaal ? (
        <p>De gedeelde agent is nog niet actief. Een afzonderlijke proef op een Mac gebruikt een extern model en zoekdiensten; resultaten worden niet met deze site gedeeld.</p>
      ) : (
        <>
          <p role="status" className="wb-onderzoek-status">
            {verbinding === 'controleren' && 'Lokale werker controleren…'}
            {verbinding === 'online' && `Lokale werker beschikbaar${resterend === null ? '' : ` · ${resterend} vragen over tot de volgende herstart`}`}
            {verbinding === 'offline' && 'Lokale werker niet beschikbaar.'}
          </p>
          {verbinding === 'offline' && <button type="button" className="knop" onClick={controleer}>Verbinding opnieuw controleren</button>}
          <p>Alleen je vraag wordt automatisch meegestuurd. De agent kan wel publieke websites raadplegen; ook de werkbank is momenteel publiek. Deze proef is daarom niet geschikt voor vertrouwelijke gegevens of manuscripttekst.</p>
          <p>De vraag gaat naar OpenRouter en zoekdiensten; Hermes bewaart lokaal een sessie. Dit gebruikt de bestaande modelsleutel en kan kosten veroorzaken. Het resultaat wordt niet in de gedeelde werkbank opgeslagen.</p>
          <form onSubmit={onderzoek}>
            <label htmlFor="wb-onderzoek-vraag">Openbare onderzoeksvraag</label>
            <textarea id="wb-onderzoek-vraag" value={vraag} maxLength={600} onChange={(e) => opVraagWijzig(e.target.value)} placeholder="Bijvoorbeeld: welke Belgische toezichthouder legt de beurstaks uit?" />
            <label className="wb-onderzoek-akkoord"><input type="checkbox" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} /> <span>Deze vraag bevat geen vertrouwelijke informatie en mag naar een extern model en zoekdiensten.</span></label>
            <div className="wb-feedback-acties"><button className="knop primair" type="submit" disabled={verbinding !== 'online' || vraag.trim().length < 10 || !akkoord || bezig}>{bezig ? 'Onderzoek loopt…' : 'Start lokaal onderzoek'}</button></div>
          </form>
          {bezig && <p role="status">De agent zoekt en controleert citaten. Dit kan enkele minuten duren.</p>}
          <OnderzoeksResultaat resultaat={resultaat} />
        </>
      )}
    </section>
  )
}
