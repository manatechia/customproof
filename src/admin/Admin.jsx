import { useEffect, useState } from 'react'
import { api } from './api.js'
import ProductsTab from './ProductsTab.jsx'
import CategoriesTab from './CategoriesTab.jsx'

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

const TABS = { productos: 'Productos', categorias: 'Categorías' }

function Dashboard({ onAuth, onLogout }) {
  const [tab, setTab] = useState('productos')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  /* Después de cada guardado se relee todo: la hoja es la única fuente de verdad */
  const load = async () => {
    setError('')
    try {
      setData(await api('admin-products'))
    } catch (err) {
      if (err.auth) return onAuth()
      setError(err.message)
    }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="adm-page">
      <header className="adm-header">
        <img src="/logo.png" alt="Custom Proof" className="adm-logo" />
        <nav className="adm-tabs" role="tablist">
          {Object.entries(TABS).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`adm-tab${tab === k ? ' is-on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        <button className="adm-link" onClick={load}>Recargar</button>
        <button className="adm-link" onClick={onLogout}>Salir</button>
      </header>

      {error && <p className="adm-error">{error} <button className="adm-link" onClick={load}>Reintentar</button></p>}
      {!data && !error && <p className="adm-meta">Cargando el sheet…</p>}
      {data?.assigned > 0 && <p className="adm-ok">Se asignó id a {data.assigned} producto{data.assigned === 1 ? '' : 's'} (el número de su fila).</p>}

      {data && tab === 'productos' && (
        <ProductsTab products={data.products} categories={data.categories} reload={load} onAuth={onAuth} />
      )}
      {data && tab === 'categorias' && (
        <CategoriesTab
          products={data.products}
          categories={data.categories}
          setCategories={(categories) => setData((d) => ({ ...d, categories }))}
          onAuth={onAuth}
        />
      )}
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
    ? <Dashboard onAuth={() => setLogged(false)} onLogout={logout} />
    : <Login onDone={() => setLogged(true)} />
}
