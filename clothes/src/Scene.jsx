import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Outfit } from './Outfit.jsx'

/* Medidas de la sala, en metros */
const RAIL_Y = 3.2
const RAIL_Z = -3.55
const WALL_Z = -4
const ROOM_H = 6
/* Las perchas van juntas, de costado, como en un perchero de verdad */
const GAP = 0.62
/* Cuánto se corren las vecinas para dejar girar a la que se mira */
const MAKE_ROOM = 0.42
/* De costado; un poco menos de 90° para que se adivine el frente */
const SIDEWAYS = Math.PI / 2 - 0.12
const SHOULDER_Y = -0.42 /* la barra de la percha, bajo el gancho */

const COLORS = { back: '#f2f0eb', side: '#e4e1da', floor: '#cdc8bf', ceiling: '#f8f7f4', rail: '#2a2a2f' }

export const slotX = (i, n) => (i - (n - 1) / 2) * GAP

/* Hacia dónde mira la cámara en cada estado. El panel de la prenda tapa la
   derecha en escritorio y la mitad de abajo en el móvil: la prenda elegida
   se encuadra en el hueco que queda libre */
function framing({ view, selX, panX, mobile }) {
  if (view === 'store') return mobile
    ? { pos: [0, 2.6, 9.5], look: [0, 2.6, WALL_Z] }
    : { pos: [0, 2.7, 8.5], look: [0, 2.5, WALL_Z] }
  if (selX !== null) return mobile
    ? { pos: [selX, 0.7, 3.3], look: [selX, 0.4, RAIL_Z] }
    : { pos: [selX + 1.05, 2.35, 0.9], look: [selX + 1.05, 2.3, RAIL_Z] }
  return mobile
    ? { pos: [panX, 2.3, 4.2], look: [panX, 2.3, RAIL_Z] }
    : { pos: [panX, 2.75, 1.5], look: [panX, 2.75, RAIL_Z] }
}

function CameraRig(props) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3(0, 2.5, WALL_Z))
  const pos = useMemo(() => new THREE.Vector3(), [])
  const tgt = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const f = framing(props)
    const k = 1 - Math.exp(-dt * 3.2) /* suavizado independiente de los fps */
    camera.position.lerp(pos.set(...f.pos), k)
    look.current.lerp(tgt.set(...f.look), k)
    camera.lookAt(look.current)
  })
  return null
}

/* El logo de la pared se dibuja en un canvas con la tipografía de la marca */
function useLogoTexture() {
  const [tex, setTex] = useState(null)
  useEffect(() => {
    let alive = true
    const draw = () => {
      const c = document.createElement('canvas')
      c.width = 1400; c.height = 300
      const g = c.getContext('2d')
      const r = 120, cx = 150, cy = 150
      g.fillStyle = '#ffcc29'
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#111'; g.strokeStyle = '#111'; g.lineCap = 'round'; g.lineWidth = 17
      const s = r / 50
      g.save(); g.translate(cx - r + 35 * s, cy - r + 37 * s); g.rotate(-14 * Math.PI / 180)
      g.beginPath(); g.ellipse(0, 0, 7.5 * s, 12 * s, 0, 0, Math.PI * 2); g.fill(); g.restore()
      const P = (x, y) => [cx - r + x * s, cy - r + y * s]
      g.beginPath(); g.moveTo(...P(60, 39)); g.quadraticCurveTo(...P(69, 30), ...P(79, 35)); g.quadraticCurveTo(...P(71, 36), ...P(68, 42)); g.stroke()
      g.beginPath(); g.moveTo(...P(22, 57)); g.quadraticCurveTo(...P(19, 61), ...P(23, 63)); g.quadraticCurveTo(...P(49, 85), ...P(76, 64)); g.quadraticCurveTo(...P(80, 61), ...P(76, 57)); g.stroke()
      g.fillStyle = '#141416'
      g.font = '700 170px Fredoka, sans-serif'
      g.textBaseline = 'middle'
      g.fillText('Custom Proof', 310, 160)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      if (alive) setTex(t)
    }
    document.fonts.load('700 170px Fredoka').then(draw, draw)
    return () => { alive = false }
  }, [])
  return tex
}

function Room({ width, onClick }) {
  const logo = useLogoTexture()
  const depth = 14
  const zMid = WALL_Z + depth / 2
  return (
    <group onClick={onClick}>
      <mesh position={[0, ROOM_H / 2, WALL_Z]} receiveShadow>
        <planeGeometry args={[width, ROOM_H]} />
        <meshStandardMaterial color={COLORS.back} emissive={COLORS.back} emissiveIntensity={0.3} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, zMid]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.8} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM_H, zMid]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={COLORS.ceiling} emissive={COLORS.ceiling} emissiveIntensity={0.55} roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[0, -s * Math.PI / 2, 0]} position={[s * width / 2, ROOM_H / 2, zMid]} receiveShadow>
          <planeGeometry args={[depth, ROOM_H]} />
          <meshStandardMaterial color={COLORS.side} emissive={COLORS.side} emissiveIntensity={0.3} roughness={0.95} />
        </mesh>
      ))}
      {/* Zócalo: marca dónde termina la pared y empieza el piso */}
      <mesh position={[0, 0.06, WALL_Z + 0.015]}>
        <boxGeometry args={[width, 0.12, 0.03]} />
        <meshStandardMaterial color="#e2ded6" />
      </mesh>
      {logo && (
        <mesh position={[0, 4.35, WALL_Z + 0.01]}>
          <planeGeometry args={[3.5, 0.75]} />
          <meshBasicMaterial map={logo} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

function Rail({ length }) {
  return (
    <group position={[0, RAIL_Y, RAIL_Z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, length, 24]} />
        <meshStandardMaterial color={COLORS.rail} metalness={0.8} roughness={0.3} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * length / 2, 0, (WALL_Z - RAIL_Z) / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, RAIL_Z - WALL_Z, 12]} />
          <meshStandardMaterial color={COLORS.rail} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/* Percha: gancho, cuello y el triángulo de los hombros */
function Hanger() {
  const parts = useMemo(() => {
    const bar = (a, b) => {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b)
      const len = va.distanceTo(vb)
      const mid = va.clone().add(vb).multiplyScalar(0.5)
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
      return { len, mid: mid.toArray(), quat: q }
    }
    return [
      bar([0, -0.05, 0], [0, -0.16, 0]),
      bar([0, -0.16, 0], [-0.5, SHOULDER_Y, 0]),
      bar([0, -0.16, 0], [0.5, SHOULDER_Y, 0]),
      bar([-0.5, SHOULDER_Y, 0], [0.5, SHOULDER_Y, 0]),
    ]
  }, [])
  return (
    <group>
      {/* El gancho abraza la barra del perchero */}
      <mesh position={[0, 0.0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[0.05, 0.011, 8, 24, Math.PI * 1.4]} />
        <meshStandardMaterial color="#c9c3b8" metalness={0.6} roughness={0.35} />
      </mesh>
      {parts.map((p, i) => (
        <mesh key={i} position={p.mid} quaternion={p.quat} castShadow>
          <cylinderGeometry args={[i ? 0.016 : 0.01, i ? 0.016 : 0.01, p.len, 10]} />
          <meshStandardMaterial color={i ? '#3a2e25' : '#c9c3b8'} metalness={i ? 0 : 0.6} roughness={i ? 0.6 : 0.35} />
        </mesh>
      ))}
    </group>
  )
}

/* El conjunto cuelga con el cuello justo debajo del gancho: los brazos de
   la percha quedan dentro del buzo, como en una percha de verdad */
const COLLAR_Y = -0.17

/* De costado en el perchero; al pasar por encima sale hacia adelante y gira
   de frente, y las vecinas se corren para hacerle lugar. La elegida gira
   sobre sí misma para mostrar el frente y la estampa de la espalda */
function Garment({ p, i, n, focus, selected, paused, onPick, onHover }) {
  const ref = useRef()
  const [hover, setHover] = useState(false)
  const swing = useRef({ a: 0, v: 0 })
  const st = useRef({ z: 0, x: 0 })

  /* Cada vez que el mouse entra, la prenda se balancea */
  useEffect(() => { if (hover) swing.current.v += 0.7 }, [hover])

  useFrame((state, frameDt) => {
    const g = ref.current
    if (!g) return
    /* Con la pestaña en segundo plano llegan saltos de un segundo o más: el
       resorte explota y la prenda da la vuelta. Paso máximo de 1/30 s */
    const dt = Math.min(frameDt, 1 / 30)
    const s = swing.current
    const t = state.clock.elapsedTime
    const k = 1 - Math.exp(-dt * 7)
    s.v += (-s.a * 28 - s.v * 3.2) * dt
    s.a = Math.max(-1.5, Math.min(1.5, s.a + s.v * dt))
    g.rotation.z = s.a * 0.1 + Math.sin(t * 0.7 + i * 1.7) * 0.006

    const front = selected || hover
    const push = focus === null || focus === i ? 0 : Math.sign(i - focus) * MAKE_ROOM
    st.current.x += (slotX(i, n) + push - st.current.x) * k
    st.current.z += ((selected ? 0.75 : hover ? 0.6 : 0) - st.current.z) * k
    g.position.set(st.current.x, RAIL_Y, RAIL_Z + st.current.z)

    if (selected) {
      /* La elegida gira sola sobre el gancho (salvo que la pausen) */
      if (!paused) g.rotation.y += dt * 0.8
    } else {
      /* Vuelve de frente o de costado por el camino más corto, venga de
         donde venga después de girar */
      const diff = (front ? 0 : SIDEWAYS) - g.rotation.y
      g.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * (1 - Math.exp(-dt * 6))
    }
  })

  return (
    <group
      ref={ref}
      position={[slotX(i, n), RAIL_Y, RAIL_Z]}
      rotation={[0, SIDEWAYS, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); onHover(i, true) }}
      onPointerOut={() => { setHover(false); onHover(i, false) }}
      onClick={(e) => { e.stopPropagation(); if (e.delta < 8) onPick(p) }}
    >
      <Hanger />
      <Outfit product={p} top={COLLAR_Y} />
    </group>
  )
}

export default function Scene({ products, view, selId, paused, onPick, onEnter, mobile }) {
  const n = products.length
  const railLen = Math.max(4, n * GAP + 2.2)
  const width = Math.max(12, railLen + 6)
  const half = Math.max(0, ((n - 1) / 2) * GAP)
  const [panX, setPanX] = useState(0)
  const [hovered, setHovered] = useState(null)
  const selIdx = products.findIndex((p) => p.id === selId)
  const selX = selIdx >= 0 ? slotX(selIdx, n) : null
  const drag = useRef(null)

  useEffect(() => { if (view === 'store') setPanX(0) }, [view])
  useEffect(() => { if (selX !== null) setPanX(Math.max(-half, Math.min(half, selX))) }, [selX, half])
  useEffect(() => { document.body.style.cursor = hovered !== null ? 'pointer' : '' }, [hovered])

  /* En el perchero se recorre arrastrando o con la rueda */
  const pan = (dx) => setPanX((x) => Math.max(-half, Math.min(half, x + dx)))
  const handlers = view === 'rail' && selX === null ? {
    onWheel: (e) => pan((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.004),
    onPointerDown: (e) => { drag.current = e.clientX },
    onPointerMove: (e) => {
      if (drag.current === null || e.buttons === 0 && e.pointerType === 'mouse') return
      pan((drag.current - e.clientX) * (mobile ? 0.006 : 0.004))
      drag.current = e.clientX
    },
    onPointerUp: () => { drag.current = null },
    onPointerLeave: () => { drag.current = null },
  } : {}

  return (
    <div className="scene" {...handlers}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: mobile ? 55 : 45, position: [0, 2.7, 8.5], near: 0.1, far: 60 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <color attach="background" args={[COLORS.back]} />
        <hemisphereLight args={['#ffffff', '#cbbfae', 1.6]} />
        <directionalLight
          position={[2.5, 7, 4]}
          intensity={1.7}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={6}
          shadow-camera-bottom={-2}
          shadow-bias={-0.0004}
          shadow-radius={6}
        />
        {/* Relleno desde la cámara: sin él la ropa negra se ve como una silueta */}
        <directionalLight position={[-3, 3, 6]} intensity={0.9} color="#fff4e6" />
        <spotLight position={[0, ROOM_H - 0.2, -1]} angle={0.9} penumbra={1} intensity={1.2} decay={0} color="#fff6e8" />
        <CameraRig view={view} selX={selX} panX={panX} mobile={mobile} />
        <Room width={width} onClick={(e) => { e.stopPropagation(); if (view === 'store') onEnter() }} />
        <Rail length={railLen} />
        {products.map((p, i) => (
          <Garment
            key={p.id}
            p={p}
            i={i}
            n={n}
            selected={p.id === selId}
            focus={hovered ?? (selIdx >= 0 ? selIdx : null)}
            paused={paused}
            onPick={onPick}
            onHover={(idx, on) => setHovered((h) => (on ? idx : h === idx ? null : h))}
          />
        ))}
      </Canvas>
    </div>
  )
}
