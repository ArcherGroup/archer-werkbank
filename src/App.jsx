import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { sb } from './lib/supabase'
import * as D from './lib/data'
import { gebruikThema } from './lib/thema'
import { useSneltoets } from './hooks/useSneltoets'
import { isVies, wisVies } from './lib/vies'
import { Palet } from './components/palet'
import { Naamvraag } from './components/naamvraag'
import { Topbar } from './components/topbar'
import { Zijbalk } from './components/zijbalk'
import { Meldingen, meld } from './components/meldingen'
import { Hulp } from './components/hulp'
import { Dialoog } from './components/dialoog'
import { OverzichtPagina } from './pages/overzicht'
import { BlokPagina } from './pages/blok'
import { DocPagina } from './pages/document'
import { BronnenPagina } from './pages/bronnen'
import { BronPagina } from './pages/bron'
import { PlanningPagina } from './pages/planning'

export default function App() {
  const [naam, setNaam] = useState(() => localStorage.getItem('werkbank_naam') || '')
  const [route, setRoute] = useState(() => window.location.hash || '#/')
  const [paletOpen, setPaletOpen] = useState(false)
  const [hulpOpen, setHulpOpen] = useState(false)
  const [blokken, setBlokken] = useState([])
  const [documentenMeta, setDocumentenMeta] = useState([])
  const [bronnen, setBronnen] = useState([])
  const [beslissingen, setBeslissingen] = useState([])
  const [validaties, setValidaties] = useState([])
  const [voorstellen, setVoorstellen] = useState([])
  const [geladen, setGeladen] = useState(false)
  const [online, setOnline] = useState([])
  const [tik, setTik] = useState(0) // herlaadtik na realtime-wijziging
  const [wacht, setWacht] = useState(null) // bestemming die wacht op bevestiging
  const [thema, kiesThema] = gebruikThema()

  const vorigeRoute = useRef(window.location.hash || '#/')
  const goedgekeurd = useRef(false)

  // Navigatie met werkverlies-bewaking: staat er onbewaarde tekst open, dan
  // vragen we eerst. Bevestigen zet `goedgekeurd` en gaat dan pas echt.
  const naar = useCallback((hash) => {
    if (!hash) return
    if (isVies()) {
      setWacht(hash)
      return
    }
    goedgekeurd.current = true
    window.location.hash = hash
  }, [])

  useEffect(() => {
    const f = () => {
      const h = window.location.hash || '#/'
      if (h === vorigeRoute.current) return
      if (isVies() && !goedgekeurd.current) {
        window.location.hash = vorigeRoute.current
        setWacht(h)
        return
      }
      goedgekeurd.current = false
      vorigeRoute.current = h
      setRoute(h)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // globale data
  const herlaadAlles = useCallback(async () => {
    const uit = await Promise.allSettled([
      D.laadBlokken(),
      D.laadDocumentenMeta(),
      D.laadBronnen(),
      D.laadBeslissingen(),
      D.laadValidaties(),
      D.laadVoorstellen(),
    ])
    const [b, dm, br, bs, va, vo] = uit
    if (b.status === 'fulfilled') setBlokken(b.value)
    if (dm.status === 'fulfilled') setDocumentenMeta(dm.value)
    if (br.status === 'fulfilled') setBronnen(br.value)
    if (bs.status === 'fulfilled') setBeslissingen(bs.value)
    if (va.status === 'fulfilled') setValidaties(va.value)
    if (vo.status === 'fulfilled') setVoorstellen(vo.value)
    setGeladen(true)
    const mislukt = uit.filter((r) => r.status === 'rejected').length
    if (mislukt) {
      meld(
        `${mislukt} van de 6 gegevensbronnen kon niet geladen worden. De rest staat er wel; probeer het zo opnieuw.`,
        { fout: true },
      )
    }
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
    let t = 'Overzicht'
    if (w === 'planning') t = 'Planning'
    else if (w === 'bronnen') t = 'Bronnen'
    else if (w === 'blok') {
      const b = blokken.find((x) => x.id === delen[1])
      if (b) t = `${b.code} · ${b.titel}`
    } else if (w === 'doc') {
      const d = documentenMeta.find((x) => String(x.id) === delen[1])
      if (d) t = d.titel
    } else if (w === 'bron') t = 'Bron'
    document.title = `${t} · Werkbank`
  }, [route, blokken, documentenMeta])

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
    <div className="schil">
      <Topbar
        naam={naam}
        online={online}
        thema={thema}
        opThema={kiesThema}
        opZoeken={() => setPaletOpen(true)}
        opHulp={() => setHulpOpen(true)}
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

      <Dialoog
        open={!!wacht}
        titel="Wijzigingen niet bewaard"
        tekst="Je hebt tekst aangepast die nog niet bewaard is. Als je nu weggaat, gaat die tekst verloren."
        actie="Weggooien en weggaan"
        verscheurend
        opAnnuleer={() => setWacht(null)}
        opBevestig={() => {
          const doel = wacht
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

function Hoofd(props) {
  const { weergave, del } = props
  if (weergave === 'blok') return <BlokPagina {...props} blokId={del[1]} />
  if (weergave === 'doc') return <DocPagina {...props} docId={Number(del[1])} />
  if (weergave === 'bronnen') return <BronnenPagina {...props} />
  if (weergave === 'bron') return <BronPagina {...props} bronId={Number(del[1])} />
  if (weergave === 'planning') return <PlanningPagina {...props} />
  return <OverzichtPagina {...props} />
}
