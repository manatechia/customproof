import { YELLOW, CELESTE, PINK } from '../src/data.js'

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSdQD5qKGGjpUxYRVF5xKMXsasvhp44BQjNFpzTmjC4nQYdAMS8NOjG1baeZEUMptisyoGG_ieO9DPM/pub?gid=0&single=true&output=csv'

const NAMED_COLORS = {
  amarillo: YELLOW, celeste: CELESTE, azul: CELESTE, rosa: PINK, violeta: PINK,
  /* hex de la paleta vieja que pueda quedar en el sheet */
  '#ffcc00': YELLOW, '#66ffcc': CELESTE, '#cc33ff': PINK,
}
const TINT_CYCLE = [YELLOW, CELESTE, PINK]

/* Parser CSV con soporte de campos entre comillas (comas y saltos de línea internos) */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

const parseNum = (s) => {
  const n = parseFloat(String(s).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function parseTint(value, i) {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return TINT_CYCLE[i % TINT_CYCLE.length]
  return NAMED_COLORS[v] ?? value.trim()
}

/* "etiqueta:precio | etiqueta:precio" -> [{v, p}] */
function parseOpts(value, basePrice) {
  const parts = String(value ?? '').split('|').map((s) => s.trim()).filter(Boolean)
  const opts = []
  for (const part of parts) {
    const sep = part.lastIndexOf(':')
    if (sep === -1) continue
    const p = parseNum(part.slice(sep + 1))
    const v = part.slice(0, sep).trim()
    if (v && p !== null) opts.push({ v, p })
  }
  if (opts.length) return opts
  return basePrice !== null ? [{ v: '', p: basePrice }] : []
}

/* Normaliza la columna `imagen` del sheet:
   - Cloudinary sin transformaciones -> inyecta f_auto,q_auto,w_800 (WebP/AVIF
     automático, calidad optimizada, 800px). Si la URL ya trae transformaciones,
     se respeta tal cual.
   - Enlaces de Google Drive (Compartir …/file/d/<id>/view, open?id=, uc?id= o
     descarga con token) -> CDN público estable. El archivo debe estar compartido
     como "Cualquiera con el enlace". */
function normalizeImg(url) {
  const cl = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/)
  if (cl) {
    const [, base, rest] = cl
    const hasTransforms = /^(?:[a-z]{1,3}_[^,/]+)(?:,[a-z]{1,3}_[^,/]+)*\//.test(rest)
    return hasTransforms ? url : `${base}f_auto,q_auto,w_800/${rest}`
  }
  if (!/^https?:\/\/(drive|docs)\.google\.com|^https?:\/\/drive\.usercontent\.google\.com/.test(url)) return url
  const m = url.match(/\/(?:file\/)?d\/([\w-]{20,})/) || url.match(/[?&]id=([\w-]{20,})/)
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w1200` : url
}

/* Columna `destacado`: cualquier marca (1, sí, x, true, ok…) sube el producto
   al Top de la home. Vacío, no/false/0 = no destacado. El puesto no sale de
   acá: el Top respeta el orden del catálogo. */
const parseDest = (value) => {
  const v = String(value ?? '').trim()
  if (!v || /^(no|false|0)$/i.test(v)) return false
  return parseNum(v) !== null || /^(si|sí|s|x|yes|true|ok|destacado)$/i.test(v)
}

function rowsToProducts(rows) {
  const [header, ...body] = rows
  const col = {}
  header.forEach((name, i) => { col[name.trim().toLowerCase()] = i })
  const get = (row, name) => (col[name] !== undefined ? String(row[col[name]] ?? '').trim() : '')

  const products = []
  body.forEach((row, i) => {
    const activo = get(row, 'activo')
    if (/^(no|false|0)$/i.test(activo)) return
    const name = get(row, 'titulo')
    const price = parseNum(get(row, 'precio'))
    const opts = parseOpts(get(row, 'opciones'), price)
    if (!name || !opts.length) return
    products.push({
      id: get(row, 'id') || `row-${i}`,
      name,
      cat: capitalize(get(row, 'categoria')) || 'Otros',
      tag: get(row, 'tag'),
      tint: parseTint(get(row, 'color'), i),
      img: normalizeImg(get(row, 'imagen')),
      shot: 'foto ' + name.toLowerCase(),
      desc: get(row, 'descripcion'),
      opts,
      orden: parseNum(get(row, 'orden')),
      dest: parseDest(get(row, 'destacado')),
    })
  })
  if (products.some((p) => p.orden !== null)) {
    products.sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity))
  }
  return products
}

/* Lanza en fallo: quien llama decide si un catálogo caído es 502 o [] */
export async function fetchCatalogFromSheet() {
  /* El CSV publicado se sirve desde una caché de Google que puede quedar horas
     desactualizada (columnas nuevas o celdas recién cargadas llegan vacías).
     El parámetro único la esquiva; el cacheo real lo hace /api/products. */
  const res = await fetch(`${SHEET_URL}&cb=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`)
  return rowsToProducts(parseCsv(await res.text()))
}
