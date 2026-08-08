import Stripe from 'stripe'
import { appendVentaRow, ventaExists } from '../lib/sheets.js'

export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_missing')
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature')
  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object
    const orderId = 'CP-' + s.id.slice(-8).toUpperCase()
    if (await ventaExists(orderId)) return Response.json({ received: true })

    const { data: lineItems } = await stripe.checkout.sessions.listLineItems(s.id, { limit: 100 })
    const items = lineItems.map((li) => `${li.quantity}x ${li.description}`).join(' | ')
    const cd = s.customer_details ?? {}
    /* La ubicación de shipping_details cambia según la versión de la API */
    const ship = s.collected_information?.shipping_details ?? s.shipping_details
    const addr = ship?.address
    const direccion = addr
      ? [addr.line1, addr.line2, addr.postal_code, addr.city, addr.state].filter(Boolean).join(', ')
      : ''
    const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

    /* Orden exacto de cabeceras de Ventas:
       Id | fecha | nombre cliente | telefono cliente | email cliente | direccion cliente | items | total | payment_status | stripe_payment_id */
    await appendVentaRow([
      orderId,
      fecha,
      ship?.name || cd.name || '',
      cd.phone || '',
      cd.email || '',
      direccion,
      items,
      (s.amount_total / 100).toFixed(2).replace('.', ','),
      s.payment_status,
      s.payment_intent || s.id,
    ])
  }

  return Response.json({ received: true })
}
