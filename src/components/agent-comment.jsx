import React, { useId, useRef, useState } from 'react'
import { veiligeBronUrl } from '../lib/bron-check'
import { Icoon } from './Icoon'
import './agent-comment.css'

/* AgentComment: een gedeelde agent expliciet laten nakijken bij één notitie, en wat de agent
   teruggeeft door een mens laten beoordelen. Alleen weergave plus het doorgeven van expliciete
   klikken: geen netwerk, geen database, geen eigen opslag, geen effecten en nooit een eigen
   resultaat. Wat er echt gebeurt, hangt af van de callbacks van de ouder; zonder die callbacks
   (of zonder echte inlog) staat alles uit en zegt de component dat eerlijk.

   Props
   - notitie      { id, wachtend? }  de notitie waarbij de agent start; een tijdelijk id (tmp-…) of `wachtend` telt niet
   - documentId   het stuk waarbij de notitie hoort
   - beschikbaar  alleen echt `true` telt: de gedeelde agent is geactiveerd
   - ingelogd     alleen echt `true` telt: een echte sessie. Een ingevulde naam is geen inlog en geeft nooit rechten.
   - opdracht     de opdracht bij deze notitie of null (hieronder)
   - opStart({ notitieId, documentId })   alleen na een klik op de startknop; mag een promise teruggeven
   - opBeoordeel({ opdrachtId?, voorstelId?, notitieId, documentId, besluit })   besluit 'goedgekeurd' of
                  'afgewezen', alleen na "Ja, …" in de bevestiging; mag een promise teruggeven. De id's die
                  er niet zijn, ontbreken. Wat er met een goedkeuring gebeurt (bijvoorbeeld toepassen in het
                  stuk), beslist de ouder; deze weergave past niets aan en belooft er niets over.
   Een fout of afwijzing (throw / rejected promise) van beide callbacks toont een eerlijke foutmelding. Een
   bekende weigering (message of code, bijvoorbeeld 'niet_de_eigenaar' of 'document_gewijzigd') staat dan
   in gewone taal; de ruwe tekst van een fout komt nooit in beeld.

   opdracht (de velden van werkbank.agent_opdrachten en agent_voorstellen werken zonder hernoemen)
   - status       'wachtrij' | 'bezig' | 'klaar' | 'mislukt' | 'geannuleerd'; al het andere heet "Onbekende status"
   - id           id van de opdracht
   - voorstel_id  id van het voorstel; genoeg om te kunnen beoordelen, ook zonder `id`
   - bijgewerkt   ISO-tijdstip; anders klaar_op (afgerond), anders created_at (aangevraagd). Alleen een geldig tijdstip wordt getoond.
   - fout         bij mislukt: een code van de agentlaag of vrije tekst; anders `fout_code`
   - beoordeling  { besluit: 'goedgekeurd' | 'toegepast' | 'afgewezen', door? } zodra een mens heeft beslist

   Bij status klaar beslist het type (`type`, of `soort`) wat je ziet:
   - 'wijziging' (ook 'voorstel') of geen type: een wijzigingsvoorstel met `oorspronkelijk` en `voorstel`
     (of `voorgesteld`), plus optioneel `uitleg`, `reden`, `modelduiding` (of `duiding`), `bronnen`,
     `bronstatus` ('niet_opgezocht') en `document_versie`. Alleen als beide teksten er zijn en echt
     verschillen, is het een voorstel met Goedkeuren en Afwijzen.
   - 'antwoord': een antwoord zonder tekstwijziging, de tekst staat in `uitleg`. Altijd "nog te
     controleren", nooit goed of af te keuren.
   - elk ander type of geen bruikbare tekst: "resultaat zonder concreet voorstel", ook zonder knoppen.
   bronnen: [{ titel, url, citaat }]. Alleen een gewoon, openbaar http(s)-adres wordt een link.

   Alles wat een model of database aanlevert wordt als platte tekst getoond: geen HTML, geen markdown,
   en verborgen of omkerende tekens worden zichtbaar gemaakt. */

const STATUSSEN = {
  wachtrij: { label: 'In de wachtrij', icoon: 'statusConcept', tekst: 'De opdracht staat in de wachtrij. De agent is nog niet begonnen.' },
  bezig: { label: 'Bezig', icoon: 'laden', tekst: 'De agent werkt aan de opdracht. Het resultaat verschijnt hier zodra de agent het heeft afgerond.' },
  klaar: { label: 'Klaar', icoon: 'statusKlaar' },
  mislukt: { label: 'Mislukt', icoon: 'waarschuwing', tekst: 'De agent kon de opdracht niet afronden. Er is niets om te beoordelen.' },
  geannuleerd: { label: 'Geannuleerd', icoon: 'sluiten', tekst: 'Deze opdracht is geannuleerd. Er is niets om te beoordelen.' },
}
const ONBEKEND = { label: 'Onbekende status', icoon: 'info' }

/* Meldingscodes van de agentlaag en de database in gewone taal; al het andere blijft platte tekst.
   Dezelfde codes als in werkbank.agent_opdrachten (fout_code) en de functies rond vraag_agent en
   beoordeel_agentvoorstel. */
const FOUTEN = {
  niet_toegelaten: 'Je hebt hier geen toegang toe.',
  werkbank_onveilig: 'De werkbank is nog niet veilig genoeg ingesteld voor de agent, dus er is niets gestart.',
  agent_niet_vrijgegeven: 'De gedeelde agent is nog niet vrijgegeven.',
  notitie_hoort_niet_bij_document: 'Deze notitie hoort niet bij dit stuk.',
  vertrouwelijk_geweigerd: 'Dit stuk is vertrouwelijk of niet toegelaten en gaat niet naar de agent.',
  ongeldige_opdracht: 'De opdracht was onvolledig of hoorde niet bij dit stuk.',
  anker_niet_uniek: 'De geselecteerde tekst komt meer dan één keer voor in het stuk. Selecteer een passage die maar één keer voorkomt.',
  anker_vereist: 'Dit stuk is te lang voor de agent. Selecteer eerst de passage waar het over gaat.',
  limiet_bereikt: 'De limiet voor agentopdrachten is bereikt.',
  ongeldige_uitvoer: 'De agent gaf geen bruikbaar antwoord.',
  tekst_niet_uniek: 'De agent noemde een tekstfragment dat niet precies één keer in het stuk staat.',
  model_niet_toegelaten: 'Dit model is niet toegelaten.',
  model_fout: 'Het model gaf een fout terug.',
  modelsleutel_ontbreekt: 'Er is geen modelsleutel ingesteld, dus de agent kan niet werken.',
  redirect_geweigerd: 'Een bronadres stuurde door naar een plek die niet toegelaten is.',
  timeout: 'De agent deed er te lang over en is gestopt.',
  budget_op: 'Het budget voor agentopdrachten is op.',
  lease_verlopen: 'De agent reageerde niet meer en is te vaak opnieuw geprobeerd.',
  kosten_onbekend_of_te_hoog: 'De kosten van deze opdracht waren onbekend of te hoog.',
  document_gewijzigd_of_geweigerd: 'Het stuk is gewijzigd sinds de aanvraag, of mag niet meer naar de agent.',
  interne_fout: 'De agent kreeg een interne fout.',
  niet_de_eigenaar: 'Alleen de eigenaar van dit blok mag dit voorstel beoordelen.',
  extra_verificatie_vereist: 'Bevestig eerst je identiteit met tweestapsverificatie en probeer daarna opnieuw.',
  voorstel_gewijzigd: 'Het voorstel is gewijzigd sinds je het bekeek. Herlaad en beoordeel opnieuw.',
  voorstel_al_beoordeeld: 'Dit voorstel is al beoordeeld.',
  geen_tekstvoorstel: 'Dit is een antwoord en geen tekstvoorstel; er valt niets goed te keuren.',
  document_gewijzigd: 'Het stuk is gewijzigd sinds dit voorstel gemaakt werd, dus het voorstel past niet meer.',
}

/* Welke weigeringen een terugkerende fout van opStart of opBeoordeel mag verklaren. Meer niet:
   een gewone netwerkfout met het woord "timeout" is geen melding van de agent. */
const START_WEIGERINGEN = ['niet_toegelaten', 'werkbank_onveilig', 'agent_niet_vrijgegeven', 'notitie_hoort_niet_bij_document',
  'vertrouwelijk_geweigerd', 'ongeldige_opdracht', 'anker_vereist', 'anker_niet_uniek', 'limiet_bereikt']
const BEOORDEEL_WEIGERINGEN = ['niet_toegelaten', 'werkbank_onveilig', 'voorstel_al_beoordeeld', 'niet_de_eigenaar', 'geen_tekstvoorstel', 'document_gewijzigd', 'extra_verificatie_vereist', 'voorstel_gewijzigd']

/* Wat een weigering in gewone taal zegt, of niets als we haar niet kennen. Een Supabase-fout, een
   Error en kale tekst dragen de code als `message` (of `code`). Alleen hele codes tellen, en de
   ruwe tekst van een fout komt nooit in beeld. */
function weigering(fout, toegestaan) {
  const bron = typeof fout === 'string' ? fout : `${tekstVan(fout?.message)} ${tekstVan(fout?.code)}`
  const code = bron.slice(0, 2000).toLowerCase().split(/[^a-z0-9_]+/).find((woord) => toegestaan.includes(woord))
  return code ? FOUTEN[code] : ''
}

const WIJZIGING_TYPEN = ['wijziging', 'voorstel', 'wijzigingsvoorstel']
// 'toegepast' is hoe de database een goedgekeurd voorstel noemt: het is dan ook in het stuk gezet.
const BESLUITEN = { goedgekeurd: 'Goedgekeurd', toegepast: 'Goedgekeurd en toegepast in het stuk', afgewezen: 'Afgewezen' }
const TIJDEN = [['bijgewerkt', 'Bijgewerkt'], ['klaar_op', 'Afgerond'], ['created_at', 'Aangevraagd']]

const eigen = (object, sleutel) => Object.prototype.hasOwnProperty.call(object, sleutel)
const isObject = (waarde) => waarde !== null && typeof waarde === 'object' && !Array.isArray(waarde)
const tekstVan = (waarde) => (typeof waarde === 'string' ? waarde : '')
const heeft = (tekst) => tekst.trim() !== ''
const kort = (tekst, max) => (tekst.length > max ? `${tekst.slice(0, max)}…` : tekst)
const heeftId = (waarde) => (typeof waarde === 'number' && Number.isFinite(waarde)) || (typeof waarde === 'string' && waarde.trim() !== '')
const regels = (tekst) => tekst.replace(/\r\n?/g, '\n').trim()

/* Wat je leest moet zijn wat er staat: onzichtbare tekens, tekenreeks-omkeerders en
   verborgen "tag"-tekens worden zichtbaar gemaakt als ‹U+….›. */
const VERBORGEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu

/* Een host die een gewone openbare website kan zijn: geen intranetnaam, geen loopback,
   geen privé- of linklocal-adres. Dezelfde lijn als de Python-agent voor zijn eigen bronnen. */
function openbaarHost(naam) {
  const host = naam.toLowerCase().replace(/\.$/, '')
  if (!host || host.includes(':') || host.startsWith('[') || !host.includes('.')) return false
  if (/\.(?:localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return false
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!v4) return true
  const [a, b] = [Number(v4[1]), Number(v4[2])]
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
}

/* Een bronadres wordt alleen een link als het een gewoon, openbaar http(s)-adres is,
   zonder spaties, besturingstekens of inloggegevens. Al het andere blijft tekst. */
function veiligeLink(adres) {
  if (typeof adres !== 'string' || !/^https?:\/\//i.test(adres) || /[\s\u0000-\u001F\u007F-\u009F]/.test(adres)) return null
  if (!veiligeBronUrl(adres)) return null
  const host = new URL(adres).hostname
  return openbaarHost(host) ? { href: adres, host } : null
}

function datumKort(iso) {
  const datum = new Date(iso)
  return Number.isNaN(datum.getTime())
    ? null
    : { iso: datum.toISOString(), tekst: datum.toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
}

/* Het eerste geldige tijdstip: bijgewerkt, anders afgerond (klaar_op), anders aangevraagd (created_at). */
function leesTijd(opdracht) {
  for (const [veld, label] of TIJDEN) {
    const tijd = typeof opdracht[veld] === 'string' ? datumKort(opdracht[veld]) : null
    if (tijd) return { ...tijd, label }
  }
  return null
}

/* Leest de opdracht defensief: alles komt uit een database of van een model en kan van
   het verkeerde type zijn. Waar geen tekst staat, blijft het veld leeg. */
function leesOpdracht(opdracht) {
  if (!opdracht) return null
  if (!isObject(opdracht)) return { status: null, ruweStatus: '' }
  let verborgen = 0
  const schoon = (waarde) => tekstVan(waarde).replace(VERBORGEN, (teken) => {
    verborgen += 1
    return `‹U+${teken.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}›`
  })

  const status = typeof opdracht.status === 'string' && eigen(STATUSSEN, opdracht.status) ? opdracht.status : null
  const type = tekstVan(opdracht.type).trim() || tekstVan(opdracht.soort).trim()
  const soort = !type ? null : type === 'antwoord' ? 'antwoord' : WIJZIGING_TYPEN.includes(type) ? 'wijziging' : 'onbekend'
  const oorspronkelijk = schoon(opdracht.oorspronkelijk)
  const voorstel = schoon(heeft(tekstVan(opdracht.voorstel)) ? opdracht.voorstel : opdracht.voorgesteld)
  // Een echt wijzigingsvoorstel heeft beide teksten en ze verschillen; anders valt er niets te beoordelen.
  const concreet = heeft(oorspronkelijk) && heeft(voorstel) && regels(oorspronkelijk) !== regels(voorstel)
  const resultaat = status !== 'klaar' ? null
    : soort === 'antwoord' ? 'antwoord'
    : soort === 'onbekend' ? 'onbekend'
    : concreet ? 'wijziging' : 'leeg'

  const data = {
    status,
    ruweStatus: status ? '' : kort(tekstVan(opdracht.status).trim(), 40),
    id: opdracht.id,
    voorstelId: opdracht.voorstel_id,
    fout: schoon(heeft(tekstVan(opdracht.fout)) ? opdracht.fout : opdracht.fout_code).trim(),
    tijd: leesTijd(opdracht),
    soort,
    type: schoon(type),
    resultaat,
    oorspronkelijk,
    voorstel,
    uitleg: schoon(opdracht.uitleg).trim(),
    reden: schoon(opdracht.reden).trim(),
    duiding: schoon(heeft(tekstVan(opdracht.modelduiding)) ? opdracht.modelduiding : opdracht.duiding).trim(),
    bronnen: (Array.isArray(opdracht.bronnen) ? opdracht.bronnen : []).filter(isObject).map((bron) => ({
      titel: schoon(bron.titel).trim(),
      citaat: schoon(bron.citaat).trim(),
      link: veiligeLink(bron.url),
      heeftAdres: heeft(tekstVan(bron.url)),
    })).filter((bron) => bron.titel || bron.heeftAdres),
    nietOpgezocht: opdracht.bronstatus === 'niet_opgezocht',
    versie: Number.isInteger(opdracht.document_versie) && opdracht.document_versie > 0 ? opdracht.document_versie : null,
    beoordeling: leesBeoordeling(opdracht.beoordeling, schoon),
  }
  data.verborgen = verborgen
  return data
}

/* Een vastgelegde beoordeling. Alleen een object met een besluit telt; al het andere
   (leeg object, tekst, getal) betekent: nog niet beoordeeld. */
function leesBeoordeling(beoordeling, schoon) {
  if (!isObject(beoordeling)) return null
  const besluit = tekstVan(beoordeling.besluit).trim()
  if (!besluit) return null
  return { besluit: eigen(BESLUITEN, besluit) ? besluit : 'onbekend', door: schoon(beoordeling.door).trim() }
}

/* Waarom de startknop uit staat, in gewone taal. Leeg = starten mag. Een vlag telt alleen
   als hij echt `true` is: bij twijfel blijft alles dicht. */
function startBlokkades({ notitie, documentId, beschikbaar, ingelogd, opStart }) {
  const reden = []
  if (beschikbaar !== true) reden.push('De gedeelde agent is nog niet actief, dus er wordt niets gestart.')
  if (ingelogd !== true) reden.push('Je bent niet ingelogd. Zonder inlog kan er geen agentopdracht gestart worden.')
  if (!heeftId(notitie?.id) || notitie?.wachtend || String(notitie.id).startsWith('tmp-')) reden.push('Deze notitie is nog niet bewaard. Bewaar haar eerst; de agent werkt alleen met een bewaarde notitie.')
  if (!heeftId(documentId)) reden.push('Deze notitie is niet aan een stuk gekoppeld, dus de agent heeft niets om na te kijken.')
  if (beschikbaar === true && typeof opStart !== 'function') reden.push('Starten is hier nog niet aangesloten.')
  return reden
}

const KLAAR_TEKST = {
  wijziging: 'De agent heeft een wijzigingsvoorstel gedaan. Een mens moet het nog beoordelen.',
  antwoord: 'De agent is klaar met een antwoord. Er is geen tekstwijziging voorgesteld.',
  onbekend: 'De agent meldt klaar, maar met een onbekend type resultaat. Er is niets om te beoordelen.',
  leeg: 'De agent meldt klaar, maar zonder concreet voorstel. Er is niets om te beoordelen.',
}

function Statusregel({ data }) {
  const info = data.status ? STATUSSEN[data.status] : ONBEKEND
  const tekst = !data.status
    ? `De status van deze opdracht${data.ruweStatus ? ` (${data.ruweStatus})` : ''} is niet herkenbaar. Er wordt niets getoond of toegepast.`
    : data.status === 'klaar' ? KLAAR_TEKST[data.resultaat] : info.tekst
  const melding = data.status === 'mislukt' && data.fout ? (eigen(FOUTEN, data.fout) ? FOUTEN[data.fout] : kort(data.fout, 300)) : ''
  return (
    <div className="agent-comment-statusregel" role="status">
      <span className="agent-comment-status" data-status={data.status ?? 'onbekend'}>
        <Icoon naam={info.icoon} maat={14} className={data.status === 'bezig' ? 'agent-comment-draait' : undefined} />
        {info.label}
      </span>
      <span className="agent-comment-statustekst">{tekst}</span>
      {data.tijd && (
        <time className="agent-comment-tijd" dateTime={data.tijd.iso}>{data.tijd.label} {data.tijd.tekst}</time>
      )}
      {melding && <p className="agent-comment-melding">Melding: {melding}</p>}
    </div>
  )
}

function Veld({ id, label, kind, children }) {
  return (
    <div className="agent-comment-veld" role="group" aria-labelledby={id} data-veld={kind}>
      <div className="agent-comment-label" id={id}>{label}</div>
      {children}
    </div>
  )
}

function Bron({ bron }) {
  return (
    <li className="agent-comment-bron">
      {bron.link
        ? <a href={bron.link.href} target="_blank" rel="noopener noreferrer">{bron.titel || bron.link.href}</a>
        : <span className="agent-comment-bronnaam">{bron.titel || 'Bron zonder titel'}</span>}
      {bron.link && <span className="agent-comment-host">{bron.link.host}</span>}
      {!bron.link && (
        <span className="agent-comment-bronnoot">
          {bron.heeftAdres ? 'Geen link: het adres is ongeldig of niet veilig.' : 'Geen adres meegegeven, dus niet te controleren.'}
        </span>
      )}
      {bron.citaat && (
        <p className="agent-comment-citaat"><span className="agent-comment-citaatlabel">Citaat volgens de agent:</span> {bron.citaat}</p>
      )}
    </li>
  )
}

function Bronnen({ data }) {
  if (data.bronnen.length === 0 && !data.nietOpgezocht) return null
  return (
    <div className="agent-comment-bronnen">
      {data.bronnen.length > 0 && (
        <>
          <div className="agent-comment-label">Bronnen volgens de agent</div>
          <ul className="agent-comment-bronlijst">{data.bronnen.map((bron, i) => <Bron bron={bron} key={i} />)}</ul>
        </>
      )}
      {data.nietOpgezocht && data.bronnen.length === 0 && <p className="agent-comment-notitie">De agent heeft geen bronnen opgezocht.</p>}
    </div>
  )
}

function VerborgenNotitie({ data, wat }) {
  if (data.verborgen === 0) return null
  return <p className="agent-comment-notitie">{`${wat} bevat verborgen tekens. Ze zijn zichtbaar gemaakt als ‹U+…›; kijk goed of dat de bedoeling is.`}</p>
}

function Waarschuwing({ children }) {
  return (
    <p className="agent-comment-waarschuwing">
      <Icoon naam="info" maat={14} />
      <span>{children}</span>
    </p>
  )
}

/* Eén omhulsel voor alles wat de agent teruggeeft, met een kop en een eerlijk label. */
function Resultaat({ basis, soort, titel, pil, children }) {
  return (
    <div className="agent-comment-resultaat" role="group" aria-labelledby={`${basis}-kop`} data-soort={soort}>
      <div className="agent-comment-resultaatkop">
        <span className="agent-comment-resultaattitel" id={`${basis}-kop`}>{titel}</span>
        <span className="agent-comment-pil">{pil}</span>
      </div>
      {children}
    </div>
  )
}

/* Waarom beoordelen niet kan, in gewone taal. Leeg = beoordelen mag. Alleen de callback,
   de inlog en een herkenbaar id (van de opdracht of van het voorstel) tellen; een naam geeft nooit rechten. */
function beoordeelBlokkades({ ingelogd, opBeoordeel, kenbaar }) {
  const reden = []
  if (typeof opBeoordeel !== 'function') reden.push('Beoordelen is hier nog niet aangesloten.')
  if (ingelogd !== true) reden.push('Log in om dit voorstel te beoordelen.')
  if (!kenbaar) reden.push('Beoordelen kan niet: deze opdracht heeft geen herkenbaar id.')
  return reden
}

/* Wat je met een klik op Goedkeuren of Afwijzen zegt, zonder iets te beloven over wat de ouder
   met je beslissing doet: dat weet deze weergave niet. */
const BEVESTIGING = {
  goedgekeurd: {
    titel: 'Dit voorstel goedkeuren?',
    uitleg: 'Je keurt de vervanging van de oorspronkelijke door de voorgestelde tekst goed, nadat je beide zelf hebt gelezen. Pas na deze bevestiging wordt je beslissing doorgegeven.',
    actie: 'Ja, goedkeuren',
  },
  afgewezen: {
    titel: 'Dit voorstel afwijzen?',
    uitleg: 'Je wijst de vervanging van de oorspronkelijke door de voorgestelde tekst af. Pas na deze bevestiging wordt je beslissing doorgegeven.',
    actie: 'Ja, afwijzen',
  },
}

// Stabiele functie: React roept hem alleen aan bij het verschijnen van het element, dus de focus verhuist één keer.
const focusBijVerschijnen = (element) => { if (element) element.focus() }

/* Goedkeuren en Afwijzen: een klik opent alleen een vraag; pas "Ja, …" geeft door aan opBeoordeel. */
function Beoordeling({ data, basis, blokkades, beheer }) {
  const beoordeling = data.beoordeling
  if (beoordeling) {
    const wie = beoordeling.door ? ` door ${beoordeling.door}` : ''
    const tekst = beoordeling.besluit === 'onbekend'
      ? 'Beoordeeld, met een besluit dat we niet kennen.'
      : `${BESLUITEN[beoordeling.besluit]}${wie}.`
    const goed = beoordeling.besluit === 'goedgekeurd' || beoordeling.besluit === 'toegepast'
    return (
      <p className="agent-comment-besluit" data-besluit={beoordeling.besluit}>
        <Icoon naam={goed ? 'vinkje' : 'info'} maat={14} />
        <span>{tekst}</span>
      </p>
    )
  }
  if (beheer.lokaal) {
    return (
      <p className="agent-comment-besluit" data-besluit={beheer.lokaal} tabIndex={-1} ref={focusBijVerschijnen}>
        <Icoon naam="info" maat={14} />
        <span>Je beoordeling is doorgegeven: {BESLUITEN[beheer.lokaal].toLowerCase()}.</span>
      </p>
    )
  }
  const kan = blokkades.length === 0
  const bevestigId = `${basis}-bevestig`
  const knop = (besluit, label, klasse) => (
    <button
      type="button"
      className={klasse}
      disabled={!kan}
      aria-disabled={beheer.bezig || undefined}
      aria-expanded={beheer.bevestig === besluit}
      aria-controls={beheer.bevestig === besluit ? bevestigId : undefined}
      aria-describedby={`${basis}-beoordeel-hint`}
      onClick={() => beheer.open(besluit)}
      ref={(element) => { beheer.triggers.current[besluit] = element }}
    >
      {label}
    </button>
  )
  const vraag = beheer.bevestig ? BEVESTIGING[beheer.bevestig] : null
  return (
    <div className="agent-comment-beoordeling">
      <div id={`${basis}-beoordeel-hint`} className="agent-comment-hint">
        {kan
          ? <p>Jij beslist. De agent past zelf niets aan; pas na je bevestiging wordt je beslissing doorgegeven.</p>
          : blokkades.map((tekst) => <p key={tekst}>{tekst}</p>)}
      </div>
      {beheer.fout && (
        <p role="alert" className="agent-comment-fout">
          Je beoordeling kon niet bevestigd worden. {beheer.fout.uitleg || 'Controleer de stand voor je opnieuw probeert.'}
        </p>
      )}
      <div className="agent-comment-knoppen">
        {knop('afgewezen', 'Afwijzen', 'knop')}
        {knop('goedgekeurd', 'Goedkeuren', 'knop primair')}
      </div>
      {vraag && (
        <div
          id={bevestigId}
          className="agent-comment-bevestig"
          role="group"
          aria-labelledby={`${bevestigId}-titel`}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); beheer.annuleer() } }}
        >
          <p className="agent-comment-bevestigtitel" id={`${bevestigId}-titel`}>{vraag.titel}</p>
          <p className="agent-comment-hint">{vraag.uitleg}</p>
          <div className="agent-comment-knoppen">
            <button type="button" className="knop" autoFocus aria-disabled={beheer.bezig || undefined} onClick={beheer.annuleer}>Annuleer</button>
            <button
              type="button"
              className={beheer.bevestig === 'goedgekeurd' ? 'knop primair' : 'knop'}
              aria-disabled={beheer.bezig || undefined}
              onClick={beheer.bevestigKlik}
            >
              {beheer.bezig ? 'Bezig…' : vraag.actie}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Voorstel({ data, basis, blokkades, beheer }) {
  const uitleg = [data.uitleg, data.duiding].filter(heeft)
  const pil = data.beoordeling ? 'Beoordeeld' : beheer.lokaal ? 'Beoordeling doorgegeven' : 'Nog niet beoordeeld'
  return (
    <Resultaat basis={basis} soort="wijziging" titel="Wijzigingsvoorstel van de agent" pil={pil}>
      <Waarschuwing>Dit voorstel is door een model geschreven en is niet gevalideerd. Het wordt niet automatisch toegepast; lees zelf na of het klopt.</Waarschuwing>
      <div className="agent-comment-vergelijk">
        <Veld id={`${basis}-oud`} label="Oorspronkelijke tekst" kind="oorspronkelijk">
          <div className="agent-comment-tekst">{data.oorspronkelijk}</div>
        </Veld>
        <Veld id={`${basis}-nieuw`} label="Voorgestelde tekst" kind="voorgesteld">
          <div className="agent-comment-tekst">{data.voorstel}</div>
        </Veld>
      </div>
      {data.reden && (
        <Veld id={`${basis}-reden`} label="Reden volgens de agent" kind="reden">
          <div className="agent-comment-tekst">{data.reden}</div>
        </Veld>
      )}
      {uitleg.length > 0 && (
        <Veld id={`${basis}-uitleg-model`} label="Uitleg van het model · niet gevalideerd" kind="uitleg">
          {uitleg.map((alinea, i) => <div className="agent-comment-tekst" key={i}>{alinea}</div>)}
        </Veld>
      )}
      {data.versie && <p className="agent-comment-meta">Gebaseerd op versie {data.versie} van het stuk.</p>}
      <Bronnen data={data} />
      <VerborgenNotitie data={data} wat="Dit voorstel" />
      <Beoordeling data={data} basis={basis} blokkades={blokkades} beheer={beheer} />
    </Resultaat>
  )
}

/* De agent heeft geen verantwoord, concreet voorstel: een antwoord zonder tekstwijziging.
   Dat is geen voorstel, dus er valt niets goed te keuren of af te wijzen. */
function Antwoord({ data, basis }) {
  return (
    <Resultaat basis={basis} soort="antwoord" titel="Antwoord van de agent" pil="Nog te controleren">
      <Waarschuwing>De agent heeft geen concrete tekstwijziging voorgesteld. Dit is een antwoord en geen voorstel: er valt niets goed te keuren of af te wijzen. Het antwoord is niet gecontroleerd; lees het kritisch en gebruik het niet als bevestigde informatie.</Waarschuwing>
      <Veld id={`${basis}-antwoord`} label="Antwoord van het model · niet gevalideerd" kind="antwoord">
        {data.uitleg ? <div className="agent-comment-tekst">{data.uitleg}</div> : <p className="agent-comment-notitie">De agent gaf geen uitleg mee.</p>}
      </Veld>
      <Bronnen data={data} />
      <VerborgenNotitie data={data} wat="Dit antwoord" />
    </Resultaat>
  )
}

/* Klaar, maar zonder iets dat je kan goedkeuren: onbekend type, ontbrekende of ongewijzigde tekst. */
function ZonderVoorstel({ data, basis }) {
  const melding = data.resultaat === 'onbekend'
    ? `De agent meldde een resultaat van het type "${kort(data.type, 40)}". Dat type kennen we niet, dus er valt niets goed te keuren of af te wijzen.`
    : data.soort === 'wijziging'
      ? 'De agent meldt een wijziging, maar de oorspronkelijke of de voorgestelde tekst ontbreekt of is niet gewijzigd. Er is geen concreet voorstel, dus niets om goed te keuren of af te wijzen.'
      : 'De agent gaf geen concreet voorstel mee. Er valt niets goed te keuren of af te wijzen.'
  return (
    <Resultaat basis={basis} soort="zonder-voorstel" titel="Resultaat zonder concreet voorstel" pil="Nog te controleren">
      <Waarschuwing>{melding}</Waarschuwing>
      {data.uitleg && (
        <Veld id={`${basis}-uitleg-model`} label="Uitleg van het model · niet gevalideerd" kind="uitleg">
          <div className="agent-comment-tekst">{data.uitleg}</div>
        </Veld>
      )}
      <VerborgenNotitie data={data} wat="Dit resultaat" />
    </Resultaat>
  )
}

const BEGIN = { bezig: null, fout: null, bevestig: null, verstuurd: null, beoordeeld: null }

export function AgentComment({ notitie, documentId, beschikbaar, ingelogd, opdracht, opStart, opBeoordeel, herstartUitleg = '', titel = 'Gedeelde agent' }) {
  const basis = useId()
  const uitlegId = `${basis}-uitleg`
  const [ui, setUi] = useState(BEGIN)
  const bezigRef = useRef(false) // vangt een tweede klik op, nog voor React opnieuw getekend heeft
  const triggers = useRef({})
  const zet = (wijziging) => setUi((huidig) => ({ ...huidig, ...wijziging }))

  const data = leesOpdracht(opdracht)
  const blokkades = startBlokkades({ notitie, documentId, beschikbaar, ingelogd, opStart })
  const kanStarten = blokkades.length === 0
  const wijziging = data?.resultaat === 'wijziging'
  const beoordeelBlok = wijziging
    ? beoordeelBlokkades({ ingelogd, opBeoordeel, kenbaar: heeftId(data.id) || heeftId(data.voorstelId) })
    : []
  const kanBeoordelen = wijziging && data.beoordeling === null && beoordeelBlok.length === 0

  // Elke lokale toestand hoort bij het moment waarop ze ontstond. Verandert de opdracht of het
  // voorstel, dan vervalt ze vanzelf: een oude bevestiging kan nooit een nieuw voorstel raken.
  const startSleutel = JSON.stringify([notitie?.id ?? null, documentId ?? null, data ? [data.id ?? null, data.status] : null])
  const voorstelSleutel = wijziging ? JSON.stringify([data.id ?? null, data.voorstelId ?? null, data.versie, data.oorspronkelijk, data.voorstel, data.uitleg]) : null
  const verstuurd = ui.verstuurd !== null && ui.verstuurd === startSleutel
  const bevestig = kanBeoordelen && ui.bevestig?.sleutel === voorstelSleutel ? ui.bevestig.besluit : null
  const lokaal = wijziging && ui.beoordeeld?.sleutel === voorstelSleutel ? ui.beoordeeld.besluit : null
  const startFout = ui.fout?.soort === 'starten' && ui.fout.sleutel === startSleutel ? ui.fout : null
  const beoordeelFout = wijziging && ui.fout?.soort === 'beoordelen' && ui.fout.sleutel === voorstelSleutel ? ui.fout : null

  async function start() {
    if (!kanStarten || bezigRef.current) return
    bezigRef.current = true
    zet({ bezig: 'starten', fout: null })
    try {
      await opStart({ notitieId: notitie.id, documentId })
      zet({ bezig: null, verstuurd: startSleutel })
    } catch (fout) {
      zet({ bezig: null, fout: { soort: 'starten', sleutel: startSleutel, uitleg: weigering(fout, START_WEIGERINGEN) } })
    } finally {
      bezigRef.current = false
    }
  }

  function open(besluit) {
    if (!kanBeoordelen || bezigRef.current) return
    zet({ bevestig: { besluit, sleutel: voorstelSleutel }, fout: null })
  }

  function annuleer() {
    if (bezigRef.current) return
    triggers.current[bevestig]?.focus() // de focus keert terug naar de knop die de vraag opende
    zet({ bevestig: null })
  }

  async function bevestigKlik() {
    if (!bevestig || !kanBeoordelen || bezigRef.current) return
    const [besluit, sleutel] = [bevestig, voorstelSleutel]
    bezigRef.current = true
    zet({ bezig: 'beoordelen', fout: null })
    try {
      // De ouder krijgt de id's mee die er echt zijn; een ontbrekend id wordt niet verzonnen.
      const ids = { ...(heeftId(data.id) && { opdrachtId: data.id }), ...(heeftId(data.voorstelId) && { voorstelId: data.voorstelId }) }
      await opBeoordeel({ ...ids, notitieId: notitie?.id, documentId, besluit })
      zet({ bezig: null, bevestig: null, beoordeeld: { besluit, sleutel } })
    } catch (fout) {
      zet({ bezig: null, bevestig: null, fout: { soort: 'beoordelen', sleutel, uitleg: weigering(fout, BEOORDEEL_WEIGERINGEN) } })
    } finally {
      bezigRef.current = false
    }
  }

  const beheer = { bezig: ui.bezig === 'beoordelen', bevestig, lokaal, fout: beoordeelFout, triggers, open, annuleer, bevestigKlik }
  // Opnieuw starten kan alleen als er niets loopt en er geen voorstel op beoordeling wacht.
  const toonStart = !data || data.status === 'mislukt' || data.status === 'geannuleerd' ||
    (data.status === 'klaar' && (data.resultaat !== 'wijziging' || data.beoordeling !== null))
  const starten = ui.bezig === 'starten'

  return (
    <div className="agent-comment" role="group" aria-label={titel} data-status={data ? (data.status ?? 'onbekend') : 'geen'}>
      <div className="agent-comment-kop">
        <span className="agent-comment-titel">{titel}</span>
      </div>
      {data && <Statusregel data={data} />}
      {wijziging && <Voorstel data={data} basis={basis} blokkades={beoordeelBlok} beheer={beheer} />}
      {data?.resultaat === 'antwoord' && <Antwoord data={data} basis={basis} />}
      {(data?.resultaat === 'leeg' || data?.resultaat === 'onbekend') && <ZonderVoorstel data={data} basis={basis} />}
      {toonStart && herstartUitleg && <p className="agent-comment-hint">{herstartUitleg}</p>}
      {toonStart && !herstartUitleg && (
        <div className="agent-comment-start">
          {verstuurd ? (
            <p className="agent-comment-lokaal" tabIndex={-1} ref={focusBijVerschijnen}>Aanvraag verstuurd. De status verschijnt hier zodra die bekend is.</p>
          ) : (
            <>
              <button
                type="button"
                className="knop primair"
                disabled={!kanStarten}
                aria-disabled={starten || undefined}
                aria-describedby={uitlegId}
                onClick={start}
              >
                {starten ? 'Starten…' : data ? 'Opnieuw laten nakijken' : 'Laat agent nakijken'}
              </button>
              <div id={uitlegId} className="agent-comment-hint">
                {kanStarten
                  ? <p>De agent leest deze notitie en komt met een antwoord of een tekstwijziging. Een mens beoordeelt wat de agent teruggeeft; er wordt niets automatisch aangepast.</p>
                  : blokkades.map((tekst) => <p key={tekst}>{tekst}</p>)}
              </div>
              {startFout && (
                <p role="alert" className="agent-comment-fout">
                  Starten is niet gelukt. {startFout.uitleg || 'Controleer of er al een opdracht verschenen is voor je opnieuw probeert.'}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
