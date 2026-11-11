import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as D from '../lib/data'
import { renderMd, splitsFrontmatter } from '../lib/md'
import { Kruimel, Pill } from '../components/basis'
import { Notities } from '../components/notities'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { Dialoog } from '../components/dialoog'
import { meld } from '../components/meldingen'
import { useSneltoets } from '../hooks/useSneltoets'
import { useTraagLaden } from '../hooks/useTraagLaden'
import { zetVies, wisVies } from '../lib/vies'

export function DocPagina({ docId, naar, naam, blokken, bronnen, herlaad, tik }) {
  const [doc, setDoc] = useState(null)
  const [geladen, setGeladen] = useState(false)
  const [modus, setModus] = useState('lees') // lees | bewerk | historiek
  const [klad, setKlad] = useState('')
  const [basis, setBasis] = useState('')
  const [historiek, setHistoriek] = useState([])
  const [notities, setNotities] = useState([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [vraag, setVraag] = useState(null) // { soort: 'herstel' | 'weggooien', versie? }
  const bewaarRef = useRef(null)
  const modusRef = useRef(modus)
  const kladRef = useRef(klad)
  const basisRef = useRef(basis)
  modusRef.current = modus
  kladRef.current = klad
  basisRef.current = basis

  const traag = useTraagLaden(!geladen)

  const herlaadDoc = useCallback(async ({ respecteerKlad = false } = {}) => {
    try {
      const d = await D.laadDocument(docId)
      setDoc(d)
      const lokaalVies = modusRef.current === 'bewerk' && kladRef.current !== basisRef.current
      // Een realtime-wijziging ergens anders mag nooit stil een lopende
      // bewerking overschrijven. De lokale tekst blijft staan; de gebruiker
      // beslist zelf wat er gebeurt.
      if (respecteerKlad && lokaalVies) {
        if ((d.inhoud ?? '') !== basisRef.current) {
          meld('Dit stuk is elders gewijzigd. Je lokale tekst blijft staan — bewaar of herlaad bewust.', { fout: true })
        }
        return
      }
      setBasis(d.inhoud ?? '')
      setKlad(d.inhoud ?? '')
      setFout('')
    } catch (e) {
      setDoc(null)
      setFout('Dit document kon niet geladen worden.')
    } finally {
      setGeladen(true)
    }
  }, [docId])

  useEffect(() => {
    setGeladen(false)
    herlaadDoc()
    D.laadNotities('document', docId).then(setNotities).catch(() => {})
  }, [herlaadDoc, docId])

  // Realtime: alleen de serverversie/metadata verversen, nooit een lopende
  // bewerking overschrijven.
  useEffect(() => {
    if (!tik) return
    herlaadDoc({ respecteerKlad: true })
  }, [tik, herlaadDoc])

  // De bronnen van dit dagdeel zitten al in de globale data; geen extra query
// nodig. Zo blijft de lijst ook meteen live via de bestaande realtime-tik.
  const bronnenVanBlok = useMemo(() => {
    const b = doc?.blok_id
    if (!b) return []
    return (bronnen ?? [])
      .filter((x) => x.blok_id === b)
      .map((x) => ({ id: x.id, titel: x.titel, url: x.url, status: x.status }))
  }, [bronnen, doc?.blok_id])

  useEffect(() => {
    if (modus === 'historiek') D.laadHistoriek(docId).then(setHistoriek).catch(() => {})
  }, [modus, docId])

  const vies = modus === 'bewerk' && klad !== basis

  // Werkverlies bewaken: de app vraagt eerst voor ze navigeert, en de browser
  // waarschuwt bij het sluiten van het tabblad.
  useEffect(() => {
    if (vies) zetVies(() => true)
    else wisVies()
    return () => wisVies()
  }, [vies])

  useEffect(() => {
    if (!vies) return
    const f = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [vies])

  const bewaar = useCallback(async () => {
    if (!doc || bezig) return
    if (klad === basis) {
      setModus('lees')
      return
    }
    setBezig(true)
    setFout('')
    try {
      const nieuw = await D.bewaarDocument(doc, klad, naam)
      setDoc(nieuw)
      setBasis(klad)
      setModus('lees')
      meld('Bewaard. De vorige versie staat in de historiek.')
      herlaad?.()
    } catch (e) {
      setFout('Bewaren mislukte. Je tekst staat er nog; probeer opnieuw of download hem eerst.')
    } finally {
      setBezig(false)
    }
  }, [doc, klad, basis, naam, herlaad, bezig])

  bewaarRef.current = bewaar

  // ⌘S bewaart ook vanuit de editor (en houdt de browser-dialoog tegen).
  useSneltoets('s', () => bewaarRef.current?.(), { ookInInvoerveld: true })

  const terugzetten = async (h) => {
    setVraag(null)
    setBezig(true)
    setFout('')
    try {
      await D.bewaarDocument(doc, h.inhoud ?? '', naam)
      await herlaadDoc()
      setModus('lees')
      meld(`Versie ${h.versie} is teruggezet.`)
      herlaad?.()
    } catch {
      setFout('Terugzetten mislukte. Probeer opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  const download = () => {
    const blob = new Blob([doc?.inhoud ?? ''], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${doc?.titel ?? 'document'}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!doc && traag) {
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <Skelet breedte="38%" hoogte={22} straal={6} />
          <div style={{ height: 12 }} />
          <Skelet breedte="62%" hoogte={12} />
          <div style={{ height: 26 }} />
          <SkeletAlinea lijnen={4} />
          <div style={{ height: 22 }} />
          <SkeletAlinea lijnen={6} />
        </div>
      </main>
    )
  }

  if (!doc)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <LegeStaat
            icoon="document"
            titel={fout || 'Dit document is er niet (meer)'}
            uitleg="De link klopt niet meer, of het stuk is verwijderd."
            acties={
              <button className="knop primair" onClick={() => naar('#/')}>
                Terug naar het overzicht
              </button>
            }
          />
        </div>
      </main>
    )

  const blok = blokken.find((b) => b.id === doc.blok_id)
  const { front, body } = splitsFrontmatter(doc.inhoud ?? '')

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
            <h1 title={doc.titel}>{doc.titel}</h1>
            <div className="onder">
              <Pill soort="accent">{doc.soort}</Pill>
              <span className="cijfers">
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
                  <Icoon naam="bewerken" maat={14} />
                  Bewerken
                </button>
                <button className="knop" onClick={() => setModus('historiek')}>
                  <Icoon naam="geschiedenis" maat={14} />
                  Historiek
                </button>
                <button className="knop" onClick={download}>
                  <Icoon naam="downloaden" maat={14} />
                  Download
                </button>
              </>
            )}
            {modus === 'bewerk' && (
              <>
                <button className="knop primair" onClick={bewaar} disabled={bezig || !vies}>
                  {bezig ? 'Bewaren…' : vies ? 'Bewaar nieuwe versie' : 'Niets gewijzigd'}
                </button>
                <button className="knop" onClick={() => (vies ? setVraag({ soort: 'weggooien' }) : setModus('lees'))}>
                  Annuleer
                </button>
                <span className="meta-klein" style={{ alignSelf: 'center' }}>
                  <kbd className="toets">⌘S</kbd> bewaart · {klad.length.toLocaleString('nl-BE')} tekens
                </span>
              </>
            )}
            {modus === 'historiek' && (
              <button className="knop" onClick={() => setModus('lees')}>
                {historiek.length} oudere versies · terug naar het stuk
              </button>
            )}
          </div>

          {fout && (
            <div className="foutkaart" role="alert">
              <div className="kop">
                <Icoon naam="waarschuwing" maat={14} />
                Er ging iets mis
              </div>
              <div>{fout}</div>
              <div className="acties">
                <button className="knop" onClick={bewaar} disabled={bezig}>
                  Opnieuw proberen
                </button>
                <button className="knop zacht" onClick={download}>
                  Downloaden
                </button>
              </div>
            </div>
          )}

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
                aria-label="Inhoud van het document, in markdown"
              />
            </div>
          )}

          {modus === 'historiek' && (
            <div>
              {historiek.length === 0 && (
                <LegeStaat
                  icoon="geschiedenis"
                  titel="Nog geen oudere versies"
                  uitleg="Dit stuk is pas één keer bewaard. Zodra iemand een nieuwe versie bewaart, verschijnt de vorige hier."
                  compact
                />
              )}
              {historiek.map((h) => (
                <div className="historiek-rij" key={h.id}>
                  <b className="cijfers">v{h.versie}</b>
                  <span className="meta-klein">
                    {h.bewerkt_door || 'onbekend'} · {D.datumKort(h.bewaard_op)} · {D.bytesLeesbaar((h.inhoud ?? '').length)}
                  </span>
                  <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={() => setVraag({ soort: 'herstel', versie: h.versie, inhoud: h.inhoud })}>
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
              <button key={b.id} className="bron-rij" onClick={() => naar(`#/bron/${b.id}`)} title={b.titel || b.url}>
                <span className={`status-stip ${b.status}`} role="img" aria-label={`Status: ${b.status}`} title={`Status: ${b.status}`} />
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

      <Dialoog
        open={vraag?.soort === 'herstel'}
        titel={`Versie ${vraag?.versie ?? ''} terugzetten?`}
        tekst="De huidige inhoud gaat naar de historiek, dus je kunt altijd terug."
        actie="Terugzetten"
        opAnnuleer={() => setVraag(null)}
        opBevestig={() => terugzetten({ versie: vraag?.versie, inhoud: vraag?.inhoud })}
      />

      <Dialoog
        open={vraag?.soort === 'weggooien'}
        titel="Wijzigingen weggooien?"
        tekst="Je hebt tekst aangepast die nog niet bewaard is. Als je nu annuleert, gaat die tekst verloren."
        actie="Weggooien"
        verscheurend
        opAnnuleer={() => setVraag(null)}
        opBevestig={() => {
          setVraag(null)
          setKlad(basis)
          setModus('lees')
        }}
      />
    </>
  )
}
