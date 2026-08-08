import Stripe from 'stripe'
import { fetchCatalogFromSheet } from '../lib/catalog.js'

const bad = (msg, status = 400) => Response.json({ error: msg }, { status })

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
    console.error('Catálogo no disponible al crear el checkout:', e)
    return bad('El catálogo no está disponible ahora mismo, probá de nuevo', 502)
  }

  /* Los precios salen siempre del sheet, nunca del cliente */
  const line_items = []
  for (const { id, opt, qty } of items) {
    const p = catalog.find((x) => x.id === id)
    const o = p?.opts.find((o) => o.v === opt)
    if (!p || !o) return bad(`Un producto del carrito ya no está disponible (${id})`)
    line_items.push({
      quantity: qty,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(o.p * 100),
        product_data: { name: o.v ? `${p.name} (${o.v})` : p.name },
      },
    })
  }

  const origin = process.env.SITE_URL || request.headers.get('origin')
  if (!origin) return bad('Origen desconocido')

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Falta STRIPE_SECRET_KEY')
    return bad('El pago no está disponible ahora mismo', 500)
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  /* El envío no se cobra acá: se coordina por WhatsApp; la dirección va al registro de Ventas */
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items,
    phone_number_collection: { enabled: true },
    shipping_address_collection: { allowed_countries: ['ES'] },
    locale: 'es',
    success_url: `${origin}/?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?pago=cancelado`,
  })
  return Response.json({ url: session.url })
}
