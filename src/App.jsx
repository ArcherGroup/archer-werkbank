import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { sb } from './lib/supabase'
import * as D from './lib/data'
import { gebruikThema } from './lib/thema'
import { useSneltoets } from './hooks/useSneltoets'
import { useEscape } from './hooks/useEscape'
import { isVies, wisVies } from './lib/vies'
import { beoordeelNavigatie, bepaalSpoor, slaScrollBijAfsluitenOp } from './lib/navigatie'
import { Palet } from './components/palet'
import { Naamvraag } from './components/naamvraag'
import { Topbar } from './components/topbar'
import { Zijbalk } from './components/zijbalk'
import { CommentsBalk } from './components/comments-balk'
import { Walkthrough } from './components/walkthrough'
import { bewaarDoel, routeVoor, telOpen } from './lib/comments'
import { bewaarInWachtrij, telWachtrij, verwerkWachtrij, alsNotitie, lokaalId, leesWachtrij } from './lib/comment-wachtrij'
import { Meldingen, meld } from './components/meldingen'
import { Hulp } from './components/hulp'
import { Dialoog } from './components/dialoog'
import { Pad } from './components/pad'
import { dagenUitMasterplan } from './lib/dagdeel-visie'
import { OverzichtPagina } from './pages/overzicht'
import { ActuaPagina } from './pages/actua'
import { WerkbladPagina } from './pages/werkblad'
import { BlokPagina } from './pages/blok'
import { DocPagina } from './pages/document'
import { BronnenPagina } from './pages/bronnen'
import { BronPagina } from './pages/bron'
import { PlanningPagina } from './pages/planning'
import { BeslissingPagina } from './pages/beslissing'
import { AgentProefPagina } from './pages/agent-proef'

export default function App() {
  const [naam, setNaam] = useState(() => localStorage.getItem('werkbank_naam') || '')
  const [route, setRoute] = useState(() => window.location.hash || '#/')
  const [spoor, setSpoor] = useState(() => bepaalSpoor([], window.history.state?.__werkbank?.spoor, window.location.hash || '#/'))
  const [paletOpen, setPaletOpen] = useState(false)
  const [hulpOpen, setHulpOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [commentsAan, setCommentsAan] = useState(() => localStorage.getItem('werkbank_comments') === 'aan')
  const [alleNotities, setAlleNotities] = useState([])
  const [bereik, setBereik] = useState('dagdeel')
  const [toonOpgelost, setToonOpgelost] = useState(false)
  const [walkthrough, setWalkthrough] = useState(null)
  const [werkbladBlok, setWerkbladBlok] = useState('1.3')
  useEscape(() => { setMenuOpen(false); document.querySelector('.mobiel-menu-knop')?.focus() }, menuOpen)
  const [blokken, setBlokken] = useState([])
  const [documentenMeta, setDocumentenMeta] = useState([])
  const [masterTekst, setMasterTekst] = useState(null)
  const [actualiteit, setActualiteit] = useState([])
  const [actuaGeladen, setActuaGeladen] = useState(false)
  const [wachtrijStand, setWachtrijStand] = useState(0)
  const [wachtrijBezig, setWachtrijBezig] = useState(false)
  const [bronnen, setBronnen] = useState([])
  const [beslissingen, setBeslissingen] = useState([])
  const [validaties, setValidaties] = useState([])
  const [voorstellen, setVoorstellen] = useState([])
  const [geladen, setGeladen] = useState(false)
  const [gegevensBeschikbaar, setGegevensBeschikbaar] = useState({ documenten: false, bronnen: false, beslissingen: false })
  const [online, setOnline] = useState([])
  const [tik, setTik] = useState(0) // herlaadtik na realtime-wijziging
  const [wacht, setWacht] = useState(null) // bestemming die wacht op bevestiging
  const [thema, kiesThema] = gebruikThema()

  const vorigeRoute = useRef(window.location.hash || '#/')
  const goedgekeurd = useRef(false)
  const spoorRef = useRef(spoor)
  const navOpties = useRef(null)
  const scrollPosities = useRef({})

  // Navigatie met werkverlies-bewaking: staat er onbewaarde tekst open, dan
  // vragen we eerst. Bevestigen zet `goedgekeurd` en gaat dan pas echt.
  const naar = useCallback((hash, opties = null) => {
    const actie = beoordeelNavigatie(hash, window.location.hash, isVies())
    if (actie === 'geen') return
    if (actie === 'vraag') {
      setWacht({ hash, opties })
      return
    }
    navOpties.current = opties
    goedgekeurd.current = true
    window.location.hash = hash
  }, [])

  useEffect(() => {
    const huidig = window.location.hash || '#/'
    const init = window.history.state?.__werkbank
    if (!Array.isArray(init?.spoor) || init.spoor.at(-1) !== huidig) {
      window.history.replaceState({ ...window.history.state, __werkbank: { spoor: spoorRef.current, scroll: 0 } }, '')
    }
    const f = () => {
      const h = window.location.hash || '#/'
      if (h === vorigeRoute.current) return
      const oud = window.history.state?.__werkbank || {}
      const uitGeschiedenis = Array.isArray(oud.spoor) && oud.spoor.at(-1) === h
      if (isVies() && !goedgekeurd.current) {
        window.location.hash = vorigeRoute.current
        setWacht({ hash: h, opties: uitGeschiedenis ? { spoor: oud.spoor, herstelScroll: true } : null })
        return
      }
      const voorkeur = navOpties.current
      const nieuwSpoor = voorkeur?.spoor
        ? bepaalSpoor([], voorkeur.spoor, h)
        : bepaalSpoor(spoorRef.current, oud.spoor, h)
      const scroll = voorkeur?.herstelScroll ? (scrollPosities.current[h] ?? oud.scroll ?? 0) : (uitGeschiedenis ? oud.scroll ?? 0 : 0)
      window.history.replaceState({ ...window.history.state, __werkbank: { spoor: nieuwSpoor, scroll } }, '')
      navOpties.current = null
      spoorRef.current = nieuwSpoor
      setSpoor(nieuwSpoor)
      goedgekeurd.current = false
      vorigeRoute.current = h
      setRoute(h)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // Bewaar de scrolpositie per geschiedenis-item en herstel die nadat de
  // inhoud is geladen, zodat teruggaan ook de werkplek terugbrengt.
  useEffect(() => {
    if (!naam) return
    const hoofd = document.querySelector('.route-laag > .hoofd')
    if (!hoofd) return
    const gewenst = Math.max(0, Number(window.history.state?.__werkbank?.scroll) || 0)
    let hersteld = gewenst === 0
    const herstel = (force = false) => {
      if (hersteld) return
      if (force || hoofd.scrollHeight - hoofd.clientHeight >= gewenst - 1) {
        hoofd.scrollTop = gewenst
        hersteld = true
      }
    }
    const opslaan = () => {
      if (!hersteld || (window.location.hash || '#/') !== route) return
      scrollPosities.current[route] = hoofd.scrollTop
      const werkbank = window.history.state?.__werkbank
      if (werkbank) window.history.replaceState({ ...window.history.state, __werkbank: { ...werkbank, scroll: hoofd.scrollTop } }, '')
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => herstel()) : null
    if (hoofd.firstElementChild) observer?.observe(hoofd.firstElementChild)
    hoofd.addEventListener('scroll', opslaan, { passive: true })
    herstel()
    const timer = setTimeout(() => herstel(true), 1800)
    return () => {
      slaScrollBijAfsluitenOp(scrollPosities.current, route, hoofd)
      clearTimeout(timer)
      observer?.disconnect()
      hoofd.removeEventListener('scroll', opslaan)
    }
  }, [route, naam, geladen])

  // globale data
  const herlaadAlles = useCallback(async () => {
    const uit = await Promise.allSettled([
      D.laadBlokken(),
      D.laadDocumentenMeta(),
      D.laadBronnen(),
      D.laadBeslissingen(),
      D.laadValidaties(),
      D.laadVoorstellen(),
      D.laadNotitiesAlles(),
      D.laadActualiteit(),
    ])
    const [b, dm, br, bs, va, vo, no, ac] = uit
    if (b.status === 'fulfilled') setBlokken(b.value)
    if (dm.status === 'fulfilled') setDocumentenMeta(dm.value)
    if (br.status === 'fulfilled') setBronnen(br.value)
    if (bs.status === 'fulfilled') setBeslissingen(bs.value)
    if (va.status === 'fulfilled') setValidaties(va.value)
    if (vo.status === 'fulfilled') setVoorstellen(vo.value)
    if (no.status === 'fulfilled') setAlleNotities(no.value)
    if (ac.status === 'fulfilled') setActualiteit(ac.value)
    setActuaGeladen(ac.status === 'fulfilled')
    setGegevensBeschikbaar({ documenten: dm.status === 'fulfilled', bronnen: br.status === 'fulfilled', beslissingen: bs.status === 'fulfilled' })
    setGeladen(true)
    const mislukt = uit.filter((r) => r.status === 'rejected').length
    if (mislukt) {
      meld(
        `${mislukt} van de ${uit.length} gegevensbronnen kon niet geladen worden. De rest staat er wel; probeer het zo opnieuw.`,
        { fout: true },
      )
    }
  }, [])

  useEffect(() => {
    herlaadAlles().catch(console.error)
  }, [herlaadAlles, tik])

  // De vier dagen van de editie komen uit het masterplan zelf, niet uit een vaste lijst.
  useEffect(() => {
    const meta = documentenMeta.find((d) => d.titel === 'masterplan-februari-2027')
    if (!meta) return
    let actief = true
    D.laadDocument(meta.id)
      .then((doc) => { if (actief && doc?.inhoud) setMasterTekst(doc.inhoud) })
      .catch(() => {})
    return () => { actief = false }
  }, [documentenMeta])

  const dagTitels = useMemo(() => dagenUitMasterplan(masterTekst), [masterTekst])

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
        const namen = Object.values(staat)
          .flat()
          .map((p) => p.naam)
          .filter(Boolean)
        // Iemand met twee tabbladen open is één persoon, geen rij duplicaten.
        setOnline([...new Set(namen)])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await kanaal.track({ naam, sinds: Date.now() })
      })
    return () => {
      sb.removeChannel(kanaal)
    }
  }, [naam])

  // Titel per route: geschiedenis, bookmarks en screenreaders weten dan waar
  // ze zijn. De app-naam blijft achteraan staan.
  useEffect(() => {
    const delen = route.replace(/^#\//, '').split('/')
    const w = delen[0] || ''
    let t = 'Werkblad'
    if (w === 'status') t = 'Stand van zaken'
    else if (w === 'planning') t = 'Planning'
    else if (w === 'agent-proef') t = 'Agentproef'
    else if (w === 'bronnen') t = 'Bronnen'
    else if (w === 'blok') {
      const b = blokken.find((x) => x.id === delen[1])
      if (b) t = `${b.code} · ${b.titel}`
    } else if (w === 'doc') {
      const d = documentenMeta.find((x) => String(x.id) === delen[1])
      if (d) t = d.titel
    } else if (w === 'bron') t = 'Bron'
    else if (w === 'beslissing') t = beslissingen.find((x) => String(x.id) === delen[1])?.titel || 'Beslissing'
    document.title = `${t} · Werkbank`
  }, [route, blokken, documentenMeta, beslissingen])

  // ⌘K — werkt ook als de focus in de editor of een zoekveld staat.
  useSneltoets('k', () => setPaletOpen((o) => !o), { ookInInvoerveld: true })

  // ? — hulp met alle sneltoetsen (niet in invoervelden)
  useEffect(() => {
    const f = (e) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.defaultPrevented || e.isComposing) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      e.preventDefault()
      setHulpOpen(true)
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [])

  // Comments: de stand wordt onthouden, de balk loopt over elke pagina mee.
  useEffect(() => {
    try { localStorage.setItem('werkbank_comments', commentsAan ? 'aan' : 'uit') } catch { /* zonder opslag werkt de balk nog */ }
  }, [commentsAan])

  useEffect(() => {
    const f = (e) => {
      if ((e.key !== 'c' && e.key !== 'C') || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (e.defaultPrevented || e.isComposing) return
      e.preventDefault()
      setCommentsAan((v) => !v)
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [])

  const commentCtx = useMemo(() => {
    const [soort, id] = route.replace(/^#\//, '').split('/')
    if (soort === 'blok') {
      const b = blokken.find((x) => String(x.id) === id)
      return { blokId: id || null, dag: b ? Number(b.dag) : null }
    }
    if (soort === 'doc') {
      const d = documentenMeta.find((x) => String(x.id) === id)
      const b = d && blokken.find((x) => x.id === d.blok_id)
      return { blokId: d?.blok_id || null, dag: b ? Number(b.dag) : null }
    }
    if (soort === 'bron') {
      const br = bronnen.find((x) => String(x.id) === id)
      const b = br && blokken.find((x) => x.id === br.blok_id)
      return { blokId: br?.blok_id || null, dag: b ? Number(b.dag) : null }
    }
    if (!soort) {
      const b = blokken.find((x) => x.id === werkbladBlok)
      return { blokId: werkbladBlok, dag: b ? Number(b.dag) : null }
    }
    return { blokId: null, dag: null }
  }, [route, blokken, documentenMeta, bronnen, werkbladBlok])

  const effectiefBereik = commentCtx.blokId ? bereik : 'alles'
  const commentBlok = blokken.find((b) => b.id === commentCtx.blokId)
  const barTitel = commentBlok ? `${commentBlok.code} · ${commentBlok.titel}` : ''
  const openComments = telOpen(alleNotities)
  // Comments die lokaal bewaard zijn, horen ook op de pagina zelf te staan.
  const lokaleComments = useMemo(() => alleNotities.filter((n) => n.lokaal === true), [alleNotities])

  const openComment = (n) => {
    bewaarDoel(n)
    setWalkthrough(null)
    setCommentsAan(true)
    naar(routeVoor(n))
    setTimeout(() => window.dispatchEvent(new Event('werkbank-comment')), 90)
  }

  const losCommentOp = async (n) => {
    const { error } = await sb.from('notities').update({ opgelost: true, opgelost_op: new Date().toISOString(), opgelost_door: naam }).eq('id', n.id)
    if (error) throw error
    setAlleNotities((lijst) => lijst.map((x) => (String(x.id) === String(n.id) ? { ...x, opgelost: true, opgelost_door: naam } : x)))
  }

  /* Afwijzen is geen verwijderen: de comment en zijn gesprek blijven staan,
     met de reden erbij, en tellen niet meer als open werk. */
  const wijsCommentAf = async (n, reden = '') => {
    const { error } = await sb.from('notities').update({
      afgewezen: true,
      afgewezen_op: new Date().toISOString(),
      afgewezen_door: naam,
      afwijs_reden: reden || null,
    }).eq('id', n.id)
    if (error) throw error
    setAlleNotities((lijst) => lijst.map((x) => (String(x.id) === String(n.id) ? { ...x, afgewezen: true, afgewezen_door: naam, afwijs_reden: reden || null } : x)))
  }

  const heropenComment = async (n) => {
    const { error } = await sb.from('notities').update({
      afgewezen: false, afgewezen_op: null, afgewezen_door: null, afwijs_reden: null,
      opgelost: false, opgelost_op: null, opgelost_door: null,
    }).eq('id', n.id)
    if (error) throw error
    setAlleNotities((lijst) => lijst.map((x) => (String(x.id) === String(n.id) ? { ...x, afgewezen: false, opgelost: false, afgewezen_door: null, opgelost_door: null, afwijs_reden: null } : x)))
  }

  const zetSignaalStatus = async (s, status) => {
    setActualiteit((lijst) => lijst.map((x) => (String(x.id) === String(s.id) ? { ...x, status } : x)))
    try {
      await D.zetSignaalStatus(s.id, status)
    } catch {
      setActualiteit((lijst) => lijst.map((x) => (String(x.id) === String(s.id) ? { ...x, status: s.status } : x)))
      meld('De status van dit signaal raakte niet bewaard.', { fout: true })
    }
  }

  /* Commentaar bewaren kan altijd: lukt de werkbank niet, dan gaat hij in de
     lokale wachtrij en blijft hij zichtbaar als "wachtend". Zodra het weer kan,
     gaat hij vanzelf mee. */
  const verstuurNotitie = async (rij) => {
    const { data, error } = await sb.from('notities').insert({
      doel_type: rij.doel_type,
      doel_id: String(rij.doel_id),
      tekst: rij.tekst,
      auteur: rij.auteur,
      anker: rij.anker || null,
      parent_id: rij.parent_id ?? null,
    }).select().single()
    if (error) throw error
    return data
  }

  const bewaarComment = async (rij) => {
    const metId = { ...rij, lokaal_id: lokaalId() }
    try {
      const data = await verstuurNotitie(metId)
      if (data) setAlleNotities((lijst) => [...lijst, data])
      return { lokaal: false, data }
    } catch {
      const lijst = bewaarInWachtrij(metId)
      const item = lijst.find((x) => x.lokaal_id === metId.lokaal_id) || lijst[lijst.length - 1]
      setAlleNotities((oud) => [...oud.filter((x) => String(x.id) !== String(item.lokaal_id)), alsNotitie(item)])
      setWachtrijStand(telWachtrij())
      meld('De werkbank is even niet bereikbaar. Je comment staat lokaal bewaard en gaat mee zodra het kan.')
      return { lokaal: true, item }
    }
  }

  const probeerWachtrij = useCallback(async () => {
    if (!telWachtrij()) return { gelukt: [], mislukt: [] }
    setWachtrijBezig(true)
    try {
      const uit = await verwerkWachtrij(verstuurNotitie)
      setWachtrijStand(telWachtrij())
      if (uit.gelukt.length) {
        meld(`${uit.gelukt.length} comment${uit.gelukt.length === 1 ? '' : 'en'} alsnog naar de werkbank gestuurd.`)
        await herlaadAlles()
        setAlleNotities((lijst) => lijst.filter((x) => !x.lokaal))
      }
      return uit
    } finally {
      setWachtrijBezig(false)
    }
  }, [herlaadAlles])

  // Wat lokaal bewaard is, hoort ook meteen in de lijst te staan.
  useEffect(() => {
    const lokaal = leesWachtrij().map(alsNotitie)
    setWachtrijStand(lokaal.length)
    if (lokaal.length) setAlleNotities((lijst) => [...lijst.filter((x) => !x.lokaal), ...lokaal])
  }, [])

  // De wachtrij stil proberen leeg te maken: bij het opstarten, elk half uur,
  // en zodra de browser weer online is.
  useEffect(() => {
    const probeer = () => { probeerWachtrij().catch(() => {}) }
    const t0 = setTimeout(probeer, 1200)
    const t1 = setInterval(probeer, 30 * 60 * 1000)
    window.addEventListener('online', probeer)
    return () => { clearTimeout(t0); clearInterval(t1); window.removeEventListener('online', probeer) }
  }, [probeerWachtrij])

  const antwoordComment = async (n, tekst) => {
    await bewaarComment({
      doel_type: n.doel_type,
      doel_id: String(n.doel_id),
      tekst,
      auteur: naam,
      anker: n.anker || null,
      parent_id: n.id,
    })
  }

  const kiesNaam = (n) => {
    localStorage.setItem('werkbank_naam', n)
    setNaam(n)
  }

  if (!naam) return <Naamvraag opNaam={kiesNaam} />

  const del = route.replace(/^#\//, '').split('/')
  const weergave = del[0] || ''

  // In een verborgen venster pauzeert de browser animaties; dan liever meteen
  // zichtbaar dan een pagina die op zijn fade-in blijft wachten.
  const verborgen = typeof document !== 'undefined' && document.hidden

  return (
    <div className={`schil${commentsAan ? ' comments-aan' : ''}`}>
      <Topbar
        naam={naam}
        online={online}
        thema={thema}
        opThema={kiesThema}
        menuOpen={menuOpen}
        opMenu={() => setMenuOpen((open) => !open)}
        commentsAan={commentsAan}
        commentsAantal={openComments}
        opComments={() => setCommentsAan((v) => !v)}
        opZoeken={() => setPaletOpen(true)}
        opHulp={() => setHulpOpen(true)}
        opWissel={() => {
          localStorage.removeItem('werkbank_naam')
          setNaam('')
        }}
      />
      {wachtrijStand > 0 && (
        <div className="wachtrij-melding" role="status">
          <span>
            {wachtrijStand === 1
              ? 'Eén comment staat lokaal bewaard.'
              : `${wachtrijStand} comments staan lokaal bewaard.`}
            {' '}Ze gaan automatisch naar de werkbank zodra dat kan.
          </span>
          <button type="button" className="knop zacht" onClick={() => probeerWachtrij()} disabled={wachtrijBezig}>
            {wachtrijBezig ? 'Proberen…' : 'Nu proberen'}
          </button>
        </div>
      )}

      {commentsAan && (
        <CommentsBalk
          notities={alleNotities}
          blokken={blokken}
          documentenMeta={documentenMeta}
          bronnen={bronnen}
          blokId={commentCtx.blokId}
          dag={commentCtx.dag}
          bereik={effectiefBereik}
          opBereik={setBereik}
          toonOpgelost={toonOpgelost}
          opToonOpgelost={setToonOpgelost}
          opOpen={openComment}
          opWalkthrough={() => setWalkthrough({ startId: null })}
          opSluiten={() => setCommentsAan(false)}
          titel={barTitel}
        />
      )}
      {menuOpen && <button type="button" className="mobiel-menu-achtergrond" onClick={() => setMenuOpen(false)} aria-label="Navigatie sluiten" />}
      <Zijbalk
        route={route}
        menuOpen={menuOpen}
        naar={(hash, opties) => { setMenuOpen(false); naar(hash, opties) }}
        blokken={blokken}
        bronnen={bronnen}
        beslissingen={beslissingen}
        voorstellen={voorstellen}
      />

      {/* Geen exit-animatie: een paginawissel moet instant aanvoelen. De nieuwe
          pagina komt zacht in, de oude verdwijnt meteen. Zo blijft de app ook
          bruikbaar als het venster even op de achtergrond stond (rAF pauzeert
          dan, en een wachtende exit zou de nieuwe pagina tegenhouden). */}
      <motion.div
        key={route}
        className="route-laag"
        initial={verborgen ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      >
          <Pad route={route} naar={naar} blokken={blokken} documentenMeta={documentenMeta} bronnen={bronnen} dagTitels={dagTitels} opTerug={() => window.history.back()} />
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
            geladen={geladen}
            gegevensBeschikbaar={gegevensBeschikbaar}
            proefToegestaan={typeof window !== 'undefined' && window.__agentProef === true}
            opActiefBlok={setWerkbladBlok}
            opComments={() => setCommentsAan(true)}
            commentsAan={commentsAan}
            opWalkthrough={(id) => setWalkthrough({ startId: id })}
            opLos={losCommentOp}
            opAntwoord={antwoordComment}
            opAfwijzen={wijsCommentAf}
            opHeropenen={heropenComment}
            opBewaren={bewaarComment}
            lokaleComments={lokaleComments}
            actualiteit={actualiteit}
            actuaGeladen={actuaGeladen}
            opSignaalStatus={zetSignaalStatus}
          />
      </motion.div>

      <Palet
        open={paletOpen}
        opSluiten={() => setPaletOpen(false)}
        blokken={blokken}
        documentenMeta={documentenMeta}
        bronnen={bronnen}
        naam={naam}
        naar={naar}
      />
      <Hulp open={hulpOpen} opSluiten={() => setHulpOpen(false)} />
      <Meldingen />

      <Walkthrough
        open={!!walkthrough}
        startId={walkthrough?.startId ?? null}
        notities={alleNotities}
        blokken={blokken}
        documentenMeta={documentenMeta}
        bronnen={bronnen}
        blokId={commentCtx.blokId}
        dag={commentCtx.dag}
        bereik={effectiefBereik}
        titel={barTitel}
        naam={naam}
        opSluiten={() => setWalkthrough(null)}
        opOpenPlek={openComment}
        opLos={losCommentOp}
        opAntwoord={antwoordComment}
        opAfwijzen={wijsCommentAf}
        opHeropenen={heropenComment}
      />

      <Dialoog
        open={!!wacht}
        titel="Wijzigingen niet bewaard"
        tekst="Je hebt tekst aangepast die nog niet bewaard is. Als je nu weggaat, gaat die tekst verloren."
        actie="Weggooien en weggaan"
        verscheurend
        opAnnuleer={() => setWacht(null)}
        opBevestig={() => {
          const doel = wacht?.hash
          navOpties.current = wacht?.opties || null
          wisVies()
          setWacht(null)
          goedgekeurd.current = true
          if (doel) window.location.hash = doel
        }}
      />

      {!geladen && <div className="laad-balk" />}
    </div>
  )
}

/* ---------------------------------------------------------------- hoofd */

export function Hoofd(props) {
  const { weergave, del } = props
  if (weergave === 'agent-proef' && props.proefToegestaan === true) return <AgentProefPagina naar={props.naar} />
  if (weergave === 'actua') {
    return <ActuaPagina {...props} signalen={props.actualiteit ?? []} geladen={props.actuaGeladen === true}
      opStatus={props.opSignaalStatus} naar={props.naar}
      filosofieId={props.documentenMeta?.find((d) => d.titel === 'filosofie-werkbank')?.id ?? null} />
  }
  if (weergave === 'status') return <OverzichtPagina {...props} />
  if (weergave === 'blok') return <BlokPagina {...props} blokId={del[1]} />
  if (weergave === 'doc') return <DocPagina {...props} docId={Number(del[1])} />
  if (weergave === 'bronnen') return <BronnenPagina {...props} />
  if (weergave === 'bron') return <BronPagina {...props} bronId={Number(del[1])} />
  if (weergave === 'planning') return <PlanningPagina {...props} />
  if (weergave === 'beslissing') return <BeslissingPagina {...props} beslissingId={del[1]} />
  return <WerkbladPagina {...props} />
}
