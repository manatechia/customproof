import { useState } from 'react'
import { api, same } from './api.js'

/* La lista se edita entera y se guarda en cada cambio (PUT de todo). Borrar
   una categoría o subcategoría de la lista no toca los productos: siguen
   con lo que tienen y aparecen como "no está en la lista" al editarlos. */
export default function CategoriesTab({ products, categories, setCategories, onAuth }) {
  const [newCat, setNewCat] = useState('')
  const [newSub, setNewSub] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const countCat = (name) => products.filter((p) => same(p.categoria, name)).length
  const countSub = (cat, sub) => products.filter((p) => same(p.categoria, cat) && p.subcategorias.some((s) => same(s, sub))).length

  const save = async (next, text) => {
    const prev = categories
    setCategories(next)
    setBusy(true)
    setMsg(null)
    try {
      const r = await api('admin-categories', { method: 'PUT', body: { categories: next } })
      setCategories(r.categories)
      setMsg({ ok: true, text })
    } catch (err) {
      setCategories(prev)
      if (err.auth) return onAuth()
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const addCat = (e) => {
    e.preventDefault()
    const name = newCat.trim()
    if (!name) return
    if (categories.some((c) => same(c.name, name))) return setMsg({ ok: false, text: `Ya existe la categoría "${name}"` })
    setNewCat('')
    save([...categories, { name, subs: [] }], `Categoría "${name}" agregada.`)
  }

  const addSub = (cat) => (e) => {
    e.preventDefault()
    const name = (newSub[cat.name] ?? '').trim()
    if (!name) return
    if (cat.subs.some((s) => same(s, name))) return setMsg({ ok: false, text: `"${cat.name}" ya tiene "${name}"` })
    setNewSub((s) => ({ ...s, [cat.name]: '' }))
    save(categories.map((c) => (c === cat ? { ...c, subs: [...c.subs, name] } : c)), `Subcategoría "${name}" agregada a ${cat.name}.`)
  }

  const removeCat = (cat) => {
    const n = countCat(cat.name)
    if (!confirm(`¿Quitar la categoría "${cat.name}" de la lista?${n ? `\n\n${n} productos la siguen teniendo: no se modifican.` : ''}`)) return
    save(categories.filter((c) => c !== cat), `Categoría "${cat.name}" quitada.`)
  }

  const removeSub = (cat, sub) => {
    const n = countSub(cat.name, sub)
    if (n && !confirm(`¿Quitar "${sub}" de ${cat.name}?\n\n${n} productos la siguen teniendo: no se modifican.`)) return
    save(categories.map((c) => (c === cat ? { ...c, subs: c.subs.filter((s) => s !== sub) } : c)), `Subcategoría "${sub}" quitada.`)
  }

  return (
    <div className="adm-cats">
      <form className="adm-add" onSubmit={addCat}>
        <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nueva categoría (ej: Tazas)" aria-label="Nueva categoría" />
        <button className="adm-btn" disabled={!newCat.trim() || busy}>Agregar categoría</button>
      </form>
      {msg && <p className={msg.ok ? 'adm-ok' : 'adm-error'}>{msg.text}</p>}

      {categories.length === 0 && <p className="adm-meta">Todavía no hay categorías.</p>}
      <ul className="adm-cat-list">
        {categories.map((c) => (
          <li key={c.name} className="adm-cat">
            <div className="adm-cat-head">
              <h3>{c.name}</h3>
              <span className="adm-meta">{countCat(c.name)} productos</span>
              <button className="adm-link adm-danger" onClick={() => removeCat(c)} disabled={busy}>Quitar</button>
            </div>
            <div className="adm-chips">
              {c.subs.length === 0 && <span className="adm-meta">Sin subcategorías</span>}
              {c.subs.map((s) => (
                <span key={s} className="adm-chip is-static">
                  {s} <small>{countSub(c.name, s)}</small>
                  <button className="adm-chip-x" onClick={() => removeSub(c, s)} disabled={busy} aria-label={`Quitar ${s}`}>✕</button>
                </span>
              ))}
            </div>
            <form className="adm-add adm-add-sm" onSubmit={addSub(c)}>
              <input value={newSub[c.name] ?? ''} onChange={(e) => setNewSub((s) => ({ ...s, [c.name]: e.target.value }))} placeholder="Nueva subcategoría" aria-label={`Nueva subcategoría de ${c.name}`} />
              <button className="adm-link" disabled={!(newSub[c.name] ?? '').trim() || busy}>+ Agregar</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
