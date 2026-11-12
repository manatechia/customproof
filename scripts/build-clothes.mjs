/* Compila la tienda de ropa (clothes/, app aparte con su propio package.json)
 * y la copia a dist/clothes, para servirla en www.customproof.es/clothes/.
 *
 * Igual que el prerender: si algo falla, la web principal se despliega igual,
 * solo que sin /clothes. Una prueba de concepto no debe romper el deploy.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'clothes')
const OUT = join(ROOT, 'dist', 'clothes')

try {
  const run = (cmd) => execSync(cmd, { cwd: APP, stdio: 'inherit' })
  /* En Vercel el repo llega limpio; en local ya están instaladas (y el dev
     server puede tener archivos tomados, así que no se reinstalan) */
  if (!existsSync(join(APP, 'node_modules'))) run('npm ci --no-audit --no-fund')
  run('npm run build')
  await rm(OUT, { recursive: true, force: true })
  await cp(join(APP, 'dist'), OUT, { recursive: true })
  console.log('[clothes] copiada a dist/clothes')
} catch (e) {
  console.warn('[clothes] no se pudo compilar; la web sigue sin /clothes:', e.message)
}
