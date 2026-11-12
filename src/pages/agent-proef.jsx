import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AgentComment } from '../components/agent-comment'
import { Kruimel } from '../components/basis'
import { Icoon } from '../components/Icoon'
import { LegeStaat } from '../components/leegstaat'
import { SkeletAlinea } from '../components/skelet'
import './agent-proef.css'

/* Lokale proefpagina voor de commentaaragent: een verzonnen stuk met een verzonnen notitie, een
   echt model en een mens die beslist. Niets hiervan is gedeeld of staat in de echte werkbank. */

/* ---------------------------------------------------------------- API-laag

   Alles gaat naar dezelfde origin, onder BASE_URL + 'api/agent-proef'. Een fout draagt alleen een
   korte code ('niet_bereikbaar', 'ongeldig_antwoord', 'http_500' of een bekende code van de
   server): ruwe servertekst, headers en sleutels komen nooit in een melding of op het scherm. */

export class ProefFout extends Error {
  constructor(code) {
    super(code)
    this.name = 'ProefFout'
    this.code = code
  }
}

const isObject = (waarde) => waarde !== null && typeof waarde === 'object' && !Array.isArray(waarde)
const heeftId = (waarde) => (typeof waarde === 'number' && Number.isFinite(waarde)) || (typeof waarde === 'string' && waarde.trim() !== '')
const zelfde = (a, b) => a == null || b == null || String(a) === String(b)
const positiefGeheel = (waarde) => Number.isSafeInteger(waarde) && waarde > 0
const SERVERCODE = /^[a-z][a-z0-9_]{1,63}$/

/* Controleert wat de server als status teruggeeft. Wat niet klopt, wordt geweigerd in plaats van
   geraden; een onbekend aantal of een onbekende versie blijft null en wordt nooit 0. */
export function leesProefStatus(data) {
  const ongeldig = () => new ProefFout('ongeldig_antwoord')
  if (!isObject(data) || typeof data.beschikbaar !== 'boolean') throw ongeldig()
  const resterend = Number.isSafeInteger(data.resterend) && data.resterend >= 0 ? data.resterend : null
  if (!data.beschikbaar) return { beschikbaar: false, document: null, notitie: null, opdracht: null, resterend }
  const { document: stuk, notitie, opdracht } = data
  if (!isObject(stuk) || !heeftId(stuk.id) || typeof stuk.inhoud !== 'string') throw ongeldig()
  if (!isObject(notitie) || !heeftId(notitie.id) || typeof notitie.tekst !== 'string') throw ongeldig()
  if (opdracht != null && !isObject(opdracht)) throw ongeldig()
  if (opdracht && (!zelfde(opdracht.notitie_id, notitie.id) || !zelfde(opdracht.document_id, stuk.id))) throw ongeldig()
  return {
    beschikbaar: true,
    document: { id: stuk.id, inhoud: stuk.inhoud, versie: positiefGeheel(stuk.versie) ? stuk.versie : null },
    notitie: { id: notitie.id, tekst: notitie.tekst, anker: typeof notitie.anker === 'string' && notitie.anker !== '' ? notitie.anker : null },
    opdracht: opdracht ?? null,
    resterend,
  }
}

export function maakProefApi({ basis, fetchFn } = {}) {
  const wortel = (basis ?? `${import.meta.env.BASE_URL}api/agent-proef`).replace(/\/+$/, '')
  // Late binding: een fetch die later wordt vervangen (of een test) wordt op het moment van het verzoek gelezen.
  const haal = fetchFn ?? ((...argumenten) => globalThis.fetch(...argumenten))

  async function vraag(pad, { signaal, body } = {}) {
    let antwoord
    try {
      antwoord = await haal(`${wortel}${pad}`, body === undefined
        ? { method: 'GET', cache: 'no-store', signal: signaal }
        : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Werkbank-Lokaal': '1' }, body: JSON.stringify(body) })
    } catch (fout) {
      if (fout?.name === 'AbortError') throw fout
      throw new ProefFout('niet_bereikbaar')
    }
    let data
    try { data = await antwoord.json() } catch { data = undefined }
    if (!antwoord.ok) {
      const code = [data?.fout, data?.code, data?.error, data?.status].find((c) => typeof c === 'string' && SERVERCODE.test(c))
      throw new ProefFout(code ?? `http_${antwoord.status}`)
    }
    if (data === undefined) throw new ProefFout('ongeldig_antwoord')
    return data
  }

  return {
    async status(signaal) { return leesProefStatus(await vraag('/status', { signaal })) },
    async start({ notitieId, documentId }) {
      const data = await vraag('/start', { body: { notitieId, documentId } })
      if (!positiefGeheel(data?.opdracht_id)) throw new ProefFout('ongeldig_antwoord')
      return data.opdracht_id
    },
    async beoordeel(invoer) {
      const ruw = invoer?.voorstelId
      const voorstelId = typeof ruw === 'string' && /^[1-9]\d{0,15}$/.test(ruw) ? Number(ruw) : ruw
      if (!positiefGeheel(voorstelId) || !['goedgekeurd', 'afgewezen'].includes(invoer?.besluit)) throw new ProefFout('ongeldige_beoordeling')
      const data = await vraag('/beoordeel', { body: { voorstelId, besluit: invoer.besluit } })
      if (data?.besluit !== 'toegepast' && data?.besluit !== 'afgewezen') throw new ProefFout('ongeldig_antwoord')
      return data.besluit
    },
    async reset() { return leesProefStatus(await vraag('/reset', { body: {} })) },
  }
}

/* ---------------------------------------------------------------- weergave

   `ProefWeergave` tekent alleen: alles wat er staat komt uit `staat`, en wat een klik doet komt uit
   `acties`. Alles wat de server of het model aanlevert, staat als platte tekst op het scherm. */

const LABELS = [
  { sleutel: 'fictief', naam: 'Fictieve proef', tekst: 'Verzonnen tekst. Voer nooit echte gegevens in.' },
  { sleutel: 'model', naam: 'Echt model', tekst: 'Het voorstel komt van een echt taalmodel.' },
  { sleutel: 'gedeeld', naam: 'Niet gedeeld', tekst: 'Niets komt in de echte werkbank.' },
]

const LEESFOUTEN = {
  niet_bereikbaar: 'De lokale proefserver antwoordt niet. Deze proef werkt alleen in de lokale preview op je eigen Mac.',
  http_404: 'De proefserver is hier niet te vinden. Deze proef werkt alleen in de lokale preview op je eigen Mac.',
  geweigerd: 'De proefserver weigert dit verzoek. Deze proef werkt alleen in de lokale preview op je eigen Mac.',
  ongeldig_antwoord: 'De proefserver gaf een antwoord dat deze pagina niet begrijpt. Er is niets gestart of aangepast.',
}
const LEESFOUT_ALGEMEEN = 'De proefserver gaf een fout terug. Er is niets gestart of aangepast.'
const leesFoutTekst = (code) => (Object.hasOwn(LEESFOUTEN, code) ? LEESFOUTEN[code] : LEESFOUT_ALGEMEEN)

// Een onbekend aantal is geen nul: dat zeggen we dan ook zo.
function aanvragenTekst(resterend) {
  if (resterend === null || resterend === undefined) return 'Het aantal resterende aanvragen is onbekend.'
  if (resterend === 0) return 'Geen aanvragen meer over.'
  return `Nog ${resterend} ${resterend === 1 ? 'aanvraag' : 'aanvragen'} over.`
}

/* De kost van de laatste aanvraag, precies zoals de server die meldt. Wat ontbreekt of er raar
   uitziet blijft weg: de pagina rekent en schat niets zelf, en een modelnaam komt alleen op het
   scherm als ze eruitziet als een modelnaam. */
const MODELNAAM = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,79}$/
export function leesKost(opdracht) {
  const bedrag = opdracht?.kost_usd
  if (typeof bedrag !== 'number' || !Number.isFinite(bedrag) || bedrag < 0 || bedrag > 1000) return null
  const geheel = (waarde) => (Number.isSafeInteger(waarde) && waarde >= 0 ? waarde : null)
  return {
    kost: bedrag > 0 && bedrag < 0.0001 ? 'minder dan $0,0001' : `$${bedrag.toFixed(4).replace('.', ',')}`,
    model: typeof opdracht.model === 'string' && MODELNAAM.test(opdracht.model) ? opdracht.model : null,
    tokensIn: geheel(opdracht.tokens_in),
    tokensUit: geheel(opdracht.tokens_uit),
  }
}

function kostTekst({ kost, model, tokensIn, tokensUit }) {
  const details = [model, tokensIn !== null && tokensUit !== null ? `${tokensIn} tokens in, ${tokensUit} uit` : null].filter(Boolean)
  return `Laatste aanvraag: ${kost}${details.length ? ` (${details.join(', ')})` : ''}.`
}

/* Een passage telt alleen als ze precies één keer in de tekst staat, net zoals de server dat
   controleert. Anders wordt er niets gemarkeerd in plaats van iets geraden. */
export function markeerPassage(tekst, passage) {
  if (typeof tekst !== 'string' || typeof passage !== 'string' || passage === '') return null
  const begin = tekst.indexOf(passage)
  if (begin < 0 || tekst.indexOf(passage, begin + 1) >= 0) return null
  return { voor: tekst.slice(0, begin), passage, na: tekst.slice(begin + passage.length) }
}

/* Wat is er met het stuk gebeurd na een beoordeling? Dat volgt uitsluitend uit de status van de
   server (de opdracht met haar besluit, het stuk met zijn versie en tekst), nooit uit wat de pagina
   zelf onthoudt: na opnieuw openen staat dus hetzelfde op het scherm.
   - 'aangepast'    de server zegt toegepast, en het stuk laat het zien (nieuwe versie of de nieuwe tekst)
   - 'onbevestigd'  de server zegt toegepast, maar in het stuk is niets te zien: een waarschuwing
   - 'afgewezen'    het voorstel is afgewezen
   - null           niets beoordeeld (of een besluit dat we niet kennen)
   `markering` is de passage die in het stuk gemarkeerd wordt: de nieuwe tekst na een aanpassing,
   anders de passage waar de notitie over gaat. */
export function leesAanpassing({ document: stuk, notitie, opdracht } = {}) {
  const anker = notitie?.anker ? { tekst: notitie.anker, soort: 'anker' } : null
  const besluit = opdracht?.beoordeling?.besluit
  const van = positiefGeheel(opdracht?.document_versie) ? opdracht.document_versie : null
  const naar = stuk?.versie ?? null
  if (besluit === 'toegepast') {
    const staatErin = typeof opdracht.voorstel === 'string' && markeerPassage(stuk?.inhoud, opdracht.voorstel) !== null
    const versieOmhoog = van !== null && naar !== null && naar > van
    if (staatErin || versieOmhoog) return { soort: 'aangepast', van, naar, markering: staatErin ? { tekst: opdracht.voorstel, soort: 'nieuw' } : null }
    return { soort: 'onbevestigd', van, naar, markering: anker }
  }
  if (besluit === 'afgewezen') return { soort: 'afgewezen', van, naar, markering: anker }
  return { soort: null, van, naar, markering: anker }
}

// De zin boven het stuk: wat er met het stuk gebeurde, niet meer en niet minder dan de server bevestigt.
function aanpassingTekst({ soort, van, naar, markering }) {
  if (soort === 'aangepast') {
    const versie = van !== null && naar !== null && naar > van ? `Aangepast na goedkeuring: versie ${van} → versie ${naar}.`
      : naar !== null ? `Aangepast na goedkeuring: het stuk is nu versie ${naar}.`
        : 'Aangepast na goedkeuring.'
    return markering ? `${versie} De nieuwe tekst staat gemarkeerd in het stuk.` : versie
  }
  if (soort === 'afgewezen') return van !== null && van === naar ? `Voorstel afgewezen: het stuk is niet aangepast (versie ${naar}).` : 'Voorstel afgewezen.'
  return `De proefserver meldt dat het voorstel is toegepast, maar in het stuk is dat niet te zien${naar !== null ? ` (versie ${naar})` : ''}. Controleer het stuk zelf voor je verdergaat.`
}

function Aanpassing({ aanpassing }) {
  const { soort } = aanpassing
  return (
    <p className="ap-banner" role={soort === 'onbevestigd' ? 'alert' : 'status'} data-soort={soort}>
      <Icoon naam={soort === 'aangepast' ? 'vinkje' : soort === 'onbevestigd' ? 'waarschuwing' : 'info'} maat={14} />
      <span>{aanpassingTekst(aanpassing)}</span>
    </p>
  )
}

function Proef({ status, acties, id, generatie }) {
  const { document: stuk, notitie } = status
  const aanpassing = leesAanpassing(status)
  const { markering } = aanpassing
  const delen = markering ? markeerPassage(stuk.inhoud, markering.tekst) : null
  const legende = !markering ? null
    : !delen ? 'De passage waar de notitie over gaat is niet uniek terug te vinden, dus er is niets gemarkeerd.'
      : markering.soort === 'nieuw' ? 'Gemarkeerd: de nieuwe tekst uit het voorstel.' : 'Gemarkeerd: de passage waar de notitie over gaat.'
  return (
    <div className="ap-raster">
      <section className="ap-kaart" aria-labelledby={`${id}-stuk`}>
        <div className="ap-kaartkop">
          <h2 id={`${id}-stuk`}>Verzonnen stuk</h2>
          {stuk.versie !== null && <span className="meta-klein cijfers">Versie {stuk.versie}</span>}
        </div>
        {aanpassing.soort && <Aanpassing aanpassing={aanpassing} />}
        <div className="ap-stuk" role="region" aria-label="Tekst van het verzonnen stuk" tabIndex={0}>
          {delen
            ? <>{delen.voor}<mark className="ap-markering" data-soort={markering.soort}>{delen.passage}</mark>{delen.na}</>
            : stuk.inhoud}
        </div>
        {legende && <p className="ap-legende meta-klein">{legende}</p>}
      </section>
      <section className="ap-kaart" aria-labelledby={`${id}-notitie`}>
        <h2 id={`${id}-notitie`}>Notitie bij het stuk</h2>
        {notitie.anker && (
          <>
            <p className="meta-klein">Bij de passage</p>
            <blockquote className="notitie-citaat">{notitie.anker}</blockquote>
          </>
        )}
        <p className="ap-notitie">{notitie.tekst}</p>
        {/* Binnen deze lokale proef is er geen echte inlog: `ingelogd` betekent hier alleen dat de
            proef zelf de beslissing van deze ene mens doorgeeft. De labels bovenaan zeggen dat eerlijk.
            `key={generatie}`: AgentComment onthoudt "aanvraag verstuurd" per notitie en opdracht. Zonder
            opdracht is die sleutel na een reset gelijk aan die van vóór de start, dus een nieuwe generatie
            laat de component vers beginnen. */}
        <AgentComment
          key={generatie}
          notitie={notitie}
          titel="Commentaaragent"
          documentId={stuk.id}
          beschikbaar={status.beschikbaar === true}
          ingelogd={true}
          opdracht={status.opdracht}
          herstartUitleg={aanpassing.soort === 'aangepast' ? 'Gebruik Opnieuw beginnen om het voorbeeld terug te zetten.' : ''}
          opStart={acties.start}
          opBeoordeel={acties.beoordeel}
        />
      </section>
    </div>
  )
}

export function ProefWeergave({ staat, acties, naar }) {
  const id = useId()
  const { fase, status, leesFout, pollt, verlopen, actie, melding, generatie = 0 } = staat
  const klaar = fase === 'klaar' && status
  const beschikbaar = Boolean(klaar && status.beschikbaar)
  const kost = beschikbaar ? leesKost(status.opdracht) : null
  return (
    <main className="hoofd">
      <div className="hoofd-binnen ap-binnen">
        <Kruimel naar={naar} delen={[{ tekst: 'Werkblad', naar: '#/' }, { tekst: 'Agentproef' }]} />
        <header className="ap-kop">
          <div className="ap-eyebrow">Lokale proef</div>
          <h1>Proef met de commentaaragent</h1>
          <p>Lees het verzonnen stuk en de notitie, laat de agent de notitie nakijken en beslis zelf wat er met het voorstel gebeurt.</p>
          <ul className="ap-labels" aria-label="Wat deze proef is">
            {LABELS.map((label) => (
              <li className="ap-label" key={label.sleutel}>
                <strong className="ap-label-kop" data-label={label.sleutel}>{label.naam}</strong>
                <span>{label.tekst}</span>
              </li>
            ))}
          </ul>
          <p className="ap-kost">
            Elke aanvraag gebruikt het echte model en kost een klein bedrag.
            {beschikbaar && <> <span className="cijfers">{aanvragenTekst(status.resterend)}</span></>}
            {kost && <> <span className="cijfers">{kostTekst(kost)}</span></>}
          </p>
        </header>
        {fase === 'laden' && (
          <div className="ap-laden" role="status">
            <span className="sr-only">De proef wordt geladen…</span>
            <SkeletAlinea lijnen={4} />
          </div>
        )}
        {fase === 'fout' && (
          <div className="ap-staat" role="alert">
            <LegeStaat
              icoon="waarschuwing"
              titel="De proef kon niet geladen worden"
              uitleg={leesFoutTekst(leesFout)}
              acties={<button type="button" className="knop primair" onClick={acties.ververs}>Opnieuw proberen</button>}
            />
          </div>
        )}
        {klaar && !status.beschikbaar && (
          <div className="ap-staat" role="alert">
            <LegeStaat
              icoon="info"
              titel="De agent is nu niet beschikbaar"
              uitleg="De proefserver meldt dat de agent niet beschikbaar is. Er wordt niets gestart."
              acties={<button type="button" className="knop primair" onClick={acties.ververs}>Opnieuw controleren</button>}
            />
          </div>
        )}
        {beschikbaar && leesFout && (
          <p className="ap-melding" role="alert" data-soort="fout">
            <Icoon naam="waarschuwing" maat={14} />
            <span>
              De stand van de agent kon niet worden opgehaald.{' '}
              {pollt ? 'We proberen het opnieuw.' : 'De getoonde stand kan verouderd zijn; gebruik Stand verversen.'}
            </span>
          </p>
        )}
        {beschikbaar && verlopen && (
          <p className="ap-melding" role="status" data-soort="wacht">
            <Icoon naam="info" maat={14} />
            <span>
              De agent heeft nog niet geantwoord en de pagina vraagt de stand niet meer automatisch op. De proef kan blijven hangen:
              gebruik Stand verversen om opnieuw te controleren, of Opnieuw beginnen om alles terug te zetten zodra de agent klaar is.
            </span>
          </p>
        )}
        {beschikbaar && <Proef status={status} acties={acties} id={id} generatie={generatie} />}
        {beschikbaar && melding && (
          <p className="ap-melding" role={melding.soort === 'fout' ? 'alert' : 'status'} data-soort={melding.soort}>
            <Icoon naam={melding.soort === 'fout' ? 'waarschuwing' : 'vinkje'} maat={14} />
            <span>
              {melding.soort === 'fout'
                ? (melding.code === 'bezig'
                  ? 'De agent is nog bezig, dus opnieuw beginnen kan nu niet. Probeer het opnieuw zodra de agent klaar is.'
                  : 'Opnieuw beginnen is niet gelukt. Probeer het opnieuw; Stand verversen laat zien wat de stand nu is.')
                : 'De proef is teruggezet.'}
            </span>
          </p>
        )}
        <footer className="ap-voet">
          <button type="button" className="knop zacht" onClick={() => naar('#/')}>
            <Icoon naam="chevronRechts" maat={14} className="ap-terug-icoon" />
            Terug naar het werkblad
          </button>
          {beschikbaar && (
            <div className="ap-voet-acties">
              <button type="button" className="knop" aria-disabled={actie ? 'true' : undefined} onClick={acties.ververs}>
                <Icoon naam="vernieuwen" maat={14} />
                Stand verversen
              </button>
              <button type="button" className="knop" aria-disabled={actie ? 'true' : undefined} aria-describedby={`${id}-reset`} onClick={acties.reset}>
                <Icoon naam="ongedaan" maat={14} />
                Opnieuw beginnen
              </button>
            </div>
          )}
          {beschikbaar && <p className="ap-hint meta-klein" id={`${id}-reset`}>Zet het verzonnen stuk en de agentopdracht terug naar het begin.</p>}
        </footer>
      </div>
    </main>
  )
}

/* ---------------------------------------------------------------- de pagina zelf */

const POLL_MS = 2000
// De modelaanroep heeft een time-out van 90 seconden en de proefserver laat een opdracht na 180 seconden
// vervallen: vier minuten wachten is dus ruim genoeg om een echte uitkomst te zien.
const MAX_WACHT_MS = 4 * 60 * 1000
const MAX_MISLUKT = 5
const ACTIEF = ['wachtrij', 'bezig']
const BEGIN_LEZEN = { fase: 'laden', status: null, leesFout: null, mislukt: 0 }

export function AgentProefPagina({ naar, fetchFn, basisUrl, pollMs = POLL_MS, maxWachtMs = MAX_WACHT_MS }) {
  // De nieuwste fetchFn wordt pas bij het verzoek gelezen: een ouder die elke render een nieuwe functie
  // meegeeft, mag de pagina niet telkens opnieuw laten laden.
  const fetchRef = useRef(fetchFn)
  fetchRef.current = fetchFn
  const api = useMemo(() => maakProefApi({ basis: basisUrl, fetchFn: (...argumenten) => (fetchRef.current ?? globalThis.fetch)(...argumenten) }), [basisUrl])
  // Navigeren via de app; zonder naar-functie rechtstreeks via de adresbalk.
  const ga = useCallback((hash) => {
    if (typeof naar === 'function') naar(hash)
    else if (typeof window !== 'undefined' && window.location) window.location.hash = hash
  }, [naar])
  const [lees, setLees] = useState(BEGIN_LEZEN)
  const [wacht, setWacht] = useState(null) // opdrachtnummer dat na een start terugkwam en nog niet in de status staat
  const [verlopen, setVerlopen] = useState(false)
  const [actie, setActie] = useState(null)
  const [melding, setMelding] = useState(null) // uitkomst van opnieuw beginnen: { soort: 'ok' | 'fout' }
  const [generatie, setGeneratie] = useState(0) // telt hoe vaak AgentComment vers moet beginnen (zie Proef)
  const levend = useRef(false)
  const teller = useRef(0) // nummer van de laatst begonnen leesaanvraag: een oudere uitkomst telt niet meer
  const lopend = useRef(new Set())
  const bezigActie = useRef(null) // één schrijvende actie tegelijk: een tweede klik vangen we hier op
  const statusRef = useRef(null)
  const status = lees.status
  statusRef.current = status

  const zetActie = useCallback((naam) => {
    bezigActie.current = naam
    if (!levend.current) return
    setActie(naam)
    if (naam) setMelding(null) // een nieuwe actie maakt de vorige melding overbodig
  }, [])

  const leesStatus = useCallback(async () => {
    const nummer = ++teller.current
    const beheer = new AbortController()
    lopend.current.add(beheer)
    const actueel = () => levend.current && nummer === teller.current
    try {
      const nieuw = await api.status(beheer.signal)
      if (actueel()) {
        // Een opdracht die op de server verdwijnt (elders teruggezet) laat AgentComment vers beginnen.
        if (statusRef.current?.opdracht && !nieuw.opdracht) setGeneratie((g) => g + 1)
        setLees({ fase: 'klaar', status: nieuw, leesFout: null, mislukt: 0 })
      }
      return nieuw
    } catch (fout) {
      if (actueel() && fout?.name !== 'AbortError') {
        setLees((huidig) => ({ fase: huidig.status ? 'klaar' : 'fout', status: huidig.status, leesFout: fout?.code ?? 'onbekend', mislukt: huidig.mislukt + 1 }))
      }
      throw fout
    } finally {
      lopend.current.delete(beheer)
    }
  }, [api])

  useEffect(() => {
    levend.current = true
    leesStatus().catch(() => {}) // de foutstand staat dan al in `lees`
    return () => {
      levend.current = false
      for (const beheer of lopend.current) beheer.abort()
      lopend.current.clear()
    }
  }, [leesStatus])

  /* Volgen: zolang een opdracht in de wachtrij staat of bezig is, of een zojuist gestarte opdracht nog
     niet in de status verschenen is. Nooit eindeloos: na te veel mislukte pogingen of een te lange
     wachttijd stopt het en zegt de pagina dat eerlijk. De volgende ronde begint pas als de vorige klaar is. */
  const actief = ACTIEF.includes(status?.opdracht?.status)
  const verwacht = wacht !== null && String(status?.opdracht?.id) !== String(wacht)
  const pollt = lees.fase === 'klaar' && status?.beschikbaar === true && (actief || verwacht) && !verlopen && lees.mislukt < MAX_MISLUKT

  useEffect(() => {
    if (!pollt) return undefined
    let doorgaan = true
    let timer
    const begin = Date.now()
    const tik = async () => {
      try { await leesStatus() } catch { /* de foutstand staat al in `lees` */ }
      if (!doorgaan) return
      if (Date.now() - begin >= maxWachtMs) { setVerlopen(true); return }
      timer = setTimeout(tik, pollMs)
    }
    timer = setTimeout(tik, pollMs)
    return () => { doorgaan = false; clearTimeout(timer) }
  }, [pollt, pollMs, maxWachtMs, leesStatus])

  useEffect(() => {
    if (wacht !== null && String(status?.opdracht?.id) === String(wacht)) setWacht(null)
  }, [wacht, status])

  const ververs = useCallback(async () => {
    if (bezigActie.current) return
    setVerlopen(false)
    setLees((huidig) => (huidig.status ? huidig : BEGIN_LEZEN)) // na een mislukte eerste poging: opnieuw "laden"
    zetActie('verversen')
    try { await leesStatus() } catch { /* de foutstand staat al in `lees` */ } finally { zetActie(null) }
  }, [leesStatus, zetActie])

  const start = useCallback(async ({ notitieId, documentId }) => {
    if (bezigActie.current) throw new ProefFout('bezig')
    // Geen verzoek dat geld kan kosten als de server zelf al zegt dat de aanvragen op zijn.
    if (statusRef.current?.resterend === 0) throw new ProefFout('limiet_bereikt')
    zetActie('starten')
    try {
      const opdrachtId = await api.start({ notitieId, documentId })
      if (!levend.current) return
      setVerlopen(false)
      setWacht(opdrachtId)
      leesStatus().catch(() => {}) // meteen kijken; lukt dat niet, dan volgt de pollronde
    } finally {
      zetActie(null)
    }
  }, [api, leesStatus, zetActie])

  /* Goedkeuren of afwijzen komt hier pas binnen na de bevestiging in AgentComment. Daarna wordt de
     stand ALTIJD opnieuw gelezen: het stuk is veranderd of niet, en dat bepaalt de server. Pas als die
     stand bevestigt wat gevraagd werd, telt de beoordeling als gelukt. */
  const beoordeel = useCallback(async ({ voorstelId, besluit }) => {
    if (bezigActie.current) throw new ProefFout('bezig')
    zetActie('beoordelen')
    try {
      const verwacht = besluit === 'goedgekeurd' ? 'toegepast' : 'afgewezen'
      let uitkomst
      try {
        uitkomst = await api.beoordeel({ voorstelId, besluit })
      } catch (fout) {
        // De server kan ondanks de fout iets gedaan hebben, of een ander tabblad was eerder: toon de echte stand.
        if (fout?.code !== 'ongeldige_beoordeling' && levend.current) await leesStatus().catch(() => {})
        throw fout
      }
      const gelezen = await leesStatus()
      const opdracht = gelezen.opdracht
      if (uitkomst !== verwacht || String(opdracht?.voorstel_id) !== String(voorstelId) || opdracht?.beoordeling?.besluit !== verwacht) {
        throw new ProefFout('beoordeling_niet_bevestigd')
      }
    } finally {
      zetActie(null)
    }
  }, [api, leesStatus, zetActie])

  /* Opnieuw beginnen zet het verzonnen stuk en de opdracht terug. Wat de server daarna teruggeeft, is de
     nieuwe stand; een leesaanvraag die al onderweg was, zag nog de stand van vóór het terugzetten en telt niet meer. */
  const reset = useCallback(async () => {
    if (bezigActie.current) return
    zetActie('resetten')
    try {
      const nieuw = await api.reset()
      if (!levend.current) return
      teller.current += 1
      setGeneratie((g) => g + 1)
      setLees({ fase: 'klaar', status: nieuw, leesFout: null, mislukt: 0 })
      setWacht(null)
      setVerlopen(false)
      setMelding({ soort: 'ok' })
    } catch (fout) {
      if (levend.current) {
        setMelding({ soort: 'fout', code: fout?.code ?? null })
        await leesStatus().catch(() => {}) // wat de server nu heeft, mag niet onzichtbaar blijven
      }
    } finally {
      zetActie(null)
    }
  }, [api, leesStatus, zetActie])

  return <ProefWeergave staat={{ ...lees, pollt, verlopen, actie, melding, generatie }} acties={{ start, beoordeel, ververs, reset }} naar={ga} />
}
