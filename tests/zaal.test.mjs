import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ZAAL, gemiddeldeVanZaal, somVanVerdeling, euro, taartStukken, donutPad } from '../src/lib/zaal.js'

test('het gemiddelde van de zaal is de som gedeeld door wie invulde', () => {
  assert.equal(gemiddeldeVanZaal(), 262548)
  assert.equal(ZAAL.project, 'pgajmjeicrwxthkwwiei')
  assert.deepEqual(ZAAL.steekproef, { ingevuld: 10, totaal: 24 })
  assert.equal(ZAAL.som, 2625482.31)
  assert.equal(gemiddeldeVanZaal({ steekproef: { ingevuld: 0 }, som: 100 }), null)
  assert.equal(gemiddeldeVanZaal({}), null)
})

test('de verdeling telt op tot wat de bron zegt, niet tot honderd', () => {
  assert.ok(Math.abs(somVanVerdeling(ZAAL.verdeling) - 100.1) < 0.00001)
  assert.equal(somVanVerdeling([]), 0)
})

test('een bedrag wordt gelezen zoals een mens het leest', () => {
  assert.equal(euro(212413), '€ 212.413')
  assert.equal(euro(2336538), '€ 2.336.538')
  assert.equal(euro(NaN), '')
})

test('de taart begint bovenaan en dekt samen de hele cirkel', () => {
  const stukken = taartStukken(ZAAL.verdeling)
  assert.equal(stukken[0].van, 0)
  assert.equal(Math.round(stukken[stukken.length - 1].tot), 360)
  assert.ok(stukken[0].tot > 180, 'cash is meer dan de helft')
  const som = stukken.reduce((t, s) => t + s.percentage, 0)
  assert.ok(Math.abs(som - 100) < 0.2, `percentages tellen op tot ${som}`)
})

test('een post van nul procent krijgt geen stuk', () => {
  const stukken = taartStukken(ZAAL.verdeling)
  const pe = stukken.find((s) => s.naam === 'Private equity')
  assert.equal(pe.tot, pe.van)
  assert.equal(donutPad(pe), '', 'een leeg stuk heeft geen pad')
})

test('een donutpad is een gesloten vorm met twee bogen', () => {
  const stukken = taartStukken(ZAAL.verdeling)
  const pad = donutPad(stukken[0])
  assert.ok(pad.startsWith('M '))
  assert.ok(pad.endsWith('Z'))
  assert.equal((pad.match(/A /g) || []).length, 2)
})

test('zonder verdeling is er geen taart', () => {
  assert.deepEqual(taartStukken([]), [])
  assert.deepEqual(taartStukken([{ naam: 'x', deel: 0 }]), [])
})