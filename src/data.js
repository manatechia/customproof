export const WHATSAPP = '34626026322'
export const EMAIL = 'customproof.es@gmail.com'
export const PHONE_LABEL = '+34 626 026 322'

/* Paleta CMYK de marca: amarillo C0 M20 Y100, celeste C60 M0 Y20, violeta C20 M80 Y0 */
export const YELLOW = '#FFCC00'
export const CELESTE = '#66FFCC'
export const VIOLET = '#CC33FF'

export const CATALOG = [
  { id: 'st-pack', name: 'Pack de stickers', cat: 'Stickers', tag: 'Más vendido', tint: YELLOW, shot: 'foto pack stickers',
    desc: 'Vinilo mate resistente al agua, cortados a medida. Elegí el tamaño del pack.',
    opts: [{ v: '10 unidades · 5 cm', p: 9 }, { v: '25 unidades · 5 cm', p: 18 }, { v: '50 unidades · 5 cm', p: 30 }] },
  { id: 'st-die', name: 'Sticker die-cut', cat: 'Stickers', tag: 'A medida', tint: CELESTE, shot: 'foto sticker die-cut',
    desc: 'Corte por la silueta de tu diseño. Ideal para logos y personajes.',
    opts: [{ v: '5 cm', p: 2.5 }, { v: '8 cm', p: 3.5 }, { v: '12 cm', p: 5 }] },
  { id: 'st-holo', name: 'Stickers holográficos', cat: 'Stickers', tag: 'Brillo', tint: VIOLET, shot: 'foto holográficos',
    desc: 'Laminado tornasolado que cambia con la luz. Mínimo 5 unidades.',
    opts: [{ v: '5 unidades', p: 12 }, { v: '10 unidades', p: 20 }, { v: '20 unidades', p: 36 }] },
  { id: 'st-planch', name: 'Plancha personalizada', cat: 'Stickers', tag: 'A4', tint: YELLOW, shot: 'foto plancha A4',
    desc: 'Una hoja A4 con todos tus diseños mezclados en el tamaño que quieras.',
    opts: [{ v: '1 plancha A4', p: 14 }, { v: '2 planchas A4', p: 25 }, { v: '5 planchas A4', p: 55 }] },
  { id: 'tz-clas', name: 'Taza personalizada', cat: 'Tazas', tag: 'Sublimada', tint: CELESTE, shot: 'foto taza blanca',
    desc: 'Taza cerámica blanca 330 ml con tu foto o diseño a todo color. Apta lavavajillas.',
    opts: [{ v: '1 taza', p: 12 }, { v: '2 tazas', p: 22 }, { v: '4 tazas', p: 40 }] },
  { id: 'tz-magic', name: 'Taza mágica', cat: 'Tazas', tag: 'Revela con calor', tint: VIOLET, shot: 'foto taza mágica',
    desc: 'Negra en frío, revela el diseño al servir algo caliente. Sorpresa asegurada.',
    opts: [{ v: '1 taza', p: 16 }, { v: '2 tazas', p: 30 }] },
  { id: 'rm-basic', name: 'Remera personalizada', cat: 'Remeras', tag: 'DTF', tint: YELLOW, shot: 'foto remera',
    desc: 'Algodón 100%, estampa DTF a todo color. Talles S al XXL, blanca o negra.',
    opts: [{ v: 'Talle S', p: 19 }, { v: 'Talle M', p: 19 }, { v: 'Talle L', p: 19 }, { v: 'Talle XL', p: 21 }, { v: 'Talle XXL', p: 23 }] },
  { id: 'rm-hood', name: 'Buzo con capucha', cat: 'Remeras', tag: 'Frisa', tint: CELESTE, shot: 'foto buzo',
    desc: 'Buzo unisex con frisa interior y estampa DTF. Talles S al XXL.',
    opts: [{ v: 'Talle S', p: 34 }, { v: 'Talle M', p: 34 }, { v: 'Talle L', p: 34 }, { v: 'Talle XL', p: 37 }, { v: 'Talle XXL', p: 39 }] },
  { id: 'ex-iman', name: 'Imanes personalizados', cat: 'Otros', tag: 'Nuevo', tint: VIOLET, shot: 'foto imanes',
    desc: 'Imanes de nevera rígidos con tu foto o ilustración. Pack de 6.',
    opts: [{ v: 'Pack de 6 · 5 cm', p: 11 }, { v: 'Pack de 12 · 5 cm', p: 19 }] },
]

export const CATS = ['Todo', 'Stickers', 'Tazas', 'Remeras', 'Otros']

export const STEPS = [
  { n: '1', t: 'Elegí', d: 'Sumá al carrito los productos y las opciones que quieras.', tint: 'var(--yellow)', fg: '#000' },
  { n: '2', t: 'Enviá', d: 'Con un toque el pedido viaja a nuestro WhatsApp, ya armado.', tint: 'var(--celeste)', fg: '#000' },
  { n: '3', t: 'Aprobá', d: 'Te mandamos la vista previa del diseño antes de imprimir.', tint: 'var(--violet)', fg: '#000' },
  { n: '4', t: 'Recibí', d: 'Producimos en 24-48hs y enviamos a toda España.', tint: 'var(--ink)', fg: 'var(--bg)' },
]

export const eur = (n) => n.toFixed(2).replace('.', ',') + ' €'

export const waLink = (text) =>
  `https://wa.me/${WHATSAPP}` + (text ? `?text=${encodeURIComponent(text)}` : '')
