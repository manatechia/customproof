import { fetchCatalogFromSheet } from '../lib/catalog.js'
import { appendVentaRow } from '../lib/sheets.js'

const bad = (msg, status = 400) => Response.json({ error: msg }, { status })

/* Registra el pedido en la hoja Ventas antes de que el cliente abra WhatsApp.
   El pago y el envío se coordinan en el chat: no se cobra nada desde la web. */
export async function POST(request) {
  let items
  try {
    ({ items } = await request.json())
  } catch {
    return bad('Cuerpo inválido')
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return bad('Carrito inválido')
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || typeof it.opt !== 'string') return bad('Carrito inválido')
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99) return bad('Cantidad inválida')
  }

  let catalog
  try {
    catalog = await fetchCatalogFromSheet()
  } catch (e) {
    console.error('Catálogo no disponible al registrar el pedido:', e)
    return bad('El catálogo no está disponible ahora mismo', 502)
  }

  /* Los precios salen siempre del sheet, nunca del cliente */
  const lines = []
  let total = 0
  for (const { id, opt, qty } of items) {
    const p = catalog.find((x) => x.id === id)
    const o = p?.opts.find((o) => o.v === opt)
    if (!p || !o) return bad(`Un producto del carrito ya no está disponible (${id})`)
    lines.push(`${qty}x ${o.v ? `${p.name} (${o.v})` : p.name}`)
    total += o.p * qty
  }

  const ref = 'CP-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase()
  const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  /* Cabeceras de Ventas:
     Id | fecha | nombre cliente | telefono cliente | email cliente | direccion cliente | items | total | payment_status | stripe_payment_id */
  try {
    await appendVentaRow([
      ref,
      fecha,
      '', '', '', '',
      lines.join(' | '),
      total.toFixed(2).replace('.', ','),
      'a coordinar por WhatsApp',
      '',
    ])
  } catch (e) {
    /* El registro no debe bloquear el pedido: el cliente sigue a WhatsApp igual */
    console.error('No se pudo registrar el pedido en Ventas:', e)
  }

  return Response.json({ ref })
}
