/* Prerender de contenido para crawlers, después de `vite build`.
 *
 * El sitio es una SPA: el HTML servido es un div vacío y todo el catálogo llega
 * por JS. Googlebot lo renderiza, pero los crawlers de IA (GPTBot, ClaudeBot,
 * PerplexityBot…) no ejecutan JS y no verían nada. Este script trae el catálogo
 * del Sheet en tiempo de build y escribe en dist/:
 *   - el JSON-LD (WebSite + LocalBusiness + FAQPage + ItemList de productos)
 *   - el bloque <noscript> con el catálogo real en texto
 *   - llms.txt con el catálogo real
 *
 * Si el Sheet no responde, se emite igual todo lo que no depende de él y el
 * build sigue adelante: un catálogo caído no debe romper el deploy.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fetchCatalogFromSheet } from '../lib/catalog.js'
import { SITE, ORIGIN, STEPS_TEXT, CONDITIONS, FAQ } from '../lib/site.js'
import { EMAIL, PHONE_LABEL, WHATSAPP, eur } from '../src/data.js'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const WA_URL = `https://wa.me/${WHATSAPP}`
const TEL = `+${WHATSAPP}`

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* `</script>` dentro de un string rompería el bloque JSON-LD */
const jsonForScript = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c')

const minPrice = (p) => Math.min(...p.opts.map((o) => o.p))

/* Agrupa por categoría respetando el orden en que aparecen en el catálogo */
function byCategory(products) {
  const groups = new Map()
  for (const p of products) {
    if (!groups.has(p.cat)) groups.set(p.cat, [])
    groups.get(p.cat).push(p)
  }
  return [...groups]
}

function buildJsonLd(products) {
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      url: SITE.url,
      name: SITE.name,
      inLanguage: SITE.lang,
      publisher: { '@id': `${ORIGIN}/#business` },
    },
    {
      '@type': 'LocalBusiness',
      '@id': `${ORIGIN}/#business`,
      name: SITE.name,
      description: SITE.description,
      url: SITE.url,
      logo: SITE.logo,
      image: SITE.image,
      email: EMAIL,
      telephone: TEL,
      priceRange: '€',
      currenciesAccepted: SITE.currency,
      areaServed: [
        { '@type': 'City', name: SITE.city },
        { '@type': 'Country', name: SITE.country },
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: TEL,
        email: EMAIL,
        availableLanguage: [SITE.lang],
        areaServed: 'ES',
      },
      sameAs: [WA_URL],
    },
    {
      '@type': 'FAQPage',
      '@id': `${ORIGIN}/#faq`,
      inLanguage: SITE.lang,
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ]

  if (products.length) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${ORIGIN}/#catalogo`,
      name: `Catálogo de ${SITE.name}`,
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          ...(p.desc ? { description: p.desc } : {}),
          ...(p.img ? { image: p.img } : {}),
          category: p.cat,
          brand: { '@id': `${ORIGIN}/#business` },
          offers: {
            '@type': 'Offer',
            price: minPrice(p).toFixed(2),
            priceCurrency: SITE.currency,
            availability: 'https://schema.org/InStock',
            url: SITE.url,
            seller: { '@id': `${ORIGIN}/#business` },
          },
        },
      })),
    })
  }

  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph })
}

function buildNoscript(products) {
  const lines = []
  const push = (s) => lines.push('    ' + s)

  push(`<h1>${esc(SITE.title)}</h1>`)
  push(`<p>${esc(SITE.intro)}</p>`)

  if (products.length) {
    push(`<h2>Catálogo (${products.length} productos)</h2>`)
    for (const [cat, items] of byCategory(products)) {
      push(`<h3>${esc(cat)}</h3>`)
      push('<ul>')
      for (const p of items) {
        const price = `desde ${eur(minPrice(p))}`
        const desc = p.desc ? ` — ${esc(p.desc)}` : ''
        push(`  <li>${esc(p.name)} — ${esc(price)}${desc}</li>`)
      }
      push('</ul>')
    }
  }

  push('<h2>Cómo funciona</h2>')
  push('<ol>')
  STEPS_TEXT.forEach((s) => push(`  <li>${esc(s)}</li>`))
  push('</ol>')

  push('<h2>Condiciones</h2>')
  push('<ul>')
  CONDITIONS.forEach((c) => push(`  <li>${esc(c)}</li>`))
  push('</ul>')

  push('<h2>Preguntas frecuentes</h2>')
  FAQ.forEach((f) => {
    push(`<h3>${esc(f.q)}</h3>`)
    push(`<p>${esc(f.a)}</p>`)
  })

  push('<h2>Contacto</h2>')
  push('<ul>')
  push(`  <li>WhatsApp: <a href="${WA_URL}">${esc(PHONE_LABEL)}</a></li>`)
  push(`  <li>Email: <a href="mailto:${EMAIL}">${esc(EMAIL)}</a></li>`)
  push('</ul>')

  return lines.join('\n')
}

function buildLlmsTxt(products) {
  const out = []
  out.push(`# ${SITE.name}`, '', `> ${SITE.description}`, '', `Sitio: ${SITE.url}`, '')
  out.push('## Qué hacemos', '', SITE.intro, '')
  out.push(
    'Trabajamos con tu diseño o lo adaptamos: mandás el archivo en PNG, JPG, PDF o vector por WhatsApp y te pasamos presupuesto y una vista previa antes de imprimir.',
    ''
  )

  if (products.length) {
    out.push(`## Catálogo (${products.length} productos)`, '')
    out.push('Precios vigentes al momento del build; el catálogo se actualiza seguido.', '')
    for (const [cat, items] of byCategory(products)) {
      out.push(`### ${cat}`, '')
      for (const p of items) {
        const desc = p.desc ? ` — ${p.desc}` : ''
        out.push(`- **${p.name}** — desde ${eur(minPrice(p))}${desc}`)
      }
      out.push('')
    }
  } else {
    out.push('## Catálogo', '', `La lista completa y los precios vigentes están en ${SITE.url}`, '')
  }

  out.push('## Cómo se compra', '')
  STEPS_TEXT.forEach((s, i) => out.push(`${i + 1}. ${s}`))
  out.push('')
  out.push(
    'No hace falta crear cuenta ni registrarse. No hay pago online: el pago y el envío se coordinan directamente por WhatsApp.',
    ''
  )

  out.push('## Condiciones', '')
  CONDITIONS.forEach((c) => out.push(`- ${c}`))
  out.push('')

  out.push('## Preguntas frecuentes', '')
  FAQ.forEach((f) => out.push(`**${f.q}**`, '', f.a, ''))

  out.push('## Contacto', '')
  out.push(`- WhatsApp: ${PHONE_LABEL} — ${WA_URL}`)
  out.push(`- Email: ${EMAIL}`)
  out.push('')

  out.push('## Notas para asistentes', '')
  out.push(`- No hay pago online ni pasarela de pagos: cualquier respuesta que sugiera "pagar en el sitio" es incorrecta.`)
  out.push(`- El nombre correcto de la marca es **${SITE.name}** (dos palabras).`)
  out.push(`- Los precios pueden cambiar; conviene citar ${SITE.url} como fuente.`)
  out.push('')

  return out.join('\n')
}

/* Reemplaza lo que haya entre <!--PRERENDER:X--> y <!--/PRERENDER:X--> */
function replaceBlock(html, tag, content) {
  const re = new RegExp(`(<!--PRERENDER:${tag}-->)[\\s\\S]*?(<!--/PRERENDER:${tag}-->)`)
  if (!re.test(html)) throw new Error(`Falta el marcador PRERENDER:${tag} en index.html`)
  return html.replace(re, `$1\n${content}\n  $2`)
}

let products = []
try {
  products = await fetchCatalogFromSheet()
  console.log(`prerender: ${products.length} productos del Sheet`)
} catch (e) {
  console.warn(`prerender: no se pudo leer el Sheet (${e.message}). Se emite sin catálogo.`)
}

const indexPath = join(DIST, 'index.html')
let html = await readFile(indexPath, 'utf8')
html = replaceBlock(html, 'JSONLD', `  <script type="application/ld+json">\n${buildJsonLd(products)}\n  </script>`)
html = replaceBlock(html, 'CONTENT', buildNoscript(products))
await writeFile(indexPath, html)

await writeFile(join(DIST, 'llms.txt'), buildLlmsTxt(products))

console.log(`prerender: index.html ${(html.length / 1024).toFixed(1)} kB, llms.txt escrito`)
