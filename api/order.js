import { fetchCatalogFromSheet } from '../lib/catalog.js'
import { appendVentaRow, appendCanjeRow } from '../lib/sheets.js'
import { validateCode } from '../lib/discounts.js'
import { shippingFor, formatAddress, ZONAS, PICKUP } from '../src/shipping.js'
import { discountFor, normalizeCode } from '../src/discount.js'

const bad = (msg, status = 400) => Response.json({ error: msg }, { status })

/* Los textos del cliente entran en una celda de la hoja: sin saltos de línea y acotados */
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/* Registra el pedido en la hoja Ventas antes de que el cliente abra WhatsApp.
   El pago y el envío se coordinan en el chat: no se cobra nada desde la web. */
export async function POST(request) {
  let items, datos
  try {
    ({ items, datos } = await request.json())
  } catch {
    return bad('Cuerpo inválido')
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return bad('Carrito inválido')
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || typeof it.opt !== 'string') return bad('Carrito inválido')
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99) return bad('Cantidad inválida')
  }

  /* Datos de entrega: se validan acá y el envío se recalcula abajo con los precios del sheet */
  const d = datos && typeof datos === 'object' ? datos : {}
  const zona = ZONAS.includes(d.zona) ? d.zona : ''
  if (!zona) return bad('Falta indicar desde dónde escribís')
  /* La recogida es solo para Barcelona: fuera de la ciudad el envío no es opcional */
  const entrega = zona === 'bcn' && d.entrega === 'recogida' ? 'recogida' : 'envio'
  const nombre = clean(d.nombre, 80)
  if (!nombre) return bad('Falta el nombre')
  /* La recogida en mano puede ir sin email; el envío no */
  const email = clean(d.email, 120).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad('El email no es válido')
  if (!email && entrega !== 'recogida') return bad('Falta el email')
  const ciudad = zona === 'bcn' ? 'Barcelona' : clean(d.ciudad, 60)
  if (!ciudad) return bad('Falta la ciudad')
  const calle = clean(d.calle, 120)
  const piso = clean(d.piso, 40)
  const cp = clean(d.cp, 5)

  let catalog
  try {
    catalog = await fetchCatalogFromSheet()
  } catch (e) {
    console.error('Catálogo no disponible al registrar el pedido:', e)
    return bad('El catálogo no está disponible ahora mismo', 502)
  }

  /* Los precios salen siempre del sheet, nunca del cliente */
  const lines = []
  let subtotal = 0
  for (const { id, opt, qty } of items) {
    const p = catalog.find((x) => x.id === id)
    const o = p?.opts.find((o) => o.v === opt)
    if (!p || !o) return bad(`Un producto del carrito ya no está disponible (${id})`)
    lines.push(`${qty}x ${o.v ? `${p.name} (${o.v})` : p.name}`)
    subtotal += o.p * qty
  }

  /* El código se revalida siempre acá: /api/discount es solo feedback del carrito */
  let codigo = normalizeCode(d.codigo)
  let pct = 0
  let verificado = true
  if (codigo) {
    try {
      const r = await validateCode(codigo, email)
      if (r.ok) pct = r.pct
      /* Inexistente, apagado, caducado o ya usado: el pedido sigue sin descuento */
      else codigo = ''
    } catch (e) {
      /* Que la hoja no responda no bloquea el pedido, igual que el append: sale
         sin descuento y el código viaja a WhatsApp para revisarlo a mano */
      console.error('No se pudo validar el código de descuento:', e)
      verificado = false
    }
  }

  const disc = discountFor(subtotal, pct)
  /* El envío gratis se mide contra el subtotal ya descontado */
  const ship = shippingFor({ zona, entrega }, disc.net)
  if (ship.needsAddress && (!calle || !/^\d{5}$/.test(cp))) return bad('Falta la dirección de envío')
  const direccion = ship.needsAddress
    ? formatAddress({ calle, piso, cp, ciudad })
    : `Recogida a coordinar (${PICKUP})`
  const total = disc.net + ship.cost

  const ref = 'CP-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase()
  const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  /* Los importes van con coma, como los espera la hoja en locale ES */
  const conComa = (n) => n.toFixed(2).replace('.', ',')

  /* Cabeceras de Ventas:
     Id | fecha | nombre cliente | telefono cliente | email cliente | direccion cliente | items | total | payment_status | stripe_payment_id | codigo descuento | descuento */
  try {
    await appendVentaRow([
      ref,
      fecha,
      nombre,
      '', email,
      direccion,
      `${lines.join(' | ')} || ${ship.entrega}`,
      conComa(total),
      'a coordinar por WhatsApp',
      '',
      codigo,
      pct ? conComa(disc.amount) : '',
    ])
  } catch (e) {
    /* El registro no debe bloquear el pedido: el cliente sigue a WhatsApp igual */
    console.error('No se pudo registrar el pedido en Ventas:', e)
  }

  /* El canje va en su propia hoja: borrar la fila devuelve el código. Después
     de Ventas a propósito: si algo revienta preferimos la venta sin el canje
     antes que un canje sin venta.
     Cabeceras de Canjes: fecha | codigo | email | pedido | nombre | importe */
  if (pct > 0) {
    try {
      await appendCanjeRow([fecha, codigo, email, ref, nombre, conComa(disc.amount)])
    } catch (e) {
      console.error('No se pudo registrar el canje:', e)
    }
  }

  return Response.json({ ref, codigo, pct, verificado })
}
