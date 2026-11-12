/* Copia de lo justo de ../src/data.js: el sitio de ropa se despliega aparte
   (otro proyecto de Vercel con raíz en clothes/) y no importa nada de afuera */
export const WHATSAPP = '34672019390'
export const EMAIL = 'customproof.es@gmail.com'

export const YELLOW = '#ffcc29'
export const CELESTE = '#5bc5cf'
export const PINK = '#c45ca1'
/* Cada look toma un color de marca, en orden */
export const ACCENTS = [YELLOW, CELESTE, PINK]

export const eur = (n) => n.toFixed(2).replace('.', ',') + ' €'

export const waLink = (text) =>
  `https://wa.me/${WHATSAPP}` + (text ? `?text=${encodeURIComponent(text)}` : '')
