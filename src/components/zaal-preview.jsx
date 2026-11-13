import React, { useMemo, useState } from 'react'
import { Icoon } from './Icoon'
import { ZAAL, euro, gemiddeldeVanZaal, taartStukken, donutPad, kleurVoor, somVanVerdeling } from '../lib/zaal'
import './zaal-preview.css'

/* De zaal in één blok: het gemiddelde dat de deelnemers zelf invulden, en de
   verdeling als taart. Altijd zichtbaar op het werkblad, met de bron en de
   beperking erbij: dit is een vroege steekproef, niet de hele zaal. */
export function ZaalPreview({ compact = true }) {
  const [open, setOpen] = useState(!compact)
  const gemiddelde = gemiddeldeVanZaal()
  const stukken = useMemo(() => taartStukken(ZAAL.verdeling), [])
  const som = somVanVerdeling(ZAAL.verdeling)

  return (
    <section className="zaal" aria-labelledby="zaal-titel">
      <div className="zaal-kop">
        <div>
          <div className="wb-eyebrow">De zaal vandaag</div>
          <h2 id="zaal-titel">
            {gemiddelde ? euro(gemiddelde) : 'nog geen cijfer'}
            <span> gemiddeld ingevuld financieel vermogen</span>
          </h2>
        </div>
        <div className="zaal-mini" aria-hidden="true">
          <svg viewBox="0 0 120 120" width="72" height="72" role="img" aria-label="Verdeling van het zaalvermogen">
            {stukken.map((s, i) => {
              const pad = donutPad(s, { r: 52, dik: 22 })
              return pad ? <path key={s.naam} d={pad} fill={kleurVoor(i)} /> : null
            })}
          </svg>
        </div>
        <div className="zaal-feiten">
          <span className="zaal-feit"><b>{ZAAL.steekproef.ingevuld}</b> van {ZAAL.steekproef.totaal} deelnemers vulden hun vermogen in</span>
          <span className="zaal-feit"><b>{euro(ZAAL.som)}</b> samen</span>
          <button type="button" className="knop zacht zaal-knop" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Icoon naam="overzicht" maat={13} /> {open ? 'Verberg de verdeling' : 'Bekijk de verdeling'}
          </button>
        </div>
      </div>

      {open && (
        <div className="zaal-verdeling">
          <svg className="zaal-taart" viewBox="0 0 120 120" width="180" height="180" role="img" aria-label="Verdeling van het zaalvermogen in procenten">
            {stukken.map((s, i) => {
              const pad = donutPad(s)
              return pad ? <path key={s.naam} d={pad} fill={kleurVoor(i)} /> : null
            })}
          </svg>
          <ul className="zaal-legende">
            {stukken.map((s, i) => (
              <li key={s.naam} className={s.deel === 0 ? 'nul' : ''}>
                <span className="zaal-stip" style={{ background: kleurVoor(i) }} aria-hidden="true" />
                <span className="zaal-naam">{s.naam}</span>
                <span className="zaal-deel">{s.deel.toLocaleString('nl-BE')}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="zaal-bron">
        Bron: {ZAAL.bron}. {ZAAL.afbakening} Alleen aggregaten, drempel tien deelnemers. Dit is een vroege steekproef en
        geen representatief zaalprofiel; de verdeling telt op tot {som.toLocaleString('nl-BE')} procent door
        afronding op één decimaal.
      </p>
    </section>
  )
}