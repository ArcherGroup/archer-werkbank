import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'

let vite, DocPagina, basisDom, basisGlobals
before(async()=>{
  basisGlobals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  globalThis.fetch = async () => { throw new Error('Externe verbinding geblokkeerd in commentcomponenttest') }
  basisDom = new JSDOM('', { url: 'http://localhost/' })
  globalThis.window = basisDom.window; globalThis.document = basisDom.window.document
  globalThis.__commentDocSb = { from(table) {
    const q = { select(){return q},eq(){return q},order(){return q},range(){return q},limit(){return q},insert(){return q},
      single:async()=>({data:globalThis.__commentDocFixture,error:null}),maybeSingle:async()=>({data:null,error:null}),
      then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)} }
    return q
  } }
  const fixturePlugin = { name:'comment-document-fixture', enforce:'pre', resolveId(source){if(/(?:^|\/)supabase(?:\.js)?$/.test(source))return '\0comment-sb-fixture'},load(id){if(id==='\0comment-sb-fixture')return 'export const sb=globalThis.__commentDocSb;export const FUNCTIES="http://localhost";export const SB_KEY="fictief";'} }
  vite=await createServer({configFile:false,plugins:[fixturePlugin,react()],logLevel:'silent',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'})
  ;({DocPagina}=await vite.ssrLoadModule('/src/pages/document.jsx'))
})
after(async()=>{
  Object.assign(globalThis,basisGlobals);basisDom?.window.close()
  await vite?.close()
  delete globalThis.__commentDocSb; delete globalThis.__commentDocFixture
})

test('een stuk opent met een volledig gesprek en een directe selectieactie, zonder oude popover',async()=>{
  const dom=new JSDOM('<div id="test"></div>',{url:'http://localhost/archer-werkbank/#/doc/16',pretendToBeVisual:true})
  const oud=Object.fromEntries(['window','document','localStorage','fetch','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,globalThis[k]]))
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,requestAnimationFrame:(f)=>setTimeout(()=>f(performance.now()),0),cancelAnimationFrame:clearTimeout,IS_REACT_ACT_ENVIRONMENT:true})
  const inhoud='## Kosten\n\nEen belegger kent zijn **jaarlijkse kosten** en kiest bewust.'
  globalThis.__commentDocFixture = { id:16, titel:'spreektekst', blok_id:'1.3', inhoud, versie:2 }
  globalThis.fetch=async(input)=>{
    const u=new URL(typeof input==='string'?input:input.url||String(input))
    if(u.pathname.endsWith('/documenten'))return new Response(JSON.stringify({id:16,titel:'spreektekst',blok_id:'1.3',inhoud,versie:2}),{status:200,headers:{'Content-Type':'application/json'}})
    if(u.pathname.endsWith('/notities')||u.pathname.endsWith('/klikplekken'))return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}})
    throw new Error('Geen externe verbinding toegestaan in deze test: '+u.pathname)
  }
  const root=createRoot(document.getElementById('test'))
  try {
    await act(async()=>{root.render(React.createElement(DocPagina,{docId:16,naam:'Lezer',blokken:[{id:'1.3'}],bronnen:[],gedeeldeComments:[{id:1,doel_type:'document',doel_id:'16',auteur:'Eerste',tekst:'De hoofdvraag',anker:'jaarlijkse kosten'},{id:2,parent_id:1,doel_type:'document',doel_id:'16',auteur:'Tweede',tekst:'Een volledig antwoord'}]}));await new Promise(r=>setTimeout(r,40))})
    assert.match(document.body.textContent,/De hoofdvraag/)
    assert.match(document.body.textContent,/Een volledig antwoord/)
    assert.equal(document.querySelector('.comment-pop'),null)
    assert.ok(document.querySelector('article.md button.comment-pin'))
    act(()=>document.querySelector('article.md button.comment-pin').click())
    assert.ok(document.querySelector('.doc-inspector.open'))
    assert.match(document.querySelector('.doc-inspector').textContent,/Een volledig antwoord/)
  } finally {act(()=>root.unmount());Object.assign(globalThis,oud);dom.window.close()}
})
