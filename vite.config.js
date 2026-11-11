import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/archer-werkbank/',
  plugins: [react()],
  // Alleen Vite's lokale ontwikkelserver gebruikt deze proxy. De gepubliceerde
  // statische site krijgt geen publiek of betaald agent-endpoint.
  server: {
    proxy: {
      '/archer-werkbank/api/lokaal-onderzoek': {
        target: 'http://127.0.0.1:8983',
        rewrite: (pad) => pad.replace(/^\/archer-werkbank/, ''),
      },
    },
  },
  build: {
    outDir: 'docs',
    rollupOptions: {
      output: {
        // Aparte vendor-chunks: elke chunk blijft onder de waarschuwing en een
        // app-wijziging invalideert de (zeldzaam veranderende) libs niet.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('/motion') || id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('/marked')) return 'vendor-marked'
          if (id.includes('/react') || id.includes('/scheduler')) return 'vendor-react'
        },
      },
    },
  },
})
