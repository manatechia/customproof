/* Genera las imágenes optimizadas de public/ a partir de los originales de assets/.
 *
 * No corre en el build: sharp pesa y las fuentes casi no cambian. Se corre a mano
 * con `npm run images` cuando se toca una imagen, y la salida se commitea.
 *
 * hero: AVIF + WebP + JPG en 700px (móvil) y 1200px (desktop en retina), servidos
 *       con <picture> + srcset desde App.jsx.
 * logo: PNG re-encodeado, mismas dimensiones (lo escala el CSS por altura).
 * favicon: el smiley de la marca (el mismo SVG que SmileyIcon) como .svg, más un
 *       PNG de 180px para iOS, que no soporta favicons SVG.
 */
import sharp from 'sharp'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'assets')
const OUT = join(ROOT, 'public')

const HERO_WIDTHS = [700, 1200]

/* El smiley guiñando de la marca. Debe seguir a SmileyIcon en src/components/Icons.jsx */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#ffcc29"/>
  <ellipse cx="35" cy="37" rx="7.5" ry="12" transform="rotate(-14 35 37)" fill="#111"/>
  <path d="M60 39 q9 -9 19 -4 q-8 1 -11 7" fill="none" stroke="#111" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 57 q-3 4 1 6 q26 22 53 1 q4 -3 0 -7" fill="none" stroke="#111" stroke-width="7" stroke-linecap="round"/>
</svg>
`

const kB = (n) => (n / 1024).toFixed(1) + ' kB'
const report = []

async function emit(name, buffer) {
  await writeFile(join(OUT, name), buffer)
  report.push([name, buffer.length])
}

/* ---- hero ---- */
const heroSrc = sharp(join(SRC, 'hero.jpg'))
const heroMeta = await heroSrc.metadata()
for (const w of HERO_WIDTHS) {
  const base = () => sharp(join(SRC, 'hero.jpg')).resize({ width: w, withoutEnlargement: true })
  await emit(`hero-${w}.avif`, await base().avif({ quality: 52 }).toBuffer())
  await emit(`hero-${w}.webp`, await base().webp({ quality: 76 }).toBuffer())
  await emit(`hero-${w}.jpg`, await base().jpeg({ quality: 78, mozjpeg: true, progressive: true }).toBuffer())
}

/* ---- og:image ----
   1200x630 es la proporción que esperan WhatsApp, Facebook y X. El hero es casi
   cuadrado, así que servirlo tal cual hacía que lo recortaran a ojo. */
await emit(
  'og.jpg',
  await sharp(join(SRC, 'hero.jpg'))
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
)

/* ---- logo ---- */
await emit(
  'logo.png',
  await sharp(join(SRC, 'logo.png')).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer()
)

/* ---- favicon ---- */
await writeFile(join(OUT, 'favicon.svg'), FAVICON_SVG)
report.push(['favicon.svg', Buffer.byteLength(FAVICON_SVG)])
await emit('apple-touch-icon.png', await sharp(Buffer.from(FAVICON_SVG)).resize(180, 180).png().toBuffer())

/* ---- resumen ---- */
const origHero = (await stat(join(SRC, 'hero.jpg'))).size
const origLogo = (await stat(join(SRC, 'logo.png'))).size
console.log(`hero original: ${heroMeta.width}x${heroMeta.height}, ${kB(origHero)}`)
console.log(`logo original: ${kB(origLogo)}\n`)
for (const [name, size] of report) console.log(`  ${name.padEnd(24)} ${kB(size).padStart(9)}`)

const bestHero = report.find(([n]) => n === `hero-${HERO_WIDTHS.at(-1)}.avif`)[1]
const newLogo = report.find(([n]) => n === 'logo.png')[1]
console.log(
  `\nhero 1200 AVIF vs original: ${kB(origHero)} -> ${kB(bestHero)} (-${Math.round((1 - bestHero / origHero) * 100)}%)`
)
console.log(`logo.png: ${kB(origLogo)} -> ${kB(newLogo)} (-${Math.round((1 - newLogo / origLogo) * 100)}%)`)
