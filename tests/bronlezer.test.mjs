import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite
let data
let controle
let bronPagina
let bronnenPagina

before(async () => {
  vite = await createServer({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  data = await vite.ssrLoadModule('/src/lib/data.js')
  controle = await vite.ssrLoadModule('/src/lib/bron-check.js')
  bronPagina = await vite.ssrLoadModule('/src/pages/bron.jsx')
  bronnenPagina = await vite.ssrLoadModule('/src/pages/bronnen.jsx')
})

after(async () => {
  await vite?.close()
})

test('een geblokkeerde bron wordt niet als leesbare tekst teruggegeven', async (t) => {
  // Reproduceert het echte antwoord van de lezer: de functie zelf antwoordt
  // 200, terwijl de opgevraagde site 403 en een firewallpagina geeft.
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    status: 403,
    titel: 'Access Denied',
    tekst: 'Your request was blocked by a Web Application Firewall.',
    soort: 'html',
  }), { status: 200, headers: { 'content-type': 'application/json' } }))

  const resultaat = await data.leesBron('https://www.spaargids.be/forum/voorbeeld')
  assert.match(String(resultaat.fout ?? ''), /blokkeert|toegang|geblokkeerd/i)
  assert.equal(resultaat.tekst, undefined, 'een foutpagina mag niet als brontekst worden opgeslagen')
})

test('een beveiligingscontrole met HTTP 200 is geen artikel', async (t) => {
  // Bestaande cache van bron 273 is letterlijk "Challenge Validation".
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    status: 200,
    titel: 'Challenge Validation',
    tekst: 'Challenge Validation',
    soort: 'html',
  }), { status: 200, headers: { 'content-type': 'application/json' } }))

  const resultaat = await data.leesBron('https://www.msci.com/indexes/index/990100')
  assert.match(String(resultaat.fout ?? ''), /beveiliging|blokkeert|toegang/i)
  assert.equal(resultaat.tekst, undefined)
})

test('een eerder opgeslagen firewallpagina krijgt een foutstatus', () => {
  assert.equal(typeof controle.beoordeelBronCache, 'function', 'ook opgeslagen broninhoud moet beoordeeld worden')
  const bron = {
    url: 'https://www.spaargids.be/forum/sparen-of-beleggen-t30119.html',
    pagina_titel: 'Access Denied',
    pagina_tekst: "Your request was blocked by DPG Media's Web Application Firewall.",
  }
  const resultaat = controle.beoordeelBronCache(bron)
  assert.equal(resultaat.type, 'geblokkeerd')
  assert.ok(resultaat.uitleg)
})

test('een PDF-bron wordt als PDF herkend en niet als lege webpagina', () => {
  const bron = { url: 'https://www.fsma.be/sites/default/files/voorbeeld.PDF?download=1', pagina_tekst: '' }
  assert.equal(controle.beoordeelBronCache(bron).type, 'pdf')
})

test('een opgeslagen onderhoudspagina wordt niet als inhoud getoond', () => {
  const bron = {
    pagina_titel: 'Bank BNP Paribas | The bank for a changing world',
    pagina_tekst: 'Oops! The website is now unvailable. We are currently doing maintenance work.',
  }
  const resultaat = controle.beoordeelBronCache(bron)
  assert.equal(resultaat.type, 'onbeschikbaar')
  assert.match(resultaat.uitleg, /onderhoud|tijdelijk/i)
})

test('een lege succesvolle respons geeft een duidelijke fout terug', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    status: 200,
    titel: 'Artikel',
    tekst: '   ',
    soort: 'html',
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const resultaat = await data.leesBron('https://voorbeeld.example/artikel')
  assert.match(String(resultaat.fout ?? ''), /geen leesbare tekst/i)
  assert.equal(resultaat.tekst, undefined)
})

test('een bronlink accepteert alleen een normaal http- of https-adres', () => {
  assert.equal(typeof controle.veiligeBronUrl, 'function', 'bronlinks moeten worden gevalideerd')
  assert.equal(controle.veiligeBronUrl('javascript:alert(1)'), null)
  const origineel = 'https://www.fsma.be/nl/consumenten?taal=nl'
  assert.equal(controle.veiligeBronUrl(origineel), origineel)
})

test('de lezer toont bij een geblokkeerde cache de originele link en geen firewalltekst', () => {
  assert.equal(typeof bronPagina.BronInhoud, 'function', 'de weergave moet ook foutstaten aankunnen')
  const bron = {
    url: 'https://www.spaargids.be/forum/sparen-of-beleggen-t30119.html',
    pagina_titel: 'Access Denied',
    pagina_tekst: "Your request was blocked by DPG Media's Web Application Firewall.",
  }
  const html = renderToStaticMarkup(React.createElement(bronPagina.BronInhoud, { bron }))
  assert.match(html, /beveiligingscontrole/i)
  assert.match(html, /eerder opgeslagen/i)
  assert.match(html, /href="https:\/\/www\.spaargids\.be\/forum\/sparen-of-beleggen-t30119\.html"/)
  assert.doesNotMatch(html, /Web Application Firewall/)
})

test('een opnieuw opgehaalde tekst is duidelijk lokaal en niet stilzwijgend gedeeld', () => {
  const bron = { url: 'https://www.fsma.be/nl/nieuws', pagina_tekst: 'Oude tekst', opgehaald_op: '2026-11-01T10:00:00Z' }
  const html = renderToStaticMarkup(React.createElement(bronPagina.BronInhoud, { bron, opgehaald: { tekst: 'Nieuwe tekst' } }))
  assert.match(html, /alleen in dit venster/i)
  assert.match(html, /niet.*opgeslagen/i)
  assert.match(html, /Nieuwe tekst/)
})

test('oude cache wordt zichtbaar als mogelijk verouderde opgeslagen tekst', () => {
  const bron = { url: 'https://www.fsma.be/nl/nieuws', pagina_tekst: 'Oude tekst', opgehaald_op: '2026-11-01T10:00:00Z' }
  const html = renderToStaticMarkup(React.createElement(bronPagina.BronInhoud, { bron }))
  assert.match(html, /eerder opgeslagen/i)
  assert.match(html, /verouderd/i)
})

test('een doorverwijzing naar een ander adres wordt zichtbaar gemaakt', () => {
  assert.equal(typeof controle.doorverwezenAdres, 'function')
  const oorspronkelijk = 'https://voorbeeld.example/oud'
  const eindadres = 'https://voorbeeld.example/nieuw'
  assert.equal(controle.doorverwezenAdres(oorspronkelijk, eindadres), eindadres)
  assert.equal(controle.doorverwezenAdres(oorspronkelijk, oorspronkelijk), null)
  assert.equal(controle.doorverwezenAdres(oorspronkelijk, 'javascript:alert(1)'), null)
})

test('de lijst telt alleen getoonde bronnen en geeft aan hoeveel nog verborgen zijn', () => {
  assert.equal(typeof controle.zichtbareBronnen, 'function')
  const bronnen = Array.from({ length: 201 }, (_, i) => ({ id: i + 1 }))
  const pagina = controle.zichtbareBronnen(bronnen, 200)
  assert.equal(pagina.items.length, 200)
  assert.equal(pagina.totaal, 201)
  assert.equal(pagina.resterend, 1)
})

test('de lijst benoemt een oude cache als eerder opgeslagen', () => {
  const bron = { id: 1, titel: 'Bron', url: 'https://www.fsma.be/nl/', status: 'ongelezen', opgehaald_op: '2026-11-01T10:00:00Z' }
  const html = renderToStaticMarkup(React.createElement(bronnenPagina.BronRij, { bron, naar: () => {} }))
  assert.match(html, /eerder opgeslagen/i)
})

test('elke bron heeft afzonderlijke acties voor de lezer en het origineel', () => {
  assert.equal(typeof bronnenPagina.BronRij, 'function')
  const bron = { id: 139, titel: 'FSMA rapport', url: 'https://www.fsma.be/rapport.pdf', status: 'ongelezen' }
  const html = renderToStaticMarkup(React.createElement(bronnenPagina.BronRij, { bron, naar: () => {} }))
  assert.match(html, /<button\b/)
  assert.match(html, /<a\b[^>]*href="https:\/\/www\.fsma\.be\/rapport\.pdf"/)
  assert.doesNotMatch(html, /<button\b[^>]*>[\s\S]*?<a\b[\s\S]*?<\/button>/, 'geen link binnen een knop')
})
