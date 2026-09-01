import { eur } from '../data.js'
import { PICKUP, FREE_FROM, BCN_COST } from '../shipping.js'

export default function CartDrawer({
  open, cart, form, ship, subtotal, total,
  onClose, onBump, onField, onCheckout, sending,
}) {
  const bcn = form.zona === 'bcn'
  const fuera = form.zona === 'fuera'
  const recogida = bcn && form.entrega === 'recogida'

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-head">
          <h3>Tu carrito</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar carrito">✕</button>
        </div>

        {/* Los datos y el botón viven en el mismo form: el navegador valida y
            enfoca el campo que falta antes de abrir WhatsApp */}
        <form className="drawer-form" onSubmit={(e) => { e.preventDefault(); onCheckout() }}>
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
                      <button type="button" className="qty-btn" onClick={() => onBump(i, -1)}>−</button>
                      <span className="cart-qty">{c.qty}</span>
                      <button type="button" className="qty-btn" onClick={() => onBump(i, 1)}>+</button>
                      <span className="cart-line">{eur(c.price * c.qty)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}

            {cart.length > 0 && (
              <div className="fields">
                <h4 className="fields-title">Tus datos para la entrega</h4>

                <label className="field">
                  <span>Nombre y apellido</span>
                  <input
                    className="field-input"
                    value={form.nombre}
                    onChange={(e) => onField('nombre', e.target.value)}
                    placeholder="Cómo te anotamos"
                    autoComplete="name"
                    maxLength={80}
                    required
                  />
                </label>

                <fieldset className="field-set">
                  <legend>¿Desde dónde nos escribís?</legend>
                  <div className="opt-row">
                    <label className={`opt${bcn ? ' on' : ''}`}>
                      <input
                        type="radio"
                        name="zona"
                        checked={bcn}
                        onChange={() => onField('zona', 'bcn')}
                        required
                      />
                      <span>Barcelona ciudad</span>
                    </label>
                    <label className={`opt${fuera ? ' on' : ''}`}>
                      <input
                        type="radio"
                        name="zona"
                        checked={fuera}
                        onChange={() => onField('zona', 'fuera')}
                        required
                      />
                      <span>Otra ciudad</span>
                    </label>
                  </div>
                </fieldset>

                {fuera && (
                  <label className="field">
                    <span>Ciudad</span>
                    <input
                      className="field-input"
                      value={form.ciudad}
                      onChange={(e) => onField('ciudad', e.target.value)}
                      placeholder="Madrid, Girona, Valencia…"
                      autoComplete="address-level2"
                      maxLength={60}
                      required
                    />
                  </label>
                )}

                {bcn && (
                  <fieldset className="field-set">
                    <legend>¿Cómo lo recibís?</legend>
                    <label className={`opt opt-wide${!recogida ? ' on' : ''}`}>
                      <input
                        type="radio"
                        name="entrega"
                        checked={!recogida}
                        onChange={() => onField('entrega', 'envio')}
                      />
                      <span>
                        <b>Envío a domicilio</b>
                        <em>
                          {subtotal >= FREE_FROM
                            ? `Gratis: tu pedido supera los ${FREE_FROM} €`
                            : `${eur(BCN_COST)} · gratis a partir de ${FREE_FROM} €`}
                        </em>
                      </span>
                    </label>
                    <label className={`opt opt-wide${recogida ? ' on' : ''}`}>
                      <input
                        type="radio"
                        name="entrega"
                        checked={recogida}
                        onChange={() => onField('entrega', 'recogida')}
                      />
                      <span>
                        <b>Recogida en mano</b>
                        <em>Gratis · coordinamos horario por {PICKUP}</em>
                      </span>
                    </label>
                  </fieldset>
                )}

                {fuera && (
                  <p className="field-note">
                    Fuera de Barcelona el envío va por mensajería y no es opcional: con tu
                    dirección te pasamos el costo por WhatsApp antes de cerrar el pedido.
                  </p>
                )}

                {ship.needsAddress && (
                  <>
                    <label className="field">
                      <span>Calle y número</span>
                      <input
                        className="field-input"
                        value={form.calle}
                        onChange={(e) => onField('calle', e.target.value)}
                        placeholder="Carrer Exemple 12"
                        autoComplete="address-line1"
                        maxLength={120}
                        required
                      />
                    </label>
                    <div className="field-row">
                      <label className="field">
                        <span>Piso y puerta</span>
                        <input
                          className="field-input"
                          value={form.piso}
                          onChange={(e) => onField('piso', e.target.value)}
                          placeholder="3º 2ª"
                          autoComplete="address-line2"
                          maxLength={40}
                        />
                      </label>
                      <label className="field">
                        <span>Código postal</span>
                        <input
                          className="field-input"
                          value={form.cp}
                          onChange={(e) => onField('cp', e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="08001"
                          inputMode="numeric"
                          pattern="[0-9]{5}"
                          title="Cinco números, por ejemplo 08001"
                          autoComplete="postal-code"
                          maxLength={5}
                          required
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="drawer-foot">
            {cart.length > 0 && (
              <div className="sum">
                <div className="sum-row">
                  <span>Subtotal</span>
                  <span>{eur(subtotal)}</span>
                </div>
                <div className="sum-row">
                  <span>{ship.label}</span>
                  <span>{ship.value}</span>
                </div>
              </div>
            )}
            <div className="total-row">
              <span>Total estimado</span>
              <span className="total">{eur(total)}{ship.quote ? ' + envío' : ''}</span>
            </div>
            <p className="drawer-note">
              Envío gratis a domicilio en Barcelona a partir de {FREE_FROM} €, {eur(BCN_COST)} por
              debajo, y recogida gratis a coordinar. Fuera de Barcelona el costo del envío lo
              pasamos por WhatsApp. El pago y los descuentos por cantidad también se coordinan por
              ahí: no se cobra nada desde la web.
            </p>
            <button className="checkout-btn" type="submit" disabled={sending || !cart.length}>
              {sending ? 'Abriendo WhatsApp…' : 'Finalizar por WhatsApp'}
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}
