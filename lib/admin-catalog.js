import { readRange, updateCells, writeRange, clearRanges, batchUpdate, catalogTabName, ensureTab, tabRange } from './sheets.js'
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

/* Fecha y hora de Madrid como texto ordenable: "2026-10-25 14:03" */
const nowMadrid = () =>
  new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', hour12: false }).slice(0, 16)

function fotoDate(imagen) {
  const m = String(imagen).match(/res\.cloudinary\.com\/[^\s|]*?\/v(\d{10})\//)
  return m ? new Date(Number(m[1]) * 1000).toISOString().slice(0, 10) : ''
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
      fecha: cell(row, 'fecha'),
      /* Los productos de antes de la columna fecha no la tienen: la de la foto
         en Cloudinary (/v<segundos>/ en la URL) es la mejor aproximación */
      fechaFoto: fotoDate(cell(row, 'imagen')),
    })
  })
  await updateCells(writes)

  /* Ids repetidos (cargados a mano): esas filas no se pueden editar sin riesgo */
  const count = {}
  products.forEach((p) => { count[p.id] = (count[p.id] ?? 0) + 1 })
  products.forEach((p) => { p.editable = count[p.id] === 1 })

  return { tab, rows, col, products, assigned: writes.filter((w) => w.value !== 'id').length, nextId: () => String(next++), lastRow: rows.length, firstFreeCol: header.length }
}

/* Mover = como arrastrar una fila en Excel: el producto pasa a la fila del
   otro y los del medio se corren uno. Después cada producto del tramo toma
   como id su número de fila nuevo, así la tienda (que muestra primero el id
   más alto) queda en el orden nuevo. Mover y renumerar va en un solo
   batchUpdate: o se aplica todo o nada. */
export async function moveProduct(id, toId) {
  const { rows, col, products } = await readCatalog()
  const p = products.find((x) => x.id === id)
  const q = products.find((x) => x.id === toId)
  if (!p || !q) return { error: 'Ese producto ya no está en la hoja', status: 409 }
  if (!p.editable || !q.editable) return { error: 'Hay un id repetido en la hoja', status: 409 }
  const s = p.fila
  const t = q.fila
  if (s === t) return { ok: true }

  /* Simulación del movimiento para saber qué fila queda con producto */
  const after = rows.slice()
  after.splice(t - 1, 0, after.splice(s - 1, 1)[0])

  const requests = [{
    moveDimension: {
      source: { sheetId: 0, dimension: 'ROWS', startIndex: s - 1, endIndex: s },
      /* El destino se cuenta antes de sacar la fila: bajando, una más */
      destinationIndex: s < t ? t : t - 1,
    },
  }]
  for (let r = Math.min(s, t); r <= Math.max(s, t); r++) {
    if (!String(after[r - 1]?.[col.titulo] ?? '').trim()) continue
    requests.push({
      updateCells: {
        start: { sheetId: 0, rowIndex: r - 1, columnIndex: col.id },
        rows: [{ values: [{ userEnteredValue: { numberValue: r } }] }],
        fields: 'userEnteredValue',
      },
    })
  }
  await batchUpdate(requests)
  return { ok: true, id: String(t) }
}

/* Eliminar = vaciar la fila entera, no borrarla: así las de abajo no se
   corren y cada id sigue igual a su fila. La hoja ya tiene filas vacías
   entre productos y el catálogo las saltea. Se recupera desde el historial
   de versiones de Google Sheets. */
export async function deleteProducts(ids) {
  const { tab, products } = await readCatalog()
  const byId = new Map(products.map((p) => [p.id, p]))
  const filas = []
  for (const id of ids) {
    const p = byId.get(id)
    if (!p) return { error: `El producto ${id} ya no está en la hoja`, status: 409 }
    if (!p.editable) return { error: `El id ${id} está repetido en la hoja`, status: 409 }
    filas.push(p.fila)
  }
  await clearRanges(filas.map((f) => tabRange(tab, `A${f}:ZZ${f}`)))
  return { ok: true, count: filas.length }
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

/* Alta: la fila nueva va justo después de la última con contenido, con su
   fecha de creación. La columna fecha se crea al final de la hoja la primera vez. */
export async function addProduct(cells) {
  const cat = await readCatalog()
  const { tab, col, lastRow } = cat
  const fila = lastRow + 1
  const id = cat.nextId()
  const writes = [{ range: tabRange(tab, `${colLetter(col.id)}${fila}`), value: id }]
  if (col.fecha === undefined) {
    col.fecha = cat.firstFreeCol
    writes.push({ range: tabRange(tab, `${colLetter(col.fecha)}1`), value: 'fecha' })
  }
  writes.push({ range: tabRange(tab, `${colLetter(col.fecha)}${fila}`), value: asText(nowMadrid()) })
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
