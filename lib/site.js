/* Fuente única de los datos del sitio que se emiten en tiempo de build:
   el JSON-LD, el bloque <noscript> y llms.txt salen todos de acá.
   Ver scripts/prerender.mjs. */

export const ORIGIN = 'https://www.customproof.es'

export const SITE = {
  name: 'Custom Proof',
  url: `${ORIGIN}/`,
  logo: `${ORIGIN}/logo.png`,
  image: `${ORIGIN}/og.jpg`,
  lang: 'es',
  locale: 'es_ES',
  currency: 'EUR',
  city: 'Barcelona',
  country: 'España',
  title: 'Custom Proof · Stickers y productos personalizados en Barcelona',
  description:
    'Stickers die-cut y productos personalizados hechos a pedido en Barcelona, con envío a toda España. Desde 1 unidad, sin registros ni pagos online: el pedido se confirma por WhatsApp.',
  intro:
    'Custom Proof hace stickers die-cut y productos personalizados a pedido en Barcelona, con envío a toda España. Los stickers se cortan con la forma del diseño y son resistentes al agua, al sol y a los rayones. También hacemos tazas, camisetas y otros productos personalizados.',
}

/* Los mismos 4 pasos que muestra la home (src/data.js STEPS), en prosa */
export const STEPS_TEXT = [
  'Elegís los productos y las opciones que quieras y los sumás al carrito.',
  'Con un toque el pedido viaja a nuestro WhatsApp, ya armado.',
  'Te mandamos la vista previa del diseño antes de imprimir.',
  'Producimos en 24 a 48 horas y enviamos a toda España.',
]

export const CONDITIONS = [
  'Desde 1 unidad: todo es hecho a pedido, sin mínimos de compra.',
  'Producción en 24 a 48 horas.',
  'Envío a toda España. Envío gratis a domicilio en Barcelona a partir de 25 €.',
  'Sin registros ni pagos online: el pago y el envío se coordinan por WhatsApp.',
  'Precios en euros (EUR).',
  '¿Tenés tu propio diseño? Mandanos el archivo en PNG, JPG, PDF o vector y te pasamos presupuesto y vista previa.',
]

export const FAQ = [
  {
    q: '¿Cómo hago un pedido en Custom Proof?',
    a: 'Elegís los productos y las opciones en el catálogo y los sumás al carrito. Con un toque el pedido viaja armado a nuestro WhatsApp. Te mandamos la vista previa del diseño antes de imprimir y, una vez aprobada, producimos y enviamos. No hace falta registrarse ni pagar online.',
  },
  {
    q: '¿Cuál es la cantidad mínima?',
    a: 'Desde 1 unidad. Todos los productos son hechos a pedido, así que no hay mínimos de compra.',
  },
  {
    q: '¿Cuánto tarda la producción y el envío?',
    a: 'Producimos en 24 a 48 horas y enviamos a toda España. El envío y la forma de pago se coordinan por WhatsApp.',
  },
  {
    q: '¿Hacen envíos gratis?',
    a: 'Sí: el envío a domicilio en Barcelona es gratis a partir de 25 €. Al resto de España se coordina el envío por WhatsApp.',
  },
  {
    q: '¿Puedo mandar mi propio diseño?',
    a: 'Sí. Nos mandás el archivo por WhatsApp en PNG, JPG, PDF o vector y te pasamos presupuesto y vista previa antes de imprimir.',
  },
  {
    q: '¿Los stickers resisten el agua?',
    a: 'Sí. Los stickers son die-cut (cortados con la forma del diseño) y resistentes al agua, al sol y a los rayones.',
  },
]
