import React, { useCallback, useEffect, useState } from 'react'
import * as D from '../lib/data'
import { Kruimel } from '../components/basis'
import { Notities } from '../components/notities'

export function BlokPagina({ blokId, naar, blokken, documentenMeta, naam, herlaad, tik }) {
  const blok = blokken.find((b) => b.id === blokId)
  const [notities, setNotities] = useState([])
  const [aanHetMaken, setAanHetMaken] = useState(false)

  const herlaadNotities = useCallback(() => {
    if (blok) D.laadNotities('blok', blok.id).then(setNotities).catch(() => {})
  }, [blok])

  useEffect(() => {
    herlaadNotities()
  }, [herlaadNotities, tik])

  if (!blok)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <div className="leeg-melding">Dit dagdeel bestaat niet.</div>
        </div>
      </main>
    )

  const docs = documentenMeta
    .filter((d) => d.blok_id === blok.id)
    .sort((a, b) => ({
      brief: 0, spreektekst: 1, slides: 2, werkboek: 3, oefening: 4, research: 5, bron: 6, algemeen: 7, overig: 8,
    })[a.soort] - ({ brief: 0, spreektekst: 1, slides: 2, werkboek: 3, oefening: 4, research: 5, bron: 6, algemeen: 7, overig: 8 })[b.soort] || a.titel.localeCompare(b.titel))

  const icoon = { brief: '📄', spreektekst: '🎤', slides: '🖼️', werkboek: '✏️', oefening: '🧩', research: '🔎', bron: '🔗', algemeen: '📘', overig: '📎' }

  const zetStatus = async (s) => {
    await D.zetBlokStatus(blok.id, s)
    herlaad()
  }

  const nieuwDocument = async () => {
    const titel = prompt('Naam van het nieuwe stuk (bijvoorbeeld "feedback", "aanvullingen" of een werktitel):')
    if (!titel) return
    setAanHetMaken(true)
    try {
      const d = await D.voegDocumentToe({ blok_id: blok.id, soort: 'overig', titel: titel.trim(), auteur: naam })
      naar(`#/doc/${d.id}`)
    } finally {
      setAanHetMaken(false)
    }
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen">
          <Kruimel
            naar={naar}
            delen={[
              { tekst: 'Overzicht', naar: '#/' },
              { tekst: `Dag ${blok.dag}`, naar: '#/' },
              { tekst: `${blok.code} · ${blok.titel}` },
            ]}
          />
          <div className="pagina-kop">
            <h1>
              {blok.code} · {blok.titel}
            </h1>
            <div className="onder">
              {blok.spreker && <span>Spreker: {blok.spreker}</span>}
              {blok.eigenaar && <span>· Eigenaar: {blok.eigenaar}</span>}
              {blok.notitie && <span>· {blok.notitie}</span>}
            </div>
          </div>

          <div className="statusbalk">
            {['Leeg', 'Concept', 'Review', 'Final'].map((s) => (
              <button key={s} className={`statusknop ${blok.status === s ? 'aan' : ''}`} onClick={() => zetStatus(s)}>
                {s}
              </button>
            ))}
            <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={nieuwDocument} disabled={aanHetMaken}>
              + Nieuw stuk
            </button>
          </div>

          <div className="doc-lijst">
            {docs.length === 0 && (
              <div className="leeg-melding">
                Nog geen stukken in dit dagdeel. Maak er een aan met “Nieuw stuk”, of laat de assistent research doen en vul
                daarna de brief, spreektekst, slides en het werkboek aan.
              </div>
            )}
            {docs.map((d) => (
              <button key={d.id} className="doc-kaart" onClick={() => naar(`#/doc/${d.id}`)}>
                <span className="soort">{icoon[d.soort] || '📎'}</span>
                <span className="midden">
                  <div className="naam">{d.titel}</div>
                  <div className="meta">
                    {d.soort}
                    {d.bytes ? ` · ${D.bytesLeesbaar(d.bytes)}` : ''}
                    {d.bewerkt_door ? ` · bewerkt door ${d.bewerkt_door}` : ''}
                    {d.updated_at ? ` · ${D.datumKort(d.updated_at)}` : ''}
                  </div>
                </span>
                <span className="pijl">›</span>
              </button>
            ))}
          </div>
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Notities bij dit dagdeel</div>
        <Notities doelType="blok" doelId={blok.id} auteur={naam} notities={notities} onWijzig={herlaadNotities} />
      </aside>
    </>
  )
}
