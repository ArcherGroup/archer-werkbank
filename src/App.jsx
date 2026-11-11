import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sb, SB_URL, SB_KEY, FUNCTIES } from './lib/supabase'
import * as D from './lib/data'
import { renderMd, splitsFrontmatter } from './lib/md'
import { Palet, Naamvraag, Notities, Pill, StatusStip, Kruimel } from './components/ui'

const DAG_NAMEN = { 0: 'Dag 0 · Voorbereiding', 1: 'Dag 1 · Anthony', 2: 'Dag 2 · Vastgoed', 3: 'Dag 3 · Fiscaliteit', 4: 'Dag 4 · Afronding' }

export default function App() {
  const [naam, setNaam] = useState(() => localStorage.getItem('werkbank_naam') || '')
  const [route, setRoute] = useState(() => window.location.hash || '#/')
  const [paletOpen, setPaletOpen] = useState(false)
  const [blokken, setBlokken] = useState([])
  const [documentenMeta, setDocumentenMeta] = useState([])
  const [bronnen, setBronnen] = useState([])
  const [beslissingen, setBeslissingen] = useState([])
  const [validaties, setValidaties] = useState([])
  const [voorstellen, setVoorstellen] = useState([])
  const [geladen, setGeladen] = useState(false)
  const [online, setOnline] = useState([])
  const [tik, setTik] = useState(0) // herlaadtik na realtime-wijziging

  const naar = useCallback((hash) => {
    window.location.hash = hash
  }, [])

  useEffect(() => {
    const f = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // globale data
  const herlaadAlles = useCallback(async () => {
    const [b, dm, br, bs, va, vo] = await Promise.all([
      D.laadBlokken(),
      D.laadDocumentenMeta(),
      D.laadBronnen(),
      D.laadBeslissingen(),
      D.laadValidaties(),
      D.laadVoorstellen(),
    ])
    setBlokken(b)
    setDocumentenMeta(dm)
    setBronnen(br)
    setBeslissingen(bs)
    setValidaties(va)
    setVoorstellen(vo)
    setGeladen(true)
  }, [])

  useEffect(() => {
    herlaadAlles().catch(console.error)
  }, [herlaadAlles, tik])

  // realtime: bij elke wijziging in de gedeelde tabellen herladen (met korte demping)
  useEffect(() => {
    let timer = null
    const kanaal = D.abonneer(() => {
      clearTimeout(timer)
      timer = setTimeout(() => setTik((t) => t + 1), 350)
    })
    return () => {
      clearTimeout(timer)
      sb.removeChannel(kanaal)
    }
  }, [])

  // aanwezigheid
  useEffect(() => {
    if (!naam) return
    const kanaal = sb.channel('werkbank-aanwezig', {
      config: { presence: { key: naam } },
    })
    kanaal
      .on('presence', { event: 'sync' }, () => {
        const staat = kanaal.presenceState()
        setOnline(Object.values(staat).flat().map((p) => p.naam).filter(Boolean))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await kanaal.track({ naam, sinds: Date.now() })
      })
    return () => {
      sb.removeChannel(kanaal)
    }
  }, [naam])

  // ⌘K
  useEffect(() => {
    const f = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletOpen((o) => !o)
      }
      if (e.key === 'Escape') setPaletOpen(false)
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [])

  const kiesNaam = (n) => {
    localStorage.setItem('werkbank_naam', n)
    setNaam(n)
  }

  if (!naam) return <Naamvraag opNaam={kiesNaam} />

  const del = route.replace(/^#\//, '').split('/')
  const weergave = del[0] || ''

  return (
    <div className="schil">
      <Topbar
        naam={naam}
        online={online}
        opZoeken={() => setPaletOpen(true)}
        opWissel={() => {
          localStorage.removeItem('werkbank_naam')
          setNaam('')
        }}
      />
      <Zijbalk
        route={route}
        naar={naar}
        blokken={blokken}
        bronnen={bronnen}
        beslissingen={beslissingen}
        voorstellen={voorstellen}
      />
      <Hoofd
        weergave={weergave}
        del={del}
        naam={naam}
        naar={naar}
        blokken={blokken}
        documentenMeta={documentenMeta}
        bronnen={bronnen}
        beslissingen={beslissingen}
        validaties={validaties}
        voorstellen={voorstellen}
        herlaad={herlaadAlles}
        tik={tik}
      />
      <Palet
        open={paletOpen}
        opSluiten={() => setPaletOpen(false)}
        blokken={blokken}
        documentenMeta={documentenMeta}
        bronnen={bronnen}
        naar={naar}
      />
      {!geladen && <div className="laad-balk" />}
    </div>
  )
}

/* ---------------------------------------------------------------- topbar */

function Topbar({ naam, online, opZoeken, opWissel }) {
  return (
    <div className="topbar">
      <div className="merk">
        <span className="blokje">A</span> Werkbank · Masterclass februari 2027
      </div>
      <button className="zoekknop" onClick={opZoeken}>
        <span>Zoek of spring…</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="topbar-rechts">
        <div className="aanwezig">
          {online.slice(0, 5).map((n) => (
            <span key={n} className="stip" style={{ background: D.kleurVoor(n) }} title={`${n} is online`}>
              {D.initialen(n)}
            </span>
          ))}
        </div>
        <button className="ik-knop" onClick={opWissel} title="Naam wisselen">
          <span className="stip" style={{ background: D.kleurVoor(naam) }}>
            {D.initialen(naam)}
          </span>
          {naam}
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- zijbalk */

function Zijbalk({ route, naar, blokken, bronnen, beslissingen, voorstellen }) {
  const perDag = useMemo(() => {
    const m = {}
    for (const b of blokken) {
      if (b.id === 'algemeen' || b.id === 'bronnen') continue
      m[b.dag] = m[b.dag] || []
      m[b.dag].push(b)
    }
    return m
  }, [blokken])

  const openBesl = beslissingen.filter((b) => b.status !== 'beslist').length
  const openVoorstel = voorstellen.filter((v) => v.status === 'open').length
  const kernbronnen = bronnen.filter((b) => b.status === 'kernbron').length

  const is = (p) => route === p

  return (
    <aside className="zijbalk">
      <div className="zij-sectie">
        <button className={`zij-item ${is('#/') || is('#/') ? (route === '#/' ? 'actief' : '') : ''}`} onClick={() => naar('#/')}>
          <span className="code">⛁</span>
          <span className="titel-tekst">Overzicht</span>
        </button>
        <button className={`zij-item ${route === '#/planning' ? 'actief' : ''}`} onClick={() => naar('#/planning')}>
          <span className="code">🧭</span>
          <span className="titel-tekst">Planning</span>
          {openBesl + openVoorstel > 0 && <span className="zij-teller">{openBesl + openVoorstel}</span>}
        </button>
        <button className={`zij-item ${route === '#/bronnen' ? 'actief' : ''}`} onClick={() => naar('#/bronnen')}>
          <span className="code">🔗</span>
          <span className="titel-tekst">Bronnen</span>
          <span className="zij-teller">{kernbronnen ? `${kernbronnen}★` : bronnen.length}</span>
        </button>
      </div>

      {[0, 1, 2, 3, 4].map((dag) => {
        const rows = perDag[dag] || []
        if (!rows.length) return null
        return (
          <div className="zij-sectie" key={dag}>
            <div className="zij-titel">{DAG_NAMEN[dag]}</div>
            {rows.map((b) => (
              <button
                key={b.id}
                className={`zij-item ${route === `#/blok/${b.id}` ? 'actief' : ''}`}
                onClick={() => naar(`#/blok/${b.id}`)}
                title={`${b.titel} · ${b.status}`}
              >
                <span className="code">{b.code}</span>
                <span className="titel-tekst">{b.titel}</span>
                <StatusStip status={b.status} />
              </button>
            ))}
          </div>
        )
      })}
    </aside>
  )
}

/* ---------------------------------------------------------------- hoofd */

function Hoofd(props) {
  const { weergave, del, naam, naar } = props
  if (weergave === 'blok') return <BlokPagina {...props} blokId={del[1]} />
  if (weergave === 'doc') return <DocPagina {...props} docId={Number(del[1])} />
  if (weergave === 'bronnen') return <BronnenPagina {...props} />
  if (weergave === 'bron') return <BronPagina {...props} bronId={Number(del[1])} />
  if (weergave === 'planning') return <PlanningPagina {...props} />
  return <OverzichtPagina {...props} />
}

/* ---------------------------------------------------------------- overzicht */

function OverzichtPagina({ naar, blokken, documentenMeta, bronnen, beslissingen, validaties, voorstellen, tik }) {
  const [recent, setRecent] = useState([])

  useEffect(() => {
    D.laadAlleNotities().then(setRecent).catch(() => {})
  }, [tik])

  const klaar = blokken.filter((b) => b.status === 'Review' || b.status === 'Final').length
  const totaal = blokken.filter((b) => b.id !== 'algemeen' && b.id !== 'bronnen').length
  const researchDocs = documentenMeta.filter((d) => d.soort === 'research')
  const bytes = researchDocs.reduce((s, d) => s + (d.bytes || 0), 0)
  const openBesl = beslissingen.filter((b) => b.status !== 'beslist')
  const openValid = validaties.filter((v) => v.status !== 'klaar')

  const groepen = useMemo(() => {
    const m = {}
    for (const b of blokken) {
      if (b.id === 'algemeen' || b.id === 'bronnen') continue
      m[b.dag] = m[b.dag] || []
      m[b.dag].push(b)
    }
    return m
  }, [blokken])

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 860 }}>
          <div className="pagina-kop">
            <h1>De hele editie in één beeld</h1>
            <div className="onder">
              <span>{klaar} van {totaal} dagdelen uitgewerkt</span>
              <span>·</span>
              <span>{researchDocs.length} researchbestanden · {D.bytesLeesbaar(bytes)}</span>
              <span>·</span>
              <span>{bronnen.length} bronnen · {bronnen.filter((b) => b.status === 'kernbron').length} kernbronnen</span>
            </div>
          </div>

          {openBesl.length > 0 && (
            <div className="pl-kaart" style={{ borderColor: 'rgba(0,0,255,0.25)', background: 'linear-gradient(0deg, rgba(237,237,255,0.5), rgba(237,237,255,0.5))' }}>
              <div className="kop">
                <span style={{ fontSize: 17 }}>🧭</span>
                <div className="t">
                  {openBesl.length} beslissing{openBesl.length > 1 ? 'en' : ''} wacht{openBesl.length > 1 ? 'en' : ''} op jou
                </div>
                <button className="knop primair" onClick={() => naar('#/planning')}>
                  Bekijk
                </button>
              </div>
              <div className="d">{openBesl.map((b) => b.titel).join(' · ')}</div>
            </div>
          )}

          {[0, 1, 2, 3, 4].map((dag) => (
            <div key={dag}>
              <div className="insp-titel" style={{ marginTop: 24 }}>
                {DAG_NAMEN[dag]}
              </div>
              <div className="doc-lijst">
                {(groepen[dag] || []).map((b) => {
                  const docs = documentenMeta.filter((d) => d.blok_id === b.id)
                  return (
                    <button key={b.id} className="doc-kaart" onClick={() => naar(`#/blok/${b.id}`)}>
                      <span className="soort">{b.code.split('.')[0] === b.code ? '📅' : '📌'}</span>
                      <span className="midden">
                        <div className="naam">
                          {b.code} · {b.titel}
                        </div>
                        <div className="meta">
                          {docs.length > 0
                            ? `${docs.length} stukken · ${docs.map((d) => d.soort).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`
                            : 'nog niets uitgewerkt'}
                          {b.spreker ? ` · spreker ${b.spreker}` : ''}
                        </div>
                      </span>
                      <Pill soort={b.status}>{b.status}</Pill>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="insp-titel" style={{ marginTop: 26 }}>
            Recente notities
          </div>
          {recent.length === 0 && <div className="leeg-tekst">Nog geen notities. Open een stuk en schrijf er een.</div>}
          {recent.slice(0, 6).map((n) => (
            <div className="notitie" key={n.id}>
              <div className="kop">
                <span className="wie" style={{ background: D.kleurVoor(n.auteur) }}>
                  {D.initialen(n.auteur)}
                </span>
                <b>{n.auteur}</b>
                <span>
                  {n.doel_type} {n.doel_id} · {D.datumKort(n.created_at)}
                </span>
              </div>
              <div className="tekst">{n.tekst.slice(0, 220)}</div>
            </div>
          ))}
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Stand van de studie</div>
        <div className="insp-kaart">
          <div className="insp-rij">
            <span className="k">Dagdelen uitgewerkt</span>
            <span className="v">{klaar} / {totaal}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Researchbestanden</span>
            <span className="v">{researchDocs.length}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Bronnen</span>
            <span className="v">{bronnen.length}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Kernbronnen</span>
            <span className="v">{bronnen.filter((b) => b.status === 'kernbron').length}</span>
          </div>
        </div>
        <div className="insp-titel">Open punten</div>
        <div className="insp-kaart">
          {openBesl.length === 0 && openValid.length === 0 && <div className="leeg-tekst">Niets open. Mooi zo.</div>}
          {openBesl.map((b) => (
            <div className="insp-rij" key={`b${b.id}`}>
              <span className="k">Beslissing</span>
              <span className="v">{b.titel}</span>
            </div>
          ))}
          {openValid.map((v) => (
            <div className="insp-rij" key={`v${v.id}`}>
              <span className="k">{v.wie}</span>
              <span className="v">{v.onderwerp}</span>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}

/* ---------------------------------------------------------------- blokpagina */

function BlokPagina({ blokId, naar, blokken, documentenMeta, naam, herlaad, tik }) {
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

/* ---------------------------------------------------------------- documentpagina */

function DocPagina({ docId, naar, naam, blokken, herlaad, tik }) {
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

/* ---------------------------------------------------------------- bronnenlijst */

function BronnenPagina({ naar, bronnen, blokken, naam, herlaad, tik }) {
  const [filter, setFilter] = useState('alle') // alle | ongelezen | gelezen | kernbron
  const [blokFilter, setBlokFilter] = useState('')
  const [q, setQ] = useState('')
  const [toevoegen, setToevoegen] = useState(false)
  const [nieuwUrl, setNieuwUrl] = useState('')
  const [nieuwTitel, setNieuwTitel] = useState('')
  const [nieuwBlok, setNieuwBlok] = useState('')

  const gefilterd = useMemo(() => {
    const term = q.trim().toLowerCase()
    return bronnen.filter((b) => {
      if (filter !== 'alle' && b.status !== filter) return false
      if (blokFilter && b.blok_id !== blokFilter) return false
      if (term && !(`${b.titel} ${b.url}`.toLowerCase().includes(term))) return false
      return true
    })
  }, [bronnen, filter, blokFilter, q])

  const toe = async () => {
    if (!nieuwUrl.trim()) return
    await D.voegBronToe({ url: nieuwUrl.trim(), titel: nieuwTitel.trim(), blok_id: nieuwBlok || 'algemeen', auteur: naam })
    setToevoegen(false)
    setNieuwUrl('')
    setNieuwTitel('')
    herlaad?.()
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 860 }}>
          <div className="pagina-kop">
            <h1>Bronnen</h1>
            <div className="onder">
              <span>{bronnen.length} bronnen, {bronnen.filter((b) => b.status === 'kernbron').length} kernbronnen</span>
              <button className="knop zacht" onClick={() => setToevoegen((t) => !t)}>
                + Bron toevoegen
              </button>
            </div>
          </div>

          {toevoegen && (
            <div className="pl-kaart">
              <div className="kop">
                <div className="t">Nieuwe bron</div>
              </div>
              <input
                className="notitie-invoer"
                style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 8, display: 'block' }}
                placeholder="https://…"
                value={nieuwUrl}
                onChange={(e) => setNieuwUrl(e.target.value)}
              />
              <input
                style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 8, display: 'block' }}
                placeholder="Titel (mag leeg blijven)"
                value={nieuwTitel}
                onChange={(e) => setNieuwTitel(e.target.value)}
              />
              <select
                style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 10 }}
                value={nieuwBlok}
                onChange={(e) => setNieuwBlok(e.target.value)}
              >
                <option value="">Bij welk dagdeel hoort hij?</option>
                {blokken.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.titel}
                  </option>
                ))}
              </select>
              <button className="knop primair" onClick={toe} disabled={!nieuwUrl.trim()}>
                Toevoegen
              </button>
            </div>
          )}

          <div className="bron-filter">
            {['alle', 'ongelezen', 'gelezen', 'kernbron'].map((f) => (
              <button key={f} className={`fil ${filter === f ? 'aan' : ''}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
            <select
              className="fil"
              style={{ paddingRight: 26 }}
              value={blokFilter}
              onChange={(e) => setBlokFilter(e.target.value)}
            >
              <option value="">alle dagdelen</option>
              {blokken.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.titel}
                </option>
              ))}
            </select>
            <input
              className="fil"
              style={{ minWidth: 180 }}
              placeholder="zoek in titel of url…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="meta-klein" style={{ alignSelf: 'center' }}>
              {gefilterd.length} getoond
            </span>
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.7)' }}>
            {gefilterd.length === 0 && <div className="leeg-tekst" style={{ padding: 18 }}>Geen bronnen met deze filters.</div>}
            {gefilterd.slice(0, 200).map((b) => (
              <button key={b.id} className="bron-rij" onClick={() => naar(`#/bron/${b.id}`)}>
                <span className={`status-stip ${b.status}`} />
                <span className="midden">
                  <div className="t">{b.titel || b.url}</div>
                  <div className="u">
                    {b.url} {b.blok_id ? `· ${b.blok_id}` : ''} {b.opgehaald_op ? '· al opgehaald' : ''}
                  </div>
                </span>
              </button>
            ))}
            {gefilterd.length > 200 && <div className="leeg-tekst" style={{ padding: 12 }}>… en nog {gefilterd.length - 200}; gebruik de filters of het zoekveld.</div>}
          </div>
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Zo werkt de lezer</div>
        <div className="insp-kaart" style={{ lineHeight: 1.55 }}>
          Klik een bron open. De werkbank haalt de pagina op en toont de leesbare tekst naast je notitieveld. Je merkt een
          bron als <b>gelezen</b> of <b>kernbron</b>; die keuze zien Victor en Anthony meteen.
        </div>
      </aside>
    </>
  )
}

/* ---------------------------------------------------------------- bronpagina (de lezer) */

function BronPagina({ bronId, naar, naam, herlaad, tik }) {
  const [bron, setBron] = useState(null)
  const [notities, setNotities] = useState([])
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState('')

  const herlaadBron = useCallback(() => {
    D.laadBron(bronId).then(setBron).catch(() => setBron(null))
  }, [bronId])

  useEffect(() => {
    herlaadBron()
    D.laadNotities('bron', bronId).then(setNotities).catch(() => {})
  }, [herlaadBron, bronId, tik])

  const haalOp = async (ververs = false) => {
    if (!bron) return
    setLaden(true)
    setFout('')
    try {
      const r = await D.leesBron(bron.url)
      if (r.fout) {
        setFout(r.fout)
        await D.bewaarBronPagina(bron.id, { fout: r.fout })
      } else {
        await D.bewaarBronPagina(bron.id, { pagina_titel: r.titel, pagina_tekst: r.tekst })
      }
      herlaadBron()
      herlaad?.()
    } catch (e) {
      setFout(String(e.message || e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    if (bron && !bron.pagina_tekst && !bron.fout && !laden) haalOp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bron?.id])

  if (!bron)
    return (
      <main className="hoofd">
        <div className="hoofd-binnen">
          <div className="leeg-melding">Deze bron is er niet (meer).</div>
        </div>
      </main>
    )

  const zetStatus = async (s) => {
    await D.zetBronStatus(bron.id, s)
    herlaadBron()
    herlaad?.()
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen">
          <Kruimel
            naar={naar}
            delen={[
              { tekst: 'Overzicht', naar: '#/' },
              { tekst: 'Bronnen', naar: '#/bronnen' },
              { tekst: (bron.titel || bron.url).slice(0, 60) },
            ]}
          />
          <div className="lezer-bron">
            <div className="titel">{bron.pagina_titel || bron.titel || bron.url}</div>
            <div className="url">
              <a href={bron.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                {bron.url}
              </a>
            </div>
            <div className="lezer-acties">
              {['ongelezen', 'gelezen', 'kernbron'].map((s) => (
                <button key={s} className={`statusknop ${bron.status === s ? 'aan' : ''}`} onClick={() => zetStatus(s)}>
                  {s === 'kernbron' ? '★ kernbron' : s}
                </button>
              ))}
              <button className="knop zacht" style={{ marginLeft: 'auto' }} onClick={() => haalOp(true)} disabled={laden}>
                {laden ? 'Ophalen…' : '↻ Opnieuw ophalen'}
              </button>
            </div>
          </div>

          {laden && <div className="leeg-melding">De pagina wordt opgehaald…</div>}
          {fout && !laden && (
            <div className="pl-kaart" style={{ borderColor: 'rgba(192,50,33,0.3)' }}>
              <div className="t">Ophalen mislukte</div>
              <div className="d">{fout}</div>
              <button className="knop" onClick={() => haalOp(true)}>
                Opnieuw proberen
              </button>
            </div>
          )}
          {!laden && bron.pagina_tekst && (
            <div className="lezer-tekst">{bron.pagina_tekst.slice(0, 120000)}</div>
          )}
          {!laden && !bron.pagina_tekst && !fout && <div className="leeg-melding">Nog niets opgehaald.</div>}
        </div>
      </main>
      <aside className="inspector breed">
        <div className="insp-titel">Jouw notitie bij deze bron</div>
        <Notities doelType="bron" doelId={bron.id} auteur={naam} notities={notities} onWijzig={() => D.laadNotities('bron', bron.id).then(setNotities)} />
        <div className="insp-titel">Details</div>
        <div className="insp-kaart">
          <div className="insp-rij">
            <span className="k">Dagdeel</span>
            <span className="v">{bron.blok_id}</span>
          </div>
          <div className="insp-rij">
            <span className="k">Status</span>
            <span className="v">{bron.status}</span>
          </div>
          {bron.opgehaald_op && (
            <div className="insp-rij">
              <span className="k">Opgehaald</span>
              <span className="v">{D.datumKort(bron.opgehaald_op)}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

/* ---------------------------------------------------------------- planning */

function PlanningPagina({ naar, beslissingen, validaties, voorstellen, naam, herlaad }) {
  const [vSoort, setVSoort] = useState('research')
  const [vTitel, setVTitel] = useState('')
  const [vDetail, setVDetail] = useState('')

  const beslis = async (b) => {
    const besluit = prompt(`Wat is het besluit over "${b.titel}"?`, b.besluit || '')
    if (besluit === null) return
    await D.zetBeslissing(b.id, { status: 'beslist', besluit })
    herlaad?.()
  }

  const heropen = async (b) => {
    await D.zetBeslissing(b.id, { status: 'open', besluit: null })
    herlaad?.()
  }

  const klaarValidatie = async (v, klaar) => {
    await D.zetValidatie(v.id, { status: klaar ? 'klaar' : 'open' })
    herlaad?.()
  }

  const voorstelToe = async () => {
    if (!vTitel.trim()) return
    await D.voegVoorstelToe({ soort: vSoort, titel: vTitel.trim(), detail: vDetail.trim(), auteur: naam })
    setVTitel('')
    setVDetail('')
    herlaad?.()
  }

  const zetVoorstelStatus = async (v, status) => {
    await D.zetVoorstel(v.id, { status })
    herlaad?.()
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen" style={{ maxWidth: 820 }}>
          <div className="pagina-kop">
            <h1>Planning</h1>
            <div className="onder">
              <span>beslissingen, validaties en voorstellen voor de hele editie</span>
            </div>
          </div>

          <div className="insp-titel">Open beslissingen</div>
          {beslissingen.filter((b) => b.status !== 'beslist').length === 0 && (
            <div className="leeg-tekst">Geen open beslissingen.</div>
          )}
          {beslissingen
            .filter((b) => b.status !== 'beslist')
            .map((b) => (
              <div className="pl-kaart" key={b.id}>
                <div className="kop">
                  <div className="t">{b.titel}</div>
                  <Pill soort="Concept">open</Pill>
                </div>
                <div className="d">{b.detail}</div>
                <div className="acties">
                  <button className="knop primair" onClick={() => beslis(b)}>
                    Beslecht
                  </button>
                  <span className="meta-klein" style={{ alignSelf: 'center' }}>
                    eigenaar {b.eigenaar}
                  </span>
                </div>
              </div>
            ))}

          {beslissingen.filter((b) => b.status === 'beslist').length > 0 && (
            <>
              <div className="insp-titel">Beslecht</div>
              {beslissingen
                .filter((b) => b.status === 'beslist')
                .map((b) => (
                  <div className="pl-kaart" key={b.id} style={{ opacity: 0.85 }}>
                    <div className="kop">
                      <div className="t">{b.titel}</div>
                      <Pill soort="Final">beslist</Pill>
                    </div>
                    <div className="d">{b.besluit}</div>
                    <div className="acties">
                      <button className="knop zacht" onClick={() => heropen(b)}>
                        Heropen
                      </button>
                    </div>
                  </div>
                ))}
            </>
          )}

          <div className="insp-titel" style={{ marginTop: 26 }}>
            Validaties
          </div>
          {validaties.map((v) => (
            <div className="pl-kaart" key={v.id} style={{ opacity: v.status === 'klaar' ? 0.7 : 1 }}>
              <div className="kop">
                <div className="t">{v.onderwerp}</div>
                <Pill soort={v.status === 'klaar' ? 'Final' : 'Concept'}>{v.status}</Pill>
              </div>
              <div className="d">
                {v.wie} · {v.wanneer}
                {v.detail ? ` · ${v.detail}` : ''}
              </div>
              <div className="acties">
                {v.status !== 'klaar' ? (
                  <button className="knop" onClick={() => klaarValidatie(v, true)}>
                    ✓ Gevalideerd
                  </button>
                ) : (
                  <button className="knop zacht" onClick={() => klaarValidatie(v, false)}>
                    Heropen
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="insp-titel" style={{ marginTop: 26 }}>
            Voorstellen
          </div>
          <div className="pl-kaart">
            <div className="kop">
              <div className="t">Nieuw voorstel</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                ['research', '🔎 nieuwe research'],
                ['verschuiving', '↔️ verschuiving in de opbouw'],
                ['inhoud', '✏️ inhoudelijke aanvulling'],
                ['vraag', '❓ vraag voor het team'],
              ].map(([v, label]) => (
                <button key={v} className={`fil ${vSoort === v ? 'aan' : ''}`} onClick={() => setVSoort(v)}>
                  {label}
                </button>
              ))}
            </div>
            <input
              style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', marginBottom: 8 }}
              placeholder="Korte titel"
              value={vTitel}
              onChange={(e) => setVTitel(e.target.value)}
            />
            <textarea
              style={{ width: '100%', border: '1px solid var(--line-stevig)', borderRadius: 9, padding: '9px 12px', minHeight: 70, marginBottom: 10, resize: 'vertical' }}
              placeholder="Wat wil je voorstellen of vragen? Hoe concreter, hoe sneller het opgepakt wordt."
              value={vDetail}
              onChange={(e) => setVDetail(e.target.value)}
            />
            <button className="knop primair" onClick={voorstelToe} disabled={!vTitel.trim()}>
              Voorstel toevoegen
            </button>
          </div>

          {voorstellen.length === 0 && <div className="leeg-tekst">Nog geen voorstellen.</div>}
          {voorstellen.map((v) => (
            <div className="pl-kaart" key={v.id} style={{ opacity: v.status === 'open' ? 1 : 0.65 }}>
              <div className="kop">
                <Pill soort="accent">{v.soort}</Pill>
                <div className="t">{v.titel}</div>
                <Pill soort={v.status === 'open' ? 'Concept' : 'Final'}>{v.status}</Pill>
              </div>
              {v.detail && <div className="d">{v.detail}</div>}
              <div className="acties">
                <span className="meta-klein" style={{ alignSelf: 'center' }}>
                  {v.auteur} · {D.datumKort(v.created_at)}
                </span>
                {v.status === 'open' ? (
                  <button className="knop" onClick={() => zetVoorstelStatus(v, 'gedaan')}>
                    ✓ Gedaan
                  </button>
                ) : (
                  <button className="knop zacht" onClick={() => zetVoorstelStatus(v, 'open')}>
                    Heropen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
      <aside className="inspector">
        <div className="insp-titel">Waarvoor dient dit</div>
        <div className="insp-kaart" style={{ lineHeight: 1.55 }}>
          Alles wat uit de studie komt en een keuze of actie vraagt, komt hier samen. Beslissingen zijn van jou; validaties
          wachten op Jurgen, Anthony of Bjorn. Voorstellen — nieuwe research, een verschuiving of een inhoudelijke
          aanvulling — kan iedereen toevoegen.
        </div>
      </aside>
    </>
  )
}
