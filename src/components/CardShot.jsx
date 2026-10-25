import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/* Cada cuánto pasa sola la foto cuando el artículo tiene varias */
const AUTOPLAY_MS = 3500
/* Cuánto tiene que quedarse quieto el mouse sobre la foto para agrandarla:
   menos dispara al cruzar la grilla camino a otra cosa, más se siente lento */
const ZOOM_DELAY_MS = 700

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* Foto de la card: carrusel con flechas si hay más de una y zoom al dejar el mouse encima.
   `children` va encima de la foto (la etiqueta de la card). */
export default function CardShot({ p, children }) {
  const imgs = p.imgs?.length ? p.imgs : p.img ? [p.img] : []
  const [i, setI] = useState(0)
  const [zoom, setZoom] = useState(null)
  const [visible, setVisible] = useState(false)
  const box = useRef(null)
  const timer = useRef(null)
  const overArrow = useRef(false)
  const closer = useRef(null)

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

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(closer.current) }, [])

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

  /* El zoom tapa la card y tiene sus propias flechas, así que el mouse pasa de
     una a otro: cerrar con un respiro evita que se cierre en ese cruce */
  const cancelClose = () => clearTimeout(closer.current)
  const closeSoon = () => {
    clearTimeout(timer.current)
    clearTimeout(closer.current)
    closer.current = setTimeout(() => setZoom(null), 120)
  }

  /* Solo mouse: en touch no hay hover y el toque es para el carrusel */
  const startTimer = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(openZoom, ZOOM_DELAY_MS)
  }
  const onEnter = (e) => {
    if (e.pointerType !== 'mouse' || !imgs.length) return
    cancelClose()
    overArrow.current = false
    if (!zoom) startTimer()
  }
  /* Sobre las flechas de la card no se agranda (el zoom las taparía justo
     antes del click). Al volver a la foto se arranca a contar de nuevo. */
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' || zoom || e.target.closest('.shot-zoom')) return
    const onArrow = Boolean(e.target.closest('.shot-arrow'))
    if (onArrow === overArrow.current) return
    overArrow.current = onArrow
    onArrow ? clearTimeout(timer.current) : startTimer()
  }
  const go = (d) => (e) => {
    e.stopPropagation()
    setI((n) => (n + d + imgs.length) % imgs.length)
  }

  const arrows = imgs.length > 1 && (
    <>
      <button className="shot-arrow prev" aria-label="Foto anterior" onClick={go(-1)}>‹</button>
      <button className="shot-arrow next" aria-label="Foto siguiente" onClick={go(1)}>›</button>
      <div className="shot-dots" aria-hidden="true">
        {imgs.map((src, n) => <span key={src} className={n === i ? 'is-on' : ''} />)}
      </div>
    </>
  )

  return (
    <div className="card-shot" ref={box} onPointerEnter={onEnter} onPointerLeave={closeSoon} onPointerMove={onMove}>
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
      {arrows}
      {children}
      {zoom && createPortal(
        <div className="shot-zoom" style={zoom} onPointerEnter={cancelClose} onPointerLeave={closeSoon}>
          <img src={imgs[i]} alt={p.name} />
          {arrows}
        </div>,
        document.body,
      )}
    </div>
  )
}
