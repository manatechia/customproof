import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* clothes.customproof.es es un sitio aparte, pero el catálogo es el mismo de
   www: en dev /api se pide a producción, igual que el rewrite de vercel.json */
export default defineConfig({
  plugins: [react()],
  /* Por ahora vive en www.customproof.es/clothes/ (lo copia el build de la web
     principal, ver scripts/build-clothes.mjs): todas las rutas cuelgan de ahí */
  base: '/clothes/',
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5180,
    proxy: { '/api': { target: 'https://www.customproof.es', changeOrigin: true } },
  },
})
