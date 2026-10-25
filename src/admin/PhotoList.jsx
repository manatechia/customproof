import { normalizeImg } from '../../lib/catalog.js'

/* Lista de URLs de fotos: la primera es la principal. `urls` siempre trae
   al menos un elemento (vacío) para que haya dónde pegar. */
export default function PhotoList({ urls, onChange }) {
  const setAt = (n, v) => onChange(urls.map((u, k) => (k === n ? v : u)))
  const remove = (n) => onChange(urls.length > 1 ? urls.filter((_, k) => k !== n) : [''])
  const toFront = (n) => onChange([urls[n], ...urls.filter((_, k) => k !== n)])

  return (
    <div className="adm-photos">
      <ul className="adm-urls">
        {urls.map((u, n) => {
          const preview = u.trim() ? normalizeImg(u.trim()) : ''
          return (
            <li key={n} className="adm-url">
              <div className="adm-thumb">
                {preview
                  ? <img src={preview} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} onLoad={(e) => { e.currentTarget.style.visibility = 'visible' }} />
                  : <span>sin foto</span>}
                {n === 0 && urls.length > 1 && <span className="adm-main">principal</span>}
              </div>
              <input
                value={u}
                onChange={(e) => setAt(n, e.target.value)}
                placeholder="https://res.cloudinary.com/… o enlace de Drive"
                inputMode="url"
                aria-label={`Foto ${n + 1}`}
              />
              <div className="adm-url-actions">
                {n > 0 && <button type="button" className="adm-link" onClick={() => toFront(n)} title="Hacerla la foto principal">★</button>}
                {(urls.length > 1 || u) && <button type="button" className="adm-link" onClick={() => remove(n)} title="Quitar esta foto">✕</button>}
              </div>
            </li>
          )
        })}
      </ul>
      {urls.length < 10 && <button type="button" className="adm-link" onClick={() => onChange([...urls, ''])}>+ Agregar foto</button>}
    </div>
  )
}
