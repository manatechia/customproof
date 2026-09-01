import { eur } from './data.js'

/* Reglas de entrega, únicas para el carrito y para /api/order:
   el carrito las muestra y el servidor las vuelve a calcular antes de
   registrar la venta (nunca se confía en lo que manda el navegador). */

export const PICKUP = 'Metro L3 Liceu o L4 Llucmajor'
export const FREE_FROM = 25
export const BCN_COST = 5
export const ZONAS = ['bcn', 'fuera']

/* Devuelve el costo y los textos de la entrega elegida:
   `label`/`value` para la fila del carrito, `entrega` para el WhatsApp y la hoja. */
export function shippingFor({ zona, entrega }, subtotal) {
  if (!ZONAS.includes(zona))
    return {
      pending: true, cost: 0, quote: false, pickup: false, needsAddress: false,
      label: 'Envío', value: 'Elegí abajo', entrega: '',
    }

  /* La recogida en mano existe solo dentro de Barcelona */
  if (zona === 'bcn' && entrega === 'recogida')
    return {
      pending: false, cost: 0, quote: false, pickup: true, needsAddress: false,
      label: 'Recogida', value: 'Gratis',
      entrega: `Recogida gratis, coordinamos horario por ${PICKUP}`,
    }

  if (zona === 'bcn') {
    const free = subtotal >= FREE_FROM
    return {
      pending: false, cost: free ? 0 : BCN_COST, quote: false, pickup: false, needsAddress: true,
      label: 'Envío a domicilio', value: free ? 'Gratis' : eur(BCN_COST),
      entrega: free
        ? `Envío gratis a domicilio en Barcelona (a partir de ${FREE_FROM} €)`
        : `Envío a domicilio por Barcelona: ${eur(BCN_COST)}`,
    }
  }

  /* Fuera de Barcelona el envío no es opcional y el precio se pasa por WhatsApp */
  return {
    pending: false, cost: 0, quote: true, pickup: false, needsAddress: true,
    label: 'Envío a domicilio', value: 'A coordinar',
    entrega: 'Envío fuera de Barcelona: el costo lo pasamos por WhatsApp',
  }
}

export const formatAddress = ({ calle, piso, cp, ciudad }) =>
  [calle, piso, cp && `CP ${cp}`, ciudad]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(', ')
