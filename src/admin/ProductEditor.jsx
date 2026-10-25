import { useEffect, useState } from 'react'
import { splitImgs } from '../../lib/catalog.js'
import { api, same } from './api.js'
import PhotoList from './PhotoList.jsx'

const EMPTY = {
  titulo: '', precio: '', categoria: '', subcategorias: [], descripcion: '',
  tag: '', imagen: [''], activo: true, destacado: false, orden: '',
}

const toForm = (p) => ({
  ...EMPTY,
  ...p,
  imagen: splitImgs(p.imagen).length ? splitImgs(p.imagen) : [''],
})

/* Lo que se manda: las fotos vacías no cuentan */
const toFields = (f) => ({ ...f, imagen: f.imagen.map((u) => u.trim()).filter(Boolean) })

const EDITABLE = Object.keys(EMPTY)

/* Alta (product = null) o edición. En la edición solo viajan los campos
   tocados, así no se reescribe lo que no cambió (ni su formato en la hoja). */
export default function ProductEditor({ product, categories, defaultCat, onClose, onSaved, onAuth }) {
  const [form, setForm] = useState(() => (product ? toForm(product) : { ...EMPTY, categoria: defaultCat }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const catEntry = categories.find((c) => same(c.name, form.categoria))
  /* Las del producto que ya no están en la lista de la categoría siguen visibles para poder quitarlas */
  const subOptions = [...(catEntry?.subs ?? [])]
  form.subcategorias.forEach((s) => { if (!subOptions.some((o) => same(o, s))) subOptions.push(s) })
  const hasSub = (s) => form.subcategorias.some((x) => same(x, s))
  const toggleSub = (s) => set('subcategorias', hasSub(s) ? form.subcategorias.filter((x) => !same(x, s)) : [...form.subcategorias, s])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const fields = toFields(form)
      if (product) {
        const before = toFields(toForm(product))
        const changed = Object.fromEntries(EDITABLE.filter((k) => JSON.stringify(fields[k]) !== JSON.stringify(before[k])).map((k) => [k, fields[k]]))
        if (Object.keys(changed).length) await api('admin-products', { method: 'PATCH', body: { id: product.id, fields: changed } })
        await onSaved(`Guardado "${fields.titulo}". Se ve en la web en hasta 5 minutos.`)
      } else {
        const r = await api('admin-products', { method: 'POST', body: { fields } })
        await onSaved(`Agregado "${fields.titulo}" con id ${r.id}. Se ve en la web en hasta 5 minutos.`)
      }
    } catch (err) {
      if (err.auth) return onAuth()
      setError(err.message)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`¿Eliminar "${product.titulo}"?\n\nSe borra del sheet y deja de verse en la tienda. Si solo querés ocultarlo, desmarcá "Activo".`)) return
    setBusy(true)
    setError('')
    try {
      await api('admin-products', { method: 'DELETE', body: { ids: [product.id] } })
      await onSaved(`Eliminado "${product.titulo}". Se puede recuperar desde el historial de versiones del sheet.`)
    } catch (err) {
      if (err.auth) return onAuth()
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="adm-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="adm-dialog" onSubmit={save} role="dialog" aria-modal="true" aria-label={product ? 'Editar producto' : 'Agregar producto'}>
        <header className="adm-dialog-head">
          <h2>{product ? `Editar · id ${product.id}` : 'Agregar producto'}</h2>
          <button type="button" className="adm-link" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <div className="adm-form">
          <label className="adm-wide">Título *<input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} required autoFocus /></label>
          <label>Precio (€) *<input value={form.precio} onChange={(e) => set('precio', e.target.value)} inputMode="decimal" placeholder="2,50" required /></label>
          <label>Categoría
            <select value={catEntry?.name ?? form.categoria} onChange={(e) => set('categoria', e.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              {form.categoria && !catEntry && <option value={form.categoria}>{form.categoria} (no está en la lista)</option>}
            </select>
          </label>

          <fieldset className="adm-wide adm-chips">
            <legend>Subcategorías</legend>
            {subOptions.length === 0 && <span className="adm-meta">{form.categoria ? 'Esta categoría no tiene subcategorías: se crean en la pestaña Categorías.' : 'Elegí una categoría primero.'}</span>}
            {subOptions.map((s) => (
              <button type="button" key={s} className={`adm-chip${hasSub(s) ? ' is-on' : ''}`} onClick={() => toggleSub(s)} aria-pressed={hasSub(s)}>{s}</button>
            ))}
          </fieldset>

          <div className="adm-wide">
            <span className="adm-label">Fotos</span>
            <PhotoList urls={form.imagen} onChange={(v) => set('imagen', v)} />
          </div>

          <label className="adm-wide">Descripción<textarea rows={3} value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></label>
          <label>Etiqueta sobre la foto
            <input value={form.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Nuevo!" maxLength={40} />
            {/* Un precio acá sale como cartelito arriba de la foto: casi siempre es un error de campo */}
            {/^\s*\d+([.,]\d+)?\s*€?\s*$/.test(form.tag)
              ? <span className="adm-warn">Esto parece un precio: va en el campo Precio, no acá.</span>
              : <span className="adm-hint">El cartelito de arriba a la izquierda. Vacío = sin cartelito.</span>}
          </label>
          <label>Orden<input value={form.orden} onChange={(e) => set('orden', e.target.value)} inputMode="numeric" /></label>
          <label className="adm-check-label"><input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} /> Activo (se ve en la tienda)</label>
          <label className="adm-check-label"><input type="checkbox" checked={form.destacado} onChange={(e) => set('destacado', e.target.checked)} /> Destacado (Top de la home)</label>
        </div>

        {error && <p className="adm-error">{error}</p>}
        <footer className="adm-dialog-foot">
          {product && <button type="button" className="adm-link adm-danger adm-foot-left" onClick={remove} disabled={busy}>Eliminar producto</button>}
          <button type="button" className="adm-link" onClick={onClose}>Cancelar</button>
          <button className="adm-btn" disabled={busy}>{busy ? 'Guardando…' : product ? 'Guardar' : 'Agregar'}</button>
        </footer>
      </form>
    </div>
  )
}
