import { fetchCatalogFromSheet } from '../lib/catalog.js'

export async function GET() {
  try {
    const products = await fetchCatalogFromSheet()
    return Response.json(products, {
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (e) {
    console.error('No se pudo cargar el catálogo del sheet:', e)
    return Response.json({ error: 'No se pudo cargar el catálogo' }, { status: 502 })
  }
}
