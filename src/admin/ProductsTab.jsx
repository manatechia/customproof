import { useMemo, useState } from 'react'
import { normalizeImg, splitImgs } from '../../lib/catalog.js'
import { api, same } from './api.js'
import ProductEditor from './ProductEditor.jsx'

const NO_CAT = '__sin__'

/* Acción masiva: qué se le hace a los productos seleccionados */
const BULK = {
  categoria: 'Mover a la categoría',
  addSub: 'Agregar la subcategoría',
  removeSub: 'Quitar la subcategoría',
}

/* Orden de la tabla. "Fecha" es la de alta: la hoja no guarda fechas, pero
   cada producto nuevo va al final con el siguiente id, así que id más alto =
   más nuevo. Los vacíos quedan siempre al final, en cualquier dirección. */
const text = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })
const price = (p) => {
  const n = parseFloat(String(p.precio).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const SORTS = {
  fecha: { label: 'Fecha de alta', get: (p) => Number(p.id) || p.fila, cmp: (a, b) => a - b, first: 'desc' },
  titulo: { label: 'Nombre', get: (p) => p.titulo, cmp: text, first: 'asc' },
  categoria: { label: 'Categoría', get: (p) => p.categoria || null, cmp: text, first: 'asc' },
  sub: { label: 'Subcategoría', get: (p) => [...p.subcategorias].sort(text).join(', ') || null, cmp: text, first: 'asc' },
  precio: { label: 'Precio', get: price, cmp: (a, b) => a - b, first: 'asc' },
}

/* "2026-10-25 14:03" o "2026-10-25" -> "25/10/2026" */
const fmtDate = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '')

function sortProducts(list, { key, dir }) {
  const s = SORTS[key]
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((x, y) => {
    const a = s.get(x)
    const b = s.get(y)
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
    /* A igual valor, por nombre: dentro de una categoría quedan ordenados */
    return s.cmp(a, b) * sign || text(x.titulo, y.titulo)
  })
}

/* Para el select: cada campo en sus dos direcciones */
const SORT_OPTIONS = [
  ['fecha', 'desc', 'Más nuevos primero'],
  ['fecha', 'asc', 'Más viejos primero'],
  ['titulo', 'asc', 'Nombre A → Z'],
  ['titulo', 'desc', 'Nombre Z → A'],
  ['categoria', 'asc', 'Categoría A → Z'],
  ['categoria', 'desc', 'Categoría Z → A'],
  ['sub', 'asc', 'Subcategoría A → Z'],
  ['sub', 'desc', 'Subcategoría Z → A'],
  ['precio', 'asc', 'Precio: menor a mayor'],
  ['precio', 'desc', 'Precio: mayor a menor'],
]

export default function ProductsTab({ products, categories, reload, onAuth }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [sub, setSub] = useState('')
  const [estado, setEstado] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [editing, setEditing] = useState(null) /* producto, 'new' o null */
  const [bulk, setBulk] = useState({ op: 'categoria', value: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sort, setSort] = useState({ key: 'fecha', dir: 'desc' })

  const subsOfCat = cat && cat !== NO_CAT ? categories.find((c) => same(c.name, cat))?.subs ?? [] : []

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return sortProducts(products.filter((p) =>
      (!cat || (cat === NO_CAT ? !p.categoria : same(p.categoria, cat))) &&
      (!sub || p.subcategorias.some((s) => same(s, sub))) &&
      (!estado || (estado === 'on' ? p.activo : !p.activo)) &&
      (!t || `${p.titulo} ${p.id} ${p.subcategorias.join(' ')}`.toLowerCase().includes(t)),
    ), sort)
  }, [products, q, cat, sub, estado, sort])

  /* Click en una cabecera: primero en su dirección natural, otro click la invierte */
  const sortBy = (key) => setSort((s) => (s.key === key
    ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: SORTS[key].first }))
  const th = (k, children, className = '') => (
    <th key={k} className={`${className} adm-sortable`} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => sortBy(k)}>
        {children}
        <span className="adm-sort-ind">{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  )

  const shownEditable = shown.filter((p) => p.editable)
  const allShownSelected = shownEditable.length > 0 && shownEditable.every((p) => selected.has(p.id))
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s)
    shownEditable.forEach((p) => (allShownSelected ? n.delete(p.id) : n.add(p.id)))
    return n
  })

  /* Opciones del segundo select según la acción masiva */
  const bulkOptions = useMemo(() => {
    if (bulk.op === 'categoria') return categories.map((c) => ({ v: c.name, label: c.name }))
    if (bulk.op === 'addSub') {
      return categories.flatMap((c) => c.subs.map((s) => ({ v: s, label: `${c.name} › ${s}` })))
    }
    const present = new Map()
    products.filter((p) => selected.has(p.id)).forEach((p) => p.subcategorias.forEach((s) => present.set(s.toLowerCase(), s)))
    return [...present.values()].map((s) => ({ v: s, label: s }))
  }, [bulk.op, categories, products, selected])

  const applyBulk = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await api('admin-products', { method: 'PATCH', body: { ids: [...selected], op: bulk.op, value: bulk.value } })
      setMsg({ ok: true, text: `Listo: ${r.count} producto${r.count === 1 ? '' : 's'} actualizado${r.count === 1 ? '' : 's'}.` })
      setSelected(new Set())
      await reload()
    } catch (err) {
      if (err.auth) return onAuth()
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  /* Elimina los ids dados (el botón de la fila o la selección), con confirmación */
  const remove = async (ids) => {
    const names = products.filter((p) => ids.includes(p.id)).map((p) => p.titulo)
    const one = names.length === 1
    const question = one
      ? `¿Eliminar "${names[0]}"?`
      : `¿Eliminar ${names.length} productos?\n\n· ${names.slice(0, 8).join('\n· ')}${names.length > 8 ? `\n… y ${names.length - 8} más` : ''}`
    if (!confirm(`${question}\n\nSe borra${one ? '' : 'n'} del sheet y deja${one ? '' : 'n'} de verse en la tienda.`)) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await api('admin-products', { method: 'DELETE', body: { ids } })
      setMsg({ ok: true, text: `${one ? `Eliminado "${names[0]}"` : `Eliminados ${r.count} productos`}. Se puede recuperar desde el historial de versiones del sheet.` })
      setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n })
      await reload()
    } catch (err) {
      if (err.auth) return onAuth()
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="adm-filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o id" type="search" />
        <select value={cat} onChange={(e) => { setCat(e.target.value); setSub('') }} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          <option value={NO_CAT}>Sin categoría</option>
        </select>
        <select value={sub} onChange={(e) => setSub(e.target.value)} disabled={!subsOfCat.length} aria-label="Subcategoría">
          <option value="">Todas las subcategorías</option>
          {subsOfCat.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Activos e inactivos</option>
          <option value="on">Solo activos</option>
          <option value="off">Solo inactivos</option>
        </select>
        <select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir }) }} aria-label="Ordenar por">
          {SORT_OPTIONS.map(([k, d, label]) => <option key={`${k}:${d}`} value={`${k}:${d}`}>{label}</option>)}
        </select>
        <button className="adm-btn" onClick={() => setEditing('new')}>+ Agregar producto</button>
      </div>

      {selected.size > 0 && (
        <div className="adm-bulk">
          <strong>{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</strong>
          <select value={bulk.op} onChange={(e) => setBulk({ op: e.target.value, value: '' })} aria-label="Acción">
            {Object.entries(BULK).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))} aria-label="Destino">
            <option value="">Elegí…</option>
            {bulkOptions.map((o) => <option key={o.label} value={o.v}>{o.label}</option>)}
          </select>
          <button className="adm-btn" onClick={applyBulk} disabled={!bulk.value || busy}>{busy ? 'Aplicando…' : 'Aplicar'}</button>
          <button className="adm-link" onClick={() => setSelected(new Set())}>Deseleccionar</button>
          <button className="adm-link adm-danger adm-bulk-del" onClick={() => remove([...selected])} disabled={busy}>Eliminar</button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'adm-ok' : 'adm-error'}>{msg.text}</p>}

      <p className="adm-meta">{shown.length} de {products.length} productos</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th className="adm-check"><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Seleccionar todos los que se ven" /></th>
              <th>Foto</th>
              <th>Id</th>
              {th('fecha', 'Creado')}
              {th('titulo', 'Título')}
              {th('categoria', 'Categoría')}
              {th('sub', 'Subcategorías')}
              {th('precio', 'Precio', 'adm-num')}
              <th>Estado</th>
              <th><span className="adm-sr">Eliminar</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const img = splitImgs(p.imagen)[0]
              const n = splitImgs(p.imagen).length
              return (
                <tr key={`${p.fila}-${p.id}`} className={`${p.activo ? '' : 'adm-off'}${selected.has(p.id) ? ' is-sel' : ''}`} onClick={() => p.editable && setEditing(p)}>
                  <td className="adm-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={!p.editable} aria-label={`Seleccionar ${p.titulo}`} />
                  </td>
                  <td>
                    <div className="adm-thumb adm-thumb-sm">
                      {img ? <img src={normalizeImg(img)} alt="" loading="lazy" /> : <span>—</span>}
                      {n > 1 && <span className="adm-count">{n}</span>}
                    </div>
                  </td>
                  <td className="adm-id">{p.editable ? p.id : <span className="adm-warn" title="Id repetido en la hoja">{p.id} ⚠</span>}</td>
                  <td className="adm-date">
                    {p.fecha
                      ? <span title={p.fecha}>{fmtDate(p.fecha)}</span>
                      : p.fechaFoto
                        ? <span className="adm-meta" title="Aproximada: es la fecha en que se subió la foto. Los productos nuevos guardan la fecha real.">≈ {fmtDate(p.fechaFoto)}</span>
                        : <span className="adm-meta">—</span>}
                  </td>
                  <td className="adm-name">{p.titulo}</td>
                  <td>{p.categoria || <span className="adm-meta">—</span>}</td>
                  <td className="adm-subs">{p.subcategorias.join(', ')}</td>
                  <td className="adm-num">{p.precio ? `${p.precio} €` : '—'}</td>
                  <td>{p.activo ? 'Activo' : 'Inactivo'}{p.destacado ? ' · ★' : ''}</td>
                  <td className="adm-row-del" onClick={(e) => e.stopPropagation()}>
                    {p.editable && (
                      <button className="adm-del-btn" onClick={() => remove([p.id])} disabled={busy} title="Eliminar este producto" aria-label={`Eliminar ${p.titulo}`}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="adm-meta adm-empty">Ningún producto coincide con los filtros.</p>}
      </div>

      {editing && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          categories={categories}
          defaultCat={cat && cat !== NO_CAT ? cat : ''}
          onClose={() => setEditing(null)}
          onSaved={async (text) => { setEditing(null); setMsg({ ok: true, text }); await reload() }}
          onAuth={onAuth}
        />
      )}
    </>
  )
}
