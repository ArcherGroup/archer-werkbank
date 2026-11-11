import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Icoon } from './Icoon'

/* Meldingen (toast): kort, niet-blokkerend, auto-weg na ±5 s.
   Eén module-brede bus; elke pagina kan melden() aanroepen. */

let luisteraars = new Set()

export function meld(tekst, { fout = false, duur = 5000 } = {}) {
  for (const l of luisteraars) l({ tekst, fout, duur, id: Math.random().toString(36).slice(2) })
}

export function Meldingen() {
  const [lijst, setLijst] = useState([])

  useEffect(() => {
    const luister = (m) => {
      setLijst((l) => [...l, m])
      setTimeout(() => setLijst((l) => l.filter((x) => x.id !== m.id)), m.duur)
    }
    luisteraars.add(luister)
    return () => luisteraars.delete(luister)
  }, [])

  return (
    <div className="meldingen">
      <AnimatePresence initial={false}>
        {lijst.map((m) => (
          <motion.div
            key={m.id}
            className={`melding-toast ${m.fout ? 'fout' : ''}`}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', duration: 0.32, bounce: 0.12 }}
            role={m.fout ? 'alert' : 'status'}
          >
            <Icoon naam={m.fout ? 'waarschuwing' : 'vinkje'} maat={14} />
            {m.tekst}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}