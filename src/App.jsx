import React, { useCallback, useEffect, useState } from 'react'
import { sb } from './lib/supabase'
import * as D from './lib/data'
import { Palet } from './components/palet'
import { Naamvraag } from './components/naamvraag'
import { Topbar } from './components/topbar'
import { Zijbalk } from './components/zijbalk'
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
