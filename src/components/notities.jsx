import React, { useState } from 'react'
import { sb } from '../lib/supabase'
import { kleurVoor, initialen } from '../lib/data'
import { meld } from './meldingen'
import { Icoon } from './Icoon'

/* Notities bij een stuk, dagdeel of bron; live zichtbaar voor beide gebruikers.
   Bewaren is optimistisch: de notitie staat er meteen, de server volgt.
   Mislukt het, dan komt de tekst terug in het veld en blijft er een melding. */

function datumKort(iso) {
  try {
    return new Date(iso).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function Notities({ doelType, doelId, auteur, notities, onWijzig, compact = false }) {
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)
  const [wachtend, setWachtend] = useState([])
  const [fout, setFout] = useState('')

  const bewaar = async () => {
    const t = tekst.trim()
    if (!t || bezig) return
    const tijdelijk = {
      id: `tmp-${Date.now()}`,
      tekst: t,
      auteur,
      created_at: new Date().toISOString(),
      wachtend: true,
    }
    setWachtend((w) => [...w, tijdelijk])
    setTekst('')
    setFout('')
    setBezig(true)
    try {
      const { error } = await sb.from('notities').insert({ doel_type: doelType, doel_id: String(doelId), tekst: t, auteur })
      if (error) throw error
      onWijzig?.()
    } catch {
      setFout('Niet bewaard — de notitie staat terug in het veld. Probeer opnieuw.')
      setTekst(t)
    } finally {
      setWachtend((w) => w.filter((x) => x.id !== tijdelijk.id))
      setBezig(false)
    }
  }

  const verwijder = async (n) => {
    setWachtend((w) => [...w]) // geen visuele sprong; de rij verdwijnt pas na de server
    const { error } = await sb.from('notities').delete().eq('id', n.id)
    if (error) {
      meld('Verwijderen mislukte. De notitie staat er nog.', { fout: true })
      return
    }
    meld('Notitie verwijderd.')
    onWijzig?.()
  }

  const eigen = notities ?? []
  const alle = [...eigen, ...wachtend]

  return (
    <div className="notities-blok">
      <div className="notitie-invoer">
        <textarea
          value={tekst}
          placeholder="Schrijf een notitie, zichtbaar voor iedereen…"
          aria-label="Nieuwe notitie"
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              bewaar()
            }
          }}
        />
        {fout && (
          <div className="veld-fout" role="alert">
            <Icoon naam="waarschuwing" maat={13} />
            {fout}
          </div>
        )}
        <div className="rij">
          <span className="meta-klein">{tekst.trim() ? '⌘⏎ om te bewaren' : ''}</span>
          <button className="knop primair" onClick={bewaar} disabled={!tekst.trim() || bezig}>
            {bezig ? 'Bewaren…' : 'Notitie bewaren'}
          </button>
        </div>
      </div>

      {alle.length === 0 && !compact && (
        <div className="leeg-notities">
          Nog geen notities hier. Schrijf de eerste: wat valt op, wat moet er nog gebeuren?
        </div>
      )}

      {alle.map((n) => (
        <div className={`notitie ${n.wachtend ? 'wachtend' : ''}`} key={n.id}>
          <div className="kop">
            <span className="wie" style={{ background: kleurVoor(n.auteur) }}>
              {initialen(n.auteur)}
            </span>
            <b>{n.auteur}</b>
            <span className="meta-klein">{n.wachtend ? 'bewaren…' : datumKort(n.created_at)}</span>
            {!n.wachtend && (
              <button className="weg" title="Verwijderen" aria-label="Notitie verwijderen" onClick={() => verwijder(n)}>
                <Icoon naam="verwijderen" maat={13} />
              </button>
            )}
          </div>
          <div className="tekst">{n.tekst}</div>
        </div>
      ))}
    </div>
  )
}
