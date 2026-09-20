import { validateCode, motivoTexto } from '../lib/discounts.js'
import { normalizeCode } from '../src/discount.js'

/* Feedback del carrito cuando el cliente toca "Aplicar". No devuelve importes:
   el descuento lo calcula el navegador con la misma función pura que el
   servidor, y el total que vale es el que arma /api/order.

   POST y no GET porque el email no puede viajar en la query string: quedaría
   en los logs de Vercel y en cualquier caché intermedia. */
export async function POST(request) {
  let code, email
  try {
    const body = await request.json()
    code = normalizeCode(body?.code)
    email = String(body?.email ?? '').trim().toLowerCase().slice(0, 120)
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  if (!code) return Response.json({ ok: false, reason: 'no-existe', error: motivoTexto('no-existe') })

  let r
  try {
    r = await validateCode(code, email)
  } catch (e) {
    /* No poder comprobarlo no es lo mismo que comprobarlo: no aplicamos nada.
       El pedido igual puede salir, y ahí el código se revisa a mano. */
    console.error('No se pudo validar el código de descuento:', e)
    return Response.json({ ok: false, reason: 'sheets', error: motivoTexto('sheets') })
  }

  /* Los rechazos son resultados de negocio, no errores HTTP: el carrito los
     pinta como mensaje y no como "se cayó algo" */
  return r.ok
    ? Response.json({ ok: true, code, pct: r.pct })
    : Response.json({ ok: false, reason: r.reason, error: motivoTexto(r.reason, r.hasta) })
}
