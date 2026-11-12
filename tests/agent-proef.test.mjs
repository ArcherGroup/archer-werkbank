import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/* Tests voor de lokale agentproef (src/pages/agent-proef.jsx).
   Geen netwerk, geen echt model, geen Supabase: de pagina krijgt een nep-`fetchFn` die het
   afgesproken contract van /api/agent-proef nabootst (status, start, beoordeel, reset). De echte
   AgentComment draait mee, dus wat hier groen is, is ook wat Victor op het scherm krijgt. */

const h = React.createElement
let vite
let pagina = {}
let vorigeFetch

before(async () => {
  // Elke test die per ongeluk het echte netwerk gebruikt, valt hard om.
  vorigeFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('netwerk is verboden in deze test') }
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { pagina = await vite.ssrLoadModule('/src/pages/agent-proef.jsx') }
  catch (e) { if (!/Failed to load|Cannot find|does not exist|ENOENT/i.test(e.message)) throw e }
})
after(async () => {
  globalThis.fetch = vorigeFetch
  await vite?.close()
})

// Eerst echte tags weghalen, daarna pas entiteiten terugzetten: ontsnapte tekst blijft zo tekst.
const zichtbaar = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const knoppen = (html) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, inhoud]) => ({
  tekst: inhoud.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
  uit: /(?:^|\s)disabled(?:=""|\s|$)/.test(attrs) || /aria-disabled="true"/.test(attrs),
  attrs,
}))
const knop = (html, tekst) => knoppen(html).find((k) => k.tekst === tekst)

// ---------------------------------------------------------------- het eerlijke demo-label (SSR)

/* De eerste weergave is altijd "laden": effecten draaien niet in een statische render, dus er
   is op dit moment ook nog niets opgehaald. Het label moet er dan al staan, niet pas na het laden. */
const renderLaden = (props = {}) => {
  assert.equal(typeof pagina.AgentProefPagina, 'function', 'AgentProefPagina ontbreekt in src/pages/agent-proef.jsx')
  return renderToStaticMarkup(h(pagina.AgentProefPagina, { naar() {}, fetchFn() { throw new Error('geen verzoek bij het renderen') }, ...props }))
}

test('de proef legt in korte labels uit wat het voorbeeld is', () => {
  const html = weergave({ fase: 'laden', status: null })
  const labels = [...html.matchAll(/<li class="ap-label">([\s\S]*?)<\/li>/g)]
  assert.equal(labels.length, 3)
  for (const [, inhoud] of labels) assert.ok(zichtbaar(inhoud).length <= 85, 'een label moet in één oogopslag te lezen zijn')
})

test('de pagina bestaat en toont meteen de drie eerlijke demo-labels, ook tijdens het laden', () => {
  assert.equal(typeof pagina.AgentProefPagina, 'function', 'AgentProefPagina ontbreekt in src/pages/agent-proef.jsx')
  const html = renderLaden()
  const tekst = zichtbaar(html)
  for (const label of ['Fictieve proef', 'Echt model', 'Niet gedeeld']) assert.match(tekst, new RegExp(label), `label "${label}" ontbreekt`)
  assert.match(tekst, /verzonnen/i, 'er staat uitgelegd dat de inhoud verzonnen is')
  assert.match(tekst, /nooit echte gegevens/i, 'er staat dat je hier geen echte gegevens invoert')
  assert.match(tekst, /taalmodel/i, 'er staat dat het antwoord van een echt taalmodel komt')
  assert.match(tekst, /echte werkbank|collega/i, 'er staat wat niet gedeeld wordt')
  assert.match(html, /<h1[^>]*>[^<]*commentaaragent/i, 'de pagina heeft één duidelijke kop')
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1)
})

test('tijdens het laden staat er een statusmelding en niets dat op een resultaat lijkt', () => {
  const html = renderLaden()
  const tekst = zichtbaar(html)
  assert.match(html, /role="status"[^>]*>[^<]*(?:<[^>]+>)*[^<]*wordt geladen/i)
  assert.doesNotMatch(tekst, /Laat agent nakijken|Goedkeuren|Afwijzen|Wijzigingsvoorstel|Versie \d/, 'nog niets om te beoordelen of te starten')
})

test('de pagina heeft geen invoerveld en toont nooit een sleutel of geheim', () => {
  const html = renderLaden()
  assert.doesNotMatch(html, /<(?:input|textarea|select)\b/i, 'er is niets om echte gegevens in te typen')
  assert.doesNotMatch(html, /sk-[a-z0-9]|OPENROUTER|api[_-]?key|Bearer |secret/i)
})

test('er is een knop om terug te gaan naar het werkblad, ook tijdens het laden', () => {
  const html = renderLaden()
  assert.ok(knop(html, 'Terug naar het werkblad'), 'knop "Terug naar het werkblad" ontbreekt')
  assert.equal(knop(html, 'Terug naar het werkblad').uit, false)
})

// ---------------------------------------------------------------- het verzonnen stuk en de nep-server

/* Alles hieronder is verzonnen, net als in de echte proef. */
const OUD = 'De bakkerij verkoopt elke dag ongeveer 400 broden en dat is zeker meer dan vorig jaar.'
const NIEUW = 'De bakkerij verkoopt elke dag ongeveer 400 broden; dat is 12% meer dan vorig jaar.'
const STUK = `# Jaarverslag bakkerij De Gouden Korst (verzonnen)\n\nHet afgelopen jaar was een goed jaar.\n\n${OUD}\n\nVolgend jaar openen we een tweede winkel.`
const STATUS = {
  beschikbaar: true,
  document: { id: 12, inhoud: STUK, versie: 1 },
  notitie: { id: 8, tekst: 'Wat is "zeker meer"? Maak dit concreet.', anker: OUD },
  opdracht: null,
  resterend: 3,
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

/* Een nep-fetch die alles onthoudt: `antwoord` is een Response, een functie of een Error. */
function maakFetch(antwoord) {
  const oproepen = []
  const fetchFn = async (url, init = {}) => {
    oproepen.push({ url, init })
    const a = typeof antwoord === 'function' ? await antwoord(url, init) : antwoord
    if (a instanceof Error) throw a
    return a
  }
  return { fetchFn, oproepen }
}

// ---------------------------------------------------------------- de API-laag (zelfde origin, nep-fetch)

const api = (opties) => {
  assert.equal(typeof pagina.maakProefApi, 'function', 'maakProefApi ontbreekt in src/pages/agent-proef.jsx')
  return pagina.maakProefApi(opties)
}

test('de API-laag leest de status van dezelfde origin, zonder cache, en geeft een gecontroleerd object terug', async () => {
  const { fetchFn, oproepen } = maakFetch(json(STATUS))
  const status = await api({ fetchFn }).status()
  assert.equal(oproepen.length, 1)
  assert.equal(oproepen[0].url, '/api/agent-proef/status', 'BASE_URL + api/agent-proef/status')
  assert.match(oproepen[0].url, /^\/(?!\/)/, 'een relatief pad op dezelfde origin, nooit een extern adres')
  assert.equal(oproepen[0].init.method, 'GET')
  assert.equal(oproepen[0].init.cache, 'no-store', 'een verouderde status uit de cache is erger dan een extra verzoek')
  assert.deepEqual(status, STATUS)
})

test('het basisadres is aanpasbaar, met of zonder slot-slash, en een annuleersignaal gaat mee naar fetch', async () => {
  const { fetchFn, oproepen } = maakFetch(json(STATUS))
  const stop = new AbortController()
  await api({ fetchFn, basis: '/archer-werkbank/api/agent-proef/' }).status(stop.signal)
  assert.equal(oproepen[0].url, '/archer-werkbank/api/agent-proef/status')
  assert.equal(oproepen[0].init.signal, stop.signal)
})

test('zonder eigen fetchFn gebruikt de API-laag de fetch van de browser op het moment van het verzoek', async () => {
  const gezien = []
  const eerder = globalThis.fetch
  globalThis.fetch = async (url) => { gezien.push(url); return json(STATUS) }
  try { await api().status() } finally { globalThis.fetch = eerder }
  assert.deepEqual(gezien, ['/api/agent-proef/status'])
})

test('start doet één POST met alleen de ids van de notitie en het stuk, en geeft het opdrachtnummer terug', async () => {
  const { fetchFn, oproepen } = maakFetch(json({ opdracht_id: 41 }))
  assert.equal(await api({ fetchFn }).start({ notitieId: 8, documentId: 12 }), 41)
  assert.equal(oproepen.length, 1)
  assert.equal(oproepen[0].url, '/api/agent-proef/start')
  assert.equal(oproepen[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(oproepen[0].init.body), { notitieId: 8, documentId: 12 })
  assert.equal(oproepen[0].init.headers['Content-Type'], 'application/json')
  assert.equal(oproepen[0].init.headers['X-Werkbank-Lokaal'], '1', 'zelfde lokale beveiligingsheader als de bestaande lokale API')
})

test('start weigert een antwoord zonder bruikbaar opdrachtnummer', async () => {
  for (const antwoord of [{}, { opdracht_id: 0 }, { opdracht_id: '41' }, { opdracht_id: 1.5 }, { opdracht_id: null }, [], 'ok']) {
    const { fetchFn } = maakFetch(json(antwoord))
    await assert.rejects(api({ fetchFn }).start({ notitieId: 8, documentId: 12 }), (f) => f.code === 'ongeldig_antwoord', JSON.stringify(antwoord))
  }
})

test('beoordeel stuurt alleen voorstelId en besluit en geeft toegepast of afgewezen terug', async () => {
  for (const [besluit, antwoord] of [['goedgekeurd', 'toegepast'], ['afgewezen', 'afgewezen']]) {
    const { fetchFn, oproepen } = maakFetch(json({ besluit: antwoord }))
    assert.equal(await api({ fetchFn }).beoordeel({ voorstelId: 5, besluit }), antwoord)
    assert.equal(oproepen[0].url, '/api/agent-proef/beoordeel')
    assert.equal(oproepen[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(oproepen[0].init.body), { voorstelId: 5, besluit })
  }
  const { fetchFn, oproepen } = maakFetch(json({ besluit: 'toegepast' }))
  await api({ fetchFn }).beoordeel({ voorstelId: '5', besluit: 'goedgekeurd' })
  assert.deepEqual(JSON.parse(oproepen[0].init.body), { voorstelId: 5, besluit: 'goedgekeurd' }, 'een cijfer als tekst wordt een getal')
})

test('beoordeel verstuurt nooit een ongeldige beoordeling en weigert een onbekend antwoord', async () => {
  const ongeldig = [
    { voorstelId: 5, besluit: 'misschien' }, { voorstelId: 5, besluit: 'toegepast' }, { voorstelId: 5 },
    { voorstelId: 0, besluit: 'goedgekeurd' }, { voorstelId: -1, besluit: 'goedgekeurd' }, { voorstelId: 'abc', besluit: 'goedgekeurd' },
    { voorstelId: 1.5, besluit: 'goedgekeurd' }, { besluit: 'afgewezen' }, {}, undefined,
  ]
  for (const invoer of ongeldig) {
    const { fetchFn, oproepen } = maakFetch(json({ besluit: 'toegepast' }))
    await assert.rejects(api({ fetchFn }).beoordeel(invoer), (f) => f.code === 'ongeldige_beoordeling', JSON.stringify(invoer))
    assert.equal(oproepen.length, 0, `er mag niets verstuurd worden voor ${JSON.stringify(invoer)}`)
  }
  for (const antwoord of [{ besluit: 'goedgekeurd' }, { besluit: 'misschien' }, {}, { besluit: null }]) {
    const { fetchFn } = maakFetch(json(antwoord))
    await assert.rejects(api({ fetchFn }).beoordeel({ voorstelId: 5, besluit: 'goedgekeurd' }), (f) => f.code === 'ongeldig_antwoord', JSON.stringify(antwoord))
  }
})

test('reset is één POST en geeft het nieuwe, gecontroleerde statusobject terug', async () => {
  const schoon = { ...STATUS, opdracht: null, resterend: 2 }
  const { fetchFn, oproepen } = maakFetch(json(schoon))
  assert.deepEqual(await api({ fetchFn }).reset(), schoon)
  assert.equal(oproepen.length, 1)
  assert.equal(oproepen[0].url, '/api/agent-proef/reset')
  assert.equal(oproepen[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(oproepen[0].init.body), {}, 'een geldige, lege JSON-body')
})

test('een netwerkfout heet niet_bereikbaar, een weigering houdt haar code en ruwe servertekst komt nooit mee', async () => {
  const geheim = 'sk-or-v1-GEHEIM'
  const gevallen = [
    ['netwerkfout', () => { throw new TypeError(`fetch failed ${geheim}`) }, 'niet_bereikbaar'],
    ['limiet in fout', () => json({ fout: 'limiet_bereikt' }, 429), 'limiet_bereikt'],
    ['code in code', () => json({ code: 'anker_niet_uniek' }, 422), 'anker_niet_uniek'],
    ['vrije tekst', () => json({ fout: `Mislukt: ${geheim}` }, 400), 'http_400'],
    ['code met hoofdletters en spaties', () => json({ fout: 'Limiet Bereikt' }, 400), 'http_400'],
    ['html bij een serverfout', () => new Response(`<html>${geheim}</html>`, { status: 500 }), 'http_500'],
    ['html bij 200 (de site, niet de proef)', () => new Response('<!doctype html><title>Werkbank</title>', { status: 200 }), 'ongeldig_antwoord'],
    ['404 van een statische site', () => new Response('niet gevonden', { status: 404 }), 'http_404'],
  ]
  for (const [naam, antwoord, code] of gevallen) {
    const { fetchFn } = maakFetch(antwoord)
    for (const actie of [(a) => a.status(), (a) => a.start({ notitieId: 8, documentId: 12 }), (a) => a.beoordeel({ voorstelId: 5, besluit: 'afgewezen' }), (a) => a.reset()]) {
      await assert.rejects(actie(api({ fetchFn })), (f) => {
        assert.equal(f.code, code, naam)
        assert.equal(f.message, code, `${naam}: de melding is alleen de code`)
        assert.ok(!`${f.message} ${f.stack}`.includes(geheim), `${naam}: ruwe tekst lekt`)
        return true
      })
    }
  }
})

test('een afgebroken verzoek blijft een AbortError, zodat de pagina het stil kan negeren', async () => {
  const { fetchFn } = maakFetch(new DOMException('Aborted', 'AbortError'))
  await assert.rejects(api({ fetchFn }).status(), { name: 'AbortError' })
})

// ---------------------------------------------------------------- statusobject controleren

const leesStatus = (data) => {
  assert.equal(typeof pagina.leesProefStatus, 'function', 'leesProefStatus ontbreekt in src/pages/agent-proef.jsx')
  return pagina.leesProefStatus(data)
}

test('een statusobject wordt gecontroleerd: onbegrijpelijke antwoorden worden geweigerd', () => {
  const onbegrijpelijk = [
    null, undefined, [], 'tekst', 42, {}, { beschikbaar: 'ja' }, { beschikbaar: 1 },
    { ...STATUS, document: null }, { ...STATUS, document: { id: 12, versie: 1 } }, { ...STATUS, document: { id: 12, inhoud: 5 } }, { ...STATUS, document: { inhoud: 'x' } },
    { ...STATUS, notitie: null }, { ...STATUS, notitie: { id: 8 } }, { ...STATUS, notitie: { tekst: 'x' } },
    { ...STATUS, opdracht: 'bezig' }, { ...STATUS, opdracht: [] }, { ...STATUS, opdracht: 7 },
    { ...STATUS, opdracht: { id: 41, status: 'bezig', notitie_id: 99 } }, { ...STATUS, opdracht: { id: 41, status: 'bezig', document_id: 99 } },
  ]
  for (const data of onbegrijpelijk) assert.throws(() => leesStatus(data), (f) => f.code === 'ongeldig_antwoord', JSON.stringify(data))
})

test('een geldig statusobject blijft zoals het is; onbekende aantallen en versies blijven onbekend in plaats van 0', () => {
  const opdracht = { id: 41, notitie_id: 8, document_id: '12', document_versie: 1, status: 'bezig' }
  const ok = leesStatus({ ...STATUS, opdracht })
  assert.deepEqual(ok.opdracht, opdracht, 'de opdracht gaat ongewijzigd door naar AgentComment')
  assert.equal(leesStatus({ ...STATUS, opdracht: undefined }).opdracht, null)
  for (const resterend of ['3', -1, 1.5, NaN, null, undefined, {}]) assert.equal(leesStatus({ ...STATUS, resterend }).resterend, null, `resterend ${String(resterend)}`)
  assert.equal(leesStatus({ ...STATUS, resterend: 0 }).resterend, 0)
  assert.equal(leesStatus({ ...STATUS, notitie: { id: 8, tekst: 'x' } }).notitie.anker, null)
  assert.equal(leesStatus({ ...STATUS, notitie: { id: 8, tekst: 'x', anker: '' } }).notitie.anker, null)
  for (const versie of ['twee', 0, -1, 1.5, null, undefined]) assert.equal(leesStatus({ ...STATUS, document: { id: 12, inhoud: 'x', versie } }).document.versie, null, `versie ${String(versie)}`)
})

test('een proef die zegt niet beschikbaar te zijn, brengt geen stuk of opdracht mee', () => {
  const uit = leesStatus({ ...STATUS, beschikbaar: false, resterend: 2 })
  assert.deepEqual(uit, { beschikbaar: false, document: null, notitie: null, opdracht: null, resterend: 2 })
  assert.equal(leesStatus({ beschikbaar: false }).resterend, null)
})

// ---------------------------------------------------------------- weergave per toestand (SSR)

const GEEN_ACTIES = { start() {}, beoordeel() {}, reset() {}, ververs() {} }
const weergave = (staat = {}, acties = GEEN_ACTIES) => {
  assert.equal(typeof pagina.ProefWeergave, 'function', 'ProefWeergave ontbreekt in src/pages/agent-proef.jsx')
  return renderToStaticMarkup(h(pagina.ProefWeergave, { staat: { fase: 'klaar', status: STATUS, leesFout: null, actie: null, melding: null, ...staat }, acties, naar() {} }))
}
const LABELS = ['Fictieve proef', 'Echt model', 'Niet gedeeld']

test('markeerPassage vindt een passage alleen als ze precies één keer voorkomt', () => {
  assert.equal(typeof pagina.markeerPassage, 'function', 'markeerPassage ontbreekt in src/pages/agent-proef.jsx')
  assert.deepEqual(pagina.markeerPassage('Voor. Midden. Na.', 'Midden.'), { voor: 'Voor. ', passage: 'Midden.', na: ' Na.' })
  assert.deepEqual(pagina.markeerPassage('Midden.', 'Midden.'), { voor: '', passage: 'Midden.', na: '' })
  for (const [tekst, passage] of [['Een. Een.', 'Een.'], ['aaa', 'aa'], ['Niets.', 'Anders.'], ['Tekst', ''], ['Tekst', null], ['Tekst', undefined], ['Tekst', 5], [null, 'x'], [undefined, 'x'], [7, 'x']]) {
    assert.equal(pagina.markeerPassage(tekst, passage), null, `${JSON.stringify(tekst)} / ${JSON.stringify(passage)}: niet uniek of niet gevonden, dus niets markeren`)
  }
  assert.equal(pagina.markeerPassage('Hoofdletter staat Er.', 'er.'), null, 'exact, zoals de server het controleert')
})

test('een passage die niet uniek terug te vinden is, wordt niet geraden: er is dan niets gemarkeerd en dat staat erbij', () => {
  for (const inhoud of [`${OUD}\n${OUD}`, 'Hier staat de passage van de notitie niet in.']) {
    const html = weergave({ status: { ...STATUS, document: { id: 12, inhoud, versie: 1 } } })
    assert.doesNotMatch(html, /<mark\b/, 'geen gok')
    assert.match(zichtbaar(html), /niet uniek terug te vinden, dus er is niets gemarkeerd/)
  }
  const zonderAnker = weergave({ status: { ...STATUS, notitie: { id: 8, tekst: 'Algemene opmerking.', anker: null } } })
  assert.doesNotMatch(zonderAnker, /<mark\b/)
  assert.doesNotMatch(zichtbaar(zonderAnker), /Gemarkeerd|niets gemarkeerd|Bij de passage/, 'een notitie zonder passage heeft ook geen uitleg over een passage')
})

test('een mislukte lading zegt eerlijk wat er mis is, houdt de labels en biedt opnieuw proberen en terug', () => {
  const gevallen = [
    ['niet_bereikbaar', /antwoordt niet/i, /lokale preview/i],
    ['http_404', /niet te vinden/i, /lokale preview/i],
    ['ongeldig_antwoord', /niet begrijpt/i, /niets gestart of aangepast/i],
    ['http_500', /fout terug/i, /niets gestart of aangepast/i],
    ['iets_onbekends', /fout terug/i, /niets gestart of aangepast/i],
  ]
  for (const [code, eerste, tweede] of gevallen) {
    const html = weergave({ fase: 'fout', status: null, leesFout: code })
    const tekst = zichtbaar(html)
    assert.match(html, /role="alert"/, code)
    assert.match(tekst, /De proef kon niet geladen worden/, code)
    assert.match(tekst, eerste, code)
    assert.match(tekst, tweede, code)
    assert.ok(!tekst.includes(code), `${code}: de ruwe code hoort niet in beeld`)
    for (const label of LABELS) assert.match(tekst, new RegExp(label), `${code}: label ${label} moet blijven staan`)
    assert.ok(knop(html, 'Opnieuw proberen'), code)
    assert.ok(knop(html, 'Terug naar het werkblad'), code)
    assert.doesNotMatch(tekst, /Laat agent nakijken|Goedkeuren|Verzonnen stuk|wordt geladen/, `${code}: geen nepinhoud`)
  }
})

test('een proef die niet beschikbaar is, zegt dat en toont geen stuk, notitie of startknop', () => {
  const html = weergave({ status: { beschikbaar: false, document: null, notitie: null, opdracht: null, resterend: 2 } })
  const tekst = zichtbaar(html)
  assert.match(tekst, /De agent is nu niet beschikbaar/)
  assert.match(tekst, /Er wordt niets gestart/)
  assert.match(html, /role="alert"/)
  for (const label of LABELS) assert.match(tekst, new RegExp(label))
  assert.doesNotMatch(tekst, /Laat agent nakijken|Verzonnen stuk|Jaarverslag/)
  assert.ok(knop(html, 'Opnieuw controleren'))
  assert.ok(knop(html, 'Terug naar het werkblad'))
})

test('een geladen proef toont het verzonnen stuk met versie, de notitie en een startklare agent', () => {
  const html = weergave()
  const tekst = zichtbaar(html)
  assert.match(tekst, /Verzonnen stuk/)
  assert.match(tekst, /Versie 1/)
  assert.match(tekst, /Jaarverslag bakkerij De Gouden Korst \(verzonnen\)/)
  assert.match(tekst, /Notitie bij het stuk/)
  assert.match(tekst, /Wat is "zeker meer"\? Maak dit concreet\./)
  assert.match(html, /role="group"[^>]*aria-label="Commentaaragent"|aria-label="Commentaaragent"[^>]*role="group"/, 'de echte AgentComment staat op de pagina')
  assert.equal(knop(html, 'Laat agent nakijken')?.uit, false, 'de startknop staat aan: de agent is beschikbaar')
  assert.doesNotMatch(tekst, /niet ingelogd|niet actief/i, 'binnen de proef is er geen inlog en geen uitgeschakelde agent')
  assert.doesNotMatch(tekst, /Wijzigingsvoorstel|Goedkeuren|Afwijzen|In de wachtrij|\bBezig\b/, 'zonder opdracht geen nepresultaat')
  for (const label of LABELS) assert.match(tekst, new RegExp(label))
})

test('het stuk staat als platte tekst op het scherm: niets uit het stuk of de notitie wordt HTML', () => {
  const gevaarlijk = '<script>alert(1)</script> <img src=x onerror=alert(1)> **vet** [link](javascript:alert(1))'
  const html = weergave({ status: { ...STATUS, document: { id: 12, inhoud: `${gevaarlijk}\n${OUD}`, versie: 1 }, notitie: { id: 8, tekst: gevaarlijk, anker: OUD } } })
  assert.doesNotMatch(html, /<script|<img|<strong>vet|<a\b[^>]*javascript/i)
  assert.doesNotMatch(html, /dangerouslySetInnerHTML/)
  assert.ok(zichtbaar(html).includes(gevaarlijk), 'de tekst blijft letterlijk leesbaar')
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+=/i)
})

test('het resterende aantal aanvragen en de modelkost staan er eerlijk bij, en onbekend is geen nul', () => {
  const kost = /kost een klein bedrag/i
  assert.match(zichtbaar(weergave({ status: { ...STATUS, resterend: 3 } })), /Nog 3 aanvragen over/)
  assert.match(zichtbaar(weergave({ status: { ...STATUS, resterend: 1 } })), /Nog 1 aanvraag over/)
  assert.match(zichtbaar(weergave({ status: { ...STATUS, resterend: 0 } })), /Geen aanvragen meer over/)
  const onbekend = zichtbaar(weergave({ status: { ...STATUS, resterend: null } }))
  assert.match(onbekend, /aantal resterende aanvragen is onbekend/i)
  assert.doesNotMatch(onbekend, /Nog 0|Geen aanvragen meer over|Nog \d/)
  for (const html of [weergave(), weergave({ fase: 'laden', status: null }), weergave({ fase: 'fout', status: null, leesFout: 'niet_bereikbaar' })]) assert.match(zichtbaar(html), kost, 'de kost staat er ook tijdens het laden en bij een fout')
  assert.doesNotMatch(zichtbaar(weergave({ fase: 'laden', status: null })), /Nog \d|onbekend|Geen aanvragen/, 'tijdens het laden is er nog niets te zeggen over het aantal')
})

// ---------------------------------------------------------------- een kleine eigen DOM voor echte klikken
/* Er staat geen jsdom in dit project en er komt er geen bij: react-dom/client heeft aan een
   piepkleine DOM genoeg om de echte pagina, met echte hooks, effecten, timers en het echte
   React-eventsysteem, te draaien. Een klik wordt aan de listeners van de root gegeven, net als
   een browser dat doet. (Dezelfde opzet als tests/agent-comment.test.mjs.) */

function maakDom() {
  const doc = { nodeType: 9, nodeName: '#document' }
  class Knoop {
    constructor(nodeType) { this.nodeType = nodeType; this.ownerDocument = doc; this.childNodes = []; this.parentNode = null }
    get firstChild() { return this.childNodes[0] ?? null }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null }
    get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] ?? null : null }
    get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] ?? null : null }
    insertBefore(kind, ref) {
      kind.parentNode?.removeChild(kind)
      kind.parentNode = this
      const i = ref ? this.childNodes.indexOf(ref) : -1
      if (i < 0) this.childNodes.push(kind); else this.childNodes.splice(i, 0, kind)
      return kind
    }
    appendChild(kind) { return this.insertBefore(kind, null) }
    removeChild(kind) { const i = this.childNodes.indexOf(kind); if (i >= 0) this.childNodes.splice(i, 1); kind.parentNode = null; return kind }
    contains(kind) { for (let n = kind; n; n = n.parentNode) if (n === this) return true; return false }
    get textContent() { return this.childNodes.map((k) => k.textContent).join('') }
    set textContent(tekst) { for (const k of [...this.childNodes]) this.removeChild(k); if (tekst) this.appendChild(new Tekst(String(tekst))) }
  }
  class Tekst extends Knoop {
    constructor(data) { super(3); this.data = data; this.nodeName = '#text' }
    get nodeValue() { return this.data }
    set nodeValue(waarde) { this.data = String(waarde) }
    get textContent() { return this.data }
    set textContent(waarde) { this.data = String(waarde) }
  }
  class Element extends Knoop {
    constructor(tag) {
      super(1)
      this.tagName = tag.toUpperCase(); this.nodeName = this.tagName; this.localName = tag
      this.namespaceURI = 'http://www.w3.org/1999/xhtml'; this.attributes = new Map(); this.style = {}; this.luisteraars = []
    }
    setAttribute(naam, waarde) { this.attributes.set(naam, String(waarde)) }
    setAttributeNS(_ns, naam, waarde) { this.setAttribute(naam, waarde) }
    removeAttribute(naam) { this.attributes.delete(naam) }
    getAttribute(naam) { return this.attributes.get(naam) ?? null }
    hasAttribute(naam) { return this.attributes.has(naam) }
    addEventListener(type, fn, opties) { this.luisteraars.push({ type, fn, capture: opties === true || opties?.capture === true }) }
    removeEventListener(type, fn) { this.luisteraars = this.luisteraars.filter((l) => !(l.type === type && l.fn === fn)) }
    focus() { doc.activeElement = this }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body }
  }
  doc.createElement = (tag) => new Element(tag)
  doc.createElementNS = (_ns, tag) => new Element(tag)
  doc.createTextNode = (tekst) => new Tekst(String(tekst))
  doc.addEventListener = () => {}
  doc.removeEventListener = () => {}
  doc.body = doc.createElement('body')
  doc.documentElement = doc.createElement('html')
  doc.documentElement.appendChild(doc.body)
  doc.activeElement = doc.body
  return doc
}

function installeerDom() {
  const doc = maakDom()
  const sleutels = ['window', 'document', 'HTMLIFrameElement', 'IS_REACT_ACT_ENVIRONMENT']
  const vorige = sleutels.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)])
  Object.assign(globalThis, { window: globalThis, document: doc, HTMLIFrameElement: class {}, IS_REACT_ACT_ENVIRONMENT: true })
  return { doc, herstel() { for (const [k, d] of vorige) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k] } } }
}

function vindAlle(wortel, voorwaarde, uit = []) {
  for (const kind of wortel.childNodes) {
    if (kind.nodeType !== 1) continue
    if (voorwaarde(kind)) uit.push(kind)
    vindAlle(kind, voorwaarde, uit)
  }
  return uit
}
const plat = (tekst) => tekst.replace(/\s+/g, ' ').trim()
// Tekst zoals een lezer die ziet: tussen aangrenzende elementen staat een spatie (textContent plakt ze aan elkaar).
const leesTekst = (knoop) => (knoop.nodeType === 3 ? knoop.data : knoop.childNodes.map(leesTekst).join(' '))
const uitgezet = (knoopje) => knoopje.hasAttribute('disabled') || knoopje.getAttribute('aria-disabled') === 'true'

/* Zet de echte pagina in de schim-DOM, met korte pollintervallen. `wacht` wacht tot iets waar is
   (binnen act, zodat timers en netwerk gewoon doorlopen) en faalt met de huidige tekst als het niet lukt. */
async function mount(props = {}) {
  assert.equal(typeof pagina.AgentProefPagina, 'function', 'AgentProefPagina ontbreekt in src/pages/agent-proef.jsx')
  const dom = installeerDom()
  const klant = await import('react-dom/client')
  const createRoot = klant.createRoot ?? klant.default.createRoot
  const houder = dom.doc.createElement('div')
  dom.doc.body.appendChild(houder)
  const root = createRoot(houder)
  let huidig = { naar() {}, pollMs: 4, ...props }
  const inhoud = () => (huidig.strikt ? h(React.StrictMode, null, h(pagina.AgentProefPagina, huidig)) : h(pagina.AgentProefPagina, huidig))
  const toon = (wijziging = {}) => { huidig = { ...huidig, ...wijziging }; return act(async () => { root.render(inhoud()) }) }
  await toon()
  const tekst = () => plat(leesTekst(houder))
  const alle = (voorwaarde) => vindAlle(houder, voorwaarde)
  const ui = {
    houder,
    doc: dom.doc,
    toon,
    tekst,
    alle,
    knop: (naam) => alle((k) => k.tagName === 'BUTTON' && plat(leesTekst(k)) === naam)[0],
    alarmen: () => alle((k) => k.getAttribute('role') === 'alert').map((k) => plat(leesTekst(k))),
    meldingen: () => alle((k) => k.getAttribute('role') === 'status').map((k) => plat(leesTekst(k))),
    klik: (doel) => act(async () => {
      const gebeurtenis = { type: 'click', target: doel, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {} }
      const luisteraars = houder.luisteraars.filter((l) => l.type === 'click')
      for (const l of luisteraars.filter((x) => x.capture)) l.fn(gebeurtenis)
      for (const l of luisteraars.filter((x) => !x.capture)) l.fn(gebeurtenis)
    }),
    async wacht(voorwaarde, wat = 'de verwachte toestand', maxMs = 3000) {
      const einde = Date.now() + maxMs
      for (;;) {
        let waar = false
        try { waar = Boolean(voorwaarde()) } catch { waar = false }
        if (waar) return
        if (Date.now() > einde) assert.fail(`Time-out bij het wachten op ${wat}. Op het scherm staat: ${tekst()}`)
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3)) })
      }
    },
    rust: (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) }),
    async sluit() { await act(async () => root.unmount()); dom.herstel() },
  }
  return ui
}

/* De nep-server volgt het afgesproken contract. Alles is verzonnen en gebeurt in het geheugen:
   de test bepaalt wanneer de "agent" bezig is en wanneer hij klaar is. Met `haken` maak je een
   storing: een haak geeft een Response of Error terug, of niets om gewoon door te gaan. */
function maakServer({ resterend = 3, beschikbaar = true } = {}) {
  const s = { doc: { id: 12, inhoud: STUK, versie: 1 }, notitie: { ...STATUS.notitie }, opdracht: null, resterend, beschikbaar, volgendeOpdracht: 41, volgendVoorstel: 5 }
  const oproepen = []
  const haken = {}
  const status = () => ({ beschikbaar: s.beschikbaar, document: { ...s.doc }, notitie: { ...s.notitie }, opdracht: s.opdracht && { ...s.opdracht }, resterend: s.resterend })
  async function fetchFn(url, init = {}) {
    const methode = init.method ?? 'GET'
    const pad = url.replace(/^.*\/api\/agent-proef/, '')
    const body = init.body ? JSON.parse(init.body) : undefined
    oproepen.push({ methode, pad, body, init })
    const haak = haken[`${methode} ${pad}`]
    if (haak) {
      const uitkomst = await haak({ methode, pad, body, init })
      if (uitkomst instanceof Error) throw uitkomst
      if (uitkomst !== undefined) return uitkomst
    }
    if (methode === 'GET' && pad === '/status') return json(status())
    if (methode === 'POST' && pad === '/start') {
      if (s.resterend <= 0) return json({ fout: 'limiet_bereikt' }, 429)
      s.resterend -= 1
      s.opdracht = { id: s.volgendeOpdracht++, notitie_id: 8, document_id: 12, document_versie: s.doc.versie, status: 'wachtrij', voorstel_id: null, soort: null, oorspronkelijk: null, voorstel: null, uitleg: null, bronstatus: null, beoordeling: null }
      return json({ opdracht_id: s.opdracht.id })
    }
    if (methode === 'POST' && pad === '/beoordeel') {
      const o = s.opdracht
      if (!o || o.voorstel_id !== body?.voorstelId) return json({ fout: 'ongeldige_opdracht' }, 409)
      if (o.beoordeling) return json({ fout: 'voorstel_al_beoordeeld' }, 409)
      if (body.besluit === 'goedgekeurd') {
        s.doc = { ...s.doc, inhoud: s.doc.inhoud.replace(o.oorspronkelijk, o.voorstel), versie: s.doc.versie + 1 }
        o.beoordeling = { besluit: 'toegepast' }
        return json({ besluit: 'toegepast' })
      }
      o.beoordeling = { besluit: 'afgewezen' }
      return json({ besluit: 'afgewezen' })
    }
    if (methode === 'POST' && pad === '/reset') {
      s.doc = { id: 12, inhoud: STUK, versie: 1 }
      s.opdracht = null
      return json(status())
    }
    return json({ fout: 'onbekend' }, 404)
  }
  return {
    fetchFn, oproepen, haken, s,
    statusNu: status,
    zetBezig() { s.opdracht.status = 'bezig' },
    rondAf(extra = {}) { Object.assign(s.opdracht, { status: 'klaar', voorstel_id: s.volgendVoorstel++, soort: 'wijziging', oorspronkelijk: OUD, voorstel: NIEUW, uitleg: 'Maakt de bewering concreet.', bronstatus: 'niet_opgezocht' }, extra) },
    mislukt(code = 'model_fout') { Object.assign(s.opdracht, { status: 'mislukt', fout_code: code }) },
    aantal: (methode, pad) => oproepen.filter((o) => o.methode === methode && o.pad === pad).length,
    volgorde: () => oproepen.map((o) => `${o.methode} ${o.pad}`),
  }
}

const esc = (tekst) => tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const OUDE_OPDRACHT = { id: 40, notitie_id: 8, document_id: 12, document_versie: 1, status: 'klaar', voorstel_id: 4, soort: 'wijziging', oorspronkelijk: OUD, voorstel: NIEUW, uitleg: 'Een eerder voorstel.', bronstatus: 'niet_opgezocht', beoordeling: { besluit: 'afgewezen' } }
const startKlaar = async (server, props = {}) => {
  const ui = await mount({ fetchFn: server.fetchFn, ...props })
  await ui.wacht(() => ui.knop('Opnieuw beginnen'), 'het laden van de proef')
  return ui
}

// ---------------------------------------------------------------- de pagina laadt echt (DOM)

test('de pagina leest bij het openen één keer de status en start of wijzigt niets zonder klik', async () => {
  const server = maakServer()
  const ui = await mount({ fetchFn: server.fetchFn })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    await ui.rust(40)
    assert.deepEqual(server.volgorde(), ['GET /status'], 'alleen lezen: geen start, beoordeling of reset bij het openen')
  } finally { await ui.sluit() }
})

test('na het laden staan het verzonnen stuk, de versie en de notitie op het scherm, met de passage van de notitie gemarkeerd', async () => {
  const server = maakServer()
  const ui = await mount({ fetchFn: server.fetchFn })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    const tekst = ui.tekst()
    assert.match(tekst, /Jaarverslag bakkerij De Gouden Korst \(verzonnen\)/)
    assert.match(tekst, /Versie 1/)
    assert.match(tekst, /Wat is "zeker meer"\? Maak dit concreet\./)
    assert.match(tekst, /Nog 3 aanvragen over/)
    assert.equal(uitgezet(ui.knop('Laat agent nakijken')), false)
    assert.doesNotMatch(tekst, /wordt geladen/, 'de laadmelding verdwijnt zodra het stuk er is')
    for (const label of LABELS) assert.match(tekst, new RegExp(label))
    const markeringen = ui.alle((k) => k.tagName === 'MARK')
    assert.equal(markeringen.length, 1, 'precies één gemarkeerde passage')
    assert.equal(markeringen[0].textContent, OUD)
    assert.equal(markeringen[0].getAttribute('data-soort'), 'anker')
    assert.match(tekst, /Gemarkeerd: de passage waar de notitie over gaat/)
  } finally { await ui.sluit() }
})

test('als de proefserver niet bereikbaar is, staat dat eerlijk op het scherm en kan je opnieuw proberen', async () => {
  const server = maakServer()
  let kapot = true
  server.haken['GET /status'] = () => (kapot ? new TypeError('fetch failed') : undefined)
  const ui = await mount({ fetchFn: server.fetchFn })
  try {
    await ui.wacht(() => ui.alarmen().length > 0, 'een foutmelding')
    assert.match(ui.alarmen().join(' '), /De proef kon niet geladen worden/)
    assert.match(ui.alarmen().join(' '), /antwoordt niet/)
    for (const label of LABELS) assert.match(ui.tekst(), new RegExp(label), 'de labels blijven bij een fout')
    assert.equal(ui.knop('Laat agent nakijken'), undefined)
    kapot = false
    await ui.klik(ui.knop('Opnieuw proberen'))
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'een geslaagde tweede poging')
    assert.deepEqual(ui.alarmen(), [], 'de foutmelding verdwijnt zodra het lukt')
    assert.deepEqual(server.volgorde(), ['GET /status', 'GET /status'])
  } finally { await ui.sluit() }
})

test('een antwoord dat geen proefstatus is (bijvoorbeeld de site zelf) wordt niet geraden maar geweigerd', async () => {
  const server = maakServer()
  server.haken['GET /status'] = () => new Response('<!doctype html><title>Werkbank</title>', { status: 200 })
  const ui = await mount({ fetchFn: server.fetchFn })
  try {
    await ui.wacht(() => ui.alarmen().length > 0, 'een foutmelding')
    assert.match(ui.alarmen().join(' '), /niet begrijpt/)
    assert.doesNotMatch(ui.tekst(), /Werkbank<|doctype/i)
    assert.equal(ui.knop('Laat agent nakijken'), undefined)
  } finally { await ui.sluit() }
})

test('een proef die zegt niet beschikbaar te zijn, krijgt geen startknop en kan opnieuw gecontroleerd worden', async () => {
  const server = maakServer({ beschikbaar: false })
  const ui = await mount({ fetchFn: server.fetchFn })
  try {
    await ui.wacht(() => ui.alarmen().length > 0, 'de melding')
    assert.match(ui.alarmen().join(' '), /De agent is nu niet beschikbaar/)
    assert.equal(ui.knop('Laat agent nakijken'), undefined)
    server.s.beschikbaar = true
    await ui.klik(ui.knop('Opnieuw controleren'))
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'een beschikbare proef')
  } finally { await ui.sluit() }
})

test('de knop terug roept naar("#/") aan en de kruimel gaat ook naar het werkblad', async () => {
  const server = maakServer()
  const bestemmingen = []
  const ui = await mount({ fetchFn: server.fetchFn, naar: (hash) => bestemmingen.push(hash) })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    await ui.klik(ui.knop('Terug naar het werkblad'))
    await ui.klik(ui.knop('Werkblad'))
    assert.deepEqual(bestemmingen, ['#/', '#/'])
  } finally { await ui.sluit() }
})

test('bij het sluiten van de pagina wordt een lopend verzoek afgebroken en komt er niets meer achteraan', async () => {
  const server = maakServer()
  let signaal
  server.haken['GET /status'] = ({ init }) => { signaal = init.signal; return new Promise(() => {}) }
  const ui = await mount({ fetchFn: server.fetchFn })
  await ui.rust(10)
  assert.equal(signaal?.aborted, false, 'tijdens het wachten is het verzoek nog levend')
  await ui.sluit()
  assert.equal(signaal.aborted, true, 'sluiten breekt het lopende verzoek af')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(server.volgorde(), ['GET /status'])
})

// ---------------------------------------------------------------- melding en verversen (SSR)

const BEZIG = { id: 41, notitie_id: 8, document_id: 12, document_versie: 1, status: 'bezig' }

test('een mislukte statusopvraging staat boven de laatst bekende stand en zegt of er nog opnieuw geprobeerd wordt', () => {
  const status = { ...STATUS, opdracht: BEZIG }
  const probeert = weergave({ status, leesFout: 'niet_bereikbaar', pollt: true })
  assert.match(probeert, /role="alert"/)
  assert.match(zichtbaar(probeert), /De stand van de agent kon niet worden opgehaald\. We proberen het opnieuw\./)
  const stopt = weergave({ status, leesFout: 'niet_bereikbaar', pollt: false })
  assert.match(zichtbaar(stopt), /De stand van de agent kon niet worden opgehaald\. De getoonde stand kan verouderd zijn; gebruik Stand verversen\./)
  assert.doesNotMatch(zichtbaar(stopt), /We proberen het opnieuw/, 'er wordt niets beloofd wat niet gebeurt')
  for (const html of [probeert, stopt]) {
    assert.doesNotMatch(zichtbaar(html), /niet_bereikbaar/, 'de ruwe code hoort niet in beeld')
    assert.match(zichtbaar(html), /Bezig/, 'de laatst bekende stand blijft zichtbaar')
  }
  assert.doesNotMatch(zichtbaar(weergave({ status })), /kon niet worden opgehaald/)
})

test('als de agent te lang niets laat horen, staat dat er als melding bij en wordt er niet langer vanzelf gevraagd', () => {
  const html = weergave({ status: { ...STATUS, opdracht: BEZIG }, verlopen: true })
  assert.match(html, /role="status"[^>]*>(?:<[^>]+>)*[^<]*nog niet geantwoord/)
  assert.match(zichtbaar(html), /nog niet geantwoord en de pagina vraagt de stand niet meer automatisch op/)
  assert.match(zichtbaar(html), /Stand verversen/)
  assert.doesNotMatch(zichtbaar(weergave({ status: { ...STATUS, opdracht: BEZIG } })), /nog niet geantwoord/)
})

test('Stand verversen staat er zodra de stand bekend is, en is bezig zolang een actie loopt', () => {
  assert.equal(knop(weergave(), 'Stand verversen')?.uit, false)
  assert.equal(knop(weergave({ actie: 'verversen' }), 'Stand verversen')?.uit, true, 'tijdens een actie een tweede klik laten vallen')
  assert.equal(knop(weergave({ actie: 'starten' }), 'Stand verversen')?.uit, true)
  assert.equal(knop(weergave({ fase: 'laden', status: null }), 'Stand verversen'), undefined, 'er is nog niets om te verversen')
  assert.equal(knop(weergave({ fase: 'fout', status: null, leesFout: 'niet_bereikbaar' }), 'Stand verversen'), undefined, 'daar staat "Opnieuw proberen"')
})

// ---------------------------------------------------------------- starten, wachten en een resultaat (DOM)

test('starten is een echte klik: één POST met alleen de ids, daarna volgt de pagina de opdracht van wachtrij via bezig tot een voorstel', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    assert.equal(server.aantal('POST', '/start'), 0, 'voor de klik is er niets gestart')
    await ui.klik(ui.knop('Laat agent nakijken'))
    assert.deepEqual(server.oproepen.filter((o) => o.methode === 'POST').map((o) => [o.pad, o.body]), [['/start', { notitieId: 8, documentId: 12 }]])
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    assert.match(ui.tekst(), /Nog 2 aanvragen over/, 'het aantal komt van de server en is bijgewerkt')
    assert.equal(ui.knop('Laat agent nakijken'), undefined, 'tijdens het wachten is er geen tweede start')
    assert.equal(ui.knop('Opnieuw laten nakijken'), undefined)
    server.zetBezig()
    await ui.wacht(() => /\bBezig\b/.test(ui.tekst()), 'de opdracht is bezig')
    assert.match(ui.tekst(), /De agent werkt aan de opdracht/)
    assert.equal(ui.knop('Goedkeuren'), undefined, 'nog geen resultaat, dus niets te beoordelen')
    server.rondAf()
    await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel van de agent')
    const tekst = ui.tekst()
    assert.match(tekst, /Wijzigingsvoorstel van de agent/)
    assert.match(tekst, /Oorspronkelijke tekst/)
    assert.match(tekst, new RegExp(esc(NIEUW)))
    assert.match(tekst, /Maakt de bewering concreet\./)
    assert.match(tekst, /niet gevalideerd/i)
    assert.match(tekst, /Nog niet beoordeeld/)
    assert.equal(server.aantal('POST', '/beoordeel'), 0, 'het resultaat wordt nooit vanzelf beoordeeld')
  } finally { await ui.sluit() }
})

test('de pagina vraagt de status op zolang de agent bezig is en stopt daar meteen mee zodra er een uitkomst is', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    const voor = server.aantal('GET', '/status')
    await ui.wacht(() => server.aantal('GET', '/status') >= voor + 3, 'meerdere pollrondes tijdens het wachten')
    server.rondAf()
    await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel van de agent')
    const na = server.aantal('GET', '/status')
    await ui.rust(60)
    assert.ok(server.aantal('GET', '/status') <= na + 1, 'na een uitkomst wordt er niet meer gepold (hooguit een verzoek dat al onderweg was)')
  } finally { await ui.sluit() }
})

test('na "Opnieuw laten nakijken" blijft de pagina vragen tot de nieuwe opdracht zichtbaar is, en toont de oude niet als nieuwe', async () => {
  const server = maakServer()
  server.s.opdracht = { ...OUDE_OPDRACHT }
  let verborgen = 4
  const gezien = []
  let ui
  server.haken['GET /status'] = () => {
    if (server.aantal('POST', '/start') > 0 && verborgen > 0) {
      verborgen -= 1
      gezien.push(ui.tekst()) // wat staat er op het scherm terwijl de server nog de oude opdracht toont?
      return json({ ...server.statusNu(), opdracht: { ...OUDE_OPDRACHT } })
    }
    return undefined
  }
  ui = await startKlaar(server)
  try {
    assert.match(ui.tekst(), /Afgewezen/, 'de eerdere, afgewezen opdracht staat er')
    await ui.klik(ui.knop('Opnieuw laten nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de nieuwe opdracht in de wachtrij')
    assert.equal(gezien.length, 4, 'de pagina bleef vragen terwijl de server de oude opdracht nog toonde')
    for (const tekst of gezien) assert.doesNotMatch(tekst, /In de wachtrij/, 'zolang de server de oude opdracht toont, verzint de pagina geen nieuwe')
    assert.doesNotMatch(ui.tekst(), /Aanvraag verstuurd/)
    assert.equal(server.aantal('POST', '/start'), 1)
  } finally { await ui.sluit() }
})

test('een mislukte opdracht toont de melding in gewone taal, stopt het vragen en laat je bewust opnieuw proberen', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    server.mislukt('timeout')
    await ui.wacht(() => /Mislukt/.test(ui.tekst()), 'de mislukte opdracht')
    assert.match(ui.tekst(), /De agent deed er te lang over en is gestopt/)
    assert.doesNotMatch(ui.tekst(), /\btimeout\b/, 'de ruwe code hoort niet in beeld')
    assert.equal(ui.knop('Goedkeuren'), undefined)
    const na = server.aantal('GET', '/status')
    await ui.rust(40)
    assert.ok(server.aantal('GET', '/status') <= na + 1, 'een mislukte opdracht wordt niet verder gevolgd (hooguit een verzoek dat al onderweg was)')
    assert.equal(uitgezet(ui.knop('Opnieuw laten nakijken')), false)
    await ui.klik(ui.knop('Opnieuw laten nakijken'))
    assert.equal(server.aantal('POST', '/start'), 2, 'opnieuw proberen is een nieuwe, bewuste aanvraag')
  } finally { await ui.sluit() }
})

test('een antwoord zonder tekstwijziging is nog te controleren en kan niet goed- of afgekeurd worden', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    server.rondAf({ soort: 'antwoord', voorstel_id: null, oorspronkelijk: null, voorstel: null, uitleg: 'Ik kan dit zonder bron niet bevestigen.' })
    await ui.wacht(() => /Antwoord van de agent/.test(ui.tekst()), 'het antwoord')
    assert.match(ui.tekst(), /Nog te controleren/)
    assert.match(ui.tekst(), /Ik kan dit zonder bron niet bevestigen\./)
    assert.equal(ui.knop('Goedkeuren'), undefined)
    assert.equal(ui.knop('Afwijzen'), undefined)
  } finally { await ui.sluit() }
})

test('als starten mislukt, staat dat eerlijk bij de knop, wordt er niet gevraagd en kan je bewust opnieuw proberen', async () => {
  const gevallen = [
    ['netwerkfout', () => new TypeError('fetch failed'), /Controleer of er al een opdracht verschenen is/],
    ['serverfout', () => json({ fout: 'interne_fout' }, 500), /Controleer of er al een opdracht verschenen is/],
    ['bekende weigering', () => json({ fout: 'anker_niet_uniek' }, 422), /meer dan één keer/],
    ['limiet van de server', () => json({ fout: 'limiet_bereikt' }, 429), /limiet voor agentopdrachten/],
  ]
  for (const [naam, haak, melding] of gevallen) {
    const server = maakServer()
    server.haken['POST /start'] = haak
    const ui = await startKlaar(server)
    try {
      await ui.klik(ui.knop('Laat agent nakijken'))
      await ui.wacht(() => ui.alarmen().some((a) => /Starten is niet gelukt/.test(a)), `de foutmelding bij ${naam}`)
      assert.match(ui.alarmen().join(' '), melding, naam)
      assert.doesNotMatch(ui.alarmen().join(' '), /interne_fout|anker_niet_uniek|limiet_bereikt|fetch failed/, `${naam}: geen ruwe code`)
      const gelezen = server.aantal('GET', '/status')
      await ui.rust(40)
      assert.equal(server.aantal('GET', '/status'), gelezen, `${naam}: een mislukte start zet geen polling aan`)
      assert.equal(uitgezet(ui.knop('Laat agent nakijken')), false, `${naam}: opnieuw proberen kan`)
      assert.equal(server.aantal('POST', '/start'), 1, naam)
    } finally { await ui.sluit() }
  }
})

test('zonder aanvragen over wordt er niets gestart: de pagina belt de server niet en zegt dat de limiet bereikt is', async () => {
  const server = maakServer({ resterend: 0 })
  const ui = await startKlaar(server)
  try {
    assert.match(ui.tekst(), /Geen aanvragen meer over\./)
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => ui.alarmen().length > 0, 'de melding')
    assert.match(ui.alarmen().join(' '), /limiet voor agentopdrachten is bereikt/)
    assert.equal(server.aantal('POST', '/start'), 0, 'geen verzoek dat geld kan kosten')
  } finally { await ui.sluit() }
})

test('een tweede klik tijdens het starten telt niet: er gaat maar één aanvraag naar het model', async () => {
  const server = maakServer()
  let vrij
  server.haken['POST /start'] = () => new Promise((resolve) => { vrij = resolve })
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.klik(ui.knop('Starten…'))
    await ui.klik(ui.knop('Starten…'))
    assert.equal(server.aantal('POST', '/start'), 1)
    assert.equal(uitgezet(ui.knop('Stand verversen')), true, 'verversen wacht op de lopende actie')
    vrij()
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    assert.equal(server.aantal('POST', '/start'), 1)
  } finally { await ui.sluit() }
})

test('als de stand tijdens het wachten even niet op te halen is, staat dat eerlijk op het scherm en herstelt de pagina vanzelf', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    let kapot = true
    server.haken['GET /status'] = () => (kapot ? new TypeError('fetch failed') : undefined)
    await ui.wacht(() => ui.alarmen().some((a) => /kon niet worden opgehaald/.test(a)), 'de foutmelding')
    assert.match(ui.alarmen().join(' '), /We proberen het opnieuw/)
    assert.match(ui.tekst(), /In de wachtrij/, 'de laatst bekende stand blijft staan, met de melding erbij')
    kapot = false
    server.rondAf()
    await ui.wacht(() => ui.knop('Goedkeuren'), 'herstel en het voorstel')
    assert.deepEqual(ui.alarmen(), [], 'de melding verdwijnt zodra het weer lukt')
  } finally { await ui.sluit() }
})

test('na te veel mislukte pogingen stopt het automatisch vragen, staat dat erbij en herstelt Stand verversen het', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    let kapot = true
    server.haken['GET /status'] = () => (kapot ? new TypeError('fetch failed') : undefined)
    await ui.wacht(() => ui.alarmen().some((a) => /De getoonde stand kan verouderd zijn/.test(a)), 'het opgeven van het automatisch vragen')
    const gelezen = server.aantal('GET', '/status')
    await ui.rust(60)
    assert.ok(server.aantal('GET', '/status') <= gelezen + 1, 'er wordt niet eindeloos doorgehamerd op een kapotte server (hooguit een verzoek dat al onderweg was)')
    kapot = false
    server.rondAf()
    await ui.klik(ui.knop('Stand verversen'))
    await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel na handmatig verversen')
    assert.deepEqual(ui.alarmen(), [])
  } finally { await ui.sluit() }
})

test('als de agent te lang niets laat horen, stopt het vragen met een eerlijke melding en kan je de stand opnieuw opvragen', async () => {
  const server = maakServer()
  const ui = await startKlaar(server, { maxWachtMs: 30 })
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => ui.meldingen().some((m) => /nog niet geantwoord/.test(m)), 'de melding dat het te lang duurt')
    const gelezen = server.aantal('GET', '/status')
    await ui.rust(60)
    assert.equal(server.aantal('GET', '/status'), gelezen, 'na de time-out wordt niet meer vanzelf gevraagd')
    server.rondAf()
    await ui.klik(ui.knop('Stand verversen'))
    await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel na verversen')
    assert.ok(!ui.meldingen().some((m) => /nog niet geantwoord/.test(m)), 'de time-outmelding verdwijnt zodra er een uitkomst is')
  } finally { await ui.sluit() }
})

test('een trage, oudere statusuitkomst overschrijft nooit een nieuwere', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    let laat
    let eerste = true
    server.haken['GET /status'] = () => {
      if (!eerste) return undefined
      eerste = false
      const oud = json(server.statusNu()) // de stand van dat moment: in de wachtrij
      return new Promise((resolve) => { laat = () => resolve(oud) })
    }
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => laat !== undefined, 'de eerste, trage statusopvraging')
    server.rondAf()
    await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel via een snellere opvraging')
    laat()
    await ui.rust(30)
    assert.ok(ui.knop('Goedkeuren'), 'het voorstel blijft staan')
    assert.doesNotMatch(ui.tekst(), /In de wachtrij/, 'de oudere stand "in de wachtrij" komt er niet overheen')
  } finally { await ui.sluit() }
})

test('bij het sluiten tijdens het wachten stopt het vragen meteen', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  await ui.klik(ui.knop('Laat agent nakijken'))
  await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
  await ui.sluit()
  const na = server.aantal('GET', '/status')
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.ok(server.aantal('GET', '/status') <= na + 1, 'na sluiten komt er geen vervolg meer (hooguit een verzoek dat al onderweg was)')
})

// ---------------------------------------------------------------- wat er met het stuk gebeurde (SSR)

const TOEGEPAST = { id: 41, notitie_id: 8, document_id: 12, document_versie: 1, status: 'klaar', voorstel_id: 5, soort: 'wijziging', oorspronkelijk: OUD, voorstel: NIEUW, uitleg: 'Maakt de bewering concreet.', bronstatus: 'niet_opgezocht', beoordeling: { besluit: 'toegepast' } }
const NA = { id: 12, inhoud: STUK.replace(OUD, NIEUW), versie: 2 }
const metOpdracht = (opdracht, document = STATUS.document) => ({ ...STATUS, document, opdracht })
const stukRegio = (html) => /aria-label="Tekst van het verzonnen stuk"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''

test('leesAanpassing leidt af wat er met het stuk gebeurde, uitsluitend uit de status van de server', () => {
  assert.equal(typeof pagina.leesAanpassing, 'function', 'leesAanpassing ontbreekt in src/pages/agent-proef.jsx')
  const anker = { tekst: OUD, soort: 'anker' }
  const nieuw = { tekst: NIEUW, soort: 'nieuw' }
  const gevallen = [
    ['geen opdracht', metOpdracht(null), { soort: null, van: null, naar: 1, markering: anker }],
    ['nog niet beoordeeld', metOpdracht({ ...TOEGEPAST, beoordeling: null }), { soort: null, van: 1, naar: 1, markering: anker }],
    ['een onbekend besluit', metOpdracht({ ...TOEGEPAST, beoordeling: { besluit: 'misschien' } }), { soort: null, van: 1, naar: 1, markering: anker }],
    ['goedgekeurd maar niet als toegepast gemeld', metOpdracht({ ...TOEGEPAST, beoordeling: { besluit: 'goedgekeurd' } }), { soort: null, van: 1, naar: 1, markering: anker }],
    ['toegepast met een nieuwe versie en de nieuwe tekst', metOpdracht(TOEGEPAST, NA), { soort: 'aangepast', van: 1, naar: 2, markering: nieuw }],
    ['toegepast, nieuwe versie, maar de voorgestelde tekst staat er niet (uniek) in', metOpdracht(TOEGEPAST, { ...NA, inhoud: 'Iets heel anders.' }), { soort: 'aangepast', van: 1, naar: 2, markering: null }],
    ['toegepast, nieuwe versie, voorgestelde tekst twee keer', metOpdracht(TOEGEPAST, { ...NA, inhoud: `${NIEUW}\n${NIEUW}` }), { soort: 'aangepast', van: 1, naar: 2, markering: null }],
    ['toegepast, de nieuwe tekst staat erin, maar de versie is gelijk', metOpdracht(TOEGEPAST, { ...NA, versie: 1 }), { soort: 'aangepast', van: 1, naar: 1, markering: nieuw }],
    ['toegepast zonder bekende basisversie', metOpdracht({ ...TOEGEPAST, document_versie: undefined }, NA), { soort: 'aangepast', van: null, naar: 2, markering: nieuw }],
    ['toegepast zonder bekende versie van het stuk, maar de tekst staat erin', metOpdracht(TOEGEPAST, { ...NA, versie: null }), { soort: 'aangepast', van: 1, naar: null, markering: nieuw }],
    ['toegepast maar in het stuk is niets te zien', metOpdracht(TOEGEPAST), { soort: 'onbevestigd', van: 1, naar: 1, markering: anker }],
    ['afgewezen', metOpdracht({ ...TOEGEPAST, beoordeling: { besluit: 'afgewezen' } }), { soort: 'afgewezen', van: 1, naar: 1, markering: anker }],
  ]
  for (const [naam, status, verwacht] of gevallen) assert.deepEqual(pagina.leesAanpassing(status), verwacht, naam)
  const zonderAnker = { ...metOpdracht({ ...TOEGEPAST, beoordeling: { besluit: 'afgewezen' } }), notitie: { id: 8, tekst: 'x', anker: null } }
  assert.equal(pagina.leesAanpassing(zonderAnker).markering, null, 'zonder passage in de notitie is er niets te markeren')
})

test('leesAanpassing valt niet om over een ontbrekend stuk of een ontbrekende notitie', () => {
  assert.deepEqual(pagina.leesAanpassing({ document: null, notitie: null, opdracht: TOEGEPAST }), { soort: 'onbevestigd', van: 1, naar: null, markering: null })
  assert.deepEqual(pagina.leesAanpassing({ document: undefined, notitie: undefined, opdracht: null }), { soort: null, van: null, naar: null, markering: null })
  assert.deepEqual(pagina.leesAanpassing({}), { soort: null, van: null, naar: null, markering: null })
  assert.deepEqual(pagina.leesAanpassing(), { soort: null, van: null, naar: null, markering: null })
})

test('de lokale proef noemt haar agent niet gedeeld', () => {
  const html = weergave()
  assert.match(zichtbaar(html), /Commentaaragent/)
  assert.doesNotMatch(zichtbaar(html), /Gedeelde agent/)
})

test('na een goedkeuring staat er welke versie het werd, met de nieuwe tekst gemarkeerd in het stuk', () => {
  const html = weergave({ status: metOpdracht(TOEGEPAST, NA) })
  const tekst = zichtbaar(html)
  assert.match(html, /role="status"[^>]*data-soort="aangepast"|data-soort="aangepast"[^>]*role="status"/)
  assert.match(tekst, /Aangepast na goedkeuring: versie 1 → versie 2\./)
  assert.match(tekst, /De nieuwe tekst staat gemarkeerd in het stuk\./)
  assert.match(tekst, /Gemarkeerd: de nieuwe tekst uit het voorstel\./)
  assert.match(tekst, /Versie 2/)
  const regio = stukRegio(html)
  assert.match(regio, /<mark[^>]*data-soort="nieuw"[^>]*>De bakkerij verkoopt elke dag ongeveer 400 broden; dat is 12% meer dan vorig jaar\.<\/mark>/)
  assert.ok(!zichtbaar(regio).includes(OUD), 'de oude tekst staat niet meer in het stuk zelf')
  assert.doesNotMatch(zichtbaar(regio), /Gemarkeerd/, 'de uitleg staat onder het stuk, niet erin')
  assert.match(tekst, /Goedgekeurd en toegepast in het stuk/, 'ook AgentComment zegt het')
  assert.equal(knop(html, 'Goedkeuren'), undefined)
  assert.equal(knop(html, 'Opnieuw laten nakijken'), undefined, 'de passage bestaat niet meer; reset is nodig')
  assert.match(tekst, /Opnieuw beginnen.*voorbeeld.*terug/i)
})

test('de melding over een aanpassing past zich aan aan wat de server wel en niet weet', () => {
  assert.match(zichtbaar(weergave({ status: metOpdracht({ ...TOEGEPAST, document_versie: undefined }, NA) })), /Aangepast na goedkeuring: het stuk is nu versie 2\./)
  assert.match(zichtbaar(weergave({ status: metOpdracht(TOEGEPAST, { ...NA, versie: null }) })), /Aangepast na goedkeuring\./)
  assert.doesNotMatch(zichtbaar(weergave({ status: metOpdracht(TOEGEPAST, { ...NA, inhoud: 'Iets heel anders.' }) })), /staat gemarkeerd|Gemarkeerd/, 'zonder terug te vinden tekst geen belofte over een markering')
})

test('een afwijzing laat het stuk ongemoeid en zegt dat alleen als de versie dat bevestigt', () => {
  const afgewezen = { ...TOEGEPAST, beoordeling: { besluit: 'afgewezen' } }
  const html = weergave({ status: metOpdracht(afgewezen) })
  assert.match(zichtbaar(html), /Voorstel afgewezen: het stuk is niet aangepast \(versie 1\)\./)
  assert.match(html, /data-soort="afgewezen"/)
  assert.match(stukRegio(html), /<mark[^>]*data-soort="anker"/, 'de passage van de notitie is weer gemarkeerd')
  assert.ok(zichtbaar(stukRegio(html)).includes(OUD))
  const anders = zichtbaar(weergave({ status: metOpdracht(afgewezen, { ...STATUS.document, versie: 3 }) }))
  assert.match(anders, /Voorstel afgewezen\./)
  assert.doesNotMatch(anders, /niet aangepast/, 'bij een andere versie claimen we niets over dit voorstel')
})

test('als de server zegt dat het is toegepast maar het stuk dat niet laat zien, wordt dat als waarschuwing gemeld', () => {
  const html = weergave({ status: metOpdracht(TOEGEPAST) })
  assert.match(html, /role="alert"[^>]*data-soort="onbevestigd"|data-soort="onbevestigd"[^>]*role="alert"/)
  assert.match(zichtbaar(html), /De proefserver meldt dat het voorstel is toegepast, maar in het stuk is dat niet te zien \(versie 1\)\. Controleer het stuk zelf voor je verdergaat\./)
  assert.doesNotMatch(zichtbaar(html), /Aangepast na goedkeuring/)
})

test('zonder beoordeeld voorstel staat er geen melding over een aanpassing', () => {
  for (const status of [STATUS, metOpdracht({ ...TOEGEPAST, beoordeling: null }), metOpdracht(BEZIG)]) {
    assert.doesNotMatch(zichtbaar(weergave({ status })), /Aangepast na goedkeuring|Voorstel afgewezen:|niet te zien/)
  }
})

// ---------------------------------------------------------------- expliciet beoordelen en het stuk aanpassen (DOM)

const naarVoorstel = async (server, props = {}) => {
  const ui = await startKlaar(server, props)
  await ui.klik(ui.knop('Laat agent nakijken'))
  await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
  server.rondAf()
  await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel van de agent')
  return ui
}
const stukTekst = (ui) => ui.alle((k) => k.getAttribute('aria-label') === 'Tekst van het verzonnen stuk')[0]?.textContent ?? ''
const beoordeelCalls = (server) => server.oproepen.filter((o) => o.pad === '/beoordeel')

test('goedkeuren vraagt eerst een bevestiging; pas "Ja, goedkeuren" doet één POST en daarna staat het aangepaste stuk van de server op het scherm', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    assert.match(ui.tekst(), /Versie 1/)
    assert.ok(stukTekst(ui).includes(OUD))
    await ui.klik(ui.knop('Goedkeuren'))
    assert.equal(beoordeelCalls(server).length, 0, 'de eerste klik beoordeelt nog niets')
    assert.match(ui.tekst(), /Dit voorstel goedkeuren\?/)
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.wacht(() => /Versie 2/.test(ui.tekst()), 'het aangepaste stuk')
    assert.deepEqual(beoordeelCalls(server).map((o) => o.body), [{ voorstelId: 5, besluit: 'goedgekeurd' }], 'alleen het voorstel en het besluit gaan mee')
    const volgorde = server.volgorde()
    assert.equal(volgorde[volgorde.indexOf('POST /beoordeel') + 1], 'GET /status', 'na het beoordelen wordt de stand opnieuw gelezen')
    assert.ok(stukTekst(ui).includes(NIEUW), 'het stuk bevat de nieuwe tekst, zoals de server hem teruggeeft')
    assert.ok(!stukTekst(ui).includes(OUD), 'en niet meer de oude')
    assert.equal(stukTekst(ui), server.s.doc.inhoud, 'het stuk op het scherm is precies dat van de server')
    const markeringen = ui.alle((k) => k.tagName === 'MARK')
    assert.equal(markeringen.length, 1)
    assert.equal(markeringen[0].getAttribute('data-soort'), 'nieuw')
    assert.equal(markeringen[0].textContent, NIEUW)
    assert.match(ui.tekst(), /Aangepast na goedkeuring: versie 1 → versie 2\./)
    assert.match(ui.tekst(), /Goedgekeurd en toegepast in het stuk/)
    assert.equal(ui.knop('Goedkeuren'), undefined, 'na een beoordeling geen tweede beoordeling')
    assert.equal(ui.knop('Afwijzen'), undefined)
    assert.equal(ui.knop('Opnieuw laten nakijken'), undefined, 'de passage is vervangen en reset is nodig')
    assert.match(ui.tekst(), /Opnieuw beginnen.*voorbeeld.*terug/i)
    assert.deepEqual(ui.alarmen(), [])
  } finally { await ui.sluit() }
})

test('afwijzen vraagt dezelfde bevestiging, past het stuk niet aan en zegt dat eerlijk', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    await ui.klik(ui.knop('Afwijzen'))
    assert.match(ui.tekst(), /Dit voorstel afwijzen\?/)
    assert.equal(beoordeelCalls(server).length, 0)
    await ui.klik(ui.knop('Ja, afwijzen'))
    await ui.wacht(() => /Voorstel afgewezen: het stuk is niet aangepast/.test(ui.tekst()), 'de afwijzing')
    assert.deepEqual(beoordeelCalls(server).map((o) => o.body), [{ voorstelId: 5, besluit: 'afgewezen' }])
    assert.match(ui.tekst(), /Versie 1/)
    assert.equal(stukTekst(ui), STUK, 'het stuk is niet veranderd')
    assert.equal(ui.alle((k) => k.tagName === 'MARK')[0].getAttribute('data-soort'), 'anker')
    assert.equal(ui.knop('Goedkeuren'), undefined)
  } finally { await ui.sluit() }
})

test('annuleren of Escape in de bevestiging beoordeelt niets', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Annuleer'))
    assert.equal(beoordeelCalls(server).length, 0)
    assert.doesNotMatch(ui.tekst(), /Dit voorstel goedkeuren\?/)
    assert.ok(ui.knop('Goedkeuren'), 'het voorstel wacht nog steeds op een beslissing')
    assert.match(ui.tekst(), /Nog niet beoordeeld/)
  } finally { await ui.sluit() }
})

test('een tweede klik op bevestigen tijdens het beoordelen telt niet', async () => {
  const server = maakServer()
  let vrij
  const ui = await naarVoorstel(server)
  try {
    server.haken['POST /beoordeel'] = () => new Promise((resolve) => { vrij = resolve })
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.klik(ui.knop('Bezig…'))
    await ui.klik(ui.knop('Bezig…'))
    assert.equal(beoordeelCalls(server).length, 1)
    vrij()
    await ui.wacht(() => /Versie 2/.test(ui.tekst()), 'het aangepaste stuk')
    assert.equal(beoordeelCalls(server).length, 1)
  } finally { await ui.sluit() }
})

test('als het beoordelen mislukt, staat dat eerlijk bij het voorstel en toont de pagina de echte stand van de server', async () => {
  const gevallen = [
    ['netwerkfout', () => new TypeError('fetch failed'), /Controleer de stand voor je opnieuw probeert/, false],
    ['serverfout', () => json({ fout: 'interne_fout' }, 500), /Controleer de stand voor je opnieuw probeert/, false],
    ['document gewijzigd', () => json({ fout: 'document_gewijzigd' }, 409), /stuk is gewijzigd sinds dit voorstel/, false],
    ['voorstel gewijzigd', () => json({ fout: 'voorstel_gewijzigd' }, 409), /voorstel is gewijzigd/, false],
  ]
  for (const [naam, haak, melding] of gevallen) {
    const server = maakServer()
    const ui = await naarVoorstel(server)
    try {
      server.haken['POST /beoordeel'] = haak
      await ui.klik(ui.knop('Goedkeuren'))
      await ui.klik(ui.knop('Ja, goedkeuren'))
      await ui.wacht(() => ui.alarmen().some((a) => /Je beoordeling kon niet bevestigd worden/.test(a)), `de foutmelding bij ${naam}`)
      assert.match(ui.alarmen().join(' '), melding, naam)
      assert.doesNotMatch(ui.alarmen().join(' '), /interne_fout|document_gewijzigd|voorstel_gewijzigd|fetch failed/, `${naam}: geen ruwe code`)
      assert.match(ui.tekst(), /Versie 1/, `${naam}: het stuk is niet veranderd`)
      assert.equal(stukTekst(ui), STUK, naam)
      assert.doesNotMatch(ui.tekst(), /Aangepast na goedkeuring/, naam)
      assert.equal(uitgezet(ui.knop('Goedkeuren')), false, `${naam}: je kan bewust opnieuw beslissen`)
      assert.equal(beoordeelCalls(server).length, 1, naam)
    } finally { await ui.sluit() }
  }
})

test('als iemand anders het voorstel al beoordeelde, laat de pagina na de weigering de echte, beoordeelde stand zien', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    server.haken['POST /beoordeel'] = () => {
      server.s.opdracht.beoordeling = { besluit: 'afgewezen' } // in een ander tabblad al afgewezen
      return json({ fout: 'voorstel_al_beoordeeld' }, 409)
    }
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.wacht(() => ui.knop('Goedkeuren') === undefined, 'de bijgewerkte stand')
    assert.match(ui.tekst(), /Voorstel afgewezen: het stuk is niet aangepast/)
    assert.equal(stukTekst(ui), STUK)
  } finally { await ui.sluit() }
})

test('als de server iets anders bevestigt dan gevraagd, wordt de beoordeling niet als gelukt getoond', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    server.haken['POST /beoordeel'] = () => json({ besluit: 'afgewezen' }) // gevraagd: goedgekeurd; de server wijzigt niets
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.wacht(() => ui.alarmen().some((a) => /Je beoordeling kon niet bevestigd worden/.test(a)), 'de foutmelding')
    assert.doesNotMatch(ui.tekst(), /Je beoordeling is doorgegeven|Goedgekeurd en toegepast/)
    assert.equal(stukTekst(ui), STUK)
  } finally { await ui.sluit() }
})

test('als de stand na het beoordelen niet te lezen is, staat dat er eerlijk bij en toont Stand verversen daarna het echte resultaat', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    let kapot = false
    server.haken['POST /beoordeel'] = () => { kapot = true }
    server.haken['GET /status'] = () => (kapot ? new TypeError('fetch failed') : undefined)
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.wacht(() => ui.alarmen().some((a) => /Je beoordeling kon niet bevestigd worden/.test(a)), 'de foutmelding bij het voorstel')
    assert.ok(ui.alarmen().some((a) => /kon niet worden opgehaald/.test(a)), 'de pagina zegt ook dat de stand niet te lezen is')
    kapot = false
    await ui.klik(ui.knop('Stand verversen'))
    await ui.wacht(() => /Versie 2/.test(ui.tekst()), 'het echte resultaat na verversen')
    assert.match(ui.tekst(), /Aangepast na goedkeuring: versie 1 → versie 2\./)
    assert.equal(stukTekst(ui), server.s.doc.inhoud)
    assert.deepEqual(ui.alarmen(), [])
  } finally { await ui.sluit() }
})

test('als de server toegepast meldt maar het stuk niet verandert, waarschuwt de pagina in plaats van succes te melden', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    server.haken['POST /beoordeel'] = () => {
      server.s.opdracht.beoordeling = { besluit: 'toegepast' } // de server meldt het, maar het stuk blijft zoals het was
      return json({ besluit: 'toegepast' })
    }
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.wacht(() => ui.alarmen().some((a) => /in het stuk is dat niet te zien/.test(a)), 'de waarschuwing')
    assert.doesNotMatch(ui.tekst(), /Aangepast na goedkeuring/)
    assert.equal(stukTekst(ui), STUK)
  } finally { await ui.sluit() }
})

test('wat er met het stuk gebeurde blijft zichtbaar na opnieuw openen van de pagina: het komt van de server, niet uit het geheugen', async () => {
  const server = maakServer()
  server.s.doc = { ...NA }
  server.s.opdracht = { ...TOEGEPAST }
  const ui = await startKlaar(server)
  try {
    assert.match(ui.tekst(), /Versie 2/)
    assert.match(ui.tekst(), /Aangepast na goedkeuring: versie 1 → versie 2\./)
    assert.equal(ui.alle((k) => k.tagName === 'MARK')[0].textContent, NIEUW)
    assert.deepEqual(server.volgorde(), ['GET /status'])
  } finally { await ui.sluit() }
})

// ---------------------------------------------------------------- opnieuw beginnen (SSR)

test('Opnieuw beginnen staat er zodra de proef geladen is, met uitleg, en is bezig zolang een actie loopt', () => {
  const html = weergave()
  assert.equal(knop(html, 'Opnieuw beginnen')?.uit, false)
  const id = /<button[^>]*aria-describedby="([^"]+)"[^>]*>(?:<[^>]+>)*Opnieuw beginnen/.exec(html)?.[1]
  assert.ok(id, 'de knop is gekoppeld aan zijn uitleg voor schermlezers')
  assert.match(html, new RegExp(`id="${esc(id)}"[^>]*>[^<]*Zet het verzonnen stuk en de agentopdracht terug`))
  for (const actie of ['starten', 'beoordelen', 'resetten', 'verversen']) assert.equal(knop(weergave({ actie }), 'Opnieuw beginnen')?.uit, true, `tijdens ${actie} geen tweede actie`)
  assert.equal(knop(weergave({ fase: 'laden', status: null }), 'Opnieuw beginnen'), undefined)
  assert.equal(knop(weergave({ fase: 'fout', status: null, leesFout: 'niet_bereikbaar' }), 'Opnieuw beginnen'), undefined)
  assert.equal(knop(weergave({ status: { ...STATUS, beschikbaar: false, document: null, notitie: null } }), 'Opnieuw beginnen'), undefined, 'een niet beschikbare proef heeft niets om terug te zetten')
})

test('na het terugzetten staat er een korte bevestiging, en een mislukt terugzetten een eerlijke waarschuwing zonder ruwe code', () => {
  const ok = weergave({ melding: { soort: 'ok' } })
  assert.match(ok, /role="status"[^>]*data-soort="ok"|data-soort="ok"[^>]*role="status"/)
  assert.match(zichtbaar(ok), /De proef is teruggezet\./)
  const fout = weergave({ melding: { soort: 'fout', code: 'niet_bereikbaar' } })
  assert.match(fout, /role="alert"[^>]*data-soort="fout"|data-soort="fout"[^>]*role="alert"/)
  assert.match(zichtbaar(fout), /Opnieuw beginnen is niet gelukt\. Probeer het opnieuw; Stand verversen laat zien wat de stand nu is\./)
  assert.doesNotMatch(zichtbaar(fout), /niet_bereikbaar/)
  assert.doesNotMatch(zichtbaar(weergave()), /teruggezet\.|Opnieuw beginnen is niet gelukt/)
})

// ---------------------------------------------------------------- opnieuw beginnen (DOM)

test('Opnieuw beginnen zet het stuk en de opdracht echt terug: één POST, daarna de stand van de server en niets anders', async () => {
  const server = maakServer()
  const ui = await naarVoorstel(server)
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.wacht(() => /Versie 2/.test(ui.tekst()), 'het aangepaste stuk')
    assert.equal(server.aantal('POST', '/reset'), 0, 'voor de klik is er niets teruggezet')
    const posts = server.oproepen.filter((o) => o.methode === 'POST').length
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => /Versie 1/.test(ui.tekst()), 'het teruggezette stuk')
    assert.deepEqual(server.oproepen.filter((o) => o.pad === '/reset').map((o) => [o.methode, o.body]), [['POST', {}]])
    assert.equal(server.oproepen.filter((o) => o.methode === 'POST').length, posts + 1, 'reset doet geen andere schrijfactie')
    assert.equal(stukTekst(ui), STUK, 'het stuk is weer het oorspronkelijke')
    assert.equal(stukTekst(ui), server.s.doc.inhoud)
    assert.doesNotMatch(ui.tekst(), /Aangepast na goedkeuring|Wijzigingsvoorstel|Goedgekeurd/, 'de oude opdracht en de melding zijn weg')
    assert.equal(uitgezet(ui.knop('Laat agent nakijken')), false, 'je kan opnieuw beginnen met een nieuwe aanvraag')
    assert.equal(ui.alle((k) => k.tagName === 'MARK')[0].getAttribute('data-soort'), 'anker')
    assert.match(ui.tekst(), /Nog 2 aanvragen over/, 'het aantal blijft dat van de server')
    assert.ok(ui.meldingen().some((m) => /De proef is teruggezet\./.test(m)))
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'een nieuwe opdracht na het terugzetten')
    assert.ok(!ui.meldingen().some((m) => /De proef is teruggezet\./.test(m)), 'de bevestiging verdwijnt bij de volgende actie')
  } finally { await ui.sluit() }
})

test('terugzetten tijdens het wachten stopt het volgen en laat de agent niets meer in beeld zetten', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'de teruggezette proef')
    assert.doesNotMatch(ui.tekst(), /In de wachtrij/)
    const gelezen = server.aantal('GET', '/status')
    await ui.rust(60)
    assert.ok(server.aantal('GET', '/status') <= gelezen + 1, 'zonder opdracht wordt er niet meer gevolgd')
  } finally { await ui.sluit() }
})

test('een trage statusuitkomst van vóór het terugzetten overschrijft de teruggezette stand niet', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    let laat
    server.haken['GET /status'] = () => {
      const oud = json(server.statusNu()) // de stand van vóór het terugzetten: in de wachtrij
      return new Promise((resolve) => { laat = () => resolve(oud) })
    }
    await ui.wacht(() => laat !== undefined, 'een trage pollronde')
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'de teruggezette proef')
    laat()
    await ui.rust(30)
    assert.ok(ui.knop('Laat agent nakijken'), 'de teruggezette stand blijft staan')
    assert.doesNotMatch(ui.tekst(), /In de wachtrij/, 'de stand van vóór het terugzetten komt er niet overheen')
  } finally { await ui.sluit() }
})

test('als terugzetten mislukt, staat dat eerlijk op het scherm en toont de pagina de echte stand', async () => {
  for (const [naam, haak] of [
    ['netwerkfout', () => new TypeError('fetch failed')],
    ['serverfout', () => json({ fout: 'interne_fout' }, 500)],
    ['onbegrijpelijk antwoord', () => new Response('<!doctype html>', { status: 200 })],
  ]) {
    const server = maakServer()
    const ui = await naarVoorstel(server)
    try {
      server.haken['POST /reset'] = haak
      await ui.klik(ui.knop('Opnieuw beginnen'))
      await ui.wacht(() => ui.alarmen().some((a) => /Opnieuw beginnen is niet gelukt/.test(a)), `de foutmelding bij ${naam}`)
      assert.doesNotMatch(ui.alarmen().join(' '), /interne_fout|fetch failed|doctype|niet_bereikbaar/, `${naam}: geen ruwe tekst`)
      assert.ok(ui.knop('Goedkeuren'), `${naam}: het stuk en het voorstel staan er nog, zoals de server ze heeft`)
      assert.equal(uitgezet(ui.knop('Opnieuw beginnen')), false, `${naam}: je kan het opnieuw proberen`)
      delete server.haken['POST /reset']
      await ui.klik(ui.knop('Opnieuw beginnen'))
      await ui.wacht(() => ui.knop('Laat agent nakijken'), `${naam}: de tweede poging`)
      assert.deepEqual(ui.alarmen(), [], `${naam}: de waarschuwing verdwijnt na een geslaagde poging`)
      assert.equal(server.aantal('POST', '/reset'), 2, naam)
    } finally { await ui.sluit() }
  }
})

test('als de opdracht op de server verdwijnt (bijvoorbeeld door een reset in een ander tabblad), komt de startknop terug in plaats van een oude "aanvraag verstuurd"', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    server.s.opdracht = null // elders teruggezet
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'de startknop na het verdwijnen van de opdracht')
    assert.doesNotMatch(ui.tekst(), /Aanvraag verstuurd|In de wachtrij/)
    assert.equal(uitgezet(ui.knop('Laat agent nakijken')), false)
  } finally { await ui.sluit() }
})

test('tijdens het starten of terugzetten blijft de andere actie dicht: er is nooit meer dan één schrijfactie tegelijk', async () => {
  const server = maakServer()
  let vrijStart
  server.haken['POST /start'] = () => new Promise((resolve) => { vrijStart = resolve })
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.klik(ui.knop('Opnieuw beginnen'))
    assert.equal(server.aantal('POST', '/reset'), 0, 'tijdens het starten wordt er niet teruggezet')
    vrijStart()
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
  } finally { await ui.sluit() }

  const tweede = maakServer()
  let vrijReset
  tweede.haken['POST /reset'] = () => new Promise((resolve) => { vrijReset = resolve })
  const ui2 = await startKlaar(tweede)
  try {
    await ui2.klik(ui2.knop('Opnieuw beginnen'))
    await ui2.wacht(() => vrijReset !== undefined, 'het lopende terugzetten')
    await ui2.klik(ui2.knop('Laat agent nakijken'))
    await ui2.wacht(() => ui2.alarmen().some((a) => /Starten is niet gelukt/.test(a)), 'de melding dat starten nu niet kan')
    assert.equal(tweede.aantal('POST', '/start'), 0, 'tijdens het terugzetten start er niets')
    vrijReset()
    await ui2.wacht(() => ui2.meldingen().some((m) => /De proef is teruggezet\./.test(m)), 'het einde van het terugzetten')
    await ui2.klik(ui2.knop('Laat agent nakijken'))
    await ui2.wacht(() => tweede.aantal('POST', '/start') === 1, 'een bewuste nieuwe start')
  } finally { await ui2.sluit() }
})

// ---------------------------------------------------------------- robuust tegen rommel en rare omstandigheden

test('zonder naar-functie van de ouder valt "Terug naar het werkblad" terug op de adresbalk van de browser', async () => {
  const server = maakServer()
  const eerder = Object.getOwnPropertyDescriptor(globalThis, 'location')
  globalThis.location = { hash: '#/agent-proef' }
  const ui = await mount({ fetchFn: server.fetchFn, naar: undefined })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    await ui.klik(ui.knop('Terug naar het werkblad'))
    assert.equal(globalThis.location.hash, '#/')
    globalThis.location.hash = '#/agent-proef'
    await ui.klik(ui.knop('Werkblad'))
    assert.equal(globalThis.location.hash, '#/')
  } finally {
    await ui.sluit()
    if (eerder) Object.defineProperty(globalThis, 'location', eerder); else delete globalThis.location
  }
})

test('een ouder die bij elke render een nieuwe fetchFn meegeeft, veroorzaakt geen eindeloos herladen', async () => {
  const server = maakServer()
  const ui = await mount({ fetchFn: (...argumenten) => server.fetchFn(...argumenten) })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    for (let i = 0; i < 3; i += 1) await ui.toon({ fetchFn: (...argumenten) => server.fetchFn(...argumenten) })
    await ui.rust(30)
    assert.deepEqual(server.volgorde(), ['GET /status'], 'een nieuwe functie is geen reden om opnieuw te laden')
  } finally { await ui.sluit() }
})

test('zonder eigen fetchFn gaat de pagina met de fetch van de browser naar de proef op dezelfde origin, nergens anders heen', async () => {
  const server = maakServer()
  const gezien = []
  const eerder = globalThis.fetch
  globalThis.fetch = async (url, init) => { gezien.push(String(url)); return server.fetchFn(url, init) }
  const ui = await mount({ fetchFn: undefined })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => ui.meldingen().some((m) => /De proef is teruggezet/.test(m)), 'het terugzetten')
    assert.ok(gezien.length >= 4)
    for (const url of gezien) assert.match(url, /^\/api\/agent-proef\/(?:status|start|reset)$/, `onverwacht adres ${url}`)
  } finally { await ui.sluit(); globalThis.fetch = eerder }
})

test('een eigen basisadres voor de API wordt gebruikt voor alle verzoeken', async () => {
  const server = maakServer()
  const urls = []
  const ui = await mount({ fetchFn: (url, init) => { urls.push(url); return server.fetchFn(url, init) }, basisUrl: '/archer-werkbank/api/agent-proef' })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => ui.meldingen().some((m) => /De proef is teruggezet/.test(m)), 'het terugzetten')
    assert.deepEqual([...new Set(urls)].sort(), ['/archer-werkbank/api/agent-proef/reset', '/archer-werkbank/api/agent-proef/status'])
  } finally { await ui.sluit() }
})

test('de pagina werkt ook in React StrictMode, waar effecten bij het openen twee keer draaien', async () => {
  const server = maakServer()
  const ui = await mount({ fetchFn: server.fetchFn, strikt: true })
  try {
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'het laden van de proef')
    await ui.rust(30)
    assert.equal(server.aantal('POST', '/start') + server.aantal('POST', '/beoordeel') + server.aantal('POST', '/reset'), 0, 'dubbel draaien start of wijzigt niets')
    assert.deepEqual(ui.alarmen(), [])
    assert.match(ui.tekst(), /Versie 1/)
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    assert.equal(server.aantal('POST', '/start'), 1)
  } finally { await ui.sluit() }
})

test('rommel in de opdracht van de server laat de pagina niet crashen en toont nooit [object Object] of undefined', () => {
  const rommel = [
    { id: 41, notitie_id: 8, document_id: 12, status: 'klaar', soort: 'wijziging', oorspronkelijk: { x: 1 }, voorstel: ['y'], uitleg: 42, voorstel_id: {}, beoordeling: { besluit: {} }, document_versie: 'één' },
    { id: 41, notitie_id: 8, document_id: 12, status: 'klaar', soort: 'wijziging', oorspronkelijk: OUD, voorstel: NIEUW, voorstel_id: 5, beoordeling: 'ja', document_versie: -3 },
    { id: 41, notitie_id: 8, document_id: 12, status: 'klaar', soort: 'wijziging', oorspronkelijk: OUD, voorstel: NIEUW, voorstel_id: 5, beoordeling: { besluit: 'toegepast' }, document_versie: 1.5 },
    { id: 41, notitie_id: 8, document_id: 12, status: { x: 1 }, fout: { diep: 1 } },
    { id: 41, notitie_id: 8, document_id: 12, status: 'mislukt', fout_code: ['x'], fout: null },
    { id: 41, notitie_id: 8, document_id: 12 },
    Object.assign(Object.create(null), { id: 41, status: 'bezig' }),
  ]
  for (const opdracht of rommel) {
    for (const document of [STATUS.document, NA]) {
      const html = weergave({ status: metOpdracht(opdracht, document) })
      const tekst = zichtbaar(html)
      assert.doesNotMatch(tekst, /\[object Object\]|\bundefined\b|\bNaN\b|\bnull\b/, `rommelige opdracht ${JSON.stringify(opdracht)}`)
      for (const label of LABELS) assert.match(tekst, new RegExp(label))
    }
  }
})

test('een heel lang stuk blijft gewoon tekst in een scrollbaar gebied en breekt de pagina niet', () => {
  const lang = 'woord '.repeat(60000)
  const html = weergave({ status: { ...STATUS, document: { id: 12, inhoud: `${lang}${OUD}${lang}`, versie: 1 } } })
  assert.ok(html.length > lang.length * 2)
  assert.match(html, /<mark[^>]*data-soort="anker"[^>]*>De bakkerij verkoopt/)
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+=/i)
})

// ---------------------------------------------------------------- toegankelijke opbouw (SSR)

const alleStaten = () => [
  ['laden', weergave({ fase: 'laden', status: null })],
  ['laadfout', weergave({ fase: 'fout', status: null, leesFout: 'niet_bereikbaar' })],
  ['niet beschikbaar', weergave({ status: { ...STATUS, beschikbaar: false, document: null, notitie: null } })],
  ['klaar zonder opdracht', weergave()],
  ['agent bezig', weergave({ status: metOpdracht(BEZIG), pollt: true })],
  ['voorstel', weergave({ status: metOpdracht({ ...TOEGEPAST, beoordeling: null }) })],
  ['aangepast', weergave({ status: metOpdracht(TOEGEPAST, NA), melding: { soort: 'ok' } })],
  ['afgewezen', weergave({ status: metOpdracht({ ...TOEGEPAST, beoordeling: { besluit: 'afgewezen' } }) })],
  ['onbevestigd', weergave({ status: metOpdracht(TOEGEPAST) })],
  ['mislukt', weergave({ status: metOpdracht({ ...BEZIG, status: 'mislukt', fout_code: 'model_fout' }) })],
  ['alle meldingen tegelijk', weergave({ verlopen: true, leesFout: 'niet_bereikbaar', melding: { soort: 'fout' }, actie: 'verversen' })],
]

test('elke toestand heeft één main, één h1 en koppen die niet overslaan', () => {
  for (const [naam, html] of alleStaten()) {
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, `${naam}: één main`)
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${naam}: één h1`)
    const niveaus = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]))
    assert.equal(niveaus[0], 1, `${naam}: begint met de h1`)
    niveaus.forEach((n, i) => { if (i > 0) assert.ok(n <= niveaus[i - 1] + 1, `${naam}: h${n} na h${niveaus[i - 1]} slaat een niveau over (${niveaus.join(',')})`) })
  }
})

test('elke toestand heeft unieke id\'s, geldige verwijzingen, benoemde regio\'s en nette knoppen', () => {
  for (const [naam, html] of alleStaten()) {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    assert.equal(new Set(ids).size, ids.length, `${naam}: dubbele id's ${ids.join(' ')}`)
    for (const [, kenmerk, waarde] of html.matchAll(/\s(aria-labelledby|aria-describedby|aria-controls)="([^"]+)"/g)) {
      for (const verwijzing of waarde.split(/\s+/)) assert.ok(ids.includes(verwijzing), `${naam}: ${kenmerk} verwijst naar ontbrekend id ${verwijzing}`)
    }
    for (const [, attrs] of html.matchAll(/<(?:div|section)\b([^>]*\srole="region"[^>]*)>/g)) assert.match(attrs, /aria-label(?:ledby)?="[^"]+"/, `${naam}: een region zonder naam`)
    for (const [, attrs] of html.matchAll(/<(?:div|section)\b([^>]*\stabindex="[^"]*"[^>]*)>/gi)) assert.match(attrs, /tabindex="0"/i, `${naam}: alleen tabindex 0`)
    const zonderKruimel = html.replace(/<div class="kruimel">[\s\S]*?<\/div>/, '')
    for (const [, attrs] of zonderKruimel.matchAll(/<button\b([^>]*)>/g)) assert.match(attrs, /type="button"/, `${naam}: een knop zonder type`)
    for (const [svg] of html.matchAll(/<svg\b[^>]*>/g)) assert.match(svg, /aria-hidden="true"/, `${naam}: een icoon dat schermlezers kunnen voorlezen`)
    assert.doesNotMatch(html, /<img\b|<a\b|\sstyle="[^"]*(?:color|background)/i, `${naam}: geen plaatjes, links of vaste kleuren in de opmaak`)
  }
})

test('een scrollbaar stuk is bereikbaar met het toetsenbord en heeft een naam', () => {
  const html = weergave()
  assert.match(html, /<div class="ap-stuk" role="region" aria-label="Tekst van het verzonnen stuk" tabindex="0">/)
  assert.equal((html.match(/tabindex=/gi) ?? []).length, 1, 'verder alleen wat van zichzelf focus krijgt')
})

test('meldingen die iets aan de gebruiker vragen zijn alert, en meldingen die alleen informeren zijn status', () => {
  const html = weergave({ verlopen: true, leesFout: 'niet_bereikbaar', melding: { soort: 'fout' } })
  const rollen = Object.fromEntries([...html.matchAll(/<p class="ap-melding" role="(alert|status)" data-soort="([a-z]+)"/g)].map((m) => [m[2], m[1]]))
  assert.deepEqual(rollen, { fout: 'alert', wacht: 'status' })
  assert.match(weergave({ melding: { soort: 'ok' } }), /<p class="ap-melding" role="status" data-soort="ok"/)
})

// ---------------------------------------------------------------- stijl: alleen bestaande tokens en schermen

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8')
const zonderCommentaar = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const proefBron = lees('../src/pages/agent-proef.jsx')
const proefCss = zonderCommentaar(lees('../src/pages/agent-proef.css'))
const basisCss = zonderCommentaar(lees('../src/styles.css'))

// Een kleine CSS-lezer: genoeg voor platte regels en één niveau @media.
function leesCss(bron, omgeving = null) {
  const regels = []
  let i = 0
  while (i < bron.length) {
    const open = bron.indexOf('{', i)
    if (open < 0) break
    let diepte = 1
    let j = open + 1
    while (j < bron.length && diepte > 0) { if (bron[j] === '{') diepte += 1; else if (bron[j] === '}') diepte -= 1; j += 1 }
    const kop = bron.slice(i, open).trim()
    const body = bron.slice(open + 1, j - 1)
    if (/^@(media|supports)/.test(kop)) regels.push(...leesCss(body, kop))
    else regels.push({ omgeving, kop, selectors: kop.startsWith('@') ? [] : kop.split(',').map((s) => s.trim()), body })
    i = j
  }
  return regels
}
const declaraties = (body) => Object.fromEntries(body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const k = d.indexOf(':'); return [d.slice(0, k).trim(), d.slice(k + 1).trim()] }))
const proefRegels = leesCss(proefCss)
const regelVoor = (selector, omgeving = null) => proefRegels.find((r) => r.omgeving === omgeving && r.selectors.includes(selector))

const basisRegels = leesCss(basisCss)
const tokenTabel = (selector) => Object.fromEntries(basisRegels.filter((r) => r.omgeving === null && r.selectors.includes(selector)).flatMap((r) => Object.entries(declaraties(r.body))).filter(([naam]) => naam.startsWith('--')))
const TOKENS_LICHT = tokenTabel(':root')
const TOKENS_DONKER = { ...TOKENS_LICHT, ...tokenTabel(":root[data-thema='donker']") }

test('de stijl gebruikt alleen tokens die in styles.css bestaan, en geen eigen kleuren', () => {
  assert.ok(Object.keys(TOKENS_LICHT).length > 50, 'de tokens van styles.css zijn gelezen')
  assert.ok(proefRegels.length > 10, 'agent-proef.css bevat de stijl van de pagina')
  for (const [, naam] of proefCss.matchAll(/var\((--[a-z0-9-]+)/g)) {
    assert.ok(naam in TOKENS_LICHT, `${naam} bestaat niet in styles.css`)
    assert.ok(naam in TOKENS_DONKER)
  }
  assert.doesNotMatch(proefCss, /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/i, 'geen eigen kleurwaarden')
  assert.doesNotMatch(proefCss, /:\s*[^;{}]*\b(?:white|black|red|green|blue|yellow|orange|purple|gr[ae]y|pink|brown)\b/i, 'geen kleurnamen')
  assert.doesNotMatch(proefCss, /!important/)
})

test('alle selectors zijn afgebakend onder .ap-, zodat de rest van de werkbank er niets van merkt', () => {
  assert.ok(proefRegels.length > 10)
  for (const regel of proefRegels) {
    for (const selector of regel.selectors) assert.match(selector, /^\.ap-[a-z]/, `selector "${selector}" lekt buiten de proefpagina`)
  }
})

test('elke ap-klas die de pagina gebruikt heeft een stijl, en elke stijl wordt gebruikt', () => {
  const inBron = new Set([...proefBron.matchAll(/className="([^"]*)"/g)].flatMap(([, v]) => v.split(/\s+/)).filter((k) => k.startsWith('ap-')))
  const inHtml = new Set(alleStaten().flatMap(([, html]) => [...html.matchAll(/class="([^"]*)"/g)].flatMap(([, v]) => v.split(/\s+/))).filter((k) => k.startsWith('ap-')))
  const inCss = new Set([...proefCss.matchAll(/\.(ap-[a-z0-9-]+)/g)].map((m) => m[1]))
  assert.ok(inBron.size >= 15, 'de klassen zijn gelezen')
  for (const klas of new Set([...inBron, ...inHtml])) assert.ok(inCss.has(klas), `.${klas} heeft geen stijl`)
  for (const klas of inCss) assert.ok(inBron.has(klas), `.${klas} staat in de CSS maar de pagina gebruikt hem niet`)
  assert.match(proefBron, /import '\.\/agent-proef\.css'/, 'de pagina laadt zijn eigen stijl')
})

test('de stijl laat focus en beweging met rust', () => {
  assert.ok(proefRegels.length > 10)
  assert.doesNotMatch(proefCss, /outline\s*:\s*(?:none|0)\b/, 'de focusring van styles.css blijft zichtbaar')
  assert.doesNotMatch(proefCss, /\b(?:animation|transition)\b|@keyframes/, 'niets beweegt, dus ook niets om uit te zetten bij verminderde beweging')
})

test('de stijl past zich aan: twee kolommen op een breed scherm, één op een smal, tekst die niet uit de kaart loopt', () => {
  const raster = regelVoor('.ap-raster')
  assert.ok(raster, '.ap-raster heeft een regel')
  assert.equal(declaraties(raster.body).display, 'grid')
  assert.match(declaraties(raster.body)['grid-template-columns'], /minmax\(0,\s*[\d.]+fr\)/, 'kolommen die kunnen krimpen')
  const smal = proefRegels.find((r) => /max-width/.test(r.omgeving ?? '') && r.selectors.includes('.ap-raster'))
  assert.ok(smal, 'op een smal scherm krijgt het raster een eigen regel')
  assert.match(declaraties(smal.body)['grid-template-columns'], /^(?:minmax\(0,\s*1fr\)|1fr)$/)
  assert.equal(declaraties(regelVoor('.ap-kaart').body)['min-width'], '0', 'een raster-kind mag krimpen')
  const stuk = declaraties(regelVoor('.ap-stuk').body)
  assert.equal(stuk['white-space'], 'pre-wrap', 'regeleinden van het stuk blijven')
  assert.equal(stuk['overflow-wrap'], 'anywhere', 'lange woorden breken')
  assert.match(stuk.overflow, /auto/)
  assert.ok(stuk['max-height'], 'een heel lang stuk scrolt in zijn eigen gebied')
  for (const klas of ['.ap-notitie', '.ap-melding', '.ap-banner']) assert.match(declaraties(regelVoor(klas).body)['overflow-wrap'] ?? '', /anywhere|break-word/, `${klas}: lange servertekst breekt af`)
})

test('markeringen zijn ook zichtbaar zonder kleur: onderstreping, en systeemkleuren bij geforceerde kleuren', () => {
  const anker = declaraties(regelVoor(".ap-markering[data-soort='anker']").body)
  const nieuw = declaraties(regelVoor(".ap-markering[data-soort='nieuw']").body)
  assert.match(anker['text-decoration'] ?? anker['text-decoration-line'] ?? '', /underline/)
  assert.match(nieuw['text-decoration'] ?? nieuw['text-decoration-line'] ?? '', /underline/)
  assert.notEqual(anker['text-decoration'], nieuw['text-decoration'], 'de twee soorten verschillen ook zonder kleur')
  const geforceerd = proefRegels.filter((r) => /forced-colors/.test(r.omgeving ?? ''))
  assert.ok(geforceerd.length > 0, 'er is een blok voor geforceerde kleuren')
  const tekst = geforceerd.map((r) => `${r.selectors.join(',')}{${r.body}}`).join('\n')
  assert.match(tekst, /\.ap-markering[^{]*\{[^}]*(?:Highlight|Mark)/, 'markeringen houden een systeemkleur')
  for (const klas of ['.ap-banner', '.ap-melding', '.ap-label']) assert.match(tekst, new RegExp(`\\${klas}\\b[^{]*\\{[^}]*border[^}]*CanvasText`), `${klas} houdt een rand`)
})

// WCAG 2.x contrast, in beide thema's, voor elke tekstkleur die de stijl kiest.
const naarRgb = (hex) => { const v = hex.replace('#', ''); const k = v.length === 3 ? [...v].map((c) => c + c).join('') : v; return [0, 2, 4].map((i) => parseInt(k.slice(i, i + 2), 16)) }
const helderheid = (rgb) => { const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]) }
const contrast = (a, b) => { const [hoog, laag] = [helderheid(a), helderheid(b)].sort((x, y) => y - x); return (hoog + 0.05) / (laag + 0.05) }
const kleurVan = (tokens, waarde) => {
  let w = waarde
  for (let i = 0; i < 6 && w?.startsWith('var('); i += 1) w = tokens[/var\((--[a-z0-9-]+)/.exec(w)[1]]
  return /^#[0-9a-f]{3,8}$/i.test(w ?? '') ? naarRgb(w) : null
}

test('elke tekstkleur van de stijl haalt 4,5:1 op haar achtergrond, in het lichte en het donkere thema', () => {
  const gecontroleerd = []
  for (const regel of proefRegels.filter((r) => r.omgeving === null)) {
    const d = declaraties(regel.body)
    if (!d.color?.startsWith('var(')) continue
    const eigen = d.background ?? d['background-color']
    for (const [thema, tokens] of [['licht', TOKENS_LICHT], ['donker', TOKENS_DONKER]]) {
      const voor = kleurVan(tokens, d.color)
      assert.ok(voor, `${regel.selectors[0]}: de tekstkleur ${d.color} is geen effen kleur`)
      const achter = eigen ? [kleurVan(tokens, eigen)] : [kleurVan(tokens, 'var(--kaart)'), kleurVan(tokens, 'var(--pagina)')]
      for (const bg of achter) {
        assert.ok(bg, `${regel.selectors[0]}: de achtergrond ${eigen} is geen effen kleur`)
        const verhouding = contrast(voor, bg)
        assert.ok(verhouding >= 4.5, `${regel.selectors[0]} (${thema}): contrast ${verhouding.toFixed(2)} is te laag`)
      }
    }
    gecontroleerd.push(regel.selectors[0])
  }
  for (const verwacht of ['.ap-eyebrow', ".ap-markering[data-soort='anker']", ".ap-markering[data-soort='nieuw']", ".ap-banner[data-soort='aangepast']", ".ap-banner[data-soort='onbevestigd']", ".ap-melding[data-soort='fout']"]) {
    assert.ok(gecontroleerd.includes(verwacht), `${verwacht} heeft een tekstkleur die gecontroleerd is`)
  }
  assert.ok(gecontroleerd.length >= 10, 'de tekstkleuren van de stijl zijn gelezen')
  for (const token of ['--tekst-1', '--tekst-2', '--tekst-3']) {
    for (const [tokens] of [[TOKENS_LICHT], [TOKENS_DONKER]]) for (const bg of ['--kaart', '--pagina']) assert.ok(contrast(kleurVan(tokens, `var(${token})`), kleurVan(tokens, `var(${bg})`)) >= 4.5, `${token} op ${bg}`)
  }
})

// ---------------------------------------------------------------- de kleine modelkost (SSR + DOM)

const MET_KOST = { kost_usd: 0.00041, model: 'anthropic/claude-sonnet-5', tokens_in: 412, tokens_uit: 96 }

test('leesKost laat alleen cijfers zien die de server echt gaf en maakt er gewone taal van', () => {
  assert.equal(typeof pagina.leesKost, 'function', 'leesKost ontbreekt in src/pages/agent-proef.jsx')
  const kost = pagina.leesKost
  assert.deepEqual(kost(MET_KOST), { kost: '$0,0004', model: 'anthropic/claude-sonnet-5', tokensIn: 412, tokensUit: 96 })
  assert.equal(kost({ kost_usd: 0.25 }).kost, '$0,2500')
  assert.equal(kost({ kost_usd: 0 }).kost, '$0,0000')
  assert.equal(kost({ kost_usd: 0.00002 }).kost, 'minder dan $0,0001')
  assert.deepEqual(kost({ kost_usd: 0.1 }), { kost: '$0,1000', model: null, tokensIn: null, tokensUit: null }, 'wat ontbreekt blijft null en wordt niet verzonnen')
  for (const rommel of [undefined, null, 'x', 5, [], {}, { kost_usd: null }, { kost_usd: '0.1' }, { kost_usd: Number.NaN }, { kost_usd: Infinity }, { kost_usd: -0.5 }, { kost_usd: true }, { kost_usd: {} }, { kost_usd: [0.1] }]) {
    assert.equal(kost(rommel), null, `geen kost bij ${JSON.stringify(rommel)}`)
  }
  for (const model of ['<script>alert(1)</script>', 'x'.repeat(81), '', 5, { a: 1 }, 'met spatie', 'regel\nbreuk']) assert.equal(kost({ kost_usd: 0.1, model }).model, null, `model ${JSON.stringify(model)} wordt niet getoond`)
  for (const tokens of [-1, 1.5, '12', null, Number.MAX_SAFE_INTEGER + 2, {}]) assert.equal(kost({ kost_usd: 0.1, tokens_in: tokens, tokens_uit: tokens }).tokensIn, null, `tokens ${JSON.stringify(tokens)}`)
})

test('na een aanvraag staat de echte, kleine modelkost bij de uitleg, en zonder cijfers staat er niets verzonnen', () => {
  const met = zichtbaar(weergave({ status: metOpdracht({ ...TOEGEPAST, beoordeling: null, ...MET_KOST }) }))
  assert.match(met, /Elke aanvraag gebruikt het echte model en kost een klein bedrag\./)
  assert.match(met, /Laatste aanvraag: \$0,0004 \(anthropic\/claude-sonnet-5, 412 tokens in, 96 uit\)\./)
  assert.match(zichtbaar(weergave({ status: metOpdracht({ ...TOEGEPAST, beoordeling: null, kost_usd: 0.00002 }) })), /Laatste aanvraag: minder dan \$0,0001\./)
  assert.match(zichtbaar(weergave({ status: metOpdracht({ ...TOEGEPAST, beoordeling: null, kost_usd: 0.2, model: '<b>x</b>' }) })), /Laatste aanvraag: \$0,2000\./)
  for (const status of [STATUS, metOpdracht({ ...TOEGEPAST, beoordeling: null }), metOpdracht(BEZIG), metOpdracht({ ...TOEGEPAST, beoordeling: null, kost_usd: 'veel' })]) {
    assert.doesNotMatch(zichtbaar(weergave({ status })), /Laatste aanvraag|\$/)
  }
})

test('de modelkost van de laatste aanvraag komt van de server en verdwijnt na het terugzetten', async () => {
  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    assert.doesNotMatch(ui.tekst(), /Laatste aanvraag/)
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    assert.doesNotMatch(ui.tekst(), /Laatste aanvraag/, 'zolang de agent werkt is er nog niets te tellen')
    server.rondAf(MET_KOST)
    await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel van de agent')
    assert.match(ui.tekst(), /Laatste aanvraag: \$0,0004 \(anthropic\/claude-sonnet-5, 412 tokens in, 96 uit\)\./)
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'de teruggezette proef')
    assert.doesNotMatch(ui.tekst(), /Laatste aanvraag/)
  } finally { await ui.sluit() }
})

// ---------------------------------------------------------------- wat de echte proefserver weigert

test('een geweigerd verzoek (verkeerde host of origin) wordt uitgelegd als een lokale-preview-probleem', () => {
  const html = zichtbaar(weergave({ fase: 'fout', status: null, leesFout: 'geweigerd' }))
  assert.match(html, /De proefserver weigert dit verzoek\./)
  assert.match(html, /lokale preview op je eigen Mac/)
  assert.doesNotMatch(html, /geweigerd/)
})

test('terugzetten wordt door de proefserver geweigerd zolang de agent werkt, en dat staat er in gewone taal', async () => {
  const ok = zichtbaar(weergave({ melding: { soort: 'fout', code: 'bezig' } }))
  assert.match(ok, /De agent is nog bezig, dus opnieuw beginnen kan nu niet\. Probeer het opnieuw zodra de agent klaar is\./)
  assert.doesNotMatch(ok, /Stand verversen laat zien/, 'bij deze weigering is de algemene uitleg niet nodig')
  assert.match(zichtbaar(weergave({ melding: { soort: 'fout', code: 'iets_anders' } })), /Opnieuw beginnen is niet gelukt\. Probeer het opnieuw; Stand verversen laat zien wat de stand nu is\./)

  const server = maakServer()
  const ui = await startKlaar(server)
  try {
    await ui.klik(ui.knop('Laat agent nakijken'))
    await ui.wacht(() => /In de wachtrij/.test(ui.tekst()), 'de opdracht in de wachtrij')
    server.haken['POST /reset'] = () => json({ ...server.statusNu(), fout: 'bezig' }, 409) // zoals de echte proefserver
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => ui.alarmen().some((a) => /De agent is nog bezig, dus opnieuw beginnen kan nu niet/.test(a)), 'de uitleg bij de weigering')
    assert.doesNotMatch(ui.alarmen().join(' '), /409|"fout"|http_/)
    assert.match(ui.tekst(), /In de wachtrij/, 'de lopende opdracht blijft zichtbaar en gevolgd')
    server.rondAf()
    await ui.wacht(() => ui.knop('Goedkeuren'), 'het voorstel van de agent')
    delete server.haken['POST /reset']
    await ui.klik(ui.knop('Opnieuw beginnen'))
    await ui.wacht(() => ui.knop('Laat agent nakijken'), 'de teruggezette proef')
    assert.deepEqual(ui.alarmen(), [])
  } finally { await ui.sluit() }
})

test('de melding bij een te lange wachttijd zegt wanneer opnieuw beginnen weer kan', () => {
  assert.match(zichtbaar(weergave({ verlopen: true })), /Opnieuw beginnen om alles terug te zetten zodra de agent klaar is\./)
})
