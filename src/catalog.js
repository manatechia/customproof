/* Devuelve el catálogo desde /api/products; si falla, un catálogo vacío */
export async function fetchCatalog() {
  try {
    const res = await fetch('/api/products')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    console.warn('No se pudo cargar el catálogo:', e)
    return []
  }
}
