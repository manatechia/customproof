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

/* Llamada autenticada a la API del spreadsheet (no a values/) */
async function sheetsApi(suffix, init = {}) {
  const token = await getAccessToken()
  const id = process.env.SHEETS_SPREADSHEET_ID
  if (!id) throw new Error('Falta SHEETS_SPREADSHEET_ID')
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${suffix}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

/* Escribe celdas sueltas en un solo request: [{ range, value }]. El admin
   edita por celda para no pisar lo que se haya cambiado a mano en el resto
   de la fila. */
export async function updateCells(cells) {
  if (!cells.length) return
  await sheetsApi('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: cells.map(({ range, value }) => ({ range, values: [[value]] })),
    }),
  })
}

/* Vacía rangos sin borrar filas: lo de abajo no se corre */
export async function clearRanges(ranges) {
  if (!ranges.length) return
  await sheetsApi('/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges }) })
}

/* Reemplaza un bloque entero (para pestañas chicas que el admin reescribe completas) */
export async function writeRange(range, rows) {
  await clearRanges([range])
  if (!rows.length) return
  await sheetsApi('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range, values: rows }] }),
  })
}

/* Nombres de pestañas por gid, cacheados como el token */
let tabs = null

async function tabTitles() {
  if (!tabs) {
    const meta = await sheetsApi('?fields=sheets.properties(sheetId,title)')
    tabs = new Map(meta.sheets.map((s) => [s.properties.sheetId, s.properties.title]))
  }
  return tabs
}

/* El catálogo es la pestaña gid=0 (la del CSV publicado). Su nombre se busca
   en vez de hardcodearlo: renombrar la pestaña no debe romper el admin. */
export async function catalogTabName() {
  const title = (await tabTitles()).get(0)
  if (!title) throw new Error('No se encontró la pestaña del catálogo (gid=0)')
  return title
}

/* Crea la pestaña si no existe. Devuelve true si la tuvo que crear. */
export async function ensureTab(title) {
  if ([...(await tabTitles()).values()].includes(title)) return false
  /* Puede haberla creado otra instancia desde que cacheamos: releer antes de crear */
  tabs = null
  if ([...(await tabTitles()).values()].includes(title)) return false
  const r = await sheetsApi(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  })
  const props = r.replies[0].addSheet.properties
  tabs.set(props.sheetId, props.title)
  return true
}

/* Cambios de estructura (mover filas, etc.) en un solo request: o se aplican todos o ninguno */
export async function batchUpdate(requests) {
  if (!requests.length) return []
  const r = await sheetsApi(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) })
  return r.replies ?? []
}

/* Rango A1 con el nombre de pestaña entre comillas (puede tener espacios) */
export const tabRange = (tab, a1) => `'${tab.replace(/'/g, "''")}'!${a1}`

export const appendVentaRow = (row) => appendRow('Ventas!A1', row)
export const appendCanjeRow = (row) => appendRow('Canjes!A1', row)
