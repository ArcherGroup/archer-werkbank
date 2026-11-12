import React, { useMemo, useState } from 'react'
import { Icoon } from '../components/Icoon'
import { Pill } from '../components/basis'
import { DOMEINEN, STATUSSEN, groepeerActua, telPerStatus, versTekst, versheidsTekst, versheidPerDomein, mooiGetal } from '../lib/actua'
import './actua.css'

/* Actua: wat de wachters vonden, per domein. Een signaal is een voorstel om te
   bevestigen of weg te leggen; pas een bevestigd signaal hoort in de lesstof. */
export function ActuaPagina({ signalen = [], geladen = true, opStatus, naar, filosofieId = null }) {
  const [status, setStatus] = useState('te_controleren')
  const [domein, setDomein] = useState(null)
  const telling = useMemo(() => telPerStatus(signalen), [signalen])
  const wachters = useMemo(() => versheidPerDomein(signalen), [signalen])
  const vers = wachters.filter((w) => w.stand === 'vers').length
  const groepen = useMemo(() => groepeerActua(signalen, { status }), [signalen, status])
  const zichtbaar = domein ? groepen.filter((g) => g.id === domein) : groepen

  return (
    <main className="hoofd">
      <div className="hoofd-binnen">
        <div className="pagina-kop">
          <h1>Actua</h1>
          <div className="onder">
            <Pill>{telling.te_controleren} te controleren</Pill>
            <Pill>{telling.bevestigd} bevestigd</Pill>
            {telling.verworpen > 0 && <Pill>{telling.verworpen} verworpen</Pill>}
          </div>
        </div>

        <p className="actua-uitleg">
          Zes wachters houden elk hun eigen bronnen in het oog: macro, staatsschuld, fiscaliteit, politiek,
          markten en energie. Ze zoeken zelf, op hun eigen ritme, en zetten wat ze vinden hier neer als signaal
          met de zin, het cijfer en de bron erbij. Een signaal wordt pas gebruikt als een mens het bevestigt.
          {filosofieId && naar && (
            <> <button type="button" className="actua-filosofie" onClick={() => naar(`#/doc/${filosofieId}`)}>Lees de filosofie van dit hart</button></>
          )}
        </p>

        <section className="actua-wachters" aria-label="De wachters">
          <header className="actua-wachters-kop">
            <h2>De wachters</h2>
            <span className="actua-wachters-stand">{vers} van {wachters.length} vers</span>
          </header>
          <div className="actua-wachter-rij">
            {wachters.map((w) => (
              <button
                type="button"
                key={w.id}
                className={`wachter stand-${w.stand} ${domein === w.id ? 'aan' : ''}`}
                aria-pressed={domein === w.id}
                onClick={() => setDomein(domein === w.id ? null : w.id)}
                title={`${w.naam} · ${w.agent} · ${w.ritme}`}
              >
                <span className="wachter-kop">
                  <span className="wachter-stip" aria-hidden="true" />
                  <b>{w.naam}</b>
                  <span className="wachter-aantal">{w.aantal}</span>
                </span>
                <span className="wachter-agent">{w.agent}</span>
                <span className="wachter-vers">{versheidsTekst(w)}</span>
                <span className="wachter-ritme">{w.ritme}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="actua-filter">
          <div className="actua-statussen" role="group" aria-label="Status">
            {STATUSSEN.map((s) => (
              <button type="button" key={s.id} aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="actua-domeinen" role="group" aria-label="Domein">
            <button type="button" aria-pressed={!domein} onClick={() => setDomein(null)}>Alle domeinen</button>
            {DOMEINEN.map((d) => (
              <button type="button" key={d.id} aria-pressed={domein === d.id} onClick={() => setDomein(d.id)}>{d.naam}</button>
            ))}
          </div>
        </div>

        {!geladen && <p className="leeg-tekst">De signalen laden…</p>}

        {geladen && zichtbaar.length === 0 && (
          <div className="actua-leeg">
            <h2>Niets in deze stand</h2>
            <p>
              {status === 'te_controleren'
                ? 'Er wacht niets op een beslissing. De wacht loopt door en zet nieuwe signalen hier neer.'
                : 'In deze stand staat niets. Kijk bij Te controleren wat er wacht.'}
            </p>
          </div>
        )}

        {zichtbaar.map((groep) => (
          <section className="actua-groep" key={groep.id} aria-label={groep.naam}>
            <header className="actua-kop">
              <h2>{groep.naam}</h2>
              <span className="actua-agent">{groep.agent || DOMEINEN.find((d) => d.id === groep.id)?.agent}</span>
              <span className="actua-tel">{groep.signalen.length}</span>
            </header>
            {groep.signalen.map((s) => (
              <article className="signaal" key={s.id ?? s.uniek}>
                <div className="signaal-kop">
                  <b className="signaal-getal">{s.getal ? mooiGetal(s.getal, s.eenheid) : 'geen cijfer'}</b>
                  <span className="signaal-bron">{s.bron_naam}</span>
                  <span className="signaal-datum" title={s.bron_datum || s.gevonden_op}>{versTekst(s.bron_datum || s.gevonden_op)}</span>
                </div>
                <p className="signaal-zin">{s.zin}</p>
                <div className="signaal-acties">
                  <a className="knop zacht" href={s.bron_url} target="_blank" rel="noreferrer noopener">
                    <Icoon naam="extern" maat={13} /> Open de bron
                  </a>
                  {opStatus && s.status !== 'bevestigd' && (
                    <button type="button" className="knop primair" onClick={() => opStatus(s, 'bevestigd')}>
                      <Icoon naam="vinkje" maat={13} /> Klopt
                    </button>
                  )}
                  {opStatus && s.status !== 'verworpen' && (
                    <button type="button" className="knop zacht" onClick={() => opStatus(s, 'verworpen')}>
                      <Icoon naam="sluiten" maat={13} /> Leg weg
                    </button>
                  )}
                  {s.status !== 'te_controleren' && opStatus && (
                    <button type="button" className="knop zacht" onClick={() => opStatus(s, 'te_controleren')}>Terug naar te controleren</button>
                  )}
                </div>
              </article>
            ))}
          </section>
        ))}

        <p className="actua-voet">
          De wacht loopt per domein op zijn eigen ritme: dagelijks voor politiek en markten, maandelijks voor macro,
          fiscaliteit en energie, per kwartaal voor de staatsschuld. Nieuwe signalen komen uit
          <code> agent/actualiteit/wacht.py</code>; de bronnenlijst staat in <code>agent/actualiteit/domeinen.json</code>.
        </p>
      </div>
    </main>
  )
}