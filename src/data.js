export const WHATSAPP = '34672019390'
export const EMAIL = 'customproof.es@gmail.com'
export const PHONE_LABEL = '+34 672 019 390'

/* Paleta de marca */
export const YELLOW = '#ffcc29'
export const CELESTE = '#5bc5cf'
export const PINK = '#c45ca1'

export const STEPS = [
  { n: '1', t: 'Elegí', d: 'Sumá al carrito los productos y las opciones que quieras.', tint: 'var(--yellow)', fg: '#000' },
  { n: '2', t: 'Enviá', d: 'Con un toque el pedido viaja a nuestro WhatsApp, ya armado.', tint: 'var(--celeste)', fg: '#000' },
  { n: '3', t: 'Aprobá', d: 'Te mandamos la vista previa del diseño antes de imprimir.', tint: 'var(--pink)', fg: '#000' },
  { n: '4', t: 'Recibí', d: 'Producimos en 24-48hs y enviamos a toda España.', tint: 'var(--ink)', fg: 'var(--bg)' },
]

export const eur = (n) => n.toFixed(2).replace('.', ',') + ' €'

export const waLink = (text) =>
  `https://wa.me/${WHATSAPP}` + (text ? `?text=${encodeURIComponent(text)}` : '')
