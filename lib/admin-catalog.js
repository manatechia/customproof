import { readRange, updateCells, writeRange, catalogTabName, ensureTab, tabRange } from './sheets.js'
import { splitImgs } from './catalog.js'

/* Lógica del admin sobre la hoja del catálogo y la pestaña Categorias.
   Los endpoints (api/admin-*.js) solo validan sesión y arman la respuesta. */

const CATEGORIAS_TAB = 'Categorias'

/* 0 -> A, 25 -> Z, 26 -> AA */
const colLetter = (i) => (i < 26 ? '' : colLetter(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26))

const isOff = (v) => /^(no|false|0)$/i.test(String(v ?? '').trim())

/* Mismo criterio que parseSubs de lib/catalog.js: coma o |, sin repetir */
export function splitSubs(value) {
  const seen = new Set()
  const out = []
  for (const part of (Array.isArray(value) ? value : String(value ?? '').split(/[,|]/))) {
    const s = String(part).trim()
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s) }
  }
  return out
}

/* Con USER_ENTERED, "3/4" se vuelve fecha y "=…" una fórmula. El apóstrofo
   fuerza texto y Sheets no lo guarda como parte del valor. */
const asText = (s) => (s ? `'${s}` : '')

const oneLine = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

const parseNum = (v) => {
  const n = parseFloat(String(v ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/* Columnas que el admin puede escribir: cada una valida y devuelve lo que va
   a la celda. Una columna que no esté acá no se toca nunca desde la web. */
const FIELDS = {
  titulo: (v) => {
    const s = oneLine(v, 120)
    return s ? { cell: asText(s) } : { error: 'El título no puede quedar vacío' }
  },
  categoria: (v) => ({ cell: asText(oneLine(v, 60)) }),
  subcategorias: (v) => ({ cell: asText(splitSubs(v).map((s) => s.slice(0, 60)).join(', ')) }),
  precio: (v) => {
    const n = parseNum(v)
    if (n === null || n < 0 || n > 100000) return { error: 'El precio tiene que ser un número' }
    /* Con coma: la hoja está en locale ES y así la cargan a mano */
    return { cell: n.toFixed(2).replace('.', ',') }
  },
  descripcion: (v) => ({ cell: asText(String(v ?? '').trim().slice(0, 1500)) }),
  tag: (v) => ({ cell: asText(oneLine(v, 40)) }),
  color: (v) => ({ cell: asText(oneLine(v, 30)) }),
  /* Varias fotos van en la misma celda separadas por " | " (ver splitImgs) */
  imagen: (v) => {
    const urls = splitImgs(Array.isArray(v) ? v.join('|') : v)
    if (urls.length > 10) return { error: 'Máximo 10 fotos por artículo' }
    const bad = urls.find((u) => !/^https:\/\/\S+$/.test(u) || u.length > 1000)
    if (bad) return { error: `Esta URL no empieza con https://: ${bad.slice(0, 60)}` }
    return { cell: asText(urls.join(' | ')) }
  },
  /* Vacío = activo, que es como lo lee la tienda */
  activo: (v) => ({ cell: v === false || isOff(v) ? 'no' : '' }),
  destacado: (v) => ({ cell: v === true || v === 'x' ? 'x' : '' }),
  orden: (v) => {
    if (String(v ?? '').trim() === '') return { cell: '' }
    const n = parseNum(v)
    return n === null ? { error: 'El orden tiene que ser un número' } : { cell: String(n).replace('.', ',') }
  },
}

/* Valida un objeto { campo: valor } y devuelve { cells: { campo: celda } } o { error } */
export function validateFields(fields) {
  const cells = {}
  for (const [name, value] of Object.entries(fields ?? {})) {
    if (!Object.hasOwn(FIELDS, name)) return { error: `El campo "${name}" no se puede editar` }
    const r = FIELDS[name](value)
    if (r.error) return { error: r.error }
    cells[name] = r.cell
  }
  return { cells }
}

/* Lee la pestaña del catálogo por la API autenticada y no por el CSV
   publicado: el CSV puede venir atrasado y acá necesitamos lo que hay ahora.

   Cada producto necesita un id único para que el admin ubique su fila aunque
   alguien reordene la hoja a mano. Si falta, se asigna acá con el número de
   fila (y si ese número ya lo usa otro, el siguiente libre). La columna id
   es la que se llama "id", o la A si su cabecera está vacía. */
export async function readCatalog() {
  const tab = await catalogTabName()
  const rows = await readRange(tabRange(tab, 'A1:ZZ'))
  const header = rows[0] ?? []
  const col = {}
  header.forEach((name, i) => { const k = String(name).trim().toLowerCase(); if (k && col[k] === undefined) col[k] = i })
  if (col.titulo === undefined) throw new Error('La hoja del catálogo no tiene columna "titulo"')

  const writes = []
  /* Primera vez (la columna todavía sin cabecera): se numera todo por fila,
     incluidos los ids cargados a mano, para que id y fila arranquen iguales */
  const firstTime = col.id === undefined
  if (firstTime) {
    if (String(header[0] ?? '').trim() !== '') throw new Error('La hoja no tiene columna "id" y la A ya se usa para otra cosa')
    col.id = 0
    writes.push({ range: tabRange(tab, 'A1'), value: 'id' })
    rows.forEach((row, i) => {
      if (i > 0 && String(row[col.titulo] ?? '').trim() && String(row[0] ?? '').trim() !== String(i + 1)) row[0] = ''
      /* Filas sin producto: un id suelto ahí bloquearía ese número */
      if (i > 0 && !String(row[col.titulo] ?? '').trim()) row[0] = ''
    })
  }

  const cell = (row, name) => (col[name] !== undefined ? String(row[col[name]] ?? '').trim() : '')
  const taken = new Set(rows.slice(1).map((r) => cell(r, 'id')).filter(Boolean))
  let next = Math.max(rows.length, ...[...taken].map(Number).filter(Number.isInteger)) + 1

  const products = []
  rows.forEach((row, i) => {
    if (i === 0 || !cell(row, 'titulo')) return
    let id = cell(row, 'id')
    if (!id) {
      id = taken.has(String(i + 1)) ? String(next++) : String(i + 1)
      taken.add(id)
      row[col.id] = id
      writes.push({ range: tabRange(tab, `${colLetter(col.id)}${i + 1}`), value: id })
    }
    products.push({
      fila: i + 1,
      id,
      titulo: cell(row, 'titulo'),
      categoria: cell(row, 'categoria'),
      subcategorias: splitSubs(cell(row, 'subcategorias')),
      precio: cell(row, 'precio'),
      descripcion: cell(row, 'descripcion'),
      tag: cell(row, 'tag'),
      color: cell(row, 'color'),
      imagen: cell(row, 'imagen'),
      activo: !isOff(cell(row, 'activo')),
      destacado: Boolean(cell(row, 'destacado')) && !isOff(cell(row, 'destacado')),
      orden: cell(row, 'orden'),
    })
  })
  await updateCells(writes)

  /* Ids repetidos (cargados a mano): esas filas no se pueden editar sin riesgo */
  const count = {}
  products.forEach((p) => { count[p.id] = (count[p.id] ?? 0) + 1 })
  products.forEach((p) => { p.editable = count[p.id] === 1 })

  return { tab, rows, col, products, assigned: writes.filter((w) => w.value !== 'id').length, nextId: () => String(next++), lastRow: rows.length }
}

/* Escribe varias filas a la vez: edits = [{ id, cells: { campo: celda } }] */
export async function writeProducts(edits) {
  const { tab, col, products } = await readCatalog()
  const byId = new Map(products.map((p) => [p.id, p]))
  const writes = []
  for (const { id, cells } of edits) {
    const p = byId.get(id)
    if (!p) return { error: `El producto ${id} ya no está en la hoja`, status: 409 }
    if (!p.editable) return { error: `El id ${id} está repetido en la hoja`, status: 409 }
    for (const [name, value] of Object.entries(cells)) {
      if (col[name] === undefined) return { error: `La hoja no tiene columna "${name}"`, status: 409 }
      writes.push({ range: tabRange(tab, `${colLetter(col[name])}${p.fila}`), value })
    }
  }
  await updateCells(writes)
  return { ok: true }
}

/* Alta: la fila nueva va justo después de la última con contenido */
export async function addProduct(cells) {
  const cat = await readCatalog()
  const { tab, col, lastRow } = cat
  const fila = lastRow + 1
  const id = cat.nextId()
  const writes = [{ range: tabRange(tab, `${colLetter(col.id)}${fila}`), value: id }]
  for (const [name, value] of Object.entries(cells)) {
    if (col[name] === undefined) return { error: `La hoja no tiene columna "${name}"`, status: 409 }
    writes.push({ range: tabRange(tab, `${colLetter(col[name])}${fila}`), value })
  }
  await updateCells(writes)
  return { ok: true, id, fila }
}

/* Pestaña Categorias: categoria | subcategoria, una fila por par. Una
   categoría sin subcategorías va con la segunda columna vacía. La primera
   vez se crea a partir de lo que ya usan los productos. */
export async function readCategories(products) {
  const created = await ensureTab(CATEGORIAS_TAB)
  if (created) {
    const seed = []
    for (const p of products) {
      if (!p.categoria) continue
      let c = seed.find((x) => x.name.toLowerCase() === p.categoria.toLowerCase())
      if (!c) seed.push((c = { name: p.categoria, subs: [] }))
      c.subs = splitSubs([...c.subs, ...p.subcategorias])
    }
    await saveCategories(seed)
    return normalizeCategories(seed)
  }
  const rows = await readRange(`${CATEGORIAS_TAB}!A2:B`)
  const list = []
  for (const [cat = '', sub = ''] of rows) {
    const name = cat.trim()
    if (!name) continue
    let c = list.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!c) list.push((c = { name, subs: [] }))
    if (sub.trim()) c.subs = splitSubs([...c.subs, sub])
  }
  return list
}

/* Con mayúscula inicial, como las muestra la tienda (capitalize de lib/catalog.js) */
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function normalizeCategories(list) {
  const out = []
  for (const c of Array.isArray(list) ? list : []) {
    const name = cap(oneLine(c?.name, 60))
    if (!name || out.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue
    out.push({ name, subs: splitSubs(splitSubs(c.subs).map((s) => cap(s.slice(0, 60)))) })
  }
  return out
}

export async function saveCategories(list) {
  const rows = [['categoria', 'subcategoria']]
  for (const c of normalizeCategories(list)) {
    if (!c.subs.length) rows.push([c.name, ''])
    for (const s of c.subs) rows.push([c.name, s])
  }
  await writeRange(`${CATEGORIAS_TAB}!A1:B`, rows)
}
