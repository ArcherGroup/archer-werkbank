import { test } from 'node:test'
import assert from 'node:assert/strict'

async function laad() {
  try { return await import('../src/lib/beslissing-review.js') }
  catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e }
}

const documenten = [
  { id: 75, blok_id: 'algemeen', titel: 'masterplan-februari-2027', versie: 1 },
  { id: 72, blok_id: '4.4', titel: 'spreektekst', versie: 1 },
  { id: 74, blok_id: 'algemeen', titel: 'criteria', versie: 1 },
  { id: 73, blok_id: '4.4', titel: 'werkboek', versie: 1 },
  { id: 66, blok_id: '4.4', titel: 'A3-template-vermogensplan', versie: 1 },
]

test('de GGR-vraag verwijst naar de juiste bronstukken en niet naar een ander dagdeel', async () => {
  const m = await laad()
  assert.equal(typeof m.bronnenVoorBeslissing, 'function')
  const bronnen = m.bronnenVoorBeslissing({ titel: 'Het GGR-anker' }, documenten)
  assert.deepEqual(bronnen.map((b) => b.document?.id), [75, 72])
  const ontbrekend = m.bronnenVoorBeslissing({ titel: 'Het GGR-anker' }, documenten.filter((d) => d.id !== 72))
  assert.equal(ontbrekend[1].document, null)
})

test('een bronstuk toont welke beslissingen ernaar verwijzen', async () => {
  const m = await laad()
  assert.equal(typeof m.beslissingenBijDocument, 'function')
  const beslissingen = [{ id: 1, titel: 'Het GGR-anker' }, { id: 2, titel: 'De acht criteria' }, { id: 3, titel: 'Het A3-template vermogensplan' }]
  assert.deepEqual(m.beslissingenBijDocument(documenten[1], beslissingen).map((b) => b.id), [1])
  assert.deepEqual(m.beslissingenBijDocument(documenten[3], beslissingen).map((b) => b.id), [3])
  assert.deepEqual(m.beslissingenBijDocument({ blok_id: '2.1', titel: 'werkboek' }, beslissingen), [])
  const dubbel = [...documenten, { id: 772, blok_id: '4.4', titel: 'spreektekst' }]
  assert.deepEqual(m.beslissingenBijDocument(documenten[1], beslissingen, dubbel), [], 'ambigue bronverwijzingen tonen geen valse backlink')
})

test('de werkbank maakt een leesbare brontabel zonder rijen te verzinnen', async () => {
  const m = await laad()
  assert.equal(typeof m.leesBrontabel, 'function')
  const bron = '| Nr | Vraag |\n|---|---|\n| **1** | [Liquiditeit](https://example.org) |\n| 2 | Risico |'
  assert.deepEqual(m.leesBrontabel(bron), { koppen: ['Nr', 'Vraag'], rijen: [['1', 'Liquiditeit'], ['2', 'Risico']] })
  assert.deepEqual(m.leesBrontabel('Geen tabel aanwezig'), { koppen: [], rijen: [] })
  const tweeTabellen = `${bron}\n\nToelichting\n\n| Andere | Tabel |\n|---|---|\n| 3 | Vermijd samenvoegen |`
  assert.equal(m.leesBrontabel(tweeTabellen).rijen.length, 2)
})

test('het GGR-dossier presenteert twee brongebonden opties en een eigen keuze', async () => {
  const m = await laad()
  assert.equal(typeof m.optiesVoorBeslissing, 'function')
  const opties = m.optiesVoorBeslissing({ titel: 'Het GGR-anker' })
  assert.deepEqual(opties.map((o) => o.id), ['ggr-03', 'ggr-06', 'eigen'])
  assert.match(opties[0].titel, /0,3/)
  assert.match(opties[1].titel, /0,6/)
  assert.equal(opties[0].bron, 'ggr')
  assert.equal(opties[1].bron, 'ggr')
  assert.equal(opties[2].bron, null)
})

test('brongebonden opties zijn niet selecteerbaar zonder passende actuele bron', async () => {
  const m = await laad()
  assert.equal(typeof m.bewijsAanwezig, 'function')
  const [a, b, eigen] = m.optiesVoorBeslissing({ titel: 'Het GGR-anker' })
  assert.equal(m.bewijsAanwezig(undefined, ''), false)
  assert.equal(m.bewijsAanwezig(a, ''), false)
  assert.equal(m.bewijsAanwezig(b, '0,3 als anker; geen tweede getal'), false)
  assert.equal(m.bewijsAanwezig(a, 'Het GGR-anker is 0,3; de 0,6 hoort bij een andere mix.'), true)
  assert.equal(m.bewijsAanwezig(eigen, ''), true)
})
