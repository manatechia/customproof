import { useEffect, useState } from 'react'
import { STEPS, EMAIL, PHONE_LABEL, eur, waLink } from './data.js'
import { fetchCatalog } from './catalog.js'
import { WhatsAppIcon, MailIcon, SmileyIcon } from './components/Icons.jsx'
import CartDrawer from './components/CartDrawer.jsx'

const MARQUEE = 'STICKERS DIE-CUT, RESISTENTES AL AGUA Y AL SOL ★ TAZAS PERSONALIZADAS ★ REMERAS CUSTOMIZADAS ★ ENVÍO GRATIS A BARCELONA EN COMPRAS SUPERIORES A 25€ ★ '

export default function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [catalog, setCatalog] = useState(null) /* null = cargando: se muestran skeletons */
  const [cat, setCat] = useState('Todo')
  const [cart, setCart] = useState([])
  const [open, setOpen] = useState(false)

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
  const shown = products.filter((p) => cat === 'Todo' || p.cat === cat)
  const count = cart.reduce((a, c) => a + c.qty, 0)
  const total = cart.reduce((a, c) => a + c.price * c.qty, 0)

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

  const checkout = () => {
    if (!cart.length) return
    const lines = cart.map((c) => `• ${c.qty}x ${c.name}${c.opt ? ` (${c.opt})` : ''} — ${eur(c.price * c.qty)}`)
    const msg = `¡Hola Custom Proof! Quiero hacer este pedido:\n\n${lines.join('\n')}\n\nTotal estimado: ${eur(total)}\n\nTe paso los diseños por acá 👇`
    window.open(waLink(msg), '_blank')
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

      <section id="top" className="container hero">
        <div>
          <div className="hero-badge">HECHO A PEDIDO · ENVÍOS A TODA ESPAÑA</div>
          <h1 className="hero-title">
            Tus ideas,<br />
            <span className="celeste">pegadas</span> <span className="yellow">e impresas</span>.
          </h1>
          <p className="hero-sub">
            Stickers die-cut, tazas y remeras personalizadas. Elegís, agregás al carrito y
            confirmamos todo por WhatsApp — sin registros ni pagos online.
          </p>
          <div className="hero-cta">
            <a href="#productos" className="btn-cyan">Ver productos</a>
            <a href="#personalizado" className="btn-ghost">Mandá tu diseño</a>
          </div>
        </div>
        <div className="hero-art">
          <span className="placeholder-note">foto lifestyle<br />stickers + taza + remera<br />1200×1200</span>
          <div className="hero-sticker">¡Desde 1 unidad!</div>
        </div>
      </section>

      <div className="marquee">
        <div className="marquee-track">
          <span>{MARQUEE + MARQUEE}</span>
          <span>{MARQUEE + MARQUEE}</span>
        </div>
      </div>

      <section id="productos" className="container catalog">
        <div className="catalog-head">
          <h2 className="section-title">El catálogo</h2>
          <div className="cats">
            {loading
              ? [72, 96, 80, 88].map((w, i) => <span className="skel-chip" key={i} style={{ width: w }} />)
              : cats.map((c) => (
                  <button
                    key={c}
                    className={`cat-btn${c === cat ? ' active' : ''}`}
                    onClick={() => setCat(c)}
                  >
                    {c}
                  </button>
                ))}
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
          {!loading && shown.map((p) => (
            <article className="card" key={p.id}>
              <div className="card-shot">
                {p.img
                  ? <img className="card-img" src={p.img} alt={p.name} loading="lazy" />
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
      </section>

      <section id="personalizado" className="container cta-section">
        <div className="cta-panel">
          <div>
            <h2 className="cta-title">¿Tenés tu propio diseño?</h2>
            <p className="cta-text">
              Mandanos el archivo por WhatsApp (PNG, JPG, PDF o vector) y te pasamos presupuesto
              y vista previa antes de imprimir. También lo diseñamos nosotros si nos contás la idea.
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
          <div className="cta-art">
            <span className="placeholder-note">mockup diseño<br />del cliente</span>
          </div>
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

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <img src="/logo.png" alt="Custom Proof" className="footer-logo" />
            <p className="footer-about">Stickers y productos personalizados, hechos a pedido en España.</p>
          </div>
          <div>
            <h4>Contacto</h4>
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
            <h4>Info</h4>
            <div className="footer-info">
              <span>Producción: 24hs a 48hs</span>
              <span>Envío a toda España</span>
              <span>Pago por transferencia o Bizum</span>
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
      />
    </div>
  )
}
