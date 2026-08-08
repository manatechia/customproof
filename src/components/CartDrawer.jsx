import { eur } from '../data.js'

export default function CartDrawer({ open, cart, total, onClose, onBump, onCheckout, sending }) {
  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-head">
          <h3>Tu carrito</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar carrito">✕</button>
        </div>

        <div className="drawer-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-title">Todavía está vacío</div>
              <p>Agregá productos del catálogo y los confirmamos juntos por WhatsApp.</p>
            </div>
          ) : (
            cart.map((c, i) => (
              <div className="cart-item" key={`${c.id}-${c.opt}`}>
                <div className="cart-swatch" style={{ background: c.tint }} />
                <div className="cart-item-body">
                  <div className="cart-item-name">{c.name}</div>
                  {c.opt && <div className="cart-item-opt">{c.opt}</div>}
                  <div className="cart-item-row">
                    <button className="qty-btn" onClick={() => onBump(i, -1)}>−</button>
                    <span className="cart-qty">{c.qty}</span>
                    <button className="qty-btn" onClick={() => onBump(i, 1)}>+</button>
                    <span className="cart-line">{eur(c.price * c.qty)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="drawer-foot">
          <div className="total-row">
            <span>Total estimado</span>
            <span className="total">{eur(total)}</span>
          </div>
          <p className="drawer-note">Envío gratis a Barcelona en compras superiores a 25€. El pago, el envío al resto y los descuentos por cantidad se coordinan por WhatsApp. No se cobra nada desde la web.</p>
          <button className="checkout-btn" onClick={onCheckout} disabled={sending}>
            {sending ? 'Abriendo WhatsApp…' : 'Finalizar por WhatsApp'}
          </button>
        </div>
      </aside>
    </>
  )
}
