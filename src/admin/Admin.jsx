import { useEffect, useMemo, useState } from 'react'
import { normalizeImg } from '../../lib/catalog.js'

/* fetch que entiende el 401 como "sesión vencida" y no como error genérico */
async function api(path, opts = {}) {
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

function Login({ onDone }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('admin-login', { method: 'POST', body: { user, pass } })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="adm-login" onSubmit={submit}>
      <img src="/logo.png" alt="Custom Proof" className="adm-logo" />
      <h1>Admin</h1>
      <label>Usuario<input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoFocus /></label>
      <label>Contraseña<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" /></label>
      {error && <p className="adm-error">{error}</p>}
      <button className="adm-btn" disabled={busy || !user || !pass}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  )
}

function ProductRow({ p, onSaved, onAuth }) {
  const [url, setUrl] = useState(p.imagen)
  const [state, setState] = useState({ s: 'idle' })
  const dirty = url.trim() !== p.imagen
  const preview = url.trim() ? normalizeImg(url.trim()) : ''

  const save = async () => {
    setState({ s: 'saving' })
    try {
      const r = await api('admin-products', { method: 'PATCH', body: { id: p.id, field: 'imagen', value: url } })
      onSaved(p.id, r.value)
      setUrl(r.value)
      setState({ s: 'ok' })
    } catch (err) {
      if (err.auth) return onAuth()
      setState({ s: 'error', msg: err.message })
    }
  }

  return (
    <li className={`adm-row${p.activo ? '' : ' adm-off'}`}>
      <div className="adm-thumb">
        {preview ? <img src={preview} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} onLoad={(e) => { e.currentTarget.style.visibility = 'visible' }} /> : <span>sin foto</span>}
      </div>
      <div className="adm-body">
        <div className="adm-title">
          <strong>{p.titulo}</strong>
          <span className="adm-meta">{p.categoria || 'Otros'} · fila {p.fila}{p.activo ? '' : ' · inactivo'}</span>
        </div>
        {p.editable ? (
          <div className="adm-edit">
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setState({ s: 'idle' }) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save() }}
              placeholder="https://res.cloudinary.com/… o enlace de Drive"
              inputMode="url"
            />
            <button className="adm-btn" onClick={save} disabled={!dirty || state.s === 'saving'}>
              {state.s === 'saving' ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        ) : (
          <p className="adm-warn">{p.id ? `El id "${p.id}" está repetido en el sheet` : 'Cargá un id en el sheet para poder editarlo'}</p>
        )}
        {state.s === 'ok' && <p className="adm-ok">Guardado. Se ve en la web en hasta 5 minutos.</p>}
        {state.s === 'error' && <p className="adm-error">{state.msg}</p>}
      </div>
    </li>
  )
}

function Products({ onAuth, onLogout }) {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = () => {
    setError('')
    api('admin-products')
      .then(setProducts)
      .catch((err) => (err.auth ? onAuth() : setError(err.message)))
  }
  useEffect(load, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!products || !t) return products
    return products.filter((p) => `${p.titulo} ${p.categoria} ${p.id}`.toLowerCase().includes(t))
  }, [products, q])

  const onSaved = (id, imagen) =>
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, imagen } : p)))

  return (
    <div className="adm-page">
      <header className="adm-header">
        <img src="/logo.png" alt="Custom Proof" className="adm-logo" />
        <h1>Imágenes del catálogo</h1>
        <button className="adm-link" onClick={onLogout}>Salir</button>
      </header>
      <div className="adm-tools">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, categoría o id" type="search" />
        <button className="adm-link" onClick={load}>Recargar</button>
      </div>
      {error && <p className="adm-error">{error} <button className="adm-link" onClick={load}>Reintentar</button></p>}
      {!products && !error && <p className="adm-meta">Cargando productos del sheet…</p>}
      {shown && (
        <ul className="adm-list">
          {/* key con fila: dos filas sin id no pueden compartir clave */}
          {shown.map((p) => <ProductRow key={`${p.fila}-${p.id}`} p={p} onSaved={onSaved} onAuth={onAuth} />)}
        </ul>
      )}
      {shown && shown.length === 0 && <p className="adm-meta">Ningún producto coincide.</p>}
    </div>
  )
}

export default function Admin() {
  /* null mientras se consulta si hay sesión, para no parpadear el login */
  const [logged, setLogged] = useState(null)

  useEffect(() => {
    fetch('/api/admin-login').then((r) => setLogged(r.ok)).catch(() => setLogged(false))
  }, [])

  const logout = async () => {
    await fetch('/api/admin-login', { method: 'DELETE' }).catch(() => {})
    setLogged(false)
  }

  if (logged === null) return null
  return logged
    ? <Products onAuth={() => setLogged(false)} onLogout={logout} />
    : <Login onDone={() => setLogged(true)} />
}
