import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/archer-werkbank/',
  plugins: [react()],
  build: { outDir: 'docs' },
})
