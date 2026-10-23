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

/* Promo fija: cada 7 stickers (mezclables entre diseños) salen 10 €. Corre
   antes que el código: el porcentaje se aplica sobre el precio ya con pack. */
export const PACK = { cat: 'Stickers', size: 7, price: 10 }

/* `lines` son [{ cat, price, qty }]. Los packs se arman con las unidades más
   caras, que es lo que más ahorra al cliente si algún día hay precios
   distintos; un pack que no ahorra (unidades que suman menos de 10 €) no cuenta. */
export function packFor(lines) {
  const units = lines
    .filter((l) => l.cat === PACK.cat)
    .flatMap((l) => Array(l.qty).fill(l.price))
    .sort((a, b) => b - a)
  const packs = Math.floor(units.length / PACK.size)
  let amount = 0
  for (let k = 0; k < packs; k++) {
    const sum = units.slice(k * PACK.size, (k + 1) * PACK.size).reduce((a, p) => a + p, 0)
    amount += Math.max(0, sum - PACK.price)
  }
  amount = Math.round(amount * 100) / 100
  return {
    packs,
    amount,
    /* Cuántos stickers faltan para el próximo pack, para avisarlo en el carrito */
    missing: units.length ? PACK.size - (units.length % PACK.size) : 0,
    label: packs > 1 ? `Promo ${PACK.size} stickers x ${PACK.price} € (x${packs})` : `Promo ${PACK.size} stickers x ${PACK.price} €`,
    value: amount ? `−${eur(amount)}` : '',
  }
}
