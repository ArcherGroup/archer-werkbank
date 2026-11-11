import { test } from 'node:test'
import assert from 'node:assert/strict'

async function laad() {
  try { return await import('../src/lib/navigatie.js') } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
    throw e
  }
}

test('de al actieve route kiezen verandert geen goedkeuringsstatus, ook niet bij klad', async () => {
  const module = await laad()
  assert.equal(typeof module.beoordeelNavigatie, 'function', 'routecontrole ontbreekt')
  assert.equal(module.beoordeelNavigatie('#/', '#/', false), 'geen')
  assert.equal(module.beoordeelNavigatie('#/', '#/', true), 'geen')
  assert.equal(module.beoordeelNavigatie('#/', '', false), 'geen')
})

test('een andere route vraagt alleen bevestiging bij onbewaarde tekst', async () => {
  const module = await laad()
  assert.equal(typeof module.beoordeelNavigatie, 'function')
  assert.equal(module.beoordeelNavigatie('#/bronnen', '#/', true), 'vraag')
  assert.equal(module.beoordeelNavigatie('#/bronnen', '#/', false), 'ga')
  assert.equal(module.beoordeelNavigatie('', '#/', true), 'geen')
})
