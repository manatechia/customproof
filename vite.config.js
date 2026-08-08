import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/* Sirve api/*.js (handlers web-standard GET/POST) bajo /api en `vite dev`,
   imitando a Vercel. En producción las funciones las sirve Vercel. */
function apiDev() {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      for (const [k, v] of Object.entries(env)) process.env[k] ??= v

      server.middlewares.use('/api', (req, res) => {
        (async () => {
          const name = (req.url || '/').split('?')[0].replace(/^\/+|\/+$/g, '')
          if (!/^[\w-]+$/.test(name)) { res.statusCode = 404; return res.end('Not found') }
          let mod
          try {
            mod = await server.ssrLoadModule(`/api/${name}.js`)
          } catch (e) {
            if (/Failed to load|not found/i.test(e.message)) { res.statusCode = 404; return res.end('Not found') }
            throw e
          }
          const handler = mod[req.method]
          if (!handler) { res.statusCode = 405; return res.end('Method not allowed') }
          const chunks = []
          for await (const c of req) chunks.push(c)
          const request = new Request(`http://${req.headers.host}/api${req.url}`, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
          })
          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        })().catch((e) => {
          console.error(`[api-dev] ${req.method} /api${req.url}:`, e)
          res.statusCode = 500
          res.end('Internal error')
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiDev()],
  server: { port: process.env.PORT ? Number(process.env.PORT) : 5173 },
})
