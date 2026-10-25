import { requireAdmin } from '../lib/admin-auth.js'
import { readCatalog, readCategories, validateFields, writeProducts, addProduct, deleteProducts, splitSubs } from '../lib/admin-catalog.js'

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function body(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/* Productos (todos, también los inactivos) y la lista de categorías */
export async function GET(request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const { products, assigned } = await readCatalog()
    const categories = await readCategories(products)
    return json({ products, categories, assigned })
  } catch (e) {
    console.error('Admin: no se pudo leer el catálogo:', e)
    return json({ error: 'No se pudo leer el sheet' }, 502)
  }
}

/* Alta de un producto: { fields: { titulo, precio, … } } */
export async function POST(request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const b = await body(request)
  if (!b?.fields?.titulo) return json({ error: 'Falta el título' }, 400)
  if (String(b.fields.precio ?? '').trim() === '') return json({ error: 'Falta el precio' }, 400)
  const v = validateFields(b.fields)
  if (v.error) return json({ error: v.error }, 400)
  try {
    const r = await addProduct(v.cells)
    return r.error ? json({ error: r.error }, r.status) : json(r)
  } catch (e) {
    console.error('Admin: no se pudo agregar el producto:', e)
    return json({ error: 'No se pudo guardar en el sheet' }, 502)
  }
}

/* Edición. Dos formas:
   - { id, fields: { campo: valor } }: un producto, varios campos
   - { ids: [...], op, value }: varios productos a la vez, con op
     'categoria' (la reemplaza), 'addSub' o 'removeSub' */
export async function PATCH(request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const b = await body(request)
  if (!b) return json({ error: 'Cuerpo inválido' }, 400)

  try {
    if (Array.isArray(b.ids)) {
      const ids = [...new Set(b.ids.map(String))]
      if (!ids.length || ids.length > 500) return json({ error: 'Selección inválida' }, 400)
      const value = String(b.value ?? '').trim()
      if (!value) return json({ error: 'Falta elegir la categoría' }, 400)

      let edits
      if (b.op === 'categoria') {
        const v = validateFields({ categoria: value })
        edits = ids.map((id) => ({ id, cells: v.cells }))
      } else if (b.op === 'addSub' || b.op === 'removeSub') {
        /* Las subcategorías dependen de lo que ya tiene cada producto: se leen frescas */
        const { products } = await readCatalog()
        const byId = new Map(products.map((p) => [p.id, p]))
        edits = []
        for (const id of ids) {
          const p = byId.get(id)
          if (!p) return json({ error: `El producto ${id} ya no está en la hoja` }, 409)
          const subs = b.op === 'addSub'
            ? splitSubs([...p.subcategorias, value])
            : p.subcategorias.filter((s) => s.toLowerCase() !== value.toLowerCase())
          edits.push({ id, cells: validateFields({ subcategorias: subs }).cells })
        }
      } else {
        return json({ error: 'Operación inválida' }, 400)
      }
      const r = await writeProducts(edits)
      return r.error ? json({ error: r.error }, r.status) : json({ ok: true, count: edits.length })
    }

    const id = String(b.id ?? '').trim()
    if (!id) return json({ error: 'Falta el id' }, 400)
    const v = validateFields(b.fields)
    if (v.error) return json({ error: v.error }, 400)
    const r = await writeProducts([{ id, cells: v.cells }])
    return r.error ? json({ error: r.error }, r.status) : json({ ok: true })
  } catch (e) {
    console.error('Admin: no se pudo guardar en el sheet:', e)
    return json({ error: 'No se pudo guardar en el sheet' }, 502)
  }
}

/* Eliminar: { ids: [...] } */
export async function DELETE(request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const b = await body(request)
  const ids = Array.isArray(b?.ids) ? [...new Set(b.ids.map(String))] : []
  if (!ids.length || ids.length > 500) return json({ error: 'Selección inválida' }, 400)
  try {
    const r = await deleteProducts(ids)
    return r.error ? json({ error: r.error }, r.status) : json(r)
  } catch (e) {
    console.error('Admin: no se pudieron eliminar productos:', e)
    return json({ error: 'No se pudo guardar en el sheet' }, 502)
  }
}
