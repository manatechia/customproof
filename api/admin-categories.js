import { requireAdmin } from '../lib/admin-auth.js'
import { normalizeCategories, saveCategories } from '../lib/admin-catalog.js'

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/* La pantalla manda la lista completa y la pestaña Categorias se reescribe
   entera: son pocas filas y así agregar, quitar o reordenar es lo mismo */
export async function PUT(request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  let list
  try {
    ({ categories: list } = await request.json())
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400)
  }
  if (!Array.isArray(list) || list.length > 200) return json({ error: 'Lista inválida' }, 400)
  const categories = normalizeCategories(list)
  try {
    await saveCategories(categories)
    return json({ ok: true, categories })
  } catch (e) {
    console.error('Admin: no se pudieron guardar las categorías:', e)
    return json({ error: 'No se pudo guardar en el sheet' }, 502)
  }
}
