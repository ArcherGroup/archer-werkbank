import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/* Tests voor de agentopdracht bij een notitie (src/components/agent-comment.jsx).
   Geen netwerk, geen Supabase, geen echte agent: de component krijgt alles via props
   en meldt alleen via callbacks wat de gebruiker expliciet deed. */

const h = React.createElement
let vite
let AgentComment

before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ AgentComment } = await vite.ssrLoadModule('/src/components/agent-comment.jsx'))
})
after(async () => { await vite?.close() })

const BASIS = { notitie: { id: 7 }, documentId: 75, beschikbaar: true, ingelogd: true, opdracht: null, opStart() {}, opBeoordeel() {} }
const render = (props = {}) => renderToStaticMarkup(h(AgentComment, { ...BASIS, ...props }))

/* Knoppen en zichtbare tekst uit de markup halen, zonder snapshots. */
function knoppen(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, inhoud]) => ({
    tekst: inhoud.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    uit: /(?:^|\s)disabled(?:=""|\s|$)/.test(attrs),
    attrs,
  }))
}
const knop = (html, tekst) => knoppen(html).find((k) => k.tekst === tekst)
// Eerst echte tags weghalen, daarna pas entiteiten terugzetten: ontsnapte tekst blijft zo tekst.
const zichtbaar = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const START = 'Laat agent nakijken'
const NEPRESULTATEN = /In de wachtrij|\bBezig\b|\bKlaar\b|\bMislukt\b|Geannuleerd|Voorgestelde tekst|Oorspronkelijke tekst|Antwoord van de agent/

// ---------------------------------------------------------------- starten

test('AgentComment toont de startknop met het afgesproken label', () => {
  assert.equal(typeof AgentComment, 'function')
  const html = render()
  assert.ok(knop(html, START), 'knop "Laat agent nakijken" ontbreekt')
  assert.match(zichtbaar(html), /Gedeelde agent/)
})

test('de startknop staat aan als alles er is en toont dan geen nepresultaat', () => {
  const html = render()
  assert.equal(knop(html, START).uit, false)
  assert.match(html, /data-status="geen"/)
  assert.doesNotMatch(zichtbaar(html), NEPRESULTATEN)
  assert.doesNotMatch(zichtbaar(html), /niet actief|niet ingelogd/i)
})

const GEBLOKKEERD = [
  ['de gedeelde agent is niet geactiveerd', { beschikbaar: false }, /gedeelde agent is nog niet actief/i],
  ['de gebruiker is niet ingelogd', { ingelogd: false }, /niet ingelogd/i],
  ['de notitie ontbreekt', { notitie: null }, /notitie is nog niet bewaard/i],
  ['de notitie heeft geen id', { notitie: {} }, /notitie is nog niet bewaard/i],
  ['de notitie wacht nog op bewaren (tijdelijk id)', { notitie: { id: 'tmp-1700000000', wachtend: true } }, /notitie is nog niet bewaard/i],
  ['de notitie heeft alleen een tijdelijk id', { notitie: { id: 'tmp-1700000000' } }, /notitie is nog niet bewaard/i],
  ['het stuk ontbreekt', { documentId: undefined }, /niet aan een stuk gekoppeld/i],
  ['het stuk is een lege waarde', { documentId: '' }, /niet aan een stuk gekoppeld/i],
  ['er is geen startfunctie aangesloten', { opStart: undefined }, /starten is hier nog niet aangesloten/i],
]
for (const [naam, props, uitleg] of GEBLOKKEERD) {
  test(`de startknop staat uit met een eerlijke uitleg als ${naam}`, () => {
    const html = render(props)
    assert.equal(knop(html, START)?.uit, true, 'de knop moet zichtbaar uit staan')
    assert.match(zichtbaar(html), uitleg)
    assert.match(html, /data-status="geen"/)
    assert.doesNotMatch(zichtbaar(html), NEPRESULTATEN, 'zonder echte opdracht mag niets op een resultaat lijken')
  })
}

test('als er meerdere dingen ontbreken staan ze allemaal in de uitleg', () => {
  const tekst = zichtbaar(render({ beschikbaar: false, ingelogd: false, documentId: null }))
  assert.match(tekst, /gedeelde agent is nog niet actief/i)
  assert.match(tekst, /niet ingelogd/i)
  assert.match(tekst, /niet aan een stuk gekoppeld/i)
})

test('een uitgeschakelde start is gekoppeld aan zijn uitleg voor schermlezers', () => {
  const html = render({ beschikbaar: false })
  const id = /<button[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1]
  assert.ok(id, 'aria-describedby ontbreekt op de startknop')
  assert.match(html, new RegExp(`id="${id}"[^>]*>(?:<[^>]+>)*[^<]*gedeelde agent is nog niet actief`, 'i'))
})

// ---------------------------------------------------------------- statussen

const STATUSSEN = [
  ['wachtrij', 'In de wachtrij', /nog niet begonnen/i],
  ['bezig', 'Bezig', /werkt aan de opdracht/i],
  ['klaar', 'Klaar', /zonder concreet voorstel/i], // een kale "klaar" bevat niets om te beoordelen
  ['mislukt', 'Mislukt', /kon de opdracht niet afronden/i],
  ['geannuleerd', 'Geannuleerd', /opdracht is geannuleerd/i],
]

test('elke status is herkenbaar aan een eigen label, een icoon en data-status', () => {
  const labels = STATUSSEN.map(([, label]) => label)
  for (const [status, label, uitleg] of STATUSSEN) {
    const html = render({ opdracht: { id: 1, status } })
    assert.match(html, new RegExp(`data-status="${status}"`))
    assert.match(html, /role="status"/, `${status}: statusregel voor schermlezers ontbreekt`)
    assert.match(html, /<svg[^>]*aria-hidden="true"/, `${status}: status mag niet alleen aan kleur herkenbaar zijn`)
    const tekst = zichtbaar(html)
    assert.match(tekst, new RegExp(`\\b${label}\\b`))
    assert.match(tekst, uitleg)
    for (const ander of labels.filter((l) => l !== label)) assert.doesNotMatch(tekst, new RegExp(`\\b${ander}\\b`), `${status} toont ook "${ander}"`)
  }
})

test('na een aanpassing kan de ouder herstart vervangen door een duidelijke herstelstap', () => {
  const opdracht = { id: 1, status: 'klaar', voorstel_id: 2, soort: 'wijziging', oorspronkelijk: 'oud', voorstel: 'nieuw', uitleg: 'Beter.', beoordeling: { besluit: 'toegepast' } }
  const html = render({ opdracht, herstartUitleg: 'Zet het voorbeeld eerst terug met Opnieuw beginnen.' })
  assert.equal(knop(html, 'Opnieuw laten nakijken'), undefined)
  assert.match(zichtbaar(html), /Zet het voorbeeld eerst terug met Opnieuw beginnen/)
})

test('tijdens wachtrij en bezig is er geen tweede start; na mislukt of geannuleerd kan je bewust opnieuw', () => {
  for (const status of ['wachtrij', 'bezig']) {
    const html = render({ opdracht: { id: 1, status } })
    assert.equal(knop(html, START), undefined, `${status}: geen tweede start`)
    assert.equal(knop(html, 'Opnieuw laten nakijken'), undefined, `${status}: geen herstart`)
  }
  for (const status of ['mislukt', 'geannuleerd']) {
    assert.equal(knop(render({ opdracht: { id: 1, status } }), 'Opnieuw laten nakijken')?.uit, false)
    const zonderLogin = render({ opdracht: { id: 1, status }, ingelogd: false })
    assert.equal(knop(zonderLogin, 'Opnieuw laten nakijken')?.uit, true)
    assert.match(zichtbaar(zonderLogin), /niet ingelogd/i)
  }
})

test('een mislukte opdracht legt de melding uit in gewone taal en toont onbekende meldingen als platte tekst', () => {
  assert.match(zichtbaar(render({ opdracht: { id: 1, status: 'mislukt', fout: 'anker_niet_uniek' } })), /meer dan één keer/i)
  assert.match(zichtbaar(render({ opdracht: { id: 1, status: 'mislukt', fout: 'timeout' } })), /te lang/i)
  const html = render({ opdracht: { id: 1, status: 'mislukt', fout: 'Misgelopen <img src=x onerror=alert(1)>' } })
  assert.match(zichtbaar(html), /Misgelopen <img src=x onerror=alert\(1\)>/)
  assert.doesNotMatch(html, /<img/)
  assert.doesNotMatch(zichtbaar(render({ opdracht: { id: 1, status: 'mislukt' } })), /Melding:/, 'geen verzonnen melding')
})

test('een statuswijziging toont het tijdstip alleen als het echt geldig is', () => {
  const geldig = render({ opdracht: { id: 1, status: 'bezig', bijgewerkt: '2026-11-12T10:30:00.000Z' } })
  assert.match(geldig, /<time\b[^>]*\sdatetime="2026-11-12T10:30:00.000Z"/i)
  assert.match(zichtbaar(geldig), /Bijgewerkt/)
  assert.doesNotMatch(render({ opdracht: { id: 1, status: 'bezig', bijgewerkt: 'gisteren' } }), /<time/)
  assert.doesNotMatch(render({ opdracht: { id: 1, status: 'bezig' } }), /<time/)
})

test('de velden van werkbank.agent_opdrachten werken ook zonder hernoemen: fout_code, klaar_op en created_at', () => {
  assert.match(zichtbaar(render({ opdracht: { id: 1, status: 'mislukt', fout_code: 'anker_niet_uniek' } })), /meer dan één keer/i)
  // `fout` wint van `fout_code`, en een lege `fout` laat `fout_code` door
  assert.match(zichtbaar(render({ opdracht: { id: 1, status: 'mislukt', fout: 'timeout', fout_code: 'budget_op' } })), /te lang/i)
  assert.match(zichtbaar(render({ opdracht: { id: 1, status: 'mislukt', fout: '', fout_code: 'budget_op' } })), /budget/i)

  const klaarOp = render({ opdracht: { id: 1, status: 'mislukt', klaar_op: '2026-11-12T10:30:00.123456+00:00' } })
  assert.match(klaarOp, /<time\b[^>]*\sdatetime="2026-11-12T10:30:00.123Z"/i)
  assert.match(zichtbaar(klaarOp), /Afgerond/)
  const aangevraagd = render({ opdracht: { id: 1, status: 'wachtrij', created_at: '2026-11-12T10:28:00.000Z' } })
  assert.match(zichtbaar(aangevraagd), /Aangevraagd/)

  const alle = { bijgewerkt: '2026-11-12T10:30:00.000Z', klaar_op: '2026-11-12T11:30:00.000Z', created_at: '2026-11-12T09:30:00.000Z' }
  const wint = zichtbaar(render({ opdracht: { id: 1, status: 'bezig', ...alle } }))
  assert.match(wint, /Bijgewerkt/)
  assert.doesNotMatch(wint, /Afgerond|Aangevraagd/, 'er staat één tijdstip, niet drie')
  const terugval = zichtbaar(render({ opdracht: { id: 1, status: 'bezig', ...alle, bijgewerkt: 'gisteren', klaar_op: null } }))
  assert.match(terugval, /Aangevraagd/, 'een ongeldig tijdstip valt terug op het volgende geldige')
})

test('een onbekende status wordt eerlijk onbekend genoemd en geeft geen knoppen', () => {
  const ongeldig = ['queued', '', undefined, null, 42, 'KLAAR', 'constructor', '__proto__', 'toString', 'hasOwnProperty', {}]
  for (const status of ongeldig) {
    const html = render({ opdracht: { id: 1, status } })
    assert.match(html, /data-status="onbekend"/, `status ${String(status)} moet onbekend zijn`)
    assert.match(zichtbaar(html), /Onbekende status/)
    assert.match(zichtbaar(html), /niet herkenbaar/i)
    assert.equal(knop(html, START), undefined)
    assert.equal(knop(html, 'Goedkeuren'), undefined)
  }
  for (const opdracht of ['bezig', true, 42, ['klaar']]) {
    assert.match(render({ opdracht }), /data-status="onbekend"/, `opdracht ${JSON.stringify(opdracht)} is geen geldige opdracht`)
  }
  const html = render({ opdracht: { id: 1, status: '<b onmouseover=alert(1)>x</b>' } })
  assert.doesNotMatch(html, /<b onmouseover/)
})

test('een lege opdrachtwaarde betekent: er is geen opdracht', () => {
  for (const opdracht of [null, undefined, false, 0, '']) {
    assert.match(render({ opdracht }), /data-status="geen"/)
  }
})

test('een voorstel verschijnt nooit buiten de status klaar', () => {
  const inhoud = { id: 1, type: 'wijziging', oorspronkelijk: 'Oude zin.', voorstel: 'Nieuwe zin.', uitleg: 'Kort.' }
  for (const status of ['wachtrij', 'bezig', 'mislukt', 'geannuleerd']) {
    const html = render({ opdracht: { ...inhoud, status } })
    assert.doesNotMatch(zichtbaar(html), /Nieuwe zin|Oude zin|Voorgestelde tekst/, `${status} toont een voorstel`)
    assert.equal(knop(html, 'Goedkeuren'), undefined)
    assert.equal(knop(html, 'Afwijzen'), undefined)
  }
})

// ---------------------------------------------------------------- wijzigingsvoorstel

const WIJZIGING = {
  id: 41,
  status: 'klaar',
  type: 'wijziging',
  oorspronkelijk: "De TOB is 0,12% voor accumulerende ETF's.",
  voorstel: "De beurstaks (TOB) bedraagt 0,12% voor accumulerende ETF's.",
  uitleg: 'Maakt duidelijk welke taks bedoeld wordt.',
  bronnen: [],
  bronstatus: 'niet_opgezocht',
  document_versie: 2,
}

test('een klaar wijzigingsvoorstel toont oorspronkelijke en voorgestelde tekst naast de uitleg van het model', () => {
  const html = render({ opdracht: WIJZIGING })
  const tekst = zichtbaar(html)
  assert.match(html, /data-status="klaar"/)
  assert.match(html, /data-soort="wijziging"/)
  assert.match(tekst, /Wijzigingsvoorstel van de agent/)
  assert.match(tekst, /Oorspronkelijke tekst/)
  assert.match(tekst, /De TOB is 0,12% voor accumulerende ETF's\./)
  assert.match(tekst, /Voorgestelde tekst/)
  assert.match(tekst, /De beurstaks \(TOB\) bedraagt 0,12% voor accumulerende ETF's\./)
  assert.match(tekst, /Uitleg van het model/)
  assert.match(tekst, /niet gevalideerd/i)
  assert.match(tekst, /Maakt duidelijk welke taks bedoeld wordt\./)
  assert.match(tekst, /Gebaseerd op versie 2 van het stuk/)
  assert.match(tekst, /Nog niet beoordeeld/)
  assert.match(tekst, /niet automatisch toegepast/i)
})

test('de woorden uit de opdracht (reden, voorgesteld, modelduiding) worden ook herkend', () => {
  const tekst = zichtbaar(render({ opdracht: { id: 3, status: 'klaar', reden: 'Eenduidige term.', oorspronkelijk: 'Oud.', voorgesteld: 'Nieuw.', modelduiding: 'Het model leest dit als een verschrijving.' } }))
  assert.match(tekst, /Reden volgens de agent/)
  assert.match(tekst, /Eenduidige term\./)
  assert.match(tekst, /Voorgestelde tekst/)
  assert.match(tekst, /Nieuw\./)
  assert.match(tekst, /Het model leest dit als een verschrijving\./)
  assert.match(tekst, /niet gevalideerd/i)
})

test('de soort mag ontbreken of voorstel heten zolang er een echte tekstwijziging staat', () => {
  const { type, ...zonderType } = WIJZIGING
  for (const opdracht of [zonderType, { ...WIJZIGING, type: 'voorstel' }, { ...WIJZIGING, type: undefined, soort: 'wijziging' }]) {
    assert.match(render({ opdracht }), /data-soort="wijziging"/)
  }
})

test('bronnen verschijnen alleen als ze echt in de opdracht staan', () => {
  const zonder = zichtbaar(render({ opdracht: { ...WIJZIGING, bronnen: [], bronstatus: undefined } }))
  assert.doesNotMatch(zonder, /bron/i, 'zonder bronnen geen bronnensectie en geen bewering over bronnen')
  assert.doesNotMatch(render({ opdracht: { ...WIJZIGING, bronnen: undefined, bronstatus: undefined } }), /<a\b/)
  // De backend zegt het zelf: er is niets opgezocht. Dat melden we eerlijk, zonder verzonnen bron.
  const nietOpgezocht = render({ opdracht: WIJZIGING })
  assert.match(zichtbaar(nietOpgezocht), /De agent heeft geen bronnen opgezocht/)
  assert.doesNotMatch(nietOpgezocht, /<a\b/)
  const met = zichtbaar(render({ opdracht: { ...WIJZIGING, bronstatus: undefined, bronnen: [{ titel: 'FOD Financiën', url: 'https://financien.belgium.be/tob' }] } }))
  assert.match(met, /Bronnen volgens de agent/)
  assert.match(met, /FOD Financiën/)
})

test('het voorstel wordt als platte tekst getoond: geen HTML, geen markdown, geen links', () => {
  const gevaarlijk = '<script>alert(1)</script> <img src=x onerror=alert(1)> <b>vet</b> **ook vet** [klik](javascript:alert(1)) &amp; &lt;i&gt;'
  const html = render({ opdracht: { ...WIJZIGING, bronstatus: undefined, oorspronkelijk: gevaarlijk, voorstel: `${gevaarlijk}!`, uitleg: gevaarlijk } })
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /<img/i)
  assert.doesNotMatch(html, /<b>|<strong>|<i>|<em>/i)
  assert.doesNotMatch(html, /<a\b/i)
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+=/i, 'geen enkel element mag een gebeurtenisattribuut dragen')
  assert.doesNotMatch(html, /dangerouslySetInnerHTML/)
  const tekst = zichtbaar(html)
  assert.ok(tekst.includes(gevaarlijk), 'de tekst moet letterlijk zichtbaar blijven')
  assert.ok(tekst.includes('**ook vet**'), 'markdown wordt niet uitgewerkt')
  assert.ok(tekst.includes('&amp;') && tekst.includes('&lt;i&gt;'), 'entiteiten worden niet gedecodeerd')
})

test('regeleinden blijven bewaard zodat je de tekst echt kan vergelijken', () => {
  const html = render({ opdracht: { ...WIJZIGING, oorspronkelijk: 'Regel een\nRegel twee', voorstel: 'Regel een\nRegel 2' } })
  assert.match(html, /Regel een\nRegel twee/)
})

test('verborgen en richtingsveranderende tekens worden zichtbaar gemaakt en gemeld', () => {
  const html = render({ opdracht: { ...WIJZIGING, oorspronkelijk: 'Bedrag: 100', voorstel: 'Bedrag: 100\u200B', uitleg: 'abc\u202Edef\u{E0041}' } })
  assert.doesNotMatch(html, /[\u200B\u202E\u{E0041}]/u, 'de ruwe tekens mogen niet in de uitvoer zitten')
  const tekst = zichtbaar(html)
  assert.match(tekst, /Bedrag: 100‹U\+200B›/)
  assert.match(tekst, /abc‹U\+202E›def‹U\+E0041›/)
  assert.match(tekst, /verborgen tekens/i)
  assert.doesNotMatch(zichtbaar(render({ opdracht: WIJZIGING })), /verborgen tekens/i)
})

// ---------------------------------------------------------------- antwoord zonder tekstwijziging

const ANTWOORD = { id: 42, status: 'klaar', type: 'antwoord', uitleg: 'Ik kan dit zonder bron niet bevestigen.', bronnen: [], bronstatus: 'niet_opgezocht' }
const BEOORDEELKNOPPEN = ['Goedkeuren', 'Afwijzen']

test('een antwoord zonder tekstwijziging wordt eerlijk als nog te controleren antwoord getoond', () => {
  const html = render({ opdracht: ANTWOORD })
  const tekst = zichtbaar(html)
  assert.match(html, /data-status="klaar"/)
  assert.match(html, /data-soort="antwoord"/)
  assert.match(tekst, /Antwoord van de agent/)
  assert.match(tekst, /Nog te controleren/)
  assert.match(tekst, /Ik kan dit zonder bron niet bevestigen\./)
  assert.match(tekst, /geen concrete tekstwijziging/i)
  assert.match(tekst, /niet gecontroleerd/i)
  assert.match(tekst, /klaar met een antwoord/i)
  assert.doesNotMatch(tekst, /Wijzigingsvoorstel|Nog niet beoordeeld/, 'een antwoord is geen voorstel')
})

test('bij een antwoord staan er geen voorstel, geen vergelijking en geen Goedkeuren of Afwijzen', () => {
  // Ook als de backend per ongeluk tekstvelden meestuurt: het type antwoord wint.
  const html = render({ opdracht: { ...ANTWOORD, oorspronkelijk: 'Oude zin.', voorstel: 'Nieuwe zin.' } })
  const tekst = zichtbaar(html)
  assert.doesNotMatch(tekst, /Oude zin|Nieuwe zin|Oorspronkelijke tekst|Voorgestelde tekst/)
  for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam), undefined, `${naam} hoort niet bij een antwoord`)
  assert.doesNotMatch(tekst, /goedkeuren|afwijzen|goedgekeurd|afgewezen/i, 'ook geen tekst die een beoordeling suggereert')
})

test('een antwoord zonder uitleg blijft eerlijk leeg in plaats van iets te verzinnen', () => {
  const tekst = zichtbaar(render({ opdracht: { id: 5, status: 'klaar', type: 'antwoord' } }))
  assert.match(tekst, /Antwoord van de agent/)
  assert.match(tekst, /De agent gaf geen uitleg mee/)
})

test('een antwoord meldt dat er niets is opgezocht en toont bronnen alleen als ze er zijn', () => {
  assert.match(zichtbaar(render({ opdracht: ANTWOORD })), /De agent heeft geen bronnen opgezocht/)
  const zonder = zichtbaar(render({ opdracht: { ...ANTWOORD, uitleg: 'Kan ik niet bevestigen.', bronstatus: undefined } }))
  assert.doesNotMatch(zonder, /bron/i)
})

test('een antwoord is ook platte tekst', () => {
  const html = render({ opdracht: { ...ANTWOORD, uitleg: '<script>alert(1)</script><img src=x onerror=alert(1)>\n**vet**' } })
  assert.doesNotMatch(html, /<script|<img|<strong>/i)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(zichtbaar(html), /\*\*vet\*\*/)
})

test('een resultaat zonder concreet voorstel zegt dat eerlijk en biedt niets om te beoordelen', () => {
  const gevallen = [
    ['zonder soort en zonder tekst', { id: 6, status: 'klaar' }, /geen concreet voorstel/i],
    ['een onbekend type', { id: 6, status: 'klaar', type: 'iets-anders', uitleg: 'Uitleg.' }, /type "iets-anders"/],
    ['een wijziging zonder voorgestelde tekst', { ...WIJZIGING, voorstel: undefined }, /ontbreekt of is niet gewijzigd/i],
    ['een wijziging zonder oorspronkelijke tekst', { ...WIJZIGING, oorspronkelijk: undefined }, /ontbreekt of is niet gewijzigd/i],
    ['een wijziging met lege teksten', { ...WIJZIGING, oorspronkelijk: '  ', voorstel: '' }, /ontbreekt of is niet gewijzigd/i],
    ['een wijziging die gelijk is aan het origineel', { ...WIJZIGING, voorstel: WIJZIGING.oorspronkelijk }, /ontbreekt of is niet gewijzigd/i],
    ['een wijziging die alleen in witruimte verschilt', { ...WIJZIGING, oorspronkelijk: 'Zin.\r\n', voorstel: 'Zin.' }, /ontbreekt of is niet gewijzigd/i],
  ]
  for (const [naam, opdracht, melding] of gevallen) {
    const html = render({ opdracht })
    const tekst = zichtbaar(html)
    assert.match(html, /data-soort="zonder-voorstel"/, naam)
    assert.match(tekst, /Resultaat zonder concreet voorstel/, naam)
    assert.match(tekst, /Nog te controleren/, naam)
    assert.match(tekst, melding, naam)
    assert.doesNotMatch(tekst, /Wijzigingsvoorstel van de agent|Nog niet beoordeeld/, naam)
    for (const knopNaam of BEOORDEELKNOPPEN) assert.equal(knop(html, knopNaam), undefined, `${naam}: geen ${knopNaam}`)
  }
})

test('een resultaat zonder concreet voorstel toont de uitleg van het model wel, als nog niet gevalideerd', () => {
  const tekst = zichtbaar(render({ opdracht: { id: 6, status: 'klaar', type: 'iets-anders', uitleg: 'Dit is wat het model zegt.' } }))
  assert.match(tekst, /Dit is wat het model zegt\./)
  assert.match(tekst, /niet gevalideerd/i)
})

test('na een antwoord of een resultaat zonder voorstel kan je bewust opnieuw starten; bij een open voorstel niet', () => {
  for (const opdracht of [ANTWOORD, { id: 6, status: 'klaar' }, { id: 6, status: 'klaar', type: 'iets-anders' }]) {
    assert.equal(knop(render({ opdracht }), 'Opnieuw laten nakijken')?.uit, false)
    assert.equal(knop(render({ opdracht, beschikbaar: false }), 'Opnieuw laten nakijken')?.uit, true)
  }
  const open = render({ opdracht: WIJZIGING })
  assert.equal(knop(open, START), undefined, 'een voorstel dat op beoordeling wacht, mag niet worden overschreven')
  assert.equal(knop(open, 'Opnieuw laten nakijken'), undefined)
})

// ---------------------------------------------------------------- beoordelen door een mens

test('alleen een echt wijzigingsvoorstel krijgt Goedkeuren en Afwijzen, en die staan nog dicht', () => {
  const html = render({ opdracht: WIJZIGING })
  for (const naam of BEOORDEELKNOPPEN) {
    assert.equal(knop(html, naam)?.uit, false, `${naam} moet aan staan voor een ingelogde gebruiker met beoordeelfunctie`)
    assert.match(knop(html, naam).attrs, /aria-expanded="false"/)
  }
  assert.doesNotMatch(zichtbaar(html), /Dit voorstel (?:goedkeuren|afwijzen)\?/, 'de bevestiging staat pas open na een klik')
  assert.match(zichtbaar(html), /past zelf niets aan/i)
  assert.match(zichtbaar(html), /pas na je bevestiging/i)
  // Wat de ouder met een goedkeuring doet (bijvoorbeeld het voorstel toepassen), weet deze weergave niet. Ze belooft er niets over.
  assert.doesNotMatch(zichtbaar(html), /past het stuk niet aan|stuk[^.]{0,30}niet aangepast|alleen je beoordeling vast/i)
})

test('zonder beoordeelfunctie staan Goedkeuren en Afwijzen uit, met uitleg', () => {
  const html = render({ opdracht: WIJZIGING, opBeoordeel: undefined })
  for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam)?.uit, true, `${naam} moet zichtbaar uit staan`)
  assert.match(zichtbaar(html), /beoordelen is hier nog niet aangesloten/i)
  assert.doesNotMatch(zichtbaar(render({ opdracht: WIJZIGING, opBeoordeel: 'ja' })), /past zelf niets aan/i)
})

test('zonder echte inlog staan Goedkeuren en Afwijzen uit', () => {
  const html = render({ opdracht: WIJZIGING, ingelogd: false })
  for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam)?.uit, true)
  assert.match(zichtbaar(html), /log in om dit voorstel te beoordelen/i)
})

test('een opdracht zonder id kan niet beoordeeld worden', () => {
  const { id, ...zonderId } = WIJZIGING
  const html = render({ opdracht: zonderId })
  for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam)?.uit, true)
  assert.match(zichtbaar(html), /geen herkenbaar id/i)
})

test('een naam geeft nooit beoordelingsrechten', () => {
  // De werkbank kent alleen een ingevulde naam. Die mag niets openzetten; alleen de callback en de inlog tellen.
  const naamsignalen = { naam: 'Victor', gebruiker: 'Victor', eigenaar: 'Victor', rol: 'beheerder', notitie: { id: 7, auteur: 'Victor' } }
  const opdracht = { ...WIJZIGING, aangevraagd_door: 'Victor', eigenaar: 'Victor' }
  for (const html of [
    render({ ...naamsignalen, opdracht, opBeoordeel: undefined }),
    render({ ...naamsignalen, opdracht, ingelogd: false }),
  ]) {
    for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam)?.uit, true, `${naam} mag niet aan staan op basis van een naam`)
  }
})

test('bij een niet-beoordeelbaar resultaat staan er nooit beoordeelknoppen, ook niet uitgeschakeld', () => {
  for (const opdracht of [ANTWOORD, { id: 6, status: 'klaar' }, { ...WIJZIGING, voorstel: WIJZIGING.oorspronkelijk }, { ...WIJZIGING, status: 'bezig' }]) {
    const html = render({ opdracht, opBeoordeel: undefined })
    for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam), undefined)
  }
})

test('een vastgelegde beoordeling toont het besluit en haalt de knoppen weg', () => {
  const goed = render({ opdracht: { ...WIJZIGING, beoordeling: { besluit: 'goedgekeurd', door: 'Anthony' } } })
  assert.match(zichtbaar(goed), /Goedgekeurd door Anthony/)
  assert.doesNotMatch(zichtbaar(goed), /Nog niet beoordeeld/)
  assert.doesNotMatch(zichtbaar(goed), /past het stuk niet aan/i, 'wat een goedkeuring met het stuk doet, bepaalt de ouder en niet deze weergave')
  const af = render({ opdracht: { ...WIJZIGING, beoordeling: { besluit: 'afgewezen' } } })
  assert.match(zichtbaar(af), /Afgewezen/)
  assert.doesNotMatch(zichtbaar(af), /Afgewezen door/)
  const vreemd = render({ opdracht: { ...WIJZIGING, beoordeling: { besluit: 'misschien' } } })
  assert.match(zichtbaar(vreemd), /Beoordeeld, met een besluit dat we niet kennen/)
  for (const html of [goed, af, vreemd]) {
    for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam), undefined, 'na een beoordeling geen tweede beoordeling')
  }
  // Een beoordeeld voorstel blokkeert een nieuwe, bewuste start niet meer.
  assert.equal(knop(goed, 'Opnieuw laten nakijken')?.uit, false)
})

test('een beoordeling met onzin als waarde wordt genegeerd en beoordelen blijft dan mogelijk', () => {
  for (const beoordeling of ['ja', 42, [], null, undefined]) {
    assert.equal(knop(render({ opdracht: { ...WIJZIGING, beoordeling } }), 'Goedkeuren')?.uit, false)
  }
})

test('een voorstel dat de database als toegepast kent, heet goedgekeurd en toegepast, zonder knoppen', () => {
  // werkbank.agent_voorstellen.status kent voorgesteld, toegepast en afgewezen. Een ouder mag die waarden doorgeven zoals ze zijn.
  const html = render({ opdracht: { ...WIJZIGING, beoordeling: { besluit: 'toegepast', door: 'Anthony' } } })
  assert.match(zichtbaar(html), /Goedgekeurd en toegepast in het stuk door Anthony\./)
  assert.match(html, /data-besluit="toegepast"/)
  assert.doesNotMatch(zichtbaar(html), /niet gekend|dat we niet kennen|Nog niet beoordeeld/)
  for (const naam of BEOORDEELKNOPPEN) assert.equal(knop(html, naam), undefined)
  const af = render({ opdracht: { ...WIJZIGING, beoordeling: { besluit: 'afgewezen', door: 'Anthony' } } })
  assert.match(zichtbaar(af), /Afgewezen door Anthony\./)
})

test('beoordelen kan ook met alleen het id van het voorstel, zoals de database het kent', () => {
  const { id, ...zonderId } = WIJZIGING
  for (const naam of BEOORDEELKNOPPEN) {
    assert.equal(knop(render({ opdracht: { ...zonderId, voorstel_id: 9 } }), naam)?.uit, false, naam)
    assert.equal(knop(render({ opdracht: { ...zonderId, voorstel_id: '' } }), naam)?.uit, true, `${naam} met een leeg voorstel-id`)
    assert.equal(knop(render({ opdracht: { ...zonderId, voorstel_id: {} } }), naam)?.uit, true, `${naam} met een onzin voorstel-id`)
  }
})

// ---------------------------------------------------------------- bronnen en links

const metBronnen = (bronnen) => render({ opdracht: { ...WIJZIGING, bronstatus: undefined, bronnen } })
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1])

test('een veilige bron is een echte link die veilig opent, met het domein er zichtbaar bij', () => {
  const html = metBronnen([
    { titel: 'FOD Financiën', url: 'https://financien.belgium.be/nl/tob', citaat: 'De taks bedraagt 0,12%.' },
    { titel: 'Wikifin', url: 'http://www.wikifin.be/pad?x=1&y=2#deel' },
  ])
  assert.deepEqual(hrefs(html), ['https://financien.belgium.be/nl/tob', 'http://www.wikifin.be/pad?x=1&amp;y=2#deel'])
  assert.match(html, /<a\b(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*href="https:\/\/financien\.belgium\.be\/nl\/tob"[^>]*>FOD Financiën<\/a>/)
  const tekst = zichtbaar(html)
  assert.match(tekst, /financien\.belgium\.be/)
  assert.match(tekst, /Citaat volgens de agent/)
  assert.match(tekst, /De taks bedraagt 0,12%\./)
})

const ONVEILIG = [
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'jav&#x09;ascript:alert(1)',
  'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'blob:https://example.org/abc',
  'ftp://example.org/bestand', 'mailto:iemand@example.org', 'tel:+3212345678',
  '//evil.example/x', '/relatief/pad', 'bron.html', '../bron', '#anker', 'https:example.org', 'https:/example.org', 'https:\\\\example.org',
  'https://user:geheim@example.org/', 'https://user@example.org/', 'https://example.org/ met spatie', ' https://example.org/', 'https://example.org/\n', 'https://exa\tmple.org/',
  'https://', 'http://', 'https://.', 'https://[bad',
  'http://localhost:8983/lokaal-onderzoek', 'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://0.0.0.0/',
  'http://192.168.1.10/admin', 'http://10.0.0.1/', 'http://172.16.5.4/', 'http://169.254.169.254/latest/meta-data', 'http://100.64.1.1/',
  'http://[::1]/', 'http://[fe80::1]/', 'http://intranet/', 'http://server.local/', 'http://metadata.google.internal/',
]

test('een onveilig of niet-openbaar adres wordt nooit een link en wordt ook niet herhaald', () => {
  for (const url of ONVEILIG) {
    const html = metBronnen([{ titel: 'Verdachte bron', url }])
    assert.deepEqual(hrefs(html), [], `link voor ${JSON.stringify(url)}`)
    assert.doesNotMatch(html, /<a\b/, `anker voor ${JSON.stringify(url)}`)
    assert.match(zichtbaar(html), /Verdachte bron/, 'de titel blijft leesbaar')
    assert.match(zichtbaar(html), /Geen link: het adres is ongeldig of niet veilig/, `uitleg voor ${JSON.stringify(url)}`)
    const kaal = url.trim()
    if (kaal.length > 8) assert.ok(!html.includes(kaal), `het adres ${JSON.stringify(url)} mag niet in de uitvoer staan`)
  }
})

test('geen enkele href in de uitvoer is iets anders dan een gewoon http(s)-adres', () => {
  const html = metBronnen([...ONVEILIG.map((url, i) => ({ titel: `Bron ${i}`, url })), { titel: 'Goed', url: 'https://www.wikifin.be/nl' }])
  assert.deepEqual(hrefs(html), ['https://www.wikifin.be/nl'])
  assert.doesNotMatch(html, /javascript:|vbscript:|data:text|file:\/\/|<script/i)
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+=/i)
})

test('een bron zonder adres is een verwijzing die je niet kan controleren, geen link', () => {
  const html = metBronnen([{ titel: 'Wet van 1965' }, { titel: 'Nog een wet', url: null }, { titel: 'Leeg adres', url: '' }, { titel: 'Spaties', url: '   ' }])
  const tekst = zichtbaar(html)
  assert.match(tekst, /Wet van 1965/)
  assert.equal((tekst.match(/Geen adres meegegeven/g) ?? []).length, 4)
  assert.doesNotMatch(html, /<a\b/)
})

test('bronnen uit een model worden ook als platte tekst getoond', () => {
  const html = metBronnen([{ titel: '<img src=x onerror=alert(1)>', url: 'https://example.org/x', citaat: '<script>alert(1)</script> **vet**' }])
  assert.doesNotMatch(html, /<img|<script|<strong>/i)
  assert.match(zichtbaar(html), /<img src=x onerror=alert\(1\)>/)
  assert.match(zichtbaar(html), /<script>alert\(1\)<\/script> \*\*vet\*\*/)
})

test('lege of onzinnige bronnen worden overgeslagen in plaats van een lege rij te tonen', () => {
  const html = metBronnen([null, undefined, 5, 'tekst', [], {}, { titel: '  ' }, { titel: {}, url: {} }, { titel: 'Echte bron', url: 'https://example.org/' }])
  assert.deepEqual(hrefs(html), ['https://example.org/'])
  assert.equal((html.match(/<li\b/g) ?? []).length, 1)
  const nietsGeldigs = zichtbaar(metBronnen([null, 5, {}]))
  assert.doesNotMatch(nietsGeldigs, /bron/i, 'zonder bruikbare bron geen bronnensectie')
  assert.doesNotMatch(zichtbaar(metBronnen('niet-een-lijst')), /bron/i)
})

// ---------------------------------------------------------------- onzin in de invoer

test('alleen echte waarden openen de knoppen: een id is een getal of tekst, een vlag is echt true', () => {
  for (const notitie of [{ id: true }, { id: {} }, { id: [] }, { id: NaN }, { id: Infinity }, { id: '   ' }, 'abc', 12, []]) {
    assert.equal(knop(render({ notitie }), START)?.uit, true, `notitie ${JSON.stringify(notitie)} heeft geen echt id`)
  }
  for (const documentId of [true, {}, [], NaN, '  ']) {
    assert.equal(knop(render({ documentId }), START)?.uit, true, `stuk ${JSON.stringify(documentId)} is geen echt id`)
  }
  for (const vlag of ['ja', 'false', 1, {}, []]) {
    assert.equal(knop(render({ beschikbaar: vlag }), START)?.uit, true, `beschikbaar ${JSON.stringify(vlag)} is geen echte true`)
    assert.equal(knop(render({ ingelogd: vlag }), START)?.uit, true, `ingelogd ${JSON.stringify(vlag)} is geen echte true`)
    assert.equal(knop(render({ opdracht: WIJZIGING, ingelogd: vlag }), 'Goedkeuren')?.uit, true)
  }
  assert.equal(knop(render({ notitie: { id: 0 }, documentId: 0 }), START)?.uit, false, '0 is een geldig getal')
  assert.equal(knop(render({ notitie: { id: 'abc-1' }, documentId: 'doc-1' }), START)?.uit, false, 'tekst-id\'s zijn geldig')
  const { id, ...zonderId } = WIJZIGING
  for (const rommelId of [true, {}, [], NaN]) {
    assert.equal(knop(render({ opdracht: { ...zonderId, id: rommelId } }), 'Goedkeuren')?.uit, true, `opdracht-id ${JSON.stringify(rommelId)}`)
  }
})

test('onzin in de opdracht laat de component niet crashen en toont geen [object Object]', () => {
  const rommel = [
    { status: 'klaar', type: { x: 1 }, oorspronkelijk: { a: 1 }, voorstel: ['x'], uitleg: 42, reden: true, modelduiding: {}, duiding: [], bronnen: 'geen lijst', bronstatus: 7, document_versie: '2', beoordeling: 'ja', bijgewerkt: 5, fout: { x: 1 } },
    { status: 'klaar', type: 'wijziging', oorspronkelijk: 'a', voorstel: 'b', bronnen: [null, 1, 'x', [], {}, { titel: { x: 1 }, url: ['https://example.org'], citaat: {} }], document_versie: -3 },
    { status: 'klaar', type: 'wijziging', oorspronkelijk: 'a', voorstel: 'b', document_versie: 2.5 },
    { status: 'mislukt', fout: { diep: { geneste: 'x' } } },
    { status: 'klaar', type: 'antwoord', uitleg: { uit: 'leg' }, bronnen: { 0: { titel: 'x' } } },
    { status: 'klaar', type: 'wijziging', oorspronkelijk: 'a', voorstel: 'b', beoordeling: { besluit: {}, door: {} } },
    { status: 'klaar', type: 'wijziging', oorspronkelijk: 'a', voorstel: 'b', beoordeling: { besluit: 'goedgekeurd', door: { naam: 'x' } } },
    Object.assign(Object.create(null), { status: 'bezig' }),
    Object.create(null),
  ]
  for (const opdracht of rommel) {
    const html = render({ opdracht })
    const tekst = zichtbaar(html)
    assert.doesNotMatch(tekst, /\[object Object\]|\bundefined\b|\bNaN\b|\bnull\b/, `rommelige opdracht ${JSON.stringify(opdracht)}`)
    assert.doesNotMatch(tekst, /Gebaseerd op versie/, 'een ongeldige versie wordt niet getoond')
  }
})

test('een heel lange tekst blijft gewoon tekst en breekt de weergave niet', () => {
  const lang = 'woord '.repeat(50000)
  const html = render({ opdracht: { ...WIJZIGING, oorspronkelijk: lang, voorstel: `${lang}extra` } })
  assert.ok(html.length > lang.length)
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+=/i)
})

// ---------------------------------------------------------------- echte klikken in een echte React-boom
/* Statische markup kan niet bewijzen dat er niets gebeurt bij het laden en dat een bevestiging
   echt eerst moet. Er staat geen jsdom in dit project en er komt er geen bij: react-dom/client
   heeft aan een piepkleine eigen DOM genoeg om de echte component, met echte hooks en het echte
   React-eventsysteem, te draaien. Een klik wordt aan de listeners van de root gegeven, net als
   een browser dat doet. */

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
const knoptekst = (knoopje) => knoopje.textContent.replace(/\s+/g, ' ').trim()

/* Zet de echte component in de schim-DOM. `toon` rendert opnieuw met nieuwe props, zoals een ouder dat doet. */
async function mount(props = {}) {
  const dom = installeerDom()
  const klant = await import('react-dom/client')
  const createRoot = klant.createRoot ?? klant.default.createRoot
  const houder = dom.doc.createElement('div')
  dom.doc.body.appendChild(houder)
  const root = createRoot(houder)
  let huidig = { ...BASIS, ...props }
  const toon = (wijziging = {}) => { huidig = { ...huidig, ...wijziging }; return act(async () => { root.render(h(AgentComment, huidig)) }) }
  await toon()
  const stuur = (doel, type, extra = {}) => act(async () => {
    const gebeurtenis = { type, target: doel, bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(), preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...extra }
    const luisteraars = houder.luisteraars.filter((l) => l.type === type)
    for (const l of luisteraars.filter((x) => x.capture)) l.fn(gebeurtenis)
    for (const l of luisteraars.filter((x) => !x.capture)) l.fn(gebeurtenis)
  })
  return {
    houder,
    doc: dom.doc,
    toon,
    tekst: () => houder.textContent.replace(/\s+/g, ' ').trim(),
    knop: (tekst) => vindAlle(houder, (k) => k.tagName === 'BUTTON' && knoptekst(k) === tekst)[0],
    alarmen: () => vindAlle(houder, (k) => k.getAttribute('role') === 'alert').map((k) => k.textContent.replace(/\s+/g, ' ').trim()),
    klik: (doel) => stuur(doel, 'click'),
    toets: (doel, key) => stuur(doel, 'keydown', { key }),
    async sluit() { await act(async () => root.unmount()); dom.herstel() },
  }
}
const uitgezet = (knoopje) => knoopje.hasAttribute('disabled') || knoopje.getAttribute('aria-disabled') === 'true'

test('niets start of beoordeelt bij het laden of opnieuw renderen, alleen een klik', async () => {
  const oproepen = []
  const ui = await mount({ opStart: (x) => oproepen.push(['start', x]), opBeoordeel: (x) => oproepen.push(['beoordeel', x]) })
  try {
    for (const opdracht of [WIJZIGING, ANTWOORD, { id: 3, status: 'mislukt' }, { id: 4, status: 'bezig' }, null]) await ui.toon({ opdracht })
    await ui.toon({ ingelogd: false })
    await ui.toon({ ingelogd: true })
    assert.deepEqual(oproepen, [], 'een callback werd zonder klik aangeroepen')
  } finally { await ui.sluit() }
})

test('een klik op de startknop start precies één keer met alleen notitie en stuk, ook bij dubbelklikken', async () => {
  const oproepen = []
  let rondAf
  const ui = await mount({ opStart: (x) => { oproepen.push(x); return new Promise((resolve) => { rondAf = resolve }) } })
  try {
    await ui.klik(ui.knop(START))
    assert.deepEqual(oproepen, [{ notitieId: 7, documentId: 75 }])
    assert.equal(ui.knop('Starten…')?.getAttribute('aria-disabled'), 'true', 'tijdens het starten is de knop bezig')
    await ui.klik(ui.knop('Starten…'))
    assert.equal(oproepen.length, 1, 'een tweede klik tijdens het starten telt niet')
    await act(async () => rondAf())
    assert.match(ui.tekst(), /Aanvraag verstuurd/)
    assert.equal(ui.knop(START), undefined, 'na het versturen kan je niet dubbel starten')
    assert.doesNotMatch(ui.tekst(), /In de wachtrij/, 'de component verzint zelf geen status')
    await ui.toon({ opdracht: { id: 9, status: 'wachtrij' } })
    assert.match(ui.tekst(), /In de wachtrij/)
    assert.doesNotMatch(ui.tekst(), /Aanvraag verstuurd/)
  } finally { await ui.sluit() }
})

test('een klik op een uitgeschakelde startknop doet niets', async () => {
  const oproepen = []
  for (const props of [{ beschikbaar: false }, { ingelogd: false }, { notitie: {} }, { documentId: null }]) {
    const ui = await mount({ ...props, opStart: (x) => oproepen.push(x) })
    try {
      assert.equal(uitgezet(ui.knop(START)), true)
      await ui.klik(ui.knop(START))
    } finally { await ui.sluit() }
  }
  assert.deepEqual(oproepen, [])
})

test('als starten mislukt, staat dat er eerlijk bij en kan je bewust opnieuw proberen', async () => {
  for (const mislukking of [() => Promise.reject(new Error('nee')), () => { throw new Error('direct') }]) {
    let pogingen = 0
    const ui = await mount({ opStart: () => { pogingen += 1; return mislukking() } })
    try {
      await ui.klik(ui.knop(START))
      assert.equal(pogingen, 1)
      assert.match(ui.alarmen().join(' '), /Starten is niet gelukt/)
      assert.doesNotMatch(ui.tekst(), /Aanvraag verstuurd/)
      assert.equal(uitgezet(ui.knop(START)), false, 'na een fout kan je opnieuw klikken')
      await ui.klik(ui.knop(START))
      assert.equal(pogingen, 2)
    } finally { await ui.sluit() }
  }
})

test('Goedkeuren vraagt eerst om bevestiging; pas "Ja, goedkeuren" geeft de beoordeling door', async () => {
  const oproepen = []
  const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: (x) => { oproepen.push(x) } })
  try {
    const trigger = ui.knop('Goedkeuren')
    await ui.klik(trigger)
    assert.deepEqual(oproepen, [], 'de eerste klik beoordeelt nog niets')
    assert.match(ui.tekst(), /Dit voorstel goedkeuren\?/)
    assert.match(ui.tekst(), /Je keurt de vervanging van de oorspronkelijke door de voorgestelde tekst goed/)
    assert.match(ui.tekst(), /Pas na deze bevestiging wordt je beslissing doorgegeven/)
    assert.doesNotMatch(ui.tekst(), /past het stuk niet aan|niet aangepast/i, 'de vraag belooft niets over wat de ouder met je beslissing doet')
    assert.equal(ui.knop('Goedkeuren').getAttribute('aria-expanded'), 'true')
    assert.equal(ui.doc.activeElement, ui.knop('Annuleer'), 'focus gaat naar de veilige keuze')

    await ui.klik(ui.knop('Annuleer'))
    assert.deepEqual(oproepen, [])
    assert.doesNotMatch(ui.tekst(), /Dit voorstel goedkeuren\?/)
    assert.equal(ui.doc.activeElement, ui.knop('Goedkeuren'), 'focus keert terug naar de knop die de vraag opende')

    await ui.klik(ui.knop('Goedkeuren'))
    await ui.toets(ui.knop('Annuleer'), 'Escape')
    assert.doesNotMatch(ui.tekst(), /Dit voorstel goedkeuren\?/, 'Escape sluit de vraag')
    assert.deepEqual(oproepen, [])

    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    assert.deepEqual(oproepen, [{ opdrachtId: 41, notitieId: 7, documentId: 75, besluit: 'goedgekeurd' }])
    assert.match(ui.tekst(), /Je beoordeling is doorgegeven: goedgekeurd/)
    assert.doesNotMatch(ui.tekst(), /past het stuk niet aan/i)
    assert.equal(ui.knop('Goedkeuren'), undefined, 'na het doorgeven geen tweede beoordeling')
    assert.equal(ui.knop('Afwijzen'), undefined)
  } finally { await ui.sluit() }
})

test('Afwijzen werkt met dezelfde bevestiging en wisselen van keuze geeft nog niets door', async () => {
  const oproepen = []
  const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: (x) => { oproepen.push(x) } })
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Afwijzen'))
    assert.deepEqual(oproepen, [])
    assert.match(ui.tekst(), /Dit voorstel afwijzen\?/)
    assert.match(ui.tekst(), /Je wijst de vervanging van de oorspronkelijke door de voorgestelde tekst af/)
    assert.doesNotMatch(ui.tekst(), /Dit voorstel goedkeuren\?/)
    assert.equal(ui.knop('Ja, goedkeuren'), undefined)
    await ui.klik(ui.knop('Ja, afwijzen'))
    assert.deepEqual(oproepen, [{ opdrachtId: 41, notitieId: 7, documentId: 75, besluit: 'afgewezen' }])
    assert.match(ui.tekst(), /Je beoordeling is doorgegeven: afgewezen/)
  } finally { await ui.sluit() }
})

test('het id van het voorstel gaat mee naar de ouder als het er is, en alleen dan', async () => {
  // De database beoordeelt op het id van het voorstel (agent_voorstellen.id), niet op dat van de opdracht.
  const oproepen = []
  const opBeoordeel = (x) => { oproepen.push(x) }
  const ui = await mount({ opdracht: { ...WIJZIGING, voorstel_id: 9 }, opBeoordeel })
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
  } finally { await ui.sluit() }
  const { id, ...zonderId } = WIJZIGING
  const alleen = await mount({ opdracht: { ...zonderId, voorstel_id: '9' }, opBeoordeel })
  try {
    await alleen.klik(alleen.knop('Afwijzen'))
    await alleen.klik(alleen.knop('Ja, afwijzen'))
  } finally { await alleen.sluit() }
  assert.deepEqual(oproepen, [
    { opdrachtId: 41, voorstelId: 9, notitieId: 7, documentId: 75, besluit: 'goedgekeurd' },
    { voorstelId: '9', notitieId: 7, documentId: 75, besluit: 'afgewezen' },
  ])
})

/* Zo komt een weigering van Supabase of een eigen Error bij de component aan: een object of
   een Error met de meldingscode als `message`, of kale tekst. */
const WEIGERINGEN = (code) => [new Error(code), Object.assign(new Error(code), { code: '42501' }), { message: code, code: 'P0001', details: null }, code, `Error: ${code}`]

test('een bekende weigering bij het beoordelen staat in gewone taal bij de fout, nooit als ruwe code', async () => {
  const gevallen = [
    ['niet_de_eigenaar', /alleen de eigenaar van dit blok mag dit voorstel beoordelen/i],
    ['document_gewijzigd', /stuk is gewijzigd sinds dit voorstel/i],
    ['voorstel_al_beoordeeld', /dit voorstel is al beoordeeld/i],
    ['extra_verificatie_vereist', /tweestapsverificatie/i],
    ['voorstel_gewijzigd', /voorstel is gewijzigd/i],
    ['niet_toegelaten', /geen toegang/i],
  ]
  for (const [code, uitleg] of gevallen) {
    for (const fout of WEIGERINGEN(code)) {
      const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: () => Promise.reject(fout) })
      try {
        await ui.klik(ui.knop('Goedkeuren'))
        await ui.klik(ui.knop('Ja, goedkeuren'))
        const alarm = ui.alarmen().join(' ')
        assert.match(alarm, /beoordeling kon niet bevestigd worden/i, `${code}: ${String(fout?.message ?? fout)}`)
        assert.match(alarm, uitleg, code)
        assert.doesNotMatch(alarm, new RegExp(code), `${code}: de ruwe code hoort niet in beeld`)
        assert.doesNotMatch(alarm, /Controleer de stand/, `${code}: de weigering is duidelijk, dus geen algemeen advies`)
        assert.doesNotMatch(ui.tekst(), /Je beoordeling is doorgegeven/)
        assert.equal(uitgezet(ui.knop('Goedkeuren')), false, 'na een weigering kan je bewust opnieuw')
      } finally { await ui.sluit() }
    }
  }
})

test('een onbekende fout bij beoordelen of starten blijft algemeen en toont nooit de tekst van de fout', async () => {
  const vuil = new Error('<img src=x onerror=alert(1)> geheime serverdetails')
  const beoordeel = await mount({ opdracht: WIJZIGING, opBeoordeel: () => { throw vuil } })
  try {
    await beoordeel.klik(beoordeel.knop('Goedkeuren'))
    await beoordeel.klik(beoordeel.knop('Ja, goedkeuren'))
    const alarm = beoordeel.alarmen().join(' ')
    assert.match(alarm, /beoordeling kon niet bevestigd worden\. Controleer de stand voor je opnieuw probeert/i)
    assert.doesNotMatch(alarm, /geheime|img|onerror/)
  } finally { await beoordeel.sluit() }
  for (const fout of [vuil, undefined, null, 42, {}, { message: 42 }, { message: 'iets_anders' }]) {
    const start = await mount({ opStart: () => Promise.reject(fout) })
    try {
      await start.klik(start.knop(START))
      const alarm = start.alarmen().join(' ')
      assert.match(alarm, /Starten is niet gelukt\. Controleer of er al een opdracht verschenen is/i, `fout ${String(fout)}`)
      assert.doesNotMatch(alarm, /geheime|img|onerror|iets_anders/)
    } finally { await start.sluit() }
  }
})

test('een bekende weigering bij het starten staat in gewone taal bij de fout', async () => {
  const gevallen = [
    ['agent_niet_vrijgegeven', /nog niet vrijgegeven/i],
    ['limiet_bereikt', /limiet voor agentopdrachten/i],
    ['vertrouwelijk_geweigerd', /vertrouwelijk/i],
    ['anker_niet_uniek', /meer dan één keer/i],
    ['notitie_hoort_niet_bij_document', /hoort niet bij dit stuk/i],
    ['werkbank_onveilig', /nog niet veilig genoeg/i],
  ]
  for (const [code, uitleg] of gevallen) {
    for (const fout of WEIGERINGEN(code)) {
      let pogingen = 0
      const ui = await mount({ opStart: () => { pogingen += 1; return Promise.reject(fout) } })
      try {
        await ui.klik(ui.knop(START))
        const alarm = ui.alarmen().join(' ')
        assert.match(alarm, /Starten is niet gelukt\./, code)
        assert.match(alarm, uitleg, code)
        assert.doesNotMatch(alarm, new RegExp(code), `${code}: de ruwe code hoort niet in beeld`)
        assert.doesNotMatch(alarm, /Controleer of er al een opdracht/, `${code}: de weigering is duidelijk, dus geen algemeen advies`)
        assert.equal(pogingen, 1)
        assert.equal(uitgezet(ui.knop(START)), false, 'na een weigering kan je bewust opnieuw')
      } finally { await ui.sluit() }
    }
  }
})

test('een weigering wordt alleen op hele woorden herkend, en alleen als ze bij deze handeling kan horen', async () => {
  // "document_gewijzigd_of_geweigerd" is een andere code dan "document_gewijzigd": een deel van een woord telt niet.
  // "timeout" en "budget_op" horen bij een mislukte opdracht, niet bij het starten of beoordelen: een gewone netwerkfout is geen melding van de agent.
  const gevallen = [
    ['document_gewijzigd_of_geweigerd', /stuk is gewijzigd sinds dit voorstel/i],
    ['xniet_de_eigenaar', /alleen de eigenaar/i],
    ['niet_de_eigenaar_x', /alleen de eigenaar/i],
    ['timeout', /te lang/i],
    ['Request timeout after 30000ms', /te lang/i],
    ['budget_op', /budget/i],
  ]
  for (const [code, nietVerwacht] of gevallen) {
    const beoordeel = await mount({ opdracht: WIJZIGING, opBeoordeel: () => Promise.reject(new Error(code)) })
    try {
      await beoordeel.klik(beoordeel.knop('Goedkeuren'))
      await beoordeel.klik(beoordeel.knop('Ja, goedkeuren'))
      const alarm = beoordeel.alarmen().join(' ')
      assert.match(alarm, /Controleer de stand voor je opnieuw probeert/, `beoordelen: ${code}`)
      assert.doesNotMatch(alarm, nietVerwacht, `beoordelen: ${code}`)
    } finally { await beoordeel.sluit() }
    const start = await mount({ opStart: () => Promise.reject(new Error(code)) })
    try {
      await start.klik(start.knop(START))
      const alarm = start.alarmen().join(' ')
      assert.match(alarm, /Controleer of er al een opdracht verschenen is/, `starten: ${code}`)
      assert.doesNotMatch(alarm, nietVerwacht, `starten: ${code}`)
    } finally { await start.sluit() }
  }
})

test('bevestigen telt maar één keer, ook bij dubbelklikken terwijl de beoordeling nog loopt', async () => {
  const oproepen = []
  let rondAf
  const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: (x) => { oproepen.push(x); return new Promise((resolve) => { rondAf = resolve }) } })
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.klik(ui.knop('Bezig…'))
    await ui.klik(ui.knop('Bezig…'))
    assert.equal(oproepen.length, 1)
    await ui.klik(ui.knop('Annuleer'))
    assert.match(ui.tekst(), /Dit voorstel goedkeuren\?/, 'tijdens het doorgeven sluit de vraag niet')
    await act(async () => rondAf())
    assert.equal(oproepen.length, 1)
    assert.match(ui.tekst(), /Je beoordeling is doorgegeven/)
  } finally { await ui.sluit() }
})

test('als het doorgeven mislukt, blijft het voorstel open en kan je bewust opnieuw beoordelen', async () => {
  let pogingen = 0
  const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: () => { pogingen += 1; throw new Error('server weigert') } })
  try {
    await ui.klik(ui.knop('Afwijzen'))
    await ui.klik(ui.knop('Ja, afwijzen'))
    assert.equal(pogingen, 1)
    assert.match(ui.alarmen().join(' '), /beoordeling kon niet bevestigd worden/i)
    assert.doesNotMatch(ui.tekst(), /Je beoordeling is doorgegeven/)
    assert.equal(uitgezet(ui.knop('Afwijzen')), false)
    assert.doesNotMatch(ui.tekst(), /Dit voorstel afwijzen\?/, 'na een fout moet je de vraag opnieuw bewust openen')
    await ui.klik(ui.knop('Afwijzen'))
    assert.deepEqual(ui.alarmen(), [], 'de oude fout verdwijnt zodra je opnieuw begint')
    await ui.klik(ui.knop('Ja, afwijzen'))
    assert.equal(pogingen, 2)
  } finally { await ui.sluit() }
})

test('een bevestiging geldt alleen voor het voorstel dat je zag en vervalt als dat verandert of niet meer mag', async () => {
  const oproepen = []
  const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: (x) => { oproepen.push(x) } })
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.toon({ opdracht: { ...WIJZIGING, voorstel: 'Een heel andere tekst.' } })
    assert.doesNotMatch(ui.tekst(), /Dit voorstel goedkeuren\?/, 'een ander voorstel kan niet met de oude bevestiging worden goedgekeurd')
    assert.equal(ui.knop('Ja, goedkeuren'), undefined)

    await ui.klik(ui.knop('Goedkeuren'))
    await ui.toon({ opdracht: { ...WIJZIGING, voorstel: 'Een heel andere tekst.', uitleg: 'Een andere uitleg.' } })
    assert.ok(!ui.knop('Ja, goedkeuren'), 'gewijzigde uitleg vereist een nieuwe bevestiging')

    await ui.klik(ui.knop('Goedkeuren'))
    await ui.toon({ ingelogd: false })
    assert.doesNotMatch(ui.tekst(), /Dit voorstel goedkeuren\?/)
    assert.equal(uitgezet(ui.knop('Goedkeuren')), true)

    await ui.toon({ ingelogd: true })
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.toon({ opBeoordeel: undefined })
    assert.equal(ui.knop('Ja, goedkeuren'), undefined)
    assert.deepEqual(oproepen, [])
  } finally { await ui.sluit() }
})

test('zonder beoordeelfunctie of zonder inlog doet een klik op Goedkeuren niets', async () => {
  for (const props of [{ opBeoordeel: undefined }, { ingelogd: false }]) {
    const oproepen = []
    const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: (x) => oproepen.push(x), ...props })
    try {
      await ui.klik(ui.knop('Goedkeuren'))
      await ui.klik(ui.knop('Afwijzen'))
      assert.doesNotMatch(ui.tekst(), /Dit voorstel (?:goedkeuren|afwijzen)\?/)
      assert.deepEqual(oproepen, [])
    } finally { await ui.sluit() }
  }
})

test('zodra de ouder de beoordeling vastlegt, neemt die het over van de lokale melding', async () => {
  const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: () => {} })
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    assert.match(ui.tekst(), /Je beoordeling is doorgegeven/)
    await ui.toon({ opdracht: { ...WIJZIGING, beoordeling: { besluit: 'goedgekeurd', door: 'Anthony' } } })
    assert.doesNotMatch(ui.tekst(), /Je beoordeling is doorgegeven/)
    assert.match(ui.tekst(), /Goedgekeurd door Anthony/)
  } finally { await ui.sluit() }
})

test('een opdracht die verdwijnt tijdens het wachten laat niets achter in de volgende opdracht', async () => {
  let rondAf
  const oproepen = []
  const ui = await mount({ opdracht: WIJZIGING, opBeoordeel: (x) => { oproepen.push(x); return new Promise((resolve) => { rondAf = resolve }) } })
  try {
    await ui.klik(ui.knop('Goedkeuren'))
    await ui.klik(ui.knop('Ja, goedkeuren'))
    await ui.toon({ opdracht: { ...WIJZIGING, id: 99, voorstel: 'Nieuw voorstel voor een andere opdracht.' } })
    await act(async () => rondAf())
    assert.doesNotMatch(ui.tekst(), /Je beoordeling is doorgegeven/, 'de melding hoort bij het oude voorstel')
    assert.equal(uitgezet(ui.knop('Goedkeuren')), false, 'het nieuwe voorstel is nog niet beoordeeld')
    assert.equal(oproepen.length, 1)
  } finally { await ui.sluit() }
})

// ---------------------------------------------------------------- isolatie en stijl

const broncode = readFileSync(new URL('../src/components/agent-comment.jsx', import.meta.url), 'utf8')
const stijl = readFileSync(new URL('../src/components/agent-comment.css', import.meta.url), 'utf8')
const zonderCommentaar = (tekst) => tekst.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const code = zonderCommentaar(broncode)
const css = zonderCommentaar(stijl)

test('de component blijft geïsoleerd: geen netwerk, database, opslag, timers of effecten', () => {
  const verboden = [
    'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'supabase', 'lib/data', 'localStorage', 'sessionStorage', 'indexedDB',
    'useEffect', 'useLayoutEffect', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'import.meta',
  ]
  for (const woord of verboden) assert.ok(!code.includes(woord), `agent-comment.jsx mag "${woord}" niet gebruiken`)
  const invoer = [...code.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1])
  assert.deepEqual(invoer.sort(), ['../lib/bron-check', './Icoon', 'react'].sort(), 'alleen deze imports')
  assert.match(code, /import '\.\/agent-comment\.css'/)
})

test('de component maakt nergens HTML uit tekst', () => {
  for (const woord of ['dangerouslySetInnerHTML', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'marked', 'DOMPurify', 'renderMd']) {
    assert.ok(!code.includes(woord), `agent-comment.jsx mag "${woord}" niet gebruiken`)
  }
  assert.doesNotMatch(code, /<(?:b|i|em|strong|script|style|iframe|object|embed)[\s>]/i, 'geen opmaaktags voor tekst uit de opdracht')
})

test('de stijl gebruikt alleen eigen selectors en de bestaande tokens uit de werkbank', () => {
  const zonderAnimaties = css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const regels = [...zonderAnimaties.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
  assert.ok(regels.length > 20, 'de stijl lijkt leeg')
  for (const [, selectors] of regels) {
    for (const selector of selectors.split(',').map((s) => s.trim()).filter(Boolean)) {
      assert.match(selector, /^\.agent-comment(?![A-Za-z0-9])/, `selector "${selector}" lekt buiten de component`)
    }
  }
  for (const token of ['--kaart', '--tekst-1', '--tekst-2', '--accent', '--lijn', '--straal', '--vul-sterk']) {
    assert.ok(css.includes(`var(${token}`), `token ${token} wordt niet gebruikt`)
  }
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, 'geen vaste kleuren: alleen tokens, zodat het donkere thema meekleurt')
  assert.doesNotMatch(css, /!important/, 'geen !important')
})

test('elke klasse in de component heeft stijl en elke stijl hoort bij een klasse', () => {
  const inCode = new Set([...code.matchAll(/agent-comment(?:-[a-z]+)*/g)].map((m) => m[0]))
  const inCss = new Set([...css.matchAll(/\.(agent-comment(?:-[a-z]+)*)/g)].map((m) => m[1]))
  assert.deepEqual([...inCode].filter((k) => !inCss.has(k)), [], 'klassen zonder stijl (typfout?)')
  assert.deepEqual([...inCss].filter((k) => !inCode.has(k)), [], 'stijl zonder klasse in de component')
})

test('de stijl houdt tekst plat en leesbaar, ontziet bewegingsgevoelige mensen en houdt uitgezette knoppen zichtbaar uit', () => {
  assert.match(css, /white-space:\s*pre-wrap/, 'regeleinden in voorstellen moeten blijven')
  assert.match(css, /overflow-wrap:\s*anywhere/, 'lange woorden en adressen mogen de kaart niet verbreden')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^{]*\{[^}]*agent-comment-draait[^}]*animation:\s*none/s, 'de spinner staat stil bij verminderde beweging')
  assert.match(css, /\.agent-comment \.knop:disabled/, 'uitgezette knoppen krijgen een eigen, zichtbaar uit-uiterlijk')
  assert.match(css, /\[aria-disabled='true'\]/, 'bezige knoppen zien er bezig uit')
  assert.match(css, /@media \(forced-colors: active\)/, 'ook in hoogcontrast-modus blijft de status herkenbaar')
})

// @@EINDE@@
