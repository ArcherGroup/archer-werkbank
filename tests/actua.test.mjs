import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mooiGetal, groepeerActua, telPerStatus, isSignaal, versTekst, versheidsTekst, versheidPerDomein, dagenOud, domeinNaam } from '../src/lib/actua.js'

const s = (extra = {}) => ({
  id: 1, domein: 'macro', agent: 'macro-wachter', bron_naam: 'VRT', bron_url: 'https://voorbeeld.be/a',
  zin: 'De inflatie steeg in oktober 2026 naar 5,26 procent.', getal: '5.26', eenheid: 'procent',
  bron_datum: '2026-10-29', status: 'te_controleren', ...extra,
})

test('signalen worden per domein gegroepeerd in de vaste volgorde', () => {
  const groepen = groepeerActua([
    s({ id: 1, domein: 'markten' }),
    s({ id: 2, domein: 'macro' }),
    s({ id: 3, domein: 'fiscaliteit' }),
  ])
  assert.deepEqual(groepen.map((g) => g.id), ['macro', 'fiscaliteit', 'markten'])
})

test('een onbekend domein verdwijnt niet maar komt achteraan', () => {
  const groepen = groepeerActua([s({ id: 1, domein: 'ruimtevaart' }), s({ id: 2, domein: 'markten' })])
  assert.deepEqual(groepen.map((g) => g.id), ['markten', 'ruimtevaart'])
  assert.equal(groepen[1].naam, 'ruimtevaart')
})

test('filteren op status laat alleen die status zien', () => {
  const lijst = [s({ id: 1 }), s({ id: 2, status: 'bevestigd' })]
  assert.deepEqual(groepeerActua(lijst, { status: 'te_controleren' })[0].signalen.map((x) => x.id), [1])
  assert.deepEqual(groepeerActua(lijst, { status: 'bevestigd' })[0].signalen.map((x) => x.id), [2])
  assert.equal(groepeerActua(lijst, { status: 'verworpen' }).length, 0)
})

test('wat geen signaal is telt niet mee', () => {
  assert.equal(isSignaal(null), false)
  assert.equal(isSignaal({ zin: '  ', bron_url: 'https://a.be' }), false)
  assert.equal(isSignaal({ zin: 'iets', bron_url: 'geen-url' }), false)
  assert.equal(isSignaal(s()), true)
  assert.equal(groepeerActua([null, { zin: '' }, s()]).length, 1)
})

test('de teller per status telt alleen echte signalen', () => {
  const telling = telPerStatus([s(), s({ id: 2, status: 'bevestigd' }), null, { zin: '' }])
  assert.equal(telling.te_controleren, 1)
  assert.equal(telling.bevestigd, 1)
  assert.equal(telling.verworpen, 0)
})

test('de nieuwste bron staat bovenaan', () => {
  const groepen = groepeerActua([s({ id: 1, bron_datum: '2026-01-05' }), s({ id: 2, bron_datum: '2026-10-29' })])
  assert.deepEqual(groepen[0].signalen.map((x) => x.id), [2, 1])
})

test('de ouderdom van een bron wordt in gewone taal gezegd', () => {
  const nu = new Date('2026-11-12T12:00:00Z')
  assert.equal(dagenOud('2026-11-12T08:00:00Z', nu), 0)
  assert.equal(versTekst('2026-11-12T08:00:00Z', nu), 'vandaag')
  assert.equal(versTekst(null), 'datum onbekend')
  assert.equal(domeinNaam('fiscaliteit'), 'Fiscaliteit')
  assert.equal(domeinNaam('onbekend'), 'onbekend')
})
test('een cijfer wordt gelezen zoals een mens het leest', () => {
  assert.equal(mooiGetal('5.26', 'procent'), '5,26 procent')
  assert.equal(mooiGetal('100.28', 'index'), '100,28 index')
  assert.equal(mooiGetal('25144', 'miljoen euro'), '25.144 miljoen euro')
  assert.equal(mooiGetal('0.14', 'procent'), '0,14 procent')
  assert.equal(mooiGetal('', 'procent'), '')
})

test('de versheid zegt per wachter of hij zijn ritme haalt', () => {
  const nu = new Date('2026-11-12T12:00:00Z')
  const lijst = [
    { id: 1, domein: 'politiek', bron_url: 'https://a.be', zin: 'iets', bron_datum: '2026-11-11', status: 'te_controleren' },
    { id: 2, domein: 'macro', bron_url: 'https://b.be', zin: 'iets', bron_datum: '2026-10-01', status: 'te_controleren' },
    { id: 3, domein: 'markten', bron_url: 'https://c.be', zin: 'iets', bron_datum: '2026-05-01', status: 'bevestigd' },
  ]
  const vers = versheidPerDomein(lijst, { nu })
  const perId = Object.fromEntries(vers.map((v) => [v.id, v]))
  assert.equal(perId.politiek.stand, 'vers')
  assert.equal(perId.macro.stand, 'let op')
  assert.equal(perId.markten.stand, 'verouderd')
  assert.equal(perId.fiscaliteit.stand, 'leeg')
  assert.equal(perId.politiek.ritme, 'dagelijks')
  assert.equal(vers.length, 6)
})

test('de versheid telt alleen echte signalen mee', () => {
  const vers = versheidPerDomein([{ domein: 'macro', zin: '', bron_url: 'https://a.be' }], { nu: new Date('2026-11-12T12:00:00Z') })
  assert.equal(vers.find((v) => v.id === 'macro').stand, 'leeg')
})

test('de versheid zegt het in gewone taal', () => {
  const nu = new Date('2026-11-12T12:00:00Z')
  const vers = versheidPerDomein([{ id: 1, domein: 'politiek', bron_url: 'https://a.be', zin: 'iets', bron_datum: '2026-11-12T08:00:00Z' }], { nu })
  assert.equal(versheidsTekst(vers.find((v) => v.id === 'politiek')), 'vandaag bijgewerkt')
  assert.equal(versheidsTekst(vers.find((v) => v.id === 'macro')), 'nog niets gevonden')
})
