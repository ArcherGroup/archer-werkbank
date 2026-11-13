import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

let vite, Overdracht
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try { ({ CommentOverdracht: Overdracht } = await vite.ssrLoadModule('/src/components/comment-overdracht.jsx')) }
  catch (e) { if (!/Failed to load|Cannot find|does not exist/.test(e.message)) throw e }
})
after(async () => { await vite?.close() })

test('lokale comments kunnen bewust meegenomen worden zonder bij renderen te delen', () => {
  assert.equal(typeof Overdracht, 'function', 'De overdracht van lokale naar gedeelde comments ontbreekt')
  let calls = 0
  const html = renderToStaticMarkup(React.createElement(Overdracht, { aantal: 0, opImport: () => { calls++ } }))
  assert.match(html, /Comments meenemen/)
  assert.match(html, /Importeren/)
  assert.match(html, /Exporteren/)
  assert.match(html, /disabled/)
  assert.equal(calls, 0)
})

test('de overdracht gebruikt bestaande lichte en donkere themakleuren', () => {
  const css = readFileSync(new URL('../src/components/comment-overdracht.css', import.meta.url), 'utf8')
  const tokens = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const bestaand = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  for (const match of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(bestaand.has(match[1]), `Onbekend token ${match[1]}`)
})

async function metScherm(fn) {
  const dom = new JSDOM('<div id="test"></div>', { url: 'http://localhost:9011/' })
  const oud = { window:globalThis.window, document:globalThis.document, IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const root=createRoot(document.getElementById('test'))
  try { await fn(root,dom.window) }
  finally { act(()=>root.unmount());Object.assign(globalThis,oud);dom.window.close() }
}
const exportInhoud=JSON.stringify({type:'werkbank-comment-wachtrij',versie:1,kaart:{},items:[{lokaal_id:'lokaal-eigen-bericht',doel_type:'document',doel_id:'16',auteur:'Lezer',tekst:'Een eigen comment',parent_id:null,created_at:'2026-11-13T11:00:00Z'}]})

async function kiesBestand(win, inhoud) {
  const input=document.querySelector('input[type=file]')
  Object.defineProperty(input,'files',{configurable:true,value:[{name:'comments.json',size:inhoud.length,text:async()=>inhoud}]})
  await act(async()=>{input.dispatchEvent(new win.Event('change',{bubbles:true}));await Promise.resolve()})
}

test('een import toont eerst de omvang en deelt pas na de expliciete bevestiging',async()=>metScherm(async(root,win)=>{
  const calls=[]
  act(()=>root.render(React.createElement(Overdracht,{aantal:0,opImport:async(inhoud)=>{calls.push(inhoud);return {bericht:'Import is gecontroleerd'}}})))
  await kiesBestand(win,exportInhoud)
  assert.match(document.body.textContent,/1 bericht/)
  assert.equal(calls.length,0)
  const bevestig=[...document.querySelectorAll('button')].find(b=>b.textContent==='Importeer en deel')
  await act(async()=>{bevestig.click();await Promise.resolve()})
  assert.deepEqual(calls,[exportInhoud])
  assert.match(document.querySelector('[role=status]').textContent,/gecontroleerd/)
}))

test('een ongeldig bestand wordt helemaal geweigerd zonder import of delen',async()=>metScherm(async(root,win)=>{
  let calls=0
  act(()=>root.render(React.createElement(Overdracht,{opImport:()=>{calls++}})))
  await kiesBestand(win,'{"type":"anders"}')
  assert.match(document.querySelector('[role=alert]').textContent,/niets geïmporteerd/)
  assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='Importeer en deel'),false)
  assert.equal(calls,0)
}))
