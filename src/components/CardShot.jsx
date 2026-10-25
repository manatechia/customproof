import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/* Cada cuánto pasa sola la foto cuando el artículo tiene varias */
const AUTOPLAY_MS = 3500
/* Cuánto tiene que quedarse quieto el mouse sobre la foto para agrandarla:
   menos dispara al cruzar la grilla camino a otra cosa, más se siente lento */
const ZOOM_DELAY_MS = 700

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* Foto de la card: carrusel si hay más de una y zoom al dejar el mouse encima.
   `children` va encima de la foto (la etiqueta de la card). */
export default function CardShot({ p, children }) {
  const imgs = p.imgs?.length ? p.imgs : p.img ? [p.img] : []
  const [i, setI] = useState(0)
  const [zoom, setZoom] = useState(null)
  const [visible, setVisible] = useState(false)
  const box = useRef(null)
  const timer = useRef(null)

  /* Solo corre el carrusel de las cards en pantalla */
  useEffect(() => {
    if (imgs.length < 2 || !box.current) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(box.current)
    return () => io.disconnect()
  }, [imgs.length])

  useEffect(() => {
    if (imgs.length < 2 || !visible || zoom || reducedMotion()) return
    const t = setTimeout(() => setI((n) => (n + 1) % imgs.length), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [i, imgs.length, visible, zoom])

  /* El zoom se ancla a la posición de la card: si la página se mueve, se cierra */
  useEffect(() => {
    if (!zoom) return
    const close = () => setZoom(null)
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [zoom])

  useEffect(() => () => clearTimeout(timer.current), [])

  const openZoom = () => {
    const r = box.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    /* El doble de la card, sin pasarse de la ventana y en el 4:3 de la foto */
    const w = Math.min(r.width * 2, vw - 32, (vh - 32) * 4 / 3)
    const h = w * 3 / 4
    const clamp = (v, min, max) => Math.max(min, Math.min(v, max))
    setZoom({
      left: clamp(r.left + r.width / 2 - w / 2, 16, vw - w - 16),
      top: clamp(r.top + r.height / 2 - h / 2, 16, vh - h - 16),
      width: w,
      height: h,
    })
  }

  /* Solo mouse: en touch no hay hover y el toque es para el carrusel */
  const onEnter = (e) => {
    if (e.pointerType !== 'mouse' || !imgs.length) return
    clearTimeout(timer.current)
    timer.current = setTimeout(openZoom, ZOOM_DELAY_MS)
  }
  const onLeave = () => {
    clearTimeout(timer.current)
    setZoom(null)
  }

  return (
    <div className="card-shot" ref={box} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      {imgs.length === 0 && <span className="placeholder-note">{p.shot}</span>}
      {imgs.map((src, n) => (
        <img
          key={src}
          className={`card-img${n === i ? ' is-on' : ''}`}
          src={src}
          alt={n === 0 ? p.name : ''}
          aria-hidden={n !== i}
          loading="lazy"
          decoding="async"
        />
      ))}
      {imgs.length > 1 && (
        <div className="shot-dots">
          {imgs.map((src, n) => (
            <button
              key={src}
              className={n === i ? 'is-on' : ''}
              aria-label={`Foto ${n + 1} de ${imgs.length}`}
              onClick={() => setI(n)}
            />
          ))}
        </div>
      )}
      {children}
      {zoom && createPortal(
        <div className="shot-zoom" style={zoom} aria-hidden="true">
          <img src={imgs[i]} alt="" />
        </div>,
        document.body,
      )}
    </div>
  )
}
