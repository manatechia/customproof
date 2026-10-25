/* fetch que entiende el 401 como "sesión vencida" y no como error genérico */
export async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) throw Object.assign(new Error(data.error || 'Sesión vencida'), { auth: true })
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

/* Para comparar categorías sin que importen mayúsculas ni espacios */
export const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
