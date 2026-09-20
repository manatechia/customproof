import { createSign } from 'node:crypto'

/* Acceso a Google Sheets con service account, sin dependencias:
   JWT RS256 firmado a mano e intercambiado por un access token. */

const b64url = (s) => Buffer.from(s).toString('base64url')

/* Vercel reusa el proceso entre invocaciones: cachear el token evita refirmar
   un JWT RS256 y pegarle a oauth2 en cada request. El margen de un minuto es
   para no usar uno que vence entre que lo leemos y Google lo recibe. */
let cached = null

async function getAccessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY')

  const iat = Math.floor(Date.now() / 1000)
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64url(JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    }))
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`Google token HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cached.token
}

const sheetsUrl = (range, suffix = '') => {
  const id = process.env.SHEETS_SPREADSHEET_ID
  if (!id) throw new Error('Falta SHEETS_SPREADSHEET_ID')
  return `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}${suffix}`
}

/* Las hojas privadas (Descuentos, Canjes) se leen por acá y no por el CSV
   publicado que usa el catálogo: Canjes guarda emails y publicar esa pestaña
   la dejaría accesible sin autenticación. El scope del JWT ya cubre lectura. */
export async function readRange(range) {
  const token = await getAccessToken()
  const res = await fetch(sheetsUrl(range), { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets read HTTP ${res.status}: ${await res.text()}`)
  /* values.get recorta las filas y celdas vacías del final: siempre leer con ?? '' */
  return (await res.json()).values ?? []
}

async function appendRow(range, row) {
  const token = await getAccessToken()
  const res = await fetch(sheetsUrl(range, ':append?valueInputOption=USER_ENTERED'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  })
  if (!res.ok) throw new Error(`Sheets append HTTP ${res.status}: ${await res.text()}`)
}

export const appendVentaRow = (row) => appendRow('Ventas!A1', row)
export const appendCanjeRow = (row) => appendRow('Canjes!A1', row)
