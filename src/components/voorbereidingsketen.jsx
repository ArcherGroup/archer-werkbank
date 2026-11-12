import React, { useId } from 'react'
import { bouwKeten } from '../lib/voorbereidingsketen'
import { Icoon, SOORT_ICOON } from './Icoon'
import { LegeStaat } from './leegstaat'
import './voorbereidingsketen.css'

/* Voorbereidingsketen: wat hangt er echt aan één dagdeel, per stap van de werkwijze
   vraag → bronnen → stelling → lesinhoud → oefening → feedback → bijsturing, met directe doorkliks.
   Alleen weergave plus het doorgeven van expliciete klikken: geen netwerk, geen database, geen
   opslag, geen eigen oordeel. De rekenregels staan in lib/voorbereidingsketen.js.

   Wat je ziet is wat er in de gegevens staat. "Gekoppeld" betekent dat er iets bij dit dagdeel hangt, niet
   dat het gecontroleerd, goedgekeurd of af is: er bestaat geen stand "klaar" en er is geen voortgangsmeter.
   Niet aangeleverd of nog aan het laden heet "onbekend", nooit "0" of "leeg".

   Props
   - blok            { id, code?, titel? } het gekozen dagdeel; zonder bruikbaar id een eerlijke lege staat met een weg naar de planning
   - documentenMeta  [{ id, blok_id, soort, titel, bytes }]          undefined/null = niet aangeleverd (onbekend)
   - bronnen         [{ id, blok_id, document_id, titel, status }]    idem
   - notities        notities van het dagdeel                         idem
   - beslissingen    alle beslissingen; de keten kiest zelf de beslissingen van dit dagdeel
   - doel            optioneel: doeltekst uit de brief; doelBron={ id } koppelt haar aan die brief
   - stelling        optioneel: kernboodschap; stellingBron={ id } koppelt haar aan die brief
   - geladen         alleen een echte `false` betekent: nog aan het laden → alles onbekend, geen doorklikken
   - naar(route)     '#/doc/:id', '#/bron/:id', '#/beslissing/:id', '#/blok/:id' of '#/planning'. Elke doorklik is ook een gewone
                     link met href: zonder `naar` werkt de #-link zelf, en cmd-, ctrl-, shift- of middelklik opent een nieuw tabblad.
   - opBlokPagina    true als de keten al op de pagina van het dagdeel staat: dan verwijst hij niet naar zichzelf
   - niveau          kopniveau 2 t/m 6 (standaard 2), zodat de kop in de pagina past */

const MAX_ZICHTBAAR = 3
const BRON_STATUS = { ongelezen: 'Ongelezen', gelezen: 'Gelezen', kernbron: 'Kernbron' }
const BESLISSING_STATUS = { open: 'Open', beslist: 'Besluit vastgelegd' }
const LEEG = {
  vraag: 'Geen brief bij dit dagdeel.',
  bronnen: 'Geen bronnen of research bij dit dagdeel.',
  stelling: 'Er is geen stelling aangeleverd.',
  lesinhoud: 'Nog geen spreektekst of slides.',
  oefening: 'Nog geen werkboek of oefening.',
  feedback: 'Nog geen notities bij dit dagdeel.',
  bijsturing: 'Geen beslissingen aan dit dagdeel gekoppeld.',
}

// Dezelfde afronding als de rest van de werkbank (data.js · bytesLeesbaar), zonder die module en zijn Supabase-client binnen te halen.
function bytesTekst(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(n / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`
}

const datumKort = (iso) => new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })

/* Een echte link die, bij een gewone klik, via naar() door de app gaat (met de bewaking tegen werkverlies).
   Alles wat de browser zelf hoort te doen (nieuw tabblad, link kopiëren, geen `naar`) blijft werken. */
function Pad({ route, naar, className, children }) {
  const klik = (e) => {
    if (typeof naar !== 'function' || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    naar(route)
  }
  return <a href={route} className={className} onClick={klik}>{children}</a>
}

function standTekst(stap) {
  if (stap.stand === 'onbekend') return stap.reden === 'laden' ? 'Wordt geladen' : 'Onbekend'
  if (stap.stand === 'leeg') return stap.reden === 'zonder-inhoud' ? 'Nog zonder inhoud' : stap.id === 'stelling' ? 'Niets aangeleverd' : 'Niets gekoppeld'
  if (stap.id === 'stelling') return 'Aangeleverd'
  if (stap.id === 'feedback') return `${stap.aantal} ${stap.aantal === 1 ? 'notitie' : 'notities'}`
  if (stap.id === 'bijsturing') return `${stap.aantal} ${stap.aantal === 1 ? 'beslissing' : 'beslissingen'}`
  return `${stap.aantal} gekoppeld`
}

/* Eén zin die zegt waarom een stap leeg of onbekend is, in gewone taal. Niets bij een stap met inhoud. */
function melding(stap) {
  const onvolledig = stap.reden === 'onvolledig' ? 'Niet alle gegevens zijn aangeleverd; er kan meer bestaan.' : ''
  if (stap.stand === 'onbekend') {
    if (stap.reden === 'laden') return 'De gegevens worden nog geladen.'
    if (stap.reden === 'niet-vastgelegd') return 'De werkbank legt de stelling niet apart vast.'
    return 'De werkbank heeft hier geen gegevens over gekregen. Dat is niet hetzelfde als niets.'
  }
  if (stap.stand === 'leeg') return stap.reden === 'zonder-inhoud' ? 'Het stuk bestaat, maar is nog leeg.' : [LEEG[stap.id], onvolledig].filter(Boolean).join(' ')
  return onvolledig
}

function itemMeta(item) {
  if (item.soort === 'bron') return BRON_STATUS[item.status] ?? ''
  if (item.soort === 'beslissing') return BESLISSING_STATUS[item.status] ?? ''
  return [item.label, item.leeg ? 'leeg' : item.bytes != null ? bytesTekst(item.bytes) : null].filter(Boolean).join(' · ')
}

function Item({ item, naar }) {
  const icoon = item.soort === 'stuk' ? SOORT_ICOON[item.type] ?? 'paperclip' : item.soort === 'bron' ? 'bronnen' : 'planning'
  const meta = itemMeta(item)
  return (
    <li className="vk-item">
      <Pad route={item.route} naar={naar} className="vk-link">
        <Icoon naam={icoon} maat={14} className="vk-icoon" />
        <span className="vk-titel">{item.titel}</span>
        {meta && <span className="vk-meta">{meta}</span>}
        <Icoon naam="chevronRechts" maat={14} className="vk-pijl" />
      </Pad>
    </li>
  )
}

function Stap({ stap, nummer, naar, opBlokPagina }) {
  const zichtbaar = stap.items.slice(0, MAX_ZICHTBAAR)
  const rest = stap.items.slice(MAX_ZICHTBAAR)
  const tekst = melding(stap)
  return (
    <li className="vk-stap" data-stap={stap.id} data-stand={stap.stand}>
      <span className="vk-nr" aria-hidden="true">{nummer}</span>
      <div className="vk-inhoud">
        <div className="vk-kop">
          <span className="vk-naam">{stap.naam}</span>
          <span className="vk-stand" data-stand={stap.stand}>{standTekst(stap)}</span>
        </div>
        <p className="vk-doel">{stap.doel}</p>
        {stap.doelTekst && <><blockquote className="vk-stelling">{stap.doelTekst}</blockquote><p className="vk-melding"><Pad route={stap.doelHerkomst.route} naar={naar} className="vk-tekstlink">Doel uit de brief bekijken</Pad></p></>}
        {stap.id === 'stelling' && stap.tekst && <blockquote className="vk-stelling">{stap.tekst}</blockquote>}
        {stap.herkomst && <p className="vk-melding"><Pad route={stap.herkomst.route} naar={naar} className="vk-tekstlink">Kernboodschap uit de brief bekijken</Pad></p>}
        {tekst && <p className="vk-melding">{tekst}</p>}
        {stap.verwijzing && (
          <p className="vk-melding">
            <Pad route={stap.verwijzing.route} naar={naar} className="vk-tekstlink">Zoek ze in de brief</Pad>
          </p>
        )}
        {stap.id === 'feedback' && stap.aantal > 0 && (
          <p className="vk-melding">
            {stap.laatste && (
              <>
                Laatste{stap.laatste.auteur ? ` van ${stap.laatste.auteur}` : ''}: <time dateTime={stap.laatste.datum}>{datumKort(stap.laatste.datum)}</time>.{' '}
              </>
            )}
            {!opBlokPagina && <Pad route={stap.route} naar={naar} className="vk-tekstlink">Lees ze bij het dagdeel</Pad>}
          </p>
        )}
        {zichtbaar.length > 0 && (
          <ul className="vk-items" role="list">
            {zichtbaar.map((item) => <Item key={`${item.soort}-${item.id}`} item={item} naar={naar} />)}
          </ul>
        )}
        {rest.length > 0 && (
          <details className="vk-meer">
            <summary>{rest.length} meer tonen</summary>
            <ul className="vk-items" role="list">
              {rest.map((item) => <Item key={`${item.soort}-${item.id}`} item={item} naar={naar} />)}
            </ul>
          </details>
        )}
      </div>
    </li>
  )
}

export function Voorbereidingsketen({ blok, documentenMeta, bronnen, notities, beslissingen, doel, doelBron, stelling, stellingBron, geladen = true, naar, opBlokPagina = false, niveau = 2 }) {
  const kopId = useId()
  const keten = bouwKeten({ blok, documentenMeta, bronnen, notities, beslissingen, doel, doelBron, stelling, stellingBron, geladen })
  const laden = !keten.geladen
  const Kop = `h${Number.isInteger(niveau) ? Math.min(6, Math.max(2, niveau)) : 2}`

  if (!keten.blok) {
    return (
      <section className="voorbereidingsketen" aria-labelledby={kopId} aria-busy={laden || undefined} data-dagdeel="geen">
        <Kop id={kopId} className="vk-h">Voorbereidingsketen</Kop>
        {laden ? (
          <p className="vk-melding" role="status">De gegevens van het dagdeel worden geladen.</p>
        ) : (
          <LegeStaat
            compact
            icoon="planning"
            titel="Geen dagdeel gekozen"
            uitleg="Kies een dagdeel in de planning om te zien wat er aan de voorbereiding hangt."
            acties={<Pad route="#/planning" naar={naar} className="knop primair">Naar de planning</Pad>}
          />
        )}
      </section>
    )
  }

  const naam = [keten.blok.code, keten.blok.titel].filter(Boolean).join(' · ') || keten.blok.id
  return (
    <section className="voorbereidingsketen" aria-labelledby={kopId} aria-busy={laden || undefined} data-dagdeel={keten.blok.id}>
      <header className="vk-hoofd">
        <Kop id={kopId} className="vk-h">Voorbereidingsketen</Kop>
        {opBlokPagina ? (
          <span className="vk-dagdeel">{naam}</span>
        ) : (
          <Pad route={keten.blok.route} naar={naar} className="vk-dagdeel vk-dagdeel-link">
            {naam}
            <Icoon naam="chevronRechts" maat={14} />
          </Pad>
        )}
      </header>
      <ol className="vk-keten" role="list">
        {keten.stappen.map((stap, i) => <Stap key={stap.id} stap={stap} nummer={i + 1} naar={naar} opBlokPagina={opBlokPagina} />)}
      </ol>
      <p className="vk-voet">
        <Icoon naam="info" maat={14} />
        <span>
          Gekoppeld betekent alleen dat er iets bij dit dagdeel hangt: de inhoud is niet gecontroleerd.
          De volgorde is een werkwijze, geen meter voor hoe ver je bent.
        </span>
      </p>
      <details className="vk-telt">
        <summary>Wat telt per stap?</summary>
        <dl>
          {keten.stappen.map((stap) => (
            <div key={stap.id}>
              <dt>{stap.naam}</dt>
              <dd>{stap.telt}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}
