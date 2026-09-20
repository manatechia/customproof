import { eur } from './data.js'

/* Cálculo del descuento por código, único para el carrito y para /api/order:
   el carrito lo muestra y el servidor lo vuelve a calcular con el porcentaje
   que salió de la hoja (nunca se confía en lo que manda el navegador).

   El descuento toca solo el subtotal de productos, nunca el envío. El umbral
   de envío gratis se mide después, contra el subtotal ya descontado: por eso
   esto corre siempre ANTES de shippingFor, en los dos lados. */

/* En la hoja los códigos viven en minúscula; el cliente puede escribir
   "  BaumFest 10 " y tiene que funcionar igual */
export const normalizeCode = (s) =>
  String(s ?? '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 32)

/* Devuelve el importe, el subtotal neto y los textos de la fila del resumen.
   Con pct 0 no hay descuento y `net` es el subtotal tal cual. */
export function discountFor(subtotal, pct) {
  if (!(pct > 0) || !(subtotal > 0))
    return { pct: 0, amount: 0, net: subtotal, label: '', value: '' }
  /* Al céntimo: 12,35 * 10 / 100 da 1.2350000000000002 en coma flotante */
  const amount = Math.round(subtotal * pct) / 100
  return {
    pct,
    amount,
    net: subtotal - amount,
    label: `Descuento (${pct}%)`,
    value: `−${eur(amount)}`,
  }
}
