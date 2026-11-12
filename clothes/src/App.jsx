import { useEffect, useRef, useState } from 'react'
import { eur, waLink } from './brand.js'
import Scene from './Scene.jsx'

const BAG_KEY = 'cpc-bag'

/* El catálogo es el mismo de www (la Sheet): acá solo entra la categoría Ropa */
async function fetchClothes() {
  const res = await fetch('/api/products')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const all = await res.json()
  return all.filter((p) => String(p.cat).toLowerCase() === 'ropa')
}

function loadBag() {
  try {
    const v = JSON.parse(localStorage.getItem(BAG_KEY))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/* "Composición 80% Algodón - Gramaje: 260 g/m2 - Unisex" -> fichas sueltas */
const specsOf = (desc) =>
  String(desc ?? '').split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^([^:]{2,20}):\s*(.+)$/) || s.match(/^(Composición)\s+(.+)$/i)
    return m ? { k: m[1], v: m[2] } : { k: '', v: s }
  })

/* Tienda virtual en 3D (three.js, ver Scene.jsx): una sala con un perchero.
   "Tienda" es el plano general; "Ropa" acerca la cámara al perchero y al
   elegir una prenda la cámara la encuadra junto al panel. */
function useMobile() {
  const q = '(max-width: 720px)'
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

export default function App() {
  const [products, setProducts] = useState(null) /* null = cargando */
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState('store') /* 'store' | 'rail' */
  const [sub, setSub] = useState('') /* '' = toda la ropa */
  const [sel, setSel] = useState(null)
  const [paused, setPaused] = useState(false) /* la elegida deja de girar */
  const [bag, setBag] = useState(loadBag)
  const [bagOpen, setBagOpen] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)
  const mobile = useMobile()

  useEffect(() => {
    fetchClothes()
      .then(setProducts)
      .catch((e) => { console.warn('No se pudo cargar el catálogo:', e); setFailed(true); setProducts([]) })
  }, [])

  useEffect(() => {
    try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)) } catch { /* modo privado: la bolsa vive solo en memoria */ }
  }, [bag])

  const looks = products ?? []
  const subs = [...new Set(looks.flatMap((p) => p.subs ?? []))]
  const shown = looks.filter((p) => !sub || p.subs?.includes(sub))
  const selP = shown.find((p) => p.id === sel) ?? null

  /* Cada prenda nueva arranca girando */
  useEffect(() => { setPaused(false) }, [sel])

  /* Escape va deshaciendo de a un paso: bolsa, prenda, zoom */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (bagOpen) setBagOpen(false)
      else if (sel) setSel(null)
      else setView('store')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bagOpen, sel])

  function pick(p) {
    setView('rail')
    setSel((cur) => (cur === p.id ? null : p.id))
  }

  function goto(nextView, nextSub = '') {
    setView(nextView)
    setSub(nextSub)
    setSel(null)
  }

  function step(dir) {
    if (!selP) return
    const i = shown.indexOf(selP)
    setSel(shown[(i + dir + shown.length) % shown.length].id)
  }

  const count = bag.reduce((n, b) => n + b.qty, 0)
  const total = bag.reduce((n, b) => n + b.qty * b.price, 0)

  function add(p, opt) {
    setBag((prev) => {
      const key = `${p.id}|${opt.v}`
      const hit = prev.find((b) => b.key === key)
      if (hit) return prev.map((b) => (b === hit ? { ...b, qty: b.qty + 1 } : b))
      return [...prev, { key, id: p.id, name: p.name, size: opt.v, price: opt.p, img: p.img, qty: 1 }]
    })
    clearTimeout(toastTimer.current)
    setToast(`${p.name}${opt.v ? ` · ${opt.v}` : ''} a la bolsa`)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }

  const setQty = (key, qty) =>
    setBag((prev) => (qty <= 0 ? prev.filter((b) => b.key !== key) : prev.map((b) => (b.key === key ? { ...b, qty } : b))))

  function order() {
    const msg = [
      '¡Hola Custom Proof! Quiero este pedido de Clothes:',
      '',
      ...bag.map((b) => `• ${b.qty}x ${b.name}${b.size ? ` (talle ${b.size})` : ''} — ${eur(b.price * b.qty)}`),
      '',
      `Total: ${eur(total)} + envío`,
    ].join('\n')
    window.open(waLink(msg), '_blank', 'noopener')
  }

  return (
    <div className={`store view-${view}${selP ? ' has-sel' : ''}`}>
      <Scene
        products={shown}
        view={view}
        selId={selP?.id ?? null}
        paused={paused}
        onPick={pick}
        onEnter={() => goto('rail', sub)}
        mobile={mobile}
      />

      {/* La escena es un canvas: para teclado y lectores de pantalla el
          perchero también existe como lista de botones (invisible) */}
      <ul className="sr-only" aria-label="Prendas del perchero">
        {shown.map((p) => (
          <li key={p.id}>
            <button onClick={() => pick(p)} aria-pressed={p.id === sel}>
              {p.name}, {eur(Math.min(...p.opts.map((o) => o.p)))}
            </button>
          </li>
        ))}
      </ul>

      {products === null && <p className="status">Colgando la ropa…</p>}
      {products && !shown.length && (
        <p className="status">
          {failed ? 'El catálogo no está disponible ahora mismo.' : 'Todavía no hay prendas colgadas.'}{' '}
          <a href={waLink('¡Hola Custom Proof! Quiero consultar por la ropa.')} target="_blank" rel="noopener">Escribinos por WhatsApp</a>.
        </p>
      )}

      {view === 'rail' && !selP && shown.length > 0 && (
        <p className="rail-hint">{mobile ? 'Deslizá para recorrer · tocá una prenda' : 'Pasá el mouse por las prendas · hacé clic para verla'}</p>
      )}

      {view === 'store' && looks.length > 0 && (
        <button className="enter-hint" onClick={() => goto('rail', sub)}>Tocá el perchero para entrar</button>
      )}

      <header className="top">
        <span className="top-brand">Custom Proof <b>Clothes</b></span>
        <span className="top-sub">tienda virtual · Barcelona</span>
      </header>
      <a className="top-link" href="https://www.customproof.es/">customproof.es ↗</a>

      {selP && <Panel key={selP.id} p={selP} paused={paused} onPause={() => setPaused((v) => !v)} onAdd={add} onClose={() => setSel(null)} onStep={shown.length > 1 ? step : null} />}

      <nav className="dock" aria-label="Secciones">
        <button className={view === 'store' ? 'on' : ''} onClick={() => goto('store')}>Tienda</button>
        <button className={view === 'rail' && !sub ? 'on' : ''} onClick={() => goto('rail')}>Ropa</button>
        {subs.map((s) => (
          <button key={s} className={view === 'rail' && sub === s ? 'on' : ''} onClick={() => goto('rail', s)}>{s}</button>
        ))}
        <a href={waLink('¡Hola Custom Proof! Quiero ropa con mi propio diseño. Les mando el archivo.')} target="_blank" rel="noopener">Tu diseño</a>
        <span className="dock-sep" />
        <button className="dock-bag" onClick={() => setBagOpen(true)} aria-label={`Abrir la bolsa, ${count} prendas`}>
          Bolsa{count > 0 && <span className="bag-count">{count}</span>}
        </button>
      </nav>

      <div className={`toast${toast ? ' show' : ''}`} role="status">{toast}</div>

      <div className={`drawer-wrap${bagOpen ? ' open' : ''}`} aria-hidden={!bagOpen} inert={!bagOpen}>
        <div className="drawer-bg" onClick={() => setBagOpen(false)} />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="Tu bolsa">
          <div className="drawer-head">
            <h2>Tu bolsa</h2>
            <button className="x" onClick={() => setBagOpen(false)} aria-label="Cerrar la bolsa">✕</button>
          </div>
          {bag.length ? (
            <>
              <ul className="bag-list">
                {bag.map((b) => (
                  <li key={b.key} className="bag-item">
                    {b.img ? <img src={b.img} alt="" /> : <span className="bag-noimg" />}
                    <div className="bag-info">
                      <p className="bag-name">{b.name}</p>
                      {b.size && <p className="bag-size">Talle {b.size}</p>}
                      <div className="qty">
                        <button onClick={() => setQty(b.key, b.qty - 1)} aria-label="Quitar uno">−</button>
                        <span>{b.qty}</span>
                        <button onClick={() => setQty(b.key, b.qty + 1)} aria-label="Sumar uno">+</button>
                      </div>
                    </div>
                    <p className="bag-price">{eur(b.price * b.qty)}</p>
                  </li>
                ))}
              </ul>
              <div className="drawer-foot">
                <div className="total"><span>Total</span><b>{eur(total)}</b></div>
                <p className="drawer-note">El envío y el pago los coordinamos por WhatsApp. Antes de estampar te mandamos la vista previa.</p>
                <button className="btn btn-wa" onClick={order}>Pedir por WhatsApp</button>
              </div>
            </>
          ) : (
            <p className="bag-empty">Tu bolsa está vacía. Tocá una prenda del perchero, elegí el talle y sumala.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

/* El panel de vidrio de la prenda elegida: talles y "Sumar a la bolsa" */
function Panel({ p, paused, onPause, onAdd, onClose, onStep }) {
  const sized = p.opts.some((o) => o.v)
  const [size, setSize] = useState(sized ? '' : p.opts[0]?.v ?? '')
  const [nudge, setNudge] = useState(0)
  const opt = p.opts.find((o) => o.v === size)
  const prices = p.opts.map((o) => o.p)
  const from = Math.min(...prices)
  const varies = prices.some((x) => x !== from)
  const specs = specsOf(p.desc)

  function addToBag() {
    if (!opt) { setNudge((n) => n + 1); return }
    onAdd(p, opt)
  }

  return (
    <section className="panel" aria-label={p.name}>
      <button className="x panel-x" onClick={onClose} aria-label="Cerrar">✕</button>
      <p className="panel-kicker">Ropa{p.subs?.length ? ` · ${p.subs.join(' · ')}` : ''}</p>
      <h1 className="panel-name">{p.name}</h1>
      <div className="panel-row">
        <p className="panel-price">{varies && !opt ? 'desde ' : ''}{eur(opt ? opt.p : from)}</p>
        <button className="flip" onClick={onPause} aria-pressed={paused}>{paused ? 'Girar ↻' : 'Pausar ❚❚'}</button>
      </div>
      {specs.length > 0 && (
        <ul className="specs">
          {specs.map((s) => <li key={s.k + s.v}>{s.k && <span>{s.k}</span>}{s.v}</li>)}
        </ul>
      )}

      {sized && (
        <fieldset className={`sizes${nudge ? ' nudge' : ''}`} key={nudge}>
          <legend>{opt ? `Talle ${opt.v}` : nudge ? 'Elegí un talle primero' : 'Elegí tu talle'}</legend>
          <div className="size-grid">
            {p.opts.map((o) => (
              <button
                key={o.v}
                className={`size${o.v === size ? ' on' : ''}`}
                onClick={() => setSize(o.v)}
                aria-pressed={o.v === size}
                title={varies ? eur(o.p) : undefined}
              >
                {o.v}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <button className="btn btn-ink" onClick={addToBag}>Sumar a la bolsa</button>
      <div className="panel-foot">
        <a href={waLink(`¡Hola Custom Proof! Tengo una duda con el talle de «${p.name}».`)} target="_blank" rel="noopener">¿Dudas con el talle?</a>
        {onStep && (
          <span className="panel-nav">
            <button onClick={() => onStep(-1)} aria-label="Prenda anterior">←</button>
            <button onClick={() => onStep(1)} aria-label="Prenda siguiente">→</button>
          </span>
        )}
      </div>
    </section>
  )
}
