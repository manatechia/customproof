import { createHmac, timingSafeEqual } from 'node:crypto'

/* Sesión del admin sin base de datos: un único usuario en variables de
   entorno y una cookie "vencimiento.firma" con HMAC. Cambiar ADMIN_SECRET
   cierra todas las sesiones abiertas. */

const COOKIE = 'cp_admin'
const MAX_AGE = 7 * 24 * 3600

function secret() {
  const s = process.env.ADMIN_SECRET
  if (!s || s.length < 32) throw new Error('Falta ADMIN_SECRET (32 caracteres o más)')
  return s
}

const sign = (exp) => createHmac('sha256', secret()).update(String(exp)).digest('base64url')

/* Compara sin filtrar por tiempo cuántos caracteres coinciden. El HMAC iguala
   los largos, que timingSafeEqual exige. */
const sameText = (a, b) => {
  const h = (s) => createHmac('sha256', 'cmp').update(String(s)).digest()
  return timingSafeEqual(h(a), h(b))
}

export function checkCredentials(user, pass) {
  const u = process.env.ADMIN_USER
  const p = process.env.ADMIN_PASSWORD
  if (!u || !p) throw new Error('Faltan ADMIN_USER / ADMIN_PASSWORD')
  /* Las dos comparaciones siempre: cortar en la primera revelaría si el usuario existe */
  const okUser = sameText(user, u)
  const okPass = sameText(pass, p)
  return okUser && okPass
}

/* Path=/api porque las cookies con Path=/api/admin no viajan a /api/admin-products */
export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/api; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`
}

export const clearCookie = () => `${COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`

export function isAdmin(request) {
  const raw = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
  const [exp, sig] = (raw?.slice(COOKIE.length + 1) ?? '').split('.')
  if (!exp || !sig || !/^\d+$/.test(exp)) return false
  if (Number(exp) < Date.now() / 1000) return false
  return sameText(sig, sign(exp))
}

/* Devuelve la respuesta 401 a cortar, o null si la sesión vale */
export const requireAdmin = (request) =>
  isAdmin(request) ? null : Response.json({ error: 'Sesión vencida' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
