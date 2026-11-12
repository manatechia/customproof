import { Component, Suspense, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'

/* Conjunto 3D (buzo con capucha + jogger). Cada prenda es su silueta
   "inflada" como un almohadón: el volumen crece con la distancia al borde,
   así los bordes quedan redondos y nada se ve como una caja. Medidas en
   metros, con el origen en el cuello del buzo (justo bajo la barra de la percha). */

const FABRIC = '#26262b'
const RIB = '#1f1f23'

/* Dónde está cada estampa dentro de la foto del producto, en fracciones
   (x, y, ancho, alto). Es la prueba de concepto: lo definitivo es cargar las
   estampas como PNG transparentes en la Sheet. Sin entrada = prenda lisa. */
export const PRINTS = {
  'Conjunto Charly Garcia': { front: [0.39, 0.215, 0.09, 0.09], back: [0.605, 0.215, 0.235, 0.28] },
  'Conjunto Patricio Rey': { front: [0.385, 0.218, 0.077, 0.064], back: [0.6, 0.228, 0.245, 0.19] },
  'Conjunto Maradona': { front: [0.725, 0.2, 0.12, 0.09], back: [0.165, 0.215, 0.27, 0.24] },
}

/* Ruido fino para el relieve del algodón (y rayas para los puños) */
function useKnitBump(rib) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const img = g.createImageData(256, 256)
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % 256
      const v = rib ? 128 + 90 * Math.sin(x * 0.9) : 110 + Math.random() * 60
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rib ? 6 : 8, rib ? 1 : 8)
    return t
  }, [rib])
}

function useMaterials() {
  const knit = useKnitBump(false)
  const ribs = useKnitBump(true)
  return useMemo(() => ({
    /* sheen: el brillo suave de la frisa cuando la luz la roza */
    fabric: new THREE.MeshPhysicalMaterial({ color: FABRIC, roughness: 0.85, sheen: 1, sheenColor: '#5c5c66', sheenRoughness: 0.7 }),
    rib: new THREE.MeshPhysicalMaterial({ color: RIB, roughness: 0.9, sheen: 1, sheenColor: '#4e4e57', sheenRoughness: 0.7 }),
    inner: new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 1 }),
    cord: new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.7 }),
    tip: new THREE.MeshStandardMaterial({ color: '#c9c4bb', metalness: 0.8, roughness: 0.3 }),
  }), [knit, ribs])
}

const shapeFrom = (pts) => {
  const s = new THREE.Shape()
  s.moveTo(...pts[0])
  pts.slice(1).forEach((p) => (p.length === 4 ? s.quadraticCurveTo(...p) : s.lineTo(...p)))
  s.closePath()
  return s
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/* Distancia de (px, py) al contorno y el punto del borde más cercano */
function nearestOnOutline(px, py, pts) {
  let best = Infinity, qx = 0, qy = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)))
    const x = a.x + t * dx, y = a.y + t * dy
    const d = (px - x) ** 2 + (py - y) ** 2
    if (d < best) { best = d; qx = x; qy = y }
  }
  return [Math.sqrt(best), qx, qy]
}

function isInside(px, py, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/* Silueta inflada: una grilla fina dentro del contorno; cada punto sube
   (adelante) y baja (atrás) según su distancia al borde, con perfil de
   cuarto de círculo de radio r hasta el grosor T. Los puntos de afuera se
   pegan al borde, así la silueta queda lisa. `fold` agrega arrugas. */
function inflate(shape, { T, r, res = 0.01, fold }) {
  const pts = shape.getSpacedPoints(260).slice(0, -1)
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const minX = Math.min(...xs) - res, minY = Math.min(...ys) - res
  const nx = Math.ceil((Math.max(...xs) + res - minX) / res) + 1
  const ny = Math.ceil((Math.max(...ys) + res - minY) / res) + 1
  const N = nx * ny
  const pos = new Float32Array(N * 6)
  const uv = new Float32Array(N * 4)
  const inn = new Uint8Array(N)
  /* Para las normales del borde: cuánto subió el perfil (t) y hacia dónde
     queda el borde más cercano (dirección hacia afuera) */
  const tt = new Float32Array(N)
  const ox = new Float32Array(N), oy = new Float32Array(N)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const x = minX + i * res, y = minY + j * res
      const [d, qx, qy] = nearestOnOutline(x, y, pts)
      let X = qx, Y = qy, z = 0
      const inside = isInside(x, y, pts)
      const len = d || 1
      ox[k] = (inside ? qx - x : x - qx) / len
      oy[k] = (inside ? qy - y : y - qy) / len
      if (inside) {
        inn[k] = 1
        const t = Math.min(d / r, 1)
        tt[k] = t
        X = x; Y = y
        z = T * Math.sqrt(1 - (1 - t) ** 2) + (fold ? fold(x, y) * t : 0)
      }
      pos.set([X, Y, z], k * 3)
      pos.set([X, Y, -z], (N + k) * 3)
      const u = (X - minX) / (nx * res), v = (Y - minY) / (ny * res)
      uv.set([u, v], k * 2)
      uv.set([u, v], (N + k) * 2)
    }
  }
  const idx = []
  const keep = (a, b, c) => {
    /* Dos vértices de afuera pueden caer en el mismo punto del borde: ese
       triángulo no tiene área y su normal sale inválida (brillos blancos) */
    const ax = pos[a * 3], ay = pos[a * 3 + 1]
    const area = (pos[b * 3] - ax) * (pos[c * 3 + 1] - ay) - (pos[c * 3] - ax) * (pos[b * 3 + 1] - ay)
    if (Math.abs(area) < res * res * 0.02) return false
    if (inn[a] + inn[b] + inn[c] >= 2) return true
    /* Con vértices pegados al borde: se queda si el triángulo ya pegado cae
       dentro de la silueta (cierra la costura sin agujeros) y se descarta si
       cruza un hueco, como la axila o la entrepierna */
    const cx = (ax + pos[b * 3] + pos[c * 3]) / 3
    const cy = (ay + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
    return isInside(cx, cy, pts) || nearestOnOutline(cx, cy, pts)[0] < res * 0.25
  }
  /* La cara de atrás comparte los vértices del borde con la de adelante:
     así las normales se promedian y la costura queda redonda, sin brillos */
  const bk = (v) => (inn[v] ? N + v : v)
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
      if (keep(a, b, d)) idx.push(a, b, d, bk(a), bk(d), bk(b))
      if (keep(a, d, c)) idx.push(a, d, c, bk(a), bk(c), bk(d))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  /* Los vértices de afuera que no quedaron en ningún triángulo tienen normal
     nula: se les da una cualquiera para que no aparezcan NaN en el shader */
  const nrm = g.attributes.normal.array
  for (let i = 0; i < nrm.length; i += 3) {
    if (!(Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) > 1e-6)) { nrm[i] = 0; nrm[i + 1] = 0; nrm[i + 2] = i < N * 3 ? 1 : -1 }
  }
  /* Cerca del borde la grilla escalona la costura y cada escalón agarra la
     luz distinto (rayitas blancas). Ahí la normal sale del perfil mismo:
     z = T·sqrt(1-(1-t)²), inclinada hacia afuera; en el borde, horizontal */
  for (let k = 0; k < N; k++) {
    let ax, ay, az
    if (!inn[k]) { ax = ox[k]; ay = oy[k]; az = 0 }
    else {
      const t = tt[k]
      if (t >= 0.85) continue
      const slope = (T / r) * (1 - t) / Math.max(Math.sqrt(1 - (1 - t) ** 2), 0.02)
      ax = slope * ox[k]; ay = slope * oy[k]; az = 1
    }
    const w = inn[k] ? clamp01((0.85 - tt[k]) / 0.3) : 1
    for (const [v, sz] of [[k, 1], [N + k, -1]]) {
      if (!inn[k] && v >= N) continue /* el borde lo comparten las dos caras */
      const nx_ = nrm[v * 3] * (1 - w) + ax * w
      const ny_ = nrm[v * 3 + 1] * (1 - w) + ay * w
      const nz_ = nrm[v * 3 + 2] * (1 - w) + az * sz * w
      const l = Math.hypot(nx_, ny_, nz_) || 1
      nrm[v * 3] = nx_ / l; nrm[v * 3 + 1] = ny_ / l; nrm[v * 3 + 2] = nz_ / l
    }
  }
  return g
}

const roundedRect = (w, h, r) => shapeFrom([
  [-w / 2 + r, 0], [w / 2 - r, 0], [w / 2, 0, w / 2, -r], [w / 2, -h + r], [w / 2, -h, w / 2 - r, -h],
  [-w / 2 + r, -h], [-w / 2, -h, -w / 2, -h + r], [-w / 2, -r], [-w / 2, 0, -w / 2 + r, 0],
])


/* Arrugas: verticales en los costados y las mangas, y la tela que se junta
   sobre los puños. El centro del pecho y la espalda quedan lisos (estampas) */
const hoodieFold = (x, y) => {
  const side = clamp01((Math.abs(x) - 0.3) / 0.1)
  const cuff = clamp01((-y - 0.45) / 0.12) * clamp01((Math.abs(x) - 0.4) / 0.04)
  return 0.007 * Math.sin(x * 46 + Math.sin(y * 7) * 1.4) * side + 0.008 * Math.sin(y * 70) * cuff
}
const pantsFold = (x, y) =>
  0.008 * Math.sin(y * 36 + x * 9) * clamp01((-y - 0.62) / 0.15) +
  0.005 * Math.sin(x * 40 + y * 4) * clamp01((-y - 0.3) / 0.2)

/* El buzo de frente: hombros caídos, mangas que se abren apenas y el hueco
   de la axila entre la manga y el cuerpo. Los puños terminan por encima de
   la cintura, como en un buzo colgado de verdad */
const HOODIE = shapeFrom([
  [0.11, 0],
  [0.28, -0.02, 0.42, -0.09], [0.52, -0.14, 0.55, -0.25],
  [0.595, -0.6], [0.6, -0.645, 0.565, -0.65],
  [0.465, -0.64], [0.445, -0.635, 0.44, -0.6],
  [0.405, -0.33], [0.39, -0.27, 0.375, -0.33],
  [0.365, -0.72], [0.365, -0.765, 0.32, -0.765],
  [-0.32, -0.765], [-0.365, -0.765, -0.365, -0.72],
  [-0.375, -0.33], [-0.39, -0.27, -0.405, -0.33],
  [-0.44, -0.6], [-0.445, -0.635, -0.465, -0.64],
  [-0.565, -0.65], [-0.6, -0.645, -0.595, -0.6],
  [-0.55, -0.25], [-0.52, -0.14, -0.42, -0.09],
  [-0.28, -0.02, -0.11, 0],
  [0, -0.08, 0.11, 0],
])

const PANTS = shapeFrom([
  [-0.3, 0], [0.3, 0], [0.315, -0.08, 0.31, -0.3],
  [0.27, -0.88], [0.27, -0.93, 0.23, -0.93], [0.09, -0.93], [0.065, -0.93, 0.065, -0.88],
  [0.035, -0.44], [0, -0.37, -0.035, -0.44],
  [-0.065, -0.88], [-0.065, -0.93, -0.09, -0.93], [-0.23, -0.93], [-0.27, -0.93, -0.27, -0.88],
  [-0.31, -0.3], [-0.315, -0.08, -0.3, 0],
])

const BODY_T = 0.085
/* El jogger va centrado y más fino que el buzo: su cintura queda adentro y
   asoma solo una franja del elástico bajo el ruedo */
const PANTS_T = 0.068
const PANTS_Y = -0.72
const PANTS_Z = 0

/* Las mallas se calculan una sola vez y las comparten todos los conjuntos */
let GEO = null
function geometries() {
  if (GEO) return GEO
  GEO = {
    body: inflate(HOODIE, { T: BODY_T, r: 0.13, fold: hoodieFold }),
    hood: inflate(shapeFrom([[-0.2, -0.04], [-0.25, 0.16, 0, 0.19], [0.25, 0.16, 0.2, -0.04], [0, -0.1, -0.2, -0.04]]), { T: 0.06, r: 0.08 }),
    hoodHole: new THREE.CircleGeometry(1, 32),
    cuff: inflate(roundedRect(0.17, 0.075, 0.03), { T: 0.086, r: 0.04, res: 0.006 }),
    /* el ruedo, apenas más angosto que el cuerpo: junta la tela */
    hem: inflate(roundedRect(0.66, 0.075, 0.035), { T: 0.08, r: 0.045 }),
    pocket: inflate(shapeFrom([
      [-0.19, 0], [0.19, 0], [0.26, -0.1], [0.26, -0.2], [0.26, -0.23, 0.23, -0.23],
      [-0.23, -0.23], [-0.26, -0.23, -0.26, -0.2], [-0.26, -0.1],
    ]), { T: 0.012, r: 0.03, res: 0.008 }),
    pants: inflate(PANTS, { T: PANTS_T, r: 0.1, fold: pantsFold }),
    waist: inflate(roundedRect(0.6, 0.08, 0.035), { T: 0.07, r: 0.04 }),
    ankle: inflate(roundedRect(0.19, 0.08, 0.03), { T: 0.074, r: 0.04, res: 0.006 }),
    cord: new THREE.CylinderGeometry(0.006, 0.006, 1, 8),
    tip: new THREE.CylinderGeometry(0.009, 0.009, 0.035, 8),
  }
  return GEO
}

/* Recorta una estampa de la foto con los bordes difuminados: alrededor de
   cada estampa hay tela negra, así que se funde con la del modelo */
function cropPrint(img, [fx, fy, fw, fh]) {
  const w = Math.round(img.naturalWidth * fw)
  const h = Math.round(img.naturalHeight * fh)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  g.drawImage(img, img.naturalWidth * fx, img.naturalHeight * fy, w, h, 0, 0, w, h)
  /* El negro de la foto no es el negro del modelo: lo oscuro se vuelve
     transparente y queda solo el dibujo sobre nuestra tela */
  const px = g.getImageData(0, 0, w, h)
  const d = px.data
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255
    const a = Math.min(1, Math.max(0, (l - 0.13) / 0.14))
    d[i + 3] = a * a * (3 - 2 * a) * 255
  }
  g.putImageData(px, 0, 0)
  g.globalCompositeOperation = 'destination-in'
  const m = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.max(w, h) * 0.62)
  m.addColorStop(0, 'rgba(0,0,0,1)')
  m.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = m
  g.fillRect(0, 0, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return { tex: t, aspect: w / h }
}

/* La estampa entra en una caja de maxW x maxH sin deformarse */
function Print({ data, maxW, maxH = maxW, position, rotation }) {
  if (!data) return null
  const w = Math.min(maxW, maxH * data.aspect)
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, w / data.aspect]} />
      <meshStandardMaterial map={data.tex} transparent roughness={0.85} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}

/* La foto en más resolución que la de la grilla, para que la estampa grande no se vea borrosa */
const hiRes = (url) => url.replace(/\bw_800\b/, 'w_1600')

function usePrints(product) {
  const crops = PRINTS[product.name]
  /* Sin recortes no hace falta bajar la foto */
  const img = useLoader(THREE.ImageLoader, crops && product.img ? hiRes(product.img) : 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')
  return useMemo(() => (crops && product.img
    ? { front: cropPrint(img, crops.front), back: cropPrint(img, crops.back) }
    : {}), [img, crops, product.img])
}

/* Los cordones salen del cuello, donde la tela es más fina, y bajan
   apenas inclinados para no hundirse en el pecho */
function Drawstring({ x, length, m, g }) {
  return (
    <group position={[x, -0.035, 0.066]} rotation={[-0.1, 0, 0]}>
      <mesh geometry={g.cord} material={m.cord} position={[0, -length / 2, 0]} scale={[1, length, 1]} castShadow />
      <mesh geometry={g.tip} material={m.tip} position={[0, -length - 0.015, 0]} />
    </group>
  )
}

/* Apenas por encima de la tela (las arrugas no llegan a la zona de las estampas) */
const ZF = BODY_T + 0.004

/* Las estampas llegan aparte: la prenda se ve enseguida y, si la foto no
   carga (CORS, 404), queda lisa */
function PrintSet({ product }) {
  const prints = usePrints(product)
  return (
    <>
      <Print data={prints.front} maxW={0.17} position={[0.18, -0.22, ZF]} />
      <Print data={prints.back} maxW={0.5} maxH={0.48} position={[0, -0.38, -ZF]} rotation={[0, Math.PI, 0]} />
      <Print data={prints.front} maxW={0.13} position={[0.17, PANTS_Y - 0.34, PANTS_Z + PANTS_T + 0.004]} />
    </>
  )
}

class Quiet extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

export function Outfit({ product, top }) {
  const m = useMaterials()
  const g = geometries()

  return (
    <group position={[0, top, 0]}>
      {/* Buzo: la capucha cae por la espalda y asoma detrás del cuello */}
      <mesh geometry={g.hood} material={m.fabric} position={[0, 0, -0.05]} scale={[1, 0.85, 1]} castShadow />
      <mesh geometry={g.hoodHole} material={m.inner} position={[0, -0.005, 0.012]} scale={[0.1, 0.045, 1]} />
      <mesh geometry={g.body} material={m.fabric} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={g.cuff} material={m.rib} position={[s * 0.518, -0.578, 0]} rotation={[0, 0, s * 0.125]} castShadow />
      ))}
      <mesh geometry={g.hem} material={m.rib} position={[0, -0.69, 0]} castShadow />
      <mesh geometry={g.pocket} material={m.fabric} position={[0, -0.42, BODY_T - 0.007]} castShadow />
      <Drawstring x={-0.055} length={0.27} m={m} g={g} />
      <Drawstring x={0.055} length={0.29} m={m} g={g} />
      <Quiet><Suspense fallback={null}><PrintSet product={product} /></Suspense></Quiet>

      {/* Jogger: la cintura queda escondida dentro del buzo */}
      <group position={[0, PANTS_Y, PANTS_Z]}>
        <mesh geometry={g.waist} material={m.rib} castShadow />
        <mesh geometry={g.pants} material={m.fabric} position={[0, -0.04, 0]} castShadow receiveShadow />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={g.ankle} material={m.rib} position={[s * 0.168, -0.91, 0]} castShadow />
        ))}
      </group>
    </group>
  )
}
