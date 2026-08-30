import { useEffect, useRef, useState } from 'react'
import { STEPS, EMAIL, PHONE_LABEL, eur, waLink } from './data.js'
import { fetchCatalog } from './catalog.js'
import { WhatsAppIcon, MailIcon, SmileyIcon, SearchIcon } from './components/Icons.jsx'
import CartDrawer from './components/CartDrawer.jsx'

const PAGE_SIZE = 30

/* Para buscar sin acentos ni mayúsculas: "cami" tiene que encontrar "CAMISETA" */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/* 1 … 4 5 6 … 12: siempre los extremos y una ventana alrededor de la actual */
function pageList(total, current) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const nums = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)
  const out = []
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

const MARQUEE = 'STICKERS DIE-CUT, RESISTENTES AL AGUA, AL SOL Y RAYONES ☆ Y MUCHOS PRODUCTOS PERSONALIZADOS! ☆ ENVÍOS GRATIS A BARCELONA EN COMPRAS SUPERIORES A 25€ ☆ '

export default function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [catalog, setCatalog] = useState(null) /* null = cargando: se muestran skeletons */
  const [cat, setCat] = useState('Todo')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  /* Persistido en localStorage para sobrevivir el redirect a Stripe y la vuelta */
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp-cart')) || [] } catch { return [] }
  })
  const [open, setOpen] = useState(false)
  const track = useRef(null)
  const catalogTop = useRef(null)
  /* Hacia qué lado se puede scrollear el carrusel; sin overflow no hay flechas */
  const [edges, setEdges] = useState({ start: true, end: true })
  const [sending, setSending] = useState(false)

  useEffect(() => {
    localStorage.setItem('cp-cart', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    let alive = true
    fetchCatalog().then((products) => { if (alive) setCatalog(products) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('cp-theme', theme)
  }, [theme])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const loading = catalog === null
  const products = catalog ?? []
  const cats = ['Todo', ...new Set(products.map((p) => p.cat))]
  const query = norm(term)
  const shown = products.filter(
    (p) => (cat === 'Todo' || p.cat === cat) && (!query || norm(p.name).includes(query))
  )
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  /* Derivado y no guardado: si el filtro achica el catálogo, la página se acota sola */
  const current = Math.min(page, pages)
  const pageItems = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  /* Los primeros 5 destacados, en el orden del catálogo (columna `orden` o el de la hoja) */
  const featured = products.filter((p) => p.dest).slice(0, 5)
  const count = cart.reduce((a, c) => a + c.qty, 0)
  const total = cart.reduce((a, c) => a + c.price * c.qty, 0)

  const syncEdges = () => {
    const el = track.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 })
  }

  const slide = (dir) => {
    const el = track.current
    if (!el) return
    const card = el.firstElementChild
    const step = card ? card.offsetWidth + 22 : el.clientWidth * 0.8
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  useEffect(() => {
    syncEdges()
    window.addEventListener('resize', syncEdges)
    return () => window.removeEventListener('resize', syncEdges)
  }, [featured.length])

  const pickCat = (c) => {
    setCat(c)
    setPage(1)
  }

  /* El filtro achica el catálogo: cualquier búsqueda vuelve a la primera página */
  const search = (v) => {
    setTerm(v)
    setPage(1)
  }

  /* Al cambiar de página el usuario está abajo del todo: lo subimos al catálogo */
  const goPage = (n) => {
    setPage(n)
    catalogTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const add = (p) => {
    const opt = p.opts[0]
    setCart((prev) => {
      const i = prev.findIndex((c) => c.id === p.id && c.opt === opt.v)
      if (i >= 0) return prev.map((c, j) => (j === i ? { ...c, qty: c.qty + 1 } : c))
      return [...prev, { id: p.id, name: p.name, opt: opt.v, price: opt.p, qty: 1, tint: p.tint }]
    })
    setOpen(true)
  }

  const bump = (i, d) => {
    setCart((prev) => {
      const q = prev[i].qty + d
      if (q <= 0) return prev.filter((_, j) => j !== i)
      return prev.map((c, j) => (j === i ? { ...c, qty: q } : c))
    })
  }

  const checkout = async () => {
    if (!cart.length || sending) return
    setSending(true)
    /* Abrimos la pestaña dentro del gesto del usuario para esquivar el bloqueador de popups
       y la navegamos cuando el pedido quedó registrado en la hoja de Ventas */
    const win = window.open('', '_blank')
    let ref = ''
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.map(({ id, opt, qty }) => ({ id, opt, qty })) }),
      })
      if (res.ok) ({ ref } = await res.json())
    } catch (e) {
      console.warn('No se pudo registrar el pedido:', e) /* el pedido sigue por WhatsApp igual */
    }
    setSending(false)
    const lines = cart.map((c) => `• ${c.qty}x ${c.name}${c.opt ? ` (${c.opt})` : ''} — ${eur(c.price * c.qty)}`)
    const msg = `¡Hola Custom Proof! Quiero hacer este pedido${ref ? ` (${ref})` : ''}:\n\n${lines.join('\n')}\n\nTotal estimado: ${eur(total)}\n\nTe paso los diseños por acá 👇`
    if (win) win.location = waLink(msg)
    else window.open(waLink(msg), '_blank')
  }

  return (
    <div className="page">
      <header className="header">
        <div className="container header-inner">
          <a href="#top"><img src="/logo.png" alt="Custom Proof" className="logo-img" /></a>
          <nav className="nav">
            <a href="#productos">Productos</a>
            <a href="#personalizado">Tu diseño</a>
            <a href="#como">Cómo funciona</a>
          </nav>
          <button
            className="theme-btn"
            aria-label="Cambiar tema"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="cart-btn" onClick={() => setOpen(true)}>
            Carrito
            <span className="cart-count">{count}</span>
          </button>
        </div>
      </header>

      <main>
        <section id="top" className="container hero">
          <div>
            <div className="hero-badge">HECHO A PEDIDO EN BARCELONA · ENVÍOS A TODA ESPAÑA</div>
            <h1 className="hero-title">
              Tus ideas,{' '}<br />
              <span className="celeste">pegadas</span> <span className="yellow">e impresas</span>.
            </h1>
            <p className="hero-sub">
              Stickers die-cut, tazas y camisetas personalizadas. Elegís, agregás al carrito y
              confirmamos todo por WhatsApp — sin registros ni pagos online.
            </p>
            <div className="hero-cta">
              <a href="#productos" className="btn-cyan">Ver productos</a>
              <a href="#personalizado" className="btn-ghost">Mandá tu diseño</a>
            </div>
          </div>
          <div className="hero-art">
            {/* La imagen mas pesada del sitio y el LCP: AVIF/WebP con fallback a JPG,
                y dos anchos porque en movil ocupa la mitad. Ver scripts/images.mjs */}
            <picture>
              <source
                type="image/avif"
                srcSet="/hero-700.avif 700w, /hero-1200.avif 1200w"
                sizes="(max-width: 720px) 100vw, 570px"
              />
              <source
                type="image/webp"
                srcSet="/hero-700.webp 700w, /hero-1200.webp 1200w"
                sizes="(max-width: 720px) 100vw, 570px"
              />
              <img
                src="/hero-1200.jpg"
                srcSet="/hero-700.jpg 700w, /hero-1200.jpg 1200w"
                sizes="(max-width: 720px) 100vw, 570px"
                alt="Stickers personalizados pegados en termo, botella, taza, mate, funda de móvil y notebook"
                className="hero-img"
                width="1200"
                height="1195"
                fetchPriority="high"
              />
            </picture>
            <div className="hero-sticker">¡Desde 1 unidad!</div>
          </div>
        </section>

        <div className="marquee">
          <div className="marquee-track">
            <span>{MARQUEE + MARQUEE}</span>
            <span aria-hidden="true">{MARQUEE + MARQUEE}</span>
          </div>
        </div>

        {!loading && featured.length > 0 && (
          <div className="featured-band">
            <section id="destacados" className="container featured">
              <div className="featured-head">
                <div className="featured-title">
                  <span className="featured-badge">DESTACADOS</span>
                  <h2 className="section-title">Top 5 de la semana</h2>
                </div>
                {!(edges.start && edges.end) && (
                  <div className="featured-arrows">
                    <button className="arrow-btn" aria-label="Anteriores" disabled={edges.start} onClick={() => slide(-1)}>‹</button>
                    <button className="arrow-btn" aria-label="Siguientes" disabled={edges.end} onClick={() => slide(1)}>›</button>
                  </div>
                )}
              </div>
              <div className="featured-track" ref={track} onScroll={syncEdges}>
                {featured.map((p) => (
                  <article className="card" key={p.id}>
                    <div className="card-shot">
                      {p.img
                        ? <img className="card-img" src={p.img} alt={p.name} loading="lazy" decoding="async" />
                        : <span className="placeholder-note">{p.shot}</span>}
                    </div>
                    <div className="card-body">
                      <div className="card-title-row">
                        <h3 className="card-name">{p.name}</h3>
                        <span className="card-price">{eur(p.opts[0].p)}</span>
                      </div>
                      <div className="card-actions">
                        <button className="add-btn" onClick={() => add(p)}>Agregar</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        <section id="productos" className="container catalog" ref={catalogTop}>
          <div className="catalog-head">
            <h2 className="section-title">El catálogo</h2>
            <div className="catalog-tools">
              <div className="search">
                <SearchIcon />
                <input
                  type="search"
                  className="search-input"
                  placeholder="Buscar por nombre…"
                  aria-label="Buscar productos por nombre"
                  value={term}
                  onChange={(e) => search(e.target.value)}
                  disabled={loading}
                />
                {term && (
                  <button className="search-clear" aria-label="Borrar búsqueda" onClick={() => search('')}>×</button>
                )}
              </div>
              <div className="cats">
                {loading
                  ? [72, 96, 80, 88].map((w, i) => <span className="skel-chip" key={i} style={{ width: w }} />)
                  : cats.map((c) => (
                      <button
                        key={c}
                        className={`cat-btn${c === cat ? ' active' : ''}`}
                        aria-pressed={c === cat}
                        onClick={() => pickCat(c)}
                      >
                        {c}
                      </button>
                    ))}
              </div>
            </div>
          </div>
          <div className="grid">
            {loading && Array.from({ length: 6 }, (_, i) => (
              <article className="card skel-card" key={i}>
                <div className="card-shot skel-block" />
                <div className="card-body">
                  <div className="card-title-row">
                    <span className="skel-line" style={{ width: '55%' }} />
                    <span className="skel-line" style={{ width: 64 }} />
                  </div>
                  <span className="skel-line" style={{ width: '90%' }} />
                  <span className="skel-line" style={{ width: '70%' }} />
                  <div className="card-actions">
                    <span className="skel-btn" />
                  </div>
                </div>
              </article>
            ))}
            {!loading && pageItems.map((p) => (
              <article className="card" key={p.id}>
                <div className="card-shot">
                  {p.img
                    ? <img className="card-img" src={p.img} alt={p.name} loading="lazy" decoding="async" />
                    : <span className="placeholder-note">{p.shot}</span>}
                  {p.tag && <span className="card-tag" style={{ background: p.tint }}>{p.tag}</span>}
                </div>
                <div className="card-body">
                  <div className="card-title-row">
                    <h3 className="card-name">{p.name}</h3>
                    <span className="card-price">{eur(p.opts[0].p)}</span>
                  </div>
                  <p className="card-desc">{p.desc}</p>
                  <div className="card-actions">
                    <button className="add-btn" onClick={() => add(p)}>Agregar</button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {!loading && !shown.length && (
            <p className="catalog-empty">
              {query
                ? <>No encontramos productos con «{term.trim()}». Probá con otro nombre o mirá <button className="link-btn" onClick={() => { search(''); pickCat('Todo') }}>todo el catálogo</button>.</>
                : 'El catálogo no está disponible en este momento. Escribinos por WhatsApp y te pasamos los productos.'}
            </p>
          )}

          {!loading && pages > 1 && (
            <nav className="pager" aria-label="Paginación del catálogo">
              <button
                className="arrow-btn"
                aria-label="Página anterior"
                disabled={current === 1}
                onClick={() => goPage(current - 1)}
              >
                ‹
              </button>
              <div className="pager-nums">
                {pageList(pages, current).map((n, i) =>
                  n === '…'
                    ? <span className="pager-gap" key={`gap${i}`}>…</span>
                    : (
                        <button
                          key={n}
                          className={`page-btn${n === current ? ' active' : ''}`}
                          aria-current={n === current ? 'page' : undefined}
                          onClick={() => goPage(n)}
                        >
                          {n}
                        </button>
                      )
                )}
              </div>
              <button
                className="arrow-btn"
                aria-label="Página siguiente"
                disabled={current === pages}
                onClick={() => goPage(current + 1)}
              >
                ›
              </button>
            </nav>
          )}
        </section>

        <section id="personalizado" className="container cta-section">
          <div className="cta-panel">
            <h2 className="cta-title">¿Tenés tu propio diseño?</h2>
            <p className="cta-text">
              Mandanos el archivo por WhatsApp (PNG, JPG, PDF o vector) y te pasamos presupuesto
              y vista previa antes de imprimir.
            </p>
            <a
              href={waLink('¡Hola Custom Proof! Quiero personalizar un producto con mi propio diseño. Les paso el archivo por acá 👇')}
              target="_blank"
              rel="noopener noreferrer"
              className="wa-btn"
            >
              Enviar mi diseño por WhatsApp
            </a>
          </div>
        </section>

        <section id="como" className="container steps-section">
          <h2 className="section-title">Cómo funciona</h2>
          <div className="steps-grid">
            {STEPS.map((s) => (
              <div className="step-card" key={s.n}>
                <div className="step-num" style={{ background: s.tint, color: s.fg }}>{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <img src="/logo.png" alt="Custom Proof" className="footer-logo" loading="lazy" />
            <p className="footer-about">Stickers y productos personalizados, hechos a pedido en Barcelona y con envío a toda España.</p>
          </div>
          <div>
            <h3>Contacto</h3>
            <div className="contact-links">
              <a href={waLink()} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon /> <span>WhatsApp {PHONE_LABEL}</span>
              </a>
              <a href={`mailto:${EMAIL}`}>
                <MailIcon /> <span>{EMAIL}</span>
              </a>
            </div>
          </div>
          <div>
            <h3>Info</h3>
            <div className="footer-info">
              <span>Producción: 24hs a 48hs</span>
              <span>Envío a toda España</span>
              <span>Pago y envío a coordinar por WhatsApp</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">© 2026 Custom Proof · Stickers &amp; productos personalizados</div>
      </footer>

      <a
        href={waLink('¡Hola Custom Proof! Tengo una consulta 🙂')}
        target="_blank"
        rel="noopener noreferrer"
        className="float-wa"
        aria-label="Escribinos por WhatsApp"
        title="Escribinos por WhatsApp"
      >
        <SmileyIcon />
      </a>

      <CartDrawer
        open={open}
        cart={cart}
        total={total}
        onClose={() => setOpen(false)}
        onBump={bump}
        onCheckout={checkout}
        sending={sending}
      />
    </div>
  )
}
