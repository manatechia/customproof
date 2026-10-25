import { checkCredentials, sessionCookie, clearCookie, isAdmin } from '../lib/admin-auth.js'

const json = (body, status = 200, extra = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extra } })

/* La pantalla lo consulta al abrir para saber si mostrar el login */
export async function GET(request) {
  return isAdmin(request) ? json({ ok: true }) : json({ ok: false }, 401)
}

export async function POST(request) {
  let user, pass
  try {
    ({ user, pass } = await request.json())
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400)
  }
  if (typeof user !== 'string' || typeof pass !== 'string') return json({ error: 'Cuerpo inválido' }, 400)

  if (!checkCredentials(user.trim(), pass)) {
    /* Freno a fuerza bruta: cada intento fallido cuesta un segundo */
    await new Promise((r) => setTimeout(r, 1000))
    return json({ error: 'Usuario o contraseña incorrectos' }, 401)
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie() })
}

export async function DELETE() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() })
}
