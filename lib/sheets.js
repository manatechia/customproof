import { createSign } from 'node:crypto'

/* Acceso a Google Sheets con service account, sin dependencias:
   JWT RS256 firmado a mano e intercambiado por un access token. */

const b64url = (s) => Buffer.from(s).toString('base64url')

async function getAccessToken() {
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
  return (await res.json()).access_token
}

const sheetsUrl = (range, suffix = '') => {
  const id = process.env.SHEETS_SPREADSHEET_ID
  if (!id) throw new Error('Falta SHEETS_SPREADSHEET_ID')
  return `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}${suffix}`
}

export async function appendVentaRow(row) {
  const token = await getAccessToken()
  const res = await fetch(sheetsUrl('Ventas!A1', ':append?valueInputOption=USER_ENTERED'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  })
  if (!res.ok) throw new Error(`Sheets append HTTP ${res.status}: ${await res.text()}`)
}
