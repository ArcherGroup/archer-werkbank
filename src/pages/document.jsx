import React, { useCallback, useEffect, useState } from 'react'
import * as D from '../lib/data'
import { sb } from '../lib/supabase'
import { renderMd, splitsFrontmatter } from '../lib/md'
import { Kruimel, Pill } from '../components/basis'
import { Notities } from '../components/notities'

export function DocPagina({ docId, naar, naam, blokken, herlaad, tik }) {
  const [doc, setDoc] = useState(null)
  const [modus, setModus] = useState('lees') // lees | bewerk | historiek
  const [klad, setKlad] = useState('')
  const [historiek, setHistoriek] = useState([])
  const [notities, setNotities] = useState([])
  const [bronnenVanBlok, setBronnenVanBlok] = useState([])
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState('')

  const herlaadDoc = useCallback(async () => {
    try {
      const d = await D.laadDocument(docId)
      setDoc(d)
      setKlad(d.inhoud ?? '')
    } catch {
      setDoc(null)
    }
  }, [docId])

  useEffect(() => {
    herlaadDoc()
    D.laadNotities('document', docId).then(setNotities).catch(() => {})
  }, [herlaadDoc, docId, tik])

  useEffect(() => {
    const b = doc?.blok_id
    if (b) {
      sb.from('bronnen').select('id,titel,url,status').eq('blok_id', b).then(({ data }) => setBronnenVanBlok(data ?? []))
    }
  }, [doc?.blok_id])

  useEffect(() => {
    if (modus === 'historiek') D.laadHistoriek(docId).then(setHistoriek).catch(() => {})
  }, [modus, docId])

  if (!doc)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <div className="leeg-melding">Dit document is er niet (meer).</div>
        </div>
      </main>
    )

  const blok = blokken.find((b) => b.id === doc.blok_id)
  const { front, body } = splitsFrontmatter(doc.inhoud ?? '')
  const vies = klad !== (doc.inhoud ?? '')

  const bewaar = async () => {
    setBezig(true)
    setMelding('')
    try {
      const nieuw = await D.bewaarDocument(doc, klad, naam)
      setDoc(nieuw)
      setModus('lees')
      setMelding('Bewaard. De vorige versie staat in de historiek.')
      herlaad?.()
    } catch (e) {
      setMelding('Bewaren mislukte: ' + (e.message || e))
    } finally {
      setBezig(false)
    }
  }

  const herstel = async (h) => {
    if (!confirm(`Versie ${h.versie} terugzetten? De huidige inhoud gaat naar de historiek.`)) return
    setBezig(true)
    try {
      await D.bewaarDocument(doc, h.inhoud ?? '', naam)
      await herlaadDoc()
      setModus('lees')
      setMelding(`Versie ${h.versie} is teruggezet.`)
      herlaad?.()
    } finally {
      setBezig(false)
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
              { tekst: `${blok?.code ?? doc.blok_id} · ${blok?.titel ?? ''}`, naar: `#/blok/${doc.blok_id}` },
              { tekst: doc.titel },
            ]}
          />
          <div className="pagina-kop">
            <h1>{doc.titel}</h1>
            <div className="onder">
              <Pill soort="accent">{doc.soort}</Pill>
              <span>
                v{doc.versie ?? 1} · {D.bytesLeesbaar(doc.bytes)}
                {doc.bewerkt_door ? ` · laatst bewerkt door ${doc.bewerkt_door}` : ''}
                {doc.updated_at ? ` · ${D.datumKort(doc.updated_at)}` : ''}
              </span>
            </div>
          </div>

          <div className="knoprij">
            {modus === 'lees' && (
              <>
                <button className="knop primair" onClick={() => setModus('bewerk')}>
                  ✏️ Bewerken
                </button>
                <button className="knop" onClick={() => setModus('historiek')}>
                  🕘 Historiek
                </button>
                <button
                  className="knop"
                  onClick={() => {
                    const blob = new Blob([doc.inhoud ?? ''], { type: 'text/markdown' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `${doc.titel}.md`
                    a.click()
                    URL.revokeObjectURL(a.href)
                  }}
                >
                  ⤓ Download
                </button>
              </>
            )}
            {modus === 'bewerk' && (
              <>
                <button className="knop primair" onClick={bewaar} disabled={bezig || !vies}>
                  {bezig ? 'Bewaren…' : vies ? 'Bewaar nieuwe versie' : 'Niets gewijzigd'}
                </button>
                <button
                  className="knop"
                  onClick={() => {
                    if (!vies || confirm('Wijzigingen weggooien?')) {
                      setKlad(doc.inhoud ?? '')
                      setModus('lees')
                    }
                  }}
                >
                  Annuleer
                </button>
                <span className="meta-klein" style={{ alignSelf: 'center' }}>
                  {klad.length.toLocaleString('nl-BE')} tekens
                </span>
              </>
            )}
            {modus === 'historiek' && (
              <button className="knop" onClick={() => setModus('lees')}>
                {historiek.length} oudere versies · terug naar het stuk
              </button>
            )}
          </div>

          {melding && <div className="pl-kaart" style={{ padding: '9px 14px' }}>{melding}</div>}

          {modus === 'lees' && (
            <article className="md">
              {front && <div className="frontmatter">{front}</div>}
              <div dangerouslySetInnerHTML={{ __html: renderMd(body) }} />
            </article>
          )}

          {modus === 'bewerk' && (
            <div className="bewerker">
              <textarea
                value={klad}
                onChange={(e) => setKlad(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    bewaar()
                  }
                }}
                spellCheck={false}
              />
            </div>
          )}

          {modus === 'historiek' && (
            <div>
              {historiek.length === 0 && <div className="leeg-tekst">Nog geen oudere versies; dit stuk is nog maar één keer bewaard.</div>}
              {historiek.map((h) => (
                <div className="historiek-rij" key={h.id}>
                  <b>v{h.versie}</b>
                  <span className="meta-klein">
                    {h.bewerkt_door || 'onbekend'} · {D.datumKort(h.bewaard_op)} · {D.bytesLeesbaar((h.inhoud ?? '').length)}
                  </span>
                  <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={() => herstel(h)}>
                    Terugzetten
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Notities bij dit stuk</div>
        <Notities
          doelType="document"
          doelId={doc.id}
          auteur={naam}
          notities={notities}
          onWijzig={() => D.laadNotities('document', doc.id).then(setNotities)}
        />
        {bronnenVanBlok.length > 0 && (
          <>
            <div className="insp-titel">Bronnen van dit dagdeel ({bronnenVanBlok.length})</div>
            {bronnenVanBlok.slice(0, 12).map((b) => (
              <button
                key={b.id}
                className="bron-rij"
                style={{ borderBottom: '1px solid var(--line)', borderRadius: 8 }}
                onClick={() => naar(`#/bron/${b.id}`)}
              >
                <span className={`status-stip ${b.status}`} />
                <span className="midden">
                  <div className="t">{b.titel || b.url}</div>
                  <div className="u">{b.url}</div>
                </span>
              </button>
            ))}
            {bronnenVanBlok.length > 12 && <div className="leeg-tekst">… en nog {bronnenVanBlok.length - 12}</div>}
          </>
        )}
      </aside>
    </>
  )
}
