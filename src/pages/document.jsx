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
import { inhoudVoorDownload, voegInterneLinkIn, ankerUitSelectie } from '../lib/document'
import { markeerAnkers, ruimAnkersOp, bouwTekstIndex } from '../lib/comment-markers'
import { voegCommentsSamen } from '../lib/comment-samenvoegen'
import { zoekCommentPassages } from '../lib/comment-navigatie'
import { piekDoel, wisDoel, telGesprekken, telOpen } from '../lib/comments'
import { leesSecties, plekVanKlik } from '../lib/secties'
import { WerkboekBalk } from '../components/werkboek-balk'
import { WerkboekWalkthrough } from '../components/werkboek-walkthrough'
import './document.css'

/* Dezelfde comment kan hier (nog) lokaal staan en tegelijk al als server-rij in
   `notities`/`gedeeldeComments` zitten (net gesynchroniseerd). Eén keer tellen,
   op id of anders op client_id. */
function samenVoegenComments(server, lokaal, docId) {
  const eigen = (lijst) => (Array.isArray(lijst) ? lijst : []).filter((n) => n.doel_type === 'document' && String(n.doel_id) === String(docId))
  return voegCommentsSamen(eigen(server), eigen(lokaal))
}

export function DocPagina({ docId, naar, naam, blokken, bronnen, documentenMeta = [], beslissingen = [], herlaad, tik, opWalkthrough, opLos, opAntwoord, opAfwijzen, opHeropenen, opBewaren, lokaleComments = [], gedeeldeComments = null }) {
  const [doc, setDoc] = useState(null)
  const [geladen, setGeladen] = useState(false)
  const [modus, setModus] = useState('lees') // lees | bewerk | historiek
  const [klad, setKlad] = useState('')
  const [basis, setBasis] = useState('')
  const [historiek, setHistoriek] = useState([])
  const [notities, setNotities] = useState([])
  const [notitiesOpen, setNotitiesOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState('comments')
  const [bronZoek, setBronZoek] = useState('')
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
  const [selectieActie, setSelectieActie] = useState(null) // { range, top, left } van een lopende tekstselectie
  const [notitieAnker, setNotitieAnker] = useState(null) // { anker, anker_context } | null
  const [ankerFout, setAnkerFout] = useState('')
  const [geselecteerdId, setGeselecteerdId] = useState(null) // het gesprek dat open staat in het paneel
  const [lichaamTekst, setLichaamTekst] = useState(null)
  const [gesprekSprong, setGesprekSprong] = useState(0)
  const laatsteSprong = useRef(null)
  const [commentPlek, setCommentPlek] = useState(null)
  const historieVoorAnker = useRef(null)
  const scrollFrame = useRef(0)
  useEffect(() => () => { if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current) }, [])
  const [focusTeller, setFocusTeller] = useState(0) // elke verhoging zet de focus weer op het invoerveld
  const artikelRef = useRef(null)
  // Wat nog niet verstuurd is, staat er toch: het gesprek mag niet doodvallen.
  // `gedeeldeComments` is leidend zodra de app hem meegeeft; zonder dat leest
  // deze pagina gewoon zijn eigen notities, zoals voorheen.
  const notitiesHier = useMemo(
    () => samenVoegenComments(gedeeldeComments ?? notities, lokaleComments, docId),
    [gedeeldeComments, notities, lokaleComments, docId],
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
  useEffect(() => {
    if (!notitiesOpen) return
    if (geselecteerdId != null) notitiesPaneelRef.current?.querySelector('.thread-antwoord input')?.focus()
    else if (!focusTeller) notitiesPaneelRef.current?.querySelector('.doc-notities-sluit')?.focus()
  }, [notitiesOpen, geselecteerdId, focusTeller])

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
    setSelectieActie(null)
    setNotitieAnker(null)
    setNotitiesOpen(false)
    setGeselecteerdId(null)
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

  // Eén gesprek openen: altijd in het paneel, altijd volledig (wortel + alle
  // antwoorden) — nooit de oude root-only popover. Of het nu via een pin, een
  // chip uit de comments-balk of een niet (meer) gevonden anker komt, het
  // gesprek zelf blijft bereikbaar; stil falen bestaat hier niet.
  const openGesprek = useCallback((id) => {
    setInspectorTab('comments')
    setCommentPlek(null)
    setGeselecteerdId(id == null ? null : String(id))
    setGesprekSprong((t) => t + 1)
    setNotitiesOpen(true)
  }, [])

  const bodyVoorAnkers = doc?.inhoud ? splitsFrontmatter(doc.inhoud).body : ''
  useEffect(() => {
    if (artikelRef.current && modus === 'lees') setLichaamTekst(bouwTekstIndex(artikelRef.current).tekst)
  }, [bodyVoorAnkers, modus])

  // Tekst selecteren (muis, toetsenbord of touch) toont één directe, toegankelijke
  // actie om er een comment bij te plaatsen — geen verborgen tweede stap.
  useEffect(() => {
    if (modus !== 'lees') return
    const f = () => {
      const sel = window.getSelection?.()
      const binnenArtikel = sel && artikelRef.current?.contains(sel.anchorNode) && artikelRef.current?.contains(sel.focusNode)
      if (!sel || sel.isCollapsed || !binnenArtikel || !sel.toString().trim()) {
        setSelectieActie(null)
        return
      }
      const range = sel.getRangeAt(0)
      const r = range.getBoundingClientRect()
      if (!r || (!r.width && !r.height)) return
      setSelectieActie({
        range: range.cloneRange(),
        top: Math.max(8, r.top - 44),
        left: Math.max(8, Math.min(r.left, window.innerWidth - 190)),
      })
    }
    document.addEventListener('selectionchange', f)
    return () => document.removeEventListener('selectionchange', f)
  }, [modus])

  /* Eén scrollbeweging voor alle sprongen: naar een tag, een pin of een klikplek.
     De pagina scrolt in .hoofd, niet in het venster; zelfde berekening, animatie
     in plaats van een sprong, en meteen naar de eindpositie bij reduced motion. */
  const scrollNaarElement = useCallback((el, { marge = 26 } = {}) => {
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current)
    if (!el) return false
    const hoofd = el.closest('.hoofd')
    if (!hoofd) { el.scrollIntoView?.({ block: 'center' }); return true }
    const van = hoofd.scrollTop
    const doel = Math.max(0, el.getBoundingClientRect().top - hoofd.getBoundingClientRect().top + van - marge)
    const ver = doel - van
    if (Math.abs(ver) < 2) return true
    const zacht = !document.hidden && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (!zacht) { hoofd.scrollTop = doel; return true }
    const start = performance.now()
    const duur = Math.min(560, 180 + Math.abs(ver) * 0.35)
    const stap = (t) => {
      const p = Math.min(1, (t - start) / duur)
      hoofd.scrollTop = van + ver * (1 - Math.pow(1 - p, 3))
      if (p < 1) scrollFrame.current = requestAnimationFrame(stap)
    }
    scrollFrame.current = requestAnimationFrame(stap)
    return true
  }, [])

  const flitsElement = useCallback((el) => {
    if (!el) return
    el.classList.add('werkbank-flits')
    setTimeout(() => el.classList.remove('werkbank-flits'), 1900)
  }, [])

  const springNaarCommentPlek = useCallback((plek) => {
    const index = bouwTekstIndex(artikelRef.current)
    const knoop = index.knopen.find((k) => k.start <= plek.start && k.end > plek.start)
    const el = knoop?.node.parentElement?.closest('p, li, blockquote, td, h2, h3') || knoop?.node.parentElement
    if (!el) return false
    scrollNaarElement(el, { marge: 100 })
    flitsElement(el)
    return true
  }, [scrollNaarElement, flitsElement])

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

  // Een citaat in het paneel aanklikken springt naar de tekst, maar sluit het
  // paneel alleen op smalle schermen (waar het paneel de tekst overlapt) —
  // op desktop blijft het gesprek gewoon open naast de tekst.
  const toonInTekst = useCallback((n) => {
    const smal = window.matchMedia?.('(max-width: 1100px)')?.matches
    openGesprek(n.client_id || n.id)
    if (smal) sluitNotities()
  }, [openGesprek, sluitNotities])

  /* Waar de vorige lezer klikte: het stuk en de zin, geen pixelpositie. */
  const onthoudKlik = useCallback((e) => {
    if (e.target?.closest?.('button.comment-pin')) return
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
    // Lokale comments (nog niet gesynchroniseerd) horen hier ook een pin te
    // krijgen — anders lijkt een net geplaatste comment verdwenen te zijn.
    const eigen = notitiesHier
      .filter((n) => n.doel_type === 'document' && String(n.doel_id) === String(docId) && n.anker && !n.opgelost && !n.afgewezen && n.parent_id == null)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id))
    markeerAnkers(root, eigen, { opKlik: openGesprek })
    return () => ruimAnkersOp(root)
  }, [bodyVoorAnkers, notitiesHier, modus, docId, openGesprek])

  useEffect(() => {
    if (geselecteerdId == null || modus !== 'lees' || !artikelRef.current) return
    const n = notitiesHier.find((n) => String(n.id) === geselecteerdId || String(n.client_id || '') === geselecteerdId)
    if (!n) return
    const sleutel = `${gesprekSprong}:${doc?.versie}:${n.client_id || n.id}`
    if (laatsteSprong.current === sleutel) return
    let geldig = true
    const zoek = async () => {
      const tekst = bouwTekstIndex(artikelRef.current).tekst
      let uit = zoekCommentPassages(tekst, n)
      if (!uit.plekken.length && n.anker) {
        try {
          const cacheKey = `${docId}:${doc?.versie}`
          if (historieVoorAnker.current?.key !== cacheKey) {
            historieVoorAnker.current = { key: cacheKey, promise: D.laadHistoriek(docId).then((rijen) => rijen.map((h) => {
              const html = renderMd(splitsFrontmatter(h.inhoud || '').body).replace(/<img\b[^>]*>/gi, '')
              const parsed = new window.DOMParser().parseFromString(html, 'text/html')
              return bouwTekstIndex(parsed.body).tekst
            })) }
          }
          const historiek = await historieVoorAnker.current.promise
          uit = zoekCommentPassages(tekst, n, { historiek })
        } catch { /* De onbekend-status blijft zichtbaar; geen willekeurige gok. */ }
      }
      if (!geldig || huidigDocId.current !== docId) return
      laatsteSprong.current = sleutel
      setCommentPlek({ ...uit, index: 0 })
      setAnkerFout('')
      if (uit.plekken.length) springNaarCommentPlek(uit.plekken[0])
    }
    zoek()
    return () => { geldig = false }
  }, [geselecteerdId, gesprekSprong, notitiesHier, docId, doc?.versie, modus, springNaarCommentPlek])


  // Vanuit de comments-balk, de walkthrough of dezelfde pagina opnieuw openen:
  // het gesprek gaat altijd open, ook zonder pin (algemene comment) of met een
  // niet meer gevonden anker — nooit een stille misser.
  useEffect(() => {
    if (!doc) return
    const doel = piekDoel()
    if (!doel || doel.doel_type !== 'document' || String(doel.doel_id) !== String(docId)) return
    openGesprek(doel.id)
    wisDoel()
  }, [doc, docId, openGesprek])

  // Dezelfde pagina opnieuw openen levert geen routewissel op; het event doet de rest.
  useEffect(() => {
    const f = () => {
      const doel = piekDoel()
      if (!doel || doel.doel_type !== 'document' || String(doel.doel_id) !== String(docId)) return
      openGesprek(doel.id)
      wisDoel()
    }
    window.addEventListener('werkbank-comment', f)
    return () => window.removeEventListener('werkbank-comment', f)
  }, [docId, openGesprek])

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

  // Eén klik op de actie bij een selectie: anker berekenen, paneel open,
  // composer gefocust met het citaat zichtbaar — geen tweede stap.
  const plaatsCommentBijSelectie = () => {
    if (!selectieActie?.range || !artikelRef.current) return
    try {
      const { anker, anker_context } = ankerUitSelectie({
        root: artikelRef.current, range: selectieActie.range, documentVersie: doc?.versie ?? null, sectieId: actieveSectie,
      })
      setNotitieAnker({ anker, anker_context })
      setInspectorTab('comments')
      setAnkerFout('')
      setGeselecteerdId(null)
      setNotitiesOpen(true)
      setSelectieActie(null)
      setFocusTeller((t) => t + 1)
    } catch (e) {
      setAnkerFout(e?.message || 'Selecteer een kort fragment uit de tekst van het stuk.')
    }
  }

  // De duidelijke tweede weg: een comment die niet aan een passage hangt.
  const algemeneComment = () => {
    setInspectorTab('comments')
    setNotitieAnker(null)
    setAnkerFout('')
    setGeselecteerdId(null)
    setNotitiesOpen(true)
    setSelectieActie(null)
    setFocusTeller((t) => t + 1)
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
              <Icoon naam="info" maat={14} /> Comments {telGesprekken(notitiesHier) ? `(${telGesprekken(notitiesHier)})` : ''}
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
              aantalComments={telOpen(notitiesHier)}
              opWalkthrough={() => { setWwStart(null); setWwOpen(true) }}
            />
          )}

          {modus === 'lees' && (
            <article className="md" ref={artikelRef} onClick={onthoudKlik}>
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

      {selectieActie && modus === 'lees' && <button type="button" className="doc-selectie-actie"
        style={{ top: selectieActie.top, left: selectieActie.left }}
        onMouseDown={(e) => e.preventDefault()} onClick={plaatsCommentBijSelectie}>Comment toevoegen</button>}

      <aside id="doc-notities-paneel" ref={notitiesPaneelRef} className={`inspector doc-inspector doc-focus-inspector ${notitiesOpen ? 'open' : ''}`} aria-label="Comments en bronnen bij dit stuk">
        <button type="button" className="knop doc-notities-sluit" onClick={sluitNotities}>Sluit comments</button>
        <div className="doc-inspector-tabs" role="tablist" aria-label="Focus van het zijpaneel" onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const tab = e.key === 'Home' ? 'comments' : e.key === 'End' ? 'bronnen' : inspectorTab === 'comments' ? 'bronnen' : 'comments'
          setInspectorTab(tab)
          document.getElementById(`doc-${tab}-tab`)?.focus()
        }}>
          <button type="button" role="tab" id="doc-comments-tab" aria-controls="doc-comments-panel" aria-selected={inspectorTab === 'comments'} tabIndex={inspectorTab === 'comments' ? 0 : -1} onClick={() => setInspectorTab('comments')}>Comments <span>{telGesprekken(notitiesHier)}</span></button>
          <button type="button" role="tab" id="doc-bronnen-tab" aria-controls="doc-bronnen-panel" aria-selected={inspectorTab === 'bronnen'} tabIndex={inspectorTab === 'bronnen' ? 0 : -1} onClick={() => setInspectorTab('bronnen')}>Bronnen <span>{bronnenVanBlok.length}</span></button>
        </div>
        <section id="doc-comments-panel" className="doc-inspector-panel" role="tabpanel" aria-labelledby="doc-comments-tab" hidden={inspectorTab !== 'comments'}>
        <div className="insp-titel">Comments bij dit stuk</div>
        {commentPlek && geselecteerdId != null && <div className="doc-comment-plek" role="status">
          <p>{commentPlek.melding || (commentPlek.status === 'geen' ? 'Algemene comment bij dit document, zonder geselecteerde passage.' : 'Gekoppelde passage in dit stuk.')}</p>
          {!!commentPlek.plekken.length && <div className="doc-comment-plekken">
            {commentPlek.plekken.map((plek, i) => <button type="button" key={`${plek.start}:${plek.end}`} className="knop zacht" aria-pressed={commentPlek.index === i} onClick={() => { if (window.matchMedia?.('(max-width: 1100px)')?.matches) sluitNotities(); setCommentPlek((oud) => ({ ...oud, index: i })); springNaarCommentPlek(plek) }}>{commentPlek.plekken.length > 1 ? `Vindplaats ${i + 1}` : 'Toon passage'}</button>)}
          </div>}
        </div>}
        <div className="doc-comment-keuze"><button type="button" className="knop zacht" onClick={algemeneComment}>Algemene comment toevoegen</button></div>
        <p className="doc-comment-hulp">Selecteer tekst en kies Comment toevoegen. Klik op een markering of comment om het volledige gesprek te openen.</p>
        {ankerFout && <p className="veld-fout" role="alert">{ankerFout}</p>}
        {agentFout && <p className="veld-fout" role="alert">{agentFout}</p>}
        <Notities
          doelType="document" doelId={doc.id} auteur={naam} notities={notitiesHier} agent={agent}
          opBewaren={opBewaren} opToon={toonInTekst} opAntwoord={opAntwoord} opLos={opLos}
          opAfwijzen={opAfwijzen} opHeropenen={opHeropenen} anker={notitieAnker}
          geselecteerdId={geselecteerdId} opSelecteer={openGesprek}
          opGeplaatst={(n) => openGesprek(n.client_id || n.id)} focusTeller={focusTeller}
          lichaamTekst={lichaamTekst}
          onAnkerWissen={(vorig) => setNotitieAnker((huidig) => huidig === vorig ? null : huidig)}
          onWijzig={() => D.laadNotities('document', doc.id).then((n) => { if (huidigDocId.current === doc.id) setNotities(n) }).catch(() => meld('Comments verversen mislukte.', { fout: true }))}
        />
        </section>
        <section id="doc-bronnen-panel" className="doc-inspector-panel" role="tabpanel" aria-labelledby="doc-bronnen-tab" hidden={inspectorTab !== 'bronnen'}>
          <h2 className="doc-bronnen-titel">Bronnen van dit dagdeel</h2>
          <p className="doc-comment-hulp">Raadpleeg een bron wanneer je die nodig hebt. Je gesprek en antwoord blijven in de tab Comments staan.</p>
          <input className="doc-bronnen-zoek" aria-label="Zoek binnen de bronnen van dit dagdeel" placeholder="Zoek titel of website…" value={bronZoek} onChange={(e) => setBronZoek(e.target.value)} />
          <div className="doc-bronnen-lijst">{bronnenVanBlok.filter((b) => `${b.titel || ''} ${b.url || ''}`.toLowerCase().includes(bronZoek.toLowerCase())).map((b) => {
            let website = ''
            try { website = new URL(b.url).hostname.replace(/^www\./, '') } catch { website = 'Bron zonder webadres' }
            return <button type="button" key={b.id} className="doc-bron-kaart" onClick={() => naar(`#/bron/${b.id}`)}>
              <strong>{b.titel && !/^https?:\/\//i.test(b.titel) ? b.titel : website}</strong><span>{b.titel && !/^https?:\/\//i.test(b.titel) ? website : 'Webbron'}</span><small>{b.status || 'Ongelezen'} · Open bron →</small>
            </button>
          })}</div>
          {!bronnenVanBlok.length && <p className="doc-comment-hulp">Nog geen bronnen aan dit dagdeel gekoppeld.</p>}
        </section>
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
          openGesprek(n.client_id || n.id)
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
