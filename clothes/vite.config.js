import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* clothes.customproof.es es un sitio aparte, pero el catálogo es el mismo de
   www: en dev /api se pide a producción, igual que el rewrite de vercel.json */
export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5180,
    proxy: { '/api': { target: 'https://www.customproof.es', changeOrigin: true } },
  },
})
