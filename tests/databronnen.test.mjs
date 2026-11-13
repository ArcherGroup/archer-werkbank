import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const configPad = new URL('../config/projecten.json', import.meta.url)
function config() {
  assert.ok(existsSync(configPad), 'Een gedeelde bronmapping voor app en wachters ontbreekt')
  return JSON.parse(readFileSync(configPad, 'utf8'))
}

test('de werkbank schrijft alleen in haar eigen intranetschema', () => {
  const c = config()
  assert.equal(c.werkbank.project, 'znqcljyroirxvvllhygu')
  assert.equal(c.werkbank.url, 'https://znqcljyroirxvvllhygu.supabase.co')
  assert.equal(c.werkbank.schema, 'werkbank')
})

test('Invest V0 is uitsluitend de read-only deelnemersbron', () => {
  const c = config()
  assert.equal(c.invest.project, 'pgajmjeicrwxthkwwiei')
  assert.equal(c.invest.alleenLezen, true)
  assert.notEqual(c.werkbank.project, c.invest.project)
})

test('de browser gebruikt de gedeelde werkbankmapping en geen verouderd project', () => {
  const tekst = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  assert.match(tekst, /config\/projecten\.json/)
  assert.doesNotMatch(tekst, /thbjzrdogebyhbkkbxzp|pgajmjeicrwxthkwwiei/)
  assert.match(tekst, /VITE_WERKBANK_SLEUTEL/)
})

test('de actualiteitswachter gebruikt dezelfde projectmapping zonder oude sleutel', () => {
  const tekst = readFileSync(new URL('../agent/actualiteit/wacht.py', import.meta.url), 'utf8')
  assert.match(tekst, /config.*projecten\.json/)
  assert.doesNotMatch(tekst, /thbjzrdogebyhbkkbxzp|pgajmjeicrwxthkwwiei|sb_publishable_[A-Za-z0-9_-]+/)
})
