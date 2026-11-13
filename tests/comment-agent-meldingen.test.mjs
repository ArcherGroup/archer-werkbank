import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
let vite, AgentComment
before(async () => {
  vite = await createServer({ configFile:false, plugins:[react()], logLevel:'silent', optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true}, appType:'custom' })
  ;({ AgentComment } = await vite.ssrLoadModule('/src/components/agent-comment.jsx'))
})
after(async () => { await vite?.close() })

test('een verouderde conversatie wordt begrijpelijk uitgelegd, niet als technische foutcode', () => {
  const html = renderToStaticMarkup(React.createElement(AgentComment, {
    notitie:{id:1,tekst:'Lees het hele gesprek'},documentId:16,beschikbaar:true,ingelogd:true,
    opdracht:{id:1,status:'mislukt',fout_code:'gesprek_gewijzigd'},opStart:()=>{},
  }))
  assert.match(html,/gesprek is gewijzigd/i)
  assert.doesNotMatch(html,/>gesprek_gewijzigd</)
})
