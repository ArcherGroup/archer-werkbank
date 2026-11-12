import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as D from '../lib/data'
import { sb } from '../lib/supabase'
import { GEDEELDE_AGENT_INGESCHAKELD, statusGedeeldeAgent, laadGedeeldeAgent, vraagGedeeldeAgent, beoordeelGedeeldeAgent } from '../lib/agent-api'
import { renderMd, splitsFrontmatter } from '../lib/md'

import { Notities } from '../components/notities'
import { Pill } from '../components/basis'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { Skelet, SkeletAlinea } from '../components/skelet'
import { Dialoog } from '../components/dialoog'
import { meld } from '../components/meldingen'
import { useSneltoets } from '../hooks/useSneltoets'
import { useEscape } from '../hooks/useEscape'
import { useTraagLaden } from '../hooks/useTraagLaden'
import { useOnbewaard } from '../hooks/useOnbewaard'
import { beslissingenBijDocument } from '../lib/beslissing-review'
import { inhoudVoorDownload, voegInterneLinkIn, valideerNotitieAnker } from '../lib/document'
import { markeerAnkers, ruimAnkersOp } from '../lib/comment-markers'
import { piekDoel, wisDoel } from '../lib/comments'
import { leesSecties, plekVanKlik } from '../lib/secties'
import { WerkboekBalk } from '../components/werkboek-balk'
import { WerkboekWalkthrough } from '../components/werkboek-walkthrough'

export function DocPagina({ docId, naar, naam, blokken, bronnen, documentenMeta = [], beslissingen = [], herlaad, tik, opWalkthrough, opLos, opAntwoord, opAfwijzen, opHeropenen, opBewaren, lokaleComments = [] }) {
  const [doc, setDoc] = useState(null)
  const [geladen, setGeladen] = useState(false)
  const [modus, setModus] = useState('lees') // lees | bewerk | historiek
  const [klad, setKlad] = useState('')
  const [basis, setBasis] = useState('')
  const [historiek, setHistoriek] = useState([])
  const [notities, setNotities] = useState([])
  const [notitiesOpen, setNotitiesOpen] = useState(false)
  const notitiesKnopRef = useRef(null)
  const notitiesPaneelRef = useRef(null)
  const [agentIngelogd, setAgentIngelogd] = useState(false)
  const [agentOpdrachten, setAgentOpdrachten] = useState({})
  const [agentStatusGereed, setAgentStatusGereed] = useState(false)
  const [agentActief, setAgentActief] = useState(false)
  const [agentFout, setAgentFout] = useState('')
  const huidigDocId = useRef(docId)
  const agentAanvraag = useRef(0)
  const agentIngelogdRef = useRef(agentIngelogd)
  huidigDocId.current = docId
  agentIngelogdRef.current = agentIngelogd
  const [tekstselectie, setTekstselectie] = useState('')
  const [notitieAnker, setNotitieAnker] = useState(null)
  const [ankerFout, setAnkerFout] = useState('')
  const [actiefComment, setActiefComment] = useState(null)
  const [flits, setFlits] = useState(null)
  const popoverRef = useRef(null)
  const artikelRef = useRef(null)
  // Wat nog niet verstuurd is, staat er toch: het gesprek mag niet doodvallen.
  const notitiesHier = useMemo(
    () => [...notities, ...(Array.isArray(lokaleComments) ? lokaleComments : []).filter((n) => String(n.doel_id) === String(docId))],
    [notities, lokaleComments, docId],
  )
  const [actieveSectie, setActieveSectie] = useState(null)
  const [laatsteKlik, setLaatsteKlik] = useState(null)
  const laatsteKlikRef = useRef(null)
  const [wwOpen, setWwOpen] = useState(false)
  const [wwStart, setWwStart] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [vraag, setVraag] = useState(null) // { soort: 'herstel' | 'weggooien', versie? }
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkSoort, setLinkSoort] = useState('document')
  const [linkZoek, setLinkZoek] = useState('')
  const [linkFout, setLinkFout] = useState('')
  const editorRef = useRef(null)
  const bewaarRef = useRef(null)
  const modusRef = useRef(modus)
  const kladRef = useRef(klad)
  const basisRef = useRef(basis)
  modusRef.current = modus
  kladRef.current = klad
  basisRef.current = basis

  const traag = useTraagLaden(!geladen)
  const sluitNotities = useCallback(() => {
    setNotitiesOpen(false)
    notitiesKnopRef.current?.focus()
  }, [])
  useEscape(sluitNotities, notitiesOpen)
  useEscape(() => setActiefComment(null), !!actiefComment)
  useEffect(() => {
    if (notitiesOpen) notitiesPaneelRef.current?.querySelector('.doc-notities-sluit')?.focus()
  }, [notitiesOpen])

  const herlaadDoc = useCallback(async ({ respecteerKlad = false } = {}) => {
    try {
      const d = await D.laadDocument(docId)
      if (huidigDocId.current !== docId) return
      const lokaalVies = modusRef.current === 'bewerk' && kladRef.current !== basisRef.current
      // Een realtime-wijziging ergens anders mag nooit stil een lopende
      // bewerking overschrijven of de bewaarbasis vooruitzetten.
      if (respecteerKlad && lokaalVies) {
        if ((d.inhoud ?? '') !== basisRef.current) {
          meld('Dit stuk is elders gewijzigd. Je lokale tekst blijft staan; download je klad en herlaad bewust.', { fout: true })
        }
        return
      }
      setDoc(d)
      setBasis(d.inhoud ?? '')
      setKlad(d.inhoud ?? '')
      setFout('')
    } catch (e) {
      if (huidigDocId.current !== docId) return
      const lokaalVies = modusRef.current === 'bewerk' && kladRef.current !== basisRef.current
      if (respecteerKlad && lokaalVies) {
        setFout('Verversen mislukte. Je klad blijft behouden; download het indien nodig.')
      } else {
        setDoc(null)
        setFout('Dit document kon niet geladen worden.')
      }
    } finally {
      if (huidigDocId.current === docId) setGeladen(true)
    }
  }, [docId])

  useEffect(() => {
    setGeladen(false)
    setTekstselectie('')
    setNotitieAnker(null)
    setNotitiesOpen(false)
    setAnkerFout('')
    herlaadDoc()
    D.laadNotities('document', docId).then((n) => { if (huidigDocId.current === docId) setNotities(n) }).catch(() => {})
  }, [herlaadDoc, docId])

  // Realtime: alleen de serverversie/metadata verversen, nooit een lopende
  // bewerking overschrijven.
  useEffect(() => {
    if (!tik) return
    herlaadDoc({ respecteerKlad: true })
    D.laadNotities('document', docId).then((n) => { if (huidigDocId.current === docId) setNotities(n) }).catch(() => {})
  }, [tik, herlaadDoc, docId])

  // Pinnen op het scherm: elke open comment met een anker krijgt een mark en een nummer.
  const openPin = useCallback((id) => {
    const note = notities.find((n) => String(n.id) === String(id))
    const pin = artikelRef.current?.querySelector(`button.comment-pin[data-comment="${id}"]`)
    if (!note || !pin) return
    const r = pin.getBoundingClientRect()
    setActiefComment({
      note,
      top: Math.max(72, Math.min(r.bottom + 8, window.innerHeight - 300)),
      left: Math.max(12, Math.min(r.left, window.innerWidth - 348)),
    })
  }, [notities])

  const bodyVoorAnkers = doc?.inhoud ? splitsFrontmatter(doc.inhoud).body : ''

  /* Eén scrollbeweging voor alle sprongen: naar een tag, een pin of een klikplek.
     De pagina scrolt in .hoofd, niet in het venster; zelfde berekening, animatie
     in plaats van een sprong, en meteen naar de eindpositie bij reduced motion. */
  const scrollNaarElement = useCallback((el, { marge = 26 } = {}) => {
    if (!el) return false
    const hoofd = el.closest('.hoofd')
    if (!hoofd) { el.scrollIntoView?.({ block: 'center' }); return true }
    const van = hoofd.scrollTop
    const doel = Math.max(0, el.getBoundingClientRect().top - hoofd.getBoundingClientRect().top + van - marge)
    const ver = doel - van
    if (Math.abs(ver) < 2) return true
    const zacht = !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (!zacht) { hoofd.scrollTop = doel; return true }
    const start = performance.now()
    const duur = Math.min(560, 180 + Math.abs(ver) * 0.35)
    const stap = (t) => {
      const p = Math.min(1, (t - start) / duur)
      hoofd.scrollTop = van + ver * (1 - Math.pow(1 - p, 3))
      if (p < 1) requestAnimationFrame(stap)
    }
    requestAnimationFrame(stap)
    return true
  }, [])

  const flitsElement = useCallback((el) => {
    if (!el) return
    el.classList.add('werkbank-flits')
    setTimeout(() => el.classList.remove('werkbank-flits'), 1900)
  }, [])

  const springNaarSectie = useCallback((sectie) => {
    const el = artikelRef.current?.querySelector(`#sec-${sectie?.id}`) || artikelRef.current?.querySelector(`[data-sectie="${sectie?.id}"]`)
    if (!el) return false
    scrollNaarElement(el, { marge: 58 })
    flitsElement(el)
    setActieveSectie(sectie.id)
    return true
  }, [scrollNaarElement, flitsElement])

  /* Naar de zin die iemand klikte of die in een comment wordt aangehaald. */
  const springNaarTekst = useCallback((fragment) => {
    const doel = String(fragment || '').replace(/\s+/g, ' ').trim()
    if (!doel || !artikelRef.current) return false
    const blokken = artikelRef.current.querySelectorAll('p, li, blockquote, h2, h3, td')
    for (const blok of blokken) {
      const tekst = (blok.textContent || '').replace(/\s+/g, ' ')
      if (tekst.includes(doel) || (doel.length > 24 && tekst.includes(doel.slice(0, 40)))) {
        scrollNaarElement(blok, { marge: 90 })
        flitsElement(blok)
        return true
      }
    }
    return false
  }, [scrollNaarElement, flitsElement])

  const springNaarAnker = useCallback((anker) => {
    if (!anker) return false
    const pin = [...(artikelRef.current?.querySelectorAll('button.comment-pin') || [])]
      .find((p) => (p.closest('mark')?.textContent || '').includes(anker))
    if (pin) {
      const mark = pin.closest('mark') || pin.previousElementSibling
      scrollNaarElement(mark || pin, { marge: 120 })
      mark?.classList.add('comment-flits')
      setTimeout(() => mark?.classList.remove('comment-flits'), 2600)
      return true
    }
    return springNaarTekst(anker)
  }, [scrollNaarElement, springNaarTekst])

  /* Waar de vorige lezer klikte: het stuk en de zin, geen pixelpositie. */
  const onthoudKlik = useCallback((e) => {
    const blok = e.target?.closest?.('p, li, h2, h3, blockquote, td')
    if (!blok || !artikelRef.current?.contains(blok)) return
    const plek = plekVanKlik({ markdown: bodyVoorAnkers, element: blok, documentId: docId, gebruiker: naam })
    if (!plek) return
    if (laatsteKlikRef.current?.fragment === plek.fragment) return
    laatsteKlikRef.current = plek
    setLaatsteKlik(plek)
    try { localStorage.setItem(`werkbank_klik_${docId}`, JSON.stringify(plek)) } catch { /* zonder opslag werkt het ook */ }
    D.bewaarKlik({ document_id: plek.document_id, gebruiker: plek.gebruiker, sectie: plek.sectie, fragment: plek.fragment }).catch(() => {})
  }, [bodyVoorAnkers, docId, naam])

  const secties = useMemo(() => leesSecties(bodyVoorAnkers), [bodyVoorAnkers])

  useEffect(() => {
    const root = artikelRef.current
    if (!root || modus !== 'lees' || !secties.length) return
    const koppen = root.querySelectorAll('h2, h3')
    koppen.forEach((el, i) => {
      const s = secties[i]
      if (!s) return
      el.id = `sec-${s.id}`
      el.dataset.sectie = s.id
    })
  }, [secties, modus, bodyVoorAnkers])

  // De actieve tag loopt mee met het scrollen, niet met de laatste klik.
  useEffect(() => {
    const root = artikelRef.current
    const hoofd = root?.closest('.hoofd')
    if (!root || !hoofd || modus !== 'lees' || !secties.length) return
    let frame = 0
    const meet = () => {
      frame = 0
      const grens = hoofd.getBoundingClientRect().top + 70
      let actief = secties[0].id
      for (const s of secties) {
        const el = root.querySelector(`#sec-${s.id}`)
        if (el && el.getBoundingClientRect().top <= grens) actief = s.id
      }
      setActieveSectie((oud) => (oud === actief ? oud : actief))
    }
    const bij = () => { if (!frame) frame = requestAnimationFrame(meet) }
    meet()
    hoofd.addEventListener('scroll', bij, { passive: true })
    return () => {
      hoofd.removeEventListener('scroll', bij)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [secties, modus, bodyVoorAnkers])

  // Laatste klik: eerst wat deze browser zag, dan wat de gedeelde werkbank weet.
  useEffect(() => {
    let actief = true
    setLaatsteKlik(null)
    laatsteKlikRef.current = null
    try {
      const lokaal = JSON.parse(localStorage.getItem(`werkbank_klik_${docId}`) || 'null')
      if (lokaal?.fragment) { setLaatsteKlik(lokaal); laatsteKlikRef.current = lokaal }
    } catch { /* ongeldige opslag telt niet */ }
    D.laadLaatsteKlik(docId)
      .then((rij) => { if (actief && rij?.fragment) { setLaatsteKlik(rij); laatsteKlikRef.current = rij } })
      .catch(() => {})
    return () => { actief = false }
  }, [docId])

  useEffect(() => {
    const root = artikelRef.current
    if (!root || modus !== 'lees') return
    const eigen = notities
      .filter((n) => n.doel_type === 'document' && String(n.doel_id) === String(docId) && n.anker && !n.opgelost && !n.lokaal && n.parent_id == null)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id))
    markeerAnkers(root, eigen, { opKlik: openPin })
    return () => ruimAnkersOp(root)
  }, [bodyVoorAnkers, notities, modus, docId, openPin])

  const springNaar = useCallback((id) => {
    const pin = artikelRef.current?.querySelector(`button.comment-pin[data-comment="${id}"]`)
    if (!pin) return false
    // De pagina scrolt in .hoofd, niet in het venster. Na de eerste render is de
    // hoogte soms nog niet definitief; daarom twee keer opnieuw mikken.
    const naarPin = () => scrollNaarElement(pin.closest('mark') || pin, { marge: 140 })
    naarPin()
    setTimeout(naarPin, 180)
    const mark = pin.closest('mark') || pin.previousElementSibling
    mark?.classList.add('comment-flits')
    setTimeout(() => mark?.classList.remove('comment-flits'), 2600)
    setFlits(String(id))
    setTimeout(() => setFlits(null), 2600)
    setTimeout(() => { naarPin(); openPin(id) }, 300)
    return true
  }, [openPin, scrollNaarElement])

  // Vanuit de comments-balk: zodra het stuk en de comments er zijn, naar de pin.
  useEffect(() => {
    if (!doc || !notities.length) return
    const doel = piekDoel()
    if (!doel || doel.doel_type !== 'document' || String(doel.doel_id) !== String(docId)) return
    const t = setTimeout(() => { if (springNaar(doel.id)) wisDoel() }, 90)
    return () => clearTimeout(t)
  }, [doc, notities, docId, springNaar])

  // Dezelfde pagina opnieuw openen levert geen routewissel op; het event doet de rest.
  useEffect(() => {
    const f = () => {
      const doel = piekDoel()
      if (!doel || doel.doel_type !== 'document' || String(doel.doel_id) !== String(docId)) return
      if (springNaar(doel.id)) wisDoel()
    }
    window.addEventListener('werkbank-comment', f)
    return () => window.removeEventListener('werkbank-comment', f)
  }, [docId, springNaar])

  useEffect(() => {
    if (!actiefComment) return
    const f = (e) => {
      if (popoverRef.current?.contains(e.target)) return
      if (e.target?.closest?.('button.comment-pin')) return
      setActiefComment(null)
    }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [actiefComment])

  useEffect(() => {
    if (!GEDEELDE_AGENT_INGESCHAKELD) return
    let geldig = true
    let authEvent = false
    const stelIn = (sessie) => { if (geldig) setAgentIngelogd(!!sessie?.user?.id && !!sessie?.access_token) }
    sb.auth.getSession().then(({ data }) => { if (!authEvent) stelIn(data?.session) }).catch(() => { if (!authEvent) stelIn(null) })
    const { data } = sb.auth.onAuthStateChange((_event, sessie) => { authEvent = true; stelIn(sessie) })
    return () => { geldig = false; data?.subscription?.unsubscribe() }
  }, [])

  const herlaadAgent = useCallback(async () => {
    if (!GEDEELDE_AGENT_INGESCHAKELD || !agentIngelogd) throw new Error('agent_niet_vrijgegeven')
    const aanvraag = ++agentAanvraag.current
    const nogGeldig = () => huidigDocId.current === docId && agentIngelogdRef.current && agentAanvraag.current === aanvraag
    try {
      const [actief, taken] = await Promise.all([
        statusGedeeldeAgent({ client: sb, ingeschakeld: true }),
        laadGedeeldeAgent(docId, { client: sb, ingeschakeld: true }),
      ])
      if (nogGeldig()) { setAgentActief(actief); setAgentOpdrachten(taken); setAgentStatusGereed(true); setAgentFout('') }
      return taken
    } catch (e) {
      if (nogGeldig()) { setAgentStatusGereed(false); setAgentFout('Agentstatus niet geladen. Controleer je verbinding en probeer opnieuw.') }
      throw e
    }
  }, [docId, agentIngelogd])

  useEffect(() => {
    agentAanvraag.current += 1
    setAgentOpdrachten({})
    setAgentStatusGereed(false)
    setAgentActief(false)
    setAgentFout('')
    if (!GEDEELDE_AGENT_INGESCHAKELD || !agentIngelogd) return
    herlaadAgent().catch(() => {})
    const timer = window.setInterval(() => herlaadAgent().catch(() => {}), 15000)
    return () => { agentAanvraag.current += 1; window.clearInterval(timer) }
  }, [herlaadAgent, agentIngelogd])

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

  // Bescherm het concept bij navigatie en verversen, ook als een notitie
  // in de zijbalk onafhankelijk daarvan nog niet bewaard is.
  useOnbewaard(vies)

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
      const bericht = e?.message || ''
      setFout(/gewijzigd|teruggelezen/i.test(bericht)
        ? bericht
        : 'Bewaren kon niet worden bevestigd. Je klad staat er nog; controleer de actuele stand of download het eerst.')
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
    const blob = new Blob([inhoudVoorDownload(modus, klad, doc?.inhoud)], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${doc?.titel ?? 'document'}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (doc && doc.id !== docId) {
    return <main className="hoofd"><div className="hoofd-binnen"><Skelet breedte="38%" hoogte={22} straal={6} /><div style={{ height: 26 }} /><SkeletAlinea lijnen={4} /></div></main>
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
  const gekoppeldeBeslissingen = beslissingenBijDocument(doc, beslissingen, documentenMeta)
  const zoek = linkZoek.trim().toLocaleLowerCase('nl-BE')
  const linkResultaten = (linkSoort === 'document' ? documentenMeta.filter((d) => d.id !== doc.id) : bronnen || [])
    .filter((item) => `${item.titel || ''} ${item.blok_id || ''} ${item.url || ''}`.toLocaleLowerCase('nl-BE').includes(zoek))
  const voegLinkToe = (item) => {
    if (bezig || !editorRef.current) return
    try {
      const veld = editorRef.current
      const route = `#/${linkSoort === 'document' ? 'doc' : 'bron'}/${item.id}`
      const resultaat = voegInterneLinkIn(klad, veld.selectionStart, veld.selectionEnd, item.titel || item.url || 'Bron', route)
      setKlad(resultaat.tekst)
      setLinkFout('')
      requestAnimationFrame(() => { veld.focus(); veld.setSelectionRange(resultaat.positie, resultaat.positie) })
    } catch (e) {
      setLinkFout(e?.message || 'De link kon niet worden ingevoegd.')
    }
  }
  const { front, body } = splitsFrontmatter(doc.inhoud ?? '')
  const onthoudSelectie = () => {
    const selectie = window.getSelection()
    if (!selectie || !artikelRef.current?.contains(selectie.anchorNode) || !artikelRef.current?.contains(selectie.focusNode)) return
    setTekstselectie(selectie.toString())
    setAnkerFout('')
  }
  const koppelSelectie = () => {
    try {
      setNotitieAnker(valideerNotitieAnker(doc.inhoud ?? '', tekstselectie))
      setAnkerFout('')
    } catch (e) {
      setAnkerFout(e.message)
    }
  }
  const agent = {
    beschikbaar: GEDEELDE_AGENT_INGESCHAKELD && agentStatusGereed && agentActief,
    ingelogd: agentIngelogd,
    opdrachten: agentStatusGereed ? agentOpdrachten : {},
    start: async ({ notitieId, documentId }) => {
      const id = await vraagGedeeldeAgent(notitieId, documentId, { client: sb, ingeschakeld: GEDEELDE_AGENT_INGESCHAKELD })
      const gelezen = await herlaadAgent()
      if (gelezen[notitieId]?.id !== id) throw new Error('opdracht_niet_bevestigd')
    },
    beoordeel: async ({ voorstelId, notitieId, besluit }) => {
      const bekekenVoorstel = agentStatusGereed ? agentOpdrachten[notitieId] : null
      const resultaat = await beoordeelGedeeldeAgent(voorstelId, besluit, { client: sb, ingeschakeld: GEDEELDE_AGENT_INGESCHAKELD, bekekenVoorstel })
      const gelezen = await herlaadAgent()
      if (gelezen[notitieId]?.voorstel_id !== voorstelId || gelezen[notitieId]?.beoordeling?.besluit !== resultaat) throw new Error('beoordeling_niet_bevestigd')
      if (huidigDocId.current === docId && resultaat === 'toegepast') {
        await herlaadDoc({ respecteerKlad: true })
        herlaad?.()
      }
    },
  }

  return (
    <>
      <main className="hoofd">
        <div className="hoofd-binnen">
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

          {gekoppeldeBeslissingen.length > 0 && <div className="doc-beslislinks"><span className="meta-klein">Gekoppeld aan beslissing</span>{gekoppeldeBeslissingen.map((b) => <button key={b.id} className="knop zacht" onClick={() => naar(`#/beslissing/${b.id}`)}>{b.titel}</button>)}</div>}

          <div className="knoprij">
            <button type="button" ref={notitiesKnopRef} className="knop doc-notities-knop" aria-controls="doc-notities-paneel" aria-expanded={notitiesOpen} onClick={() => setNotitiesOpen(true)}>
              <Icoon naam="info" maat={14} /> Notities {notities.length ? `(${notities.length})` : ''}
            </button>
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
                <button className="knop" onClick={() => setLinkOpen((o) => !o)} aria-expanded={linkOpen} aria-controls="doc-linkkiezer" disabled={bezig}>
                  Koppel pagina of bron
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
            <WerkboekBalk
              secties={secties}
              actiefId={actieveSectie}
              opSectie={springNaarSectie}
              opVorige={() => {
                const i = secties.findIndex((s) => s.id === actieveSectie)
                if (i > 0) springNaarSectie(secties[i - 1])
              }}
              opVolgende={() => {
                const i = secties.findIndex((s) => s.id === actieveSectie)
                if (i >= 0 && i + 1 < secties.length) springNaarSectie(secties[i + 1])
              }}
              laatste={laatsteKlik}
              opLaatste={() => laatsteKlik && springNaarTekst(laatsteKlik.fragment)}
              aantalComments={notitiesHier.filter((n) => !n.opgelost && !n.afgewezen && n.parent_id == null).length}
              opWalkthrough={() => { setWwStart(null); setWwOpen(true) }}
            />
          )}

          {modus === 'lees' && (
            <article className="md" ref={artikelRef} onMouseUp={onthoudSelectie} onKeyUp={onthoudSelectie} onClick={onthoudKlik}>
              {front && <div className="frontmatter">{front}</div>}
              <div dangerouslySetInnerHTML={{ __html: renderMd(body) }} />
            </article>
          )}

          {modus === 'bewerk' && (
            <div className="bewerker">
              {linkOpen && <section id="doc-linkkiezer" className="doc-linkkiezer" aria-label="Pagina of bron koppelen">
                <div><strong>Koppel vanuit deze tekst</strong><p>Selecteer eerst woorden in de editor, of voeg de titel in op de cursorpositie. Je kunt meerdere koppelingen na elkaar toevoegen.</p></div>
                <div className="seg" role="group" aria-label="Soort koppeling">
                  <button type="button" className={`fil ${linkSoort === 'document' ? 'aan' : ''}`} aria-pressed={linkSoort === 'document'} onClick={() => setLinkSoort('document')}>Pagina's</button>
                  <button type="button" className={`fil ${linkSoort === 'bron' ? 'aan' : ''}`} aria-pressed={linkSoort === 'bron'} onClick={() => setLinkSoort('bron')}>Bronnen</button>
                </div>
                <label className="veldlabels" htmlFor="doc-link-zoek">Zoek op titel of dagdeel</label>
                <input id="doc-link-zoek" value={linkZoek} onChange={(e) => setLinkZoek(e.target.value)} placeholder="Zoek een pagina of bron" />
                {linkFout && <p role="alert" className="veld-fout">{linkFout}</p>}
                <div className="doc-linkresultaten">{linkResultaten.slice(0, 20).map((item) => <button key={item.id} type="button" onClick={() => voegLinkToe(item)} disabled={bezig}><strong>{item.titel || item.url || 'Naamloze bron'}</strong><span>{item.blok_id || 'Algemeen'}</span></button>)}</div>
                <p className="meta-klein">{linkResultaten.length ? `${Math.min(20, linkResultaten.length)} van ${linkResultaten.length} resultaten` : 'Geen resultaten voor deze zoekopdracht.'}</p>
              </section>}
              <textarea
                ref={editorRef}
                readOnly={bezig}
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

      {actiefComment && (
        <div ref={popoverRef} className="comment-pop" style={{ top: actiefComment.top, left: actiefComment.left }} role="dialog" aria-label={`Comment van ${actiefComment.note.auteur}`}>
          <div className="comment-pop-kop">
            <span className="comment-pop-wie" style={{ background: D.kleurVoor(actiefComment.note.auteur) }} aria-hidden="true">{D.initialen(actiefComment.note.auteur)}</span>
            <b>{actiefComment.note.auteur}</b>
            <span className="comment-pop-datum">{D.datumKort(actiefComment.note.created_at)}</span>
            <button type="button" className="comment-pop-sluit" onClick={() => setActiefComment(null)} aria-label="Comment sluiten">
              <Icoon naam="sluiten" maat={13} />
            </button>
          </div>
          {actiefComment.note.anker && <blockquote>{actiefComment.note.anker}</blockquote>}
          <p>{actiefComment.note.tekst}</p>
          <div className="comment-pop-acties">
            <button type="button" className="knop zacht" onClick={() => { opWalkthrough?.(actiefComment.note.id); setActiefComment(null) }}>In de walkthrough</button>
            <button type="button" className="knop" onClick={async () => {
              try { await opLos?.(actiefComment.note); setActiefComment(null) } catch { meld('Oplossen mislukte. Probeer opnieuw.', { fout: true }) }
            }}>Los op</button>
          </div>
        </div>
      )}

      <aside id="doc-notities-paneel" ref={notitiesPaneelRef} className={`inspector doc-inspector ${notitiesOpen ? 'open' : ''}`} aria-label="Notities en bronnen bij dit stuk">
        <button type="button" className="knop doc-notities-sluit" onClick={sluitNotities}>Sluit notities</button>
        <div className="insp-titel">Notities bij dit stuk</div>
        <div className="notitie-selectie">
          <p>Selecteer tekst in het stuk om je notitie aan een passage te koppelen.</p>
          <button className="knop zacht" type="button" onClick={koppelSelectie} disabled={!tekstselectie || modus !== 'lees'}>Notitie bij selectie</button>
          {ankerFout && <p className="veld-fout" role="alert">{ankerFout}</p>}
        </div>
        {agentFout && <p className="veld-fout" role="alert">{agentFout}</p>}
        <Notities
          doelType="document"
          doelId={doc.id}
          auteur={naam}
          notities={notitiesHier}
          agent={agent}
          opBewaren={opBewaren}
          opToon={(n) => { sluitNotities(); setTimeout(() => springNaarAnker(n.anker), 80) }}
          opAntwoord={opAntwoord}
          opLos={opLos}
          opAfwijzen={opAfwijzen}
          opHeropenen={opHeropenen}
          anker={notitieAnker}
          onAnkerWissen={(vorig) => setNotitieAnker((huidig) => huidig === vorig ? null : huidig)}
          onWijzig={() => D.laadNotities('document', doc.id).then((n) => { if (huidigDocId.current === doc.id) setNotities(n) }).catch(() => meld('Notities verversen mislukte.', { fout: true }))}
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

      <WerkboekWalkthrough
        open={wwOpen}
        startId={wwStart}
        notities={notitiesHier}
        body={bodyVoorAnkers}
        secties={secties}
        naam={naam}
        titel={`${doc?.titel ?? 'stuk'} · ${secties.length} stukken`}
        opSluiten={() => setWwOpen(false)}
        opSpring={(n) => {
          setWwOpen(false)
          setTimeout(() => springNaarAnker(n.anker), 60)
        }}
        opLos={opLos}
        opAntwoord={opAntwoord}
        opAfwijzen={opAfwijzen}
        opHeropenen={opHeropenen}
      />

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
