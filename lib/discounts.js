import { readRange } from './sheets.js'
import { normalizeCode } from '../src/discount.js'

/* Hoja Descuentos: codigo | porcentaje | activo | caduca | nota
   Hoja Canjes:     fecha | codigo | email | pedido | nombre | importe

   El uso único es la existencia de una fila en Canjes con ese (código, email):
   borrar la fila a mano "devuelve" el código, que es como Noelia lo maneja
   cuando un pedido no se concreta. */

const norm = (s) => String(s ?? '').trim().toLowerCase()

/* La celda de caducidad puede llegar de tres maneras según cómo la haya
   cargado Noelia y el locale de la hoja: texto dd/mm/aaaa, texto ISO, o el
   serial de Sheets (días desde 1899-12-30). Devuelve 'aaaa-mm-dd' o ''. */
function parseSheetDate(v) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const serial = Number(s.replace(',', '.'))
  /* El rango descarta que un número suelto mal puesto se lea como fecha */
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000)
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10)
  return ''
}

/* Comparar strings ISO esquiva los husos y el "¿caduca a las 00:00 o a las
   23:59?": el código vale todo el día que dice la hoja, hora de Madrid. */
const hoyMadrid = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

/* Acepta "10", "10%" y "10,5". Rechaza menos de 1 (un "0,1" es un error de
   carga, no un 0,1% real) y más de 90 (un "100" mal tipeado no regala el pedido). */
const parsePct = (s) => {
  const n = parseFloat(String(s ?? '').replace('%', '').replace(',', '.'))
  return Number.isFinite(n) && n >= 1 && n <= 90 ? n : null
}

/* Una fila con el porcentaje ilegible se comporta como código inexistente:
   preferimos no aplicar nada antes que aplicar cualquier cosa. */
async function fetchDiscount(code) {
  const rows = await readRange('Descuentos!A2:D')
  const hoy = hoyMadrid()
  for (const r of rows) {
    if (normalizeCode(r[0]) !== code) continue
    const pct = parsePct(r[1])
    if (pct === null) return { ok: false, reason: 'no-existe' }
    /* Mismo criterio que la columna `activo` del catálogo: solo no/false/0 apagan */
    if (/^(no|false|0)$/i.test(String(r[2] ?? '').trim())) return { ok: false, reason: 'inactivo' }
    const hasta = parseSheetDate(r[3])
    if (hasta && hoy > hasta) return { ok: false, reason: 'caducado', hasta }
    return { ok: true, pct }
  }
  return { ok: false, reason: 'no-existe' }
}

async function isCodeUsed(code, email) {
  const rows = await readRange('Canjes!B2:C')
  return rows.some((r) => normalizeCode(r[0]) === code && norm(r[1]) === email)
}

/* Único punto de verdad: lo usan /api/discount (que solo da feedback) y
   /api/order (que es el que manda). Lanza si la hoja no responde. */
export async function validateCode(code, email) {
  const d = await fetchDiscount(code)
  if (!d.ok) return d
  /* Sin email no hay uso único posible: ese pedido es una recogida en mano y
     el control queda manual, con el código a la vista en el WhatsApp */
  if (email && (await isCodeUsed(code, email))) return { ok: false, reason: 'usado' }
  return d
}

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

/* Los textos viven acá para que los dos endpoints le hablen igual al cliente */
export const motivoTexto = (reason, hasta) =>
  ({
    'no-existe': 'Ese código no existe. Revisá que esté bien escrito.',
    inactivo: 'Ese código ya no está activo.',
    caducado: `Ese código caducó${hasta ? ` el ${fmtDate(hasta)}` : ''}.`,
    usado: 'Ya usaste este código con ese email.',
    sheets: 'No pudimos comprobar el código ahora mismo. Probá de nuevo o mencionalo por WhatsApp.',
  }[reason] ?? 'No pudimos aplicar ese código.')
