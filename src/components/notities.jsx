import React, { useState } from 'react'
import { sb } from '../lib/supabase'
import { kleurVoor, initialen } from '../lib/data'

/* Notities bij een stuk, dagdeel of bron; live zichtbaar voor beide gebruikers. */

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
