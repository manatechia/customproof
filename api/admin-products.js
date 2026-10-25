import { requireAdmin } from '../lib/admin-auth.js'
import { readRange, updateCell, catalogTabName, tabRange } from '../lib/sheets.js'
import { normalizeImg } from '../lib/catalog.js'

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/* Columnas que el admin puede escribir. Sumar precio, categoría, etc. es
   agregarlas acá con su validación y su input en src/admin/Admin.jsx */
const EDITABLE = {
  imagen: (v) => {
    const s = String(v ?? '').trim()
    if (s === '') return { ok: true, value: '' }
    if (!/^https:\/\/\S+$/.test(s) || s.length > 1000) return { ok: false, error: 'La URL tiene que empezar con https://' }
    return { ok: true, value: s }
  },
}

/* 0 -> A, 25 -> Z, 26 -> AA */
const colLetter = (i) => (i < 26 ? '' : colLetter(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26))

/* Lee la pestaña del catálogo por la API autenticada y no por el CSV
   publicado: el CSV puede venir atrasado y acá necesitamos lo que hay ahora */
async function readCatalogSheet() {
  const tab = await catalogTabName()
  const rows = await readRange(tabRange(tab, 'A1:ZZ'))
  const col = {}
  ;(rows[0] ?? []).forEach((name, i) => { col[String(name).trim().toLowerCase()] = i })
  const get = (row, name) => (col[name] !== undefined ? String(row[col[name]] ?? '').trim() : '')
  return { tab, rows, col, get }
}

export async function GET(request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const { rows, get } = await readCatalogSheet()
    const ids = rows.slice(1).map((r) => get(r, 'id'))
    const products = []
    rows.slice(1).forEach((r, i) => {
      const titulo = get(r, 'titulo')
      if (!titulo) return
      const id = ids[i]
      products.push({
        fila: i + 2,
        id,
        /* Sin id, o con el id repetido, no hay forma segura de ubicar la fila al guardar */
        editable: Boolean(id) && ids.filter((x) => x === id).length === 1,
        titulo,
        categoria: get(r, 'categoria'),
        activo: !/^(no|false|0)$/i.test(get(r, 'activo')),
        imagen: get(r, 'imagen'),
      })
    })
    return json(products)
  } catch (e) {
    console.error('Admin: no se pudo leer el catálogo:', e)
    return json({ error: 'No se pudo leer el sheet' }, 502)
  }
}

export async function PATCH(request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400)
  }
  const id = String(body?.id ?? '').trim()
  const field = String(body?.field ?? '')
  if (!id) return json({ error: 'Falta el id' }, 400)
  if (!Object.hasOwn(EDITABLE, field)) return json({ error: 'Ese campo no se puede editar' }, 400)
  const v = EDITABLE[field](body.value)
  if (!v.ok) return json({ error: v.error }, 400)

  try {
    /* Se relee justo antes de escribir y se ubica la fila por id: si alguien
       movió filas en el sheet desde que se abrió el admin, igual cae en la correcta */
    const { tab, rows, col, get } = await readCatalogSheet()
    if (col.id === undefined || col[field] === undefined) return json({ error: `El sheet no tiene columna "${field}"` }, 409)
    const matches = []
    rows.forEach((r, i) => { if (i > 0 && get(r, 'id') === id) matches.push(i) })
    if (matches.length !== 1) {
      return json({ error: matches.length ? 'Ese id está repetido en el sheet' : 'Ese producto ya no está en el sheet' }, 409)
    }
    await updateCell(tabRange(tab, `${colLetter(col[field])}${matches[0] + 1}`), v.value)
    return json({ ok: true, value: v.value, img: field === 'imagen' && v.value ? normalizeImg(v.value) : undefined })
  } catch (e) {
    console.error('Admin: no se pudo guardar en el sheet:', e)
    return json({ error: 'No se pudo guardar en el sheet' }, 502)
  }
}
