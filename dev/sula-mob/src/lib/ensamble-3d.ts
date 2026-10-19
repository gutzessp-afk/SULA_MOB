/**
 * ensamble-3d.ts
 * ──────────────
 * Calcula dónde va cada pieza del BOM en el producto ARMADO, para la vista 3D.
 *
 * El plano no trae coordenadas. Lo que se guarda de cada pieza es su
 * "colocación" en palabras (lado izquierdo/ambos, piso/tope, frente/centro,
 * y hacia qué eje corre su largo); aquí se convierten en posiciones reales
 * usando las medidas de la pieza y las dimensiones generales del producto.
 *
 *   x = ancho (izquierda-derecha) · y = alto (el piso es y = 0) · z = fondo
 *   Origen = centro de la base del producto. Todo en milímetros.
 *
 * Jerarquía: cada subensamble puede traer su propia "ubicación" y medidas
 * (el módulo A a la izquierda, el B a la derecha, la cubierta en el tope) y
 * el subensamble que lo contiene (la jaula va dentro del módulo). Sus piezas
 * se colocan dentro de ESE espacio, no en el producto completo.
 * El frente del producto queda en +z (hacia la cámara).
 *
 * Si un BOM no trae colocación (planos leídos sin IA), se deduce por el
 * nombre de la pieza (POSTE, PANEL, ENTREPAÑO, TAPA...): es una aproximación.
 *
 * RUTA: src/lib/ensamble-3d.ts
 */

import type { Capa3D, Colocacion3D, ComponenteBOM, Eje3D, Geometria3D, PlantillaBOM, TipoMaterial } from './types'

export interface PiezaArmada {
  key: string                    // única por instancia: "sub-pieza-n"
  compKey: string                // la pieza del BOM a la que pertenece: "sub-pieza"
  nombre: string
  subensamble: string
  material: string
  acabado: string                // acabado de esta pieza según el plano ("" = al natural)
  tipoMaterial: TipoMaterial
  inclinacion: number            // grados que se inclina hacia atrás (0 = recta)
  area: string
  capa: Capa3D
  geometria: Geometria3D
  cantidad: number               // piezas por subensamble
  total: number                  // piezas dibujadas
  largo: number | null
  ancho: string
  pagina: number | null
  notas: string
  pos: [number, number, number]  // centro, en mm
  size: [number, number, number] // tamaño en x, y, z, en mm
  ejeLargo: Eje3D
}

export interface Ensamble {
  piezas: PiezaArmada[]
  dims: { ancho: number; alto: number; fondo: number }
  /** true si la colocación se dedujo por nombre y no viene del análisis del plano */
  aproximado: boolean
  /** true si hay piezas colocadas con la posición exacta leída del plano */
  exacto: boolean
}

/** Espacio donde se colocan piezas: esquina mínima y tamaño, en mm */
interface Caja { min: [number, number, number]; size: [number, number, number] }

const EJES: Eje3D[] = ['x', 'y', 'z']
const IDX: Record<Eje3D, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

/** '2 3/4"x1"' → [69.85, 25.4] mm; '531.5' → [531.5] */
export function medidasDe(texto: string): number[] {
  const t = (texto || '').replace(/,/g, '.')
  if (/^\s*\d+(\.\d+)?\s*$/.test(t)) return [Number(t)]
  return t.split(/x/i).map(parte => {
    const m = parte.match(/(\d+)?\s*(\d+)\s*[\/-]\s*(\d+)|(\d+(?:\.\d+)?)/)
    if (!m) return NaN
    const valor = m[2] ? Number(m[1] || 0) + Number(m[2]) / Number(m[3]) : Number(m[4])
    return /"|in\b|pulg/i.test(parte) || m[2] ? valor * 25.4 : valor
  }).filter(n => Number.isFinite(n) && n > 0)
}

/** Clase de material de una pieza: la que dio el análisis, o deducida del texto del material */
export function tipoMaterialDe(c: Pick<ComponenteBOM, 'material' | 'tipo_material'>): TipoMaterial {
  if (c.tipo_material) return c.tipo_material
  const m = normalizar(c.material)
  if (/VIDRIO|CRISTAL|ESPEJO/.test(m)) return 'vidrio'
  if (/MELAMIN/.test(m)) return 'melamina'
  if (/MDF|TRIPLAY|MADERA|AGLOMERADO/.test(m)) return 'madera'
  if (/HULE|CAUCHO|NEOPRENO/.test(m)) return 'hule'
  if (/ALUMINIO/.test(m)) return 'aluminio'
  if (/ACRILIC|PVC|PLASTIC|POLICARB/.test(m)) return 'plastico'
  return 'metal'
}

const esPerfil = (material: string, geometria?: string) =>
  /^tubo/.test(geometria ?? '') || /tubo|t-?\s?rect|t-?\s?cuad|ptr|perfil cuadrado|solera|[aá]ngulo|barra|redondo|alambr/i.test(material)

/* ═══════════════════════════════════════
   COLOCACIÓN POR NOMBRE (cuando el BOM no la trae)
   ═══════════════════════════════════════ */

function colocacionPorNombre(c: ComponenteBOM): { colocacion: Colocacion3D; capa: Capa3D; geometria: Geometria3D } {
  const n = c.descripcion.toUpperCase()
  const perfil = esPerfil(c.material)
  const geometria: Geometria3D = perfil ? (/RED|ALAMBR|BARRA/i.test(c.material) ? 'tubo_redondo' : 'tubo_rectangular') : 'lamina_plana'
  const col = (eje_largo: Eje3D, eje_ancho: Eje3D, lado_x: Colocacion3D['lado_x'], altura_y: Colocacion3D['altura_y'], fondo_z: Colocacion3D['fondo_z']): Colocacion3D =>
    ({ eje_largo, eje_ancho, lado_x, altura_y, fondo_z })

  if (/POSTE|PARAL/.test(n)) return { colocacion: col('y', 'z', 'ambos', 'medio', 'centro'), capa: 'estructura', geometria }
  if (/PATA|NIVELADOR/.test(n)) return { colocacion: col('z', 'x', 'ambos', 'piso', 'ambos'), capa: 'base', geometria }
  if (/COSTADO|LATERAL/.test(n)) return { colocacion: col('y', 'z', 'ambos', 'medio', 'centro'), capa: 'exterior', geometria }
  if (/RESPALDO|FONDO|TRASER/.test(n)) return { colocacion: col('x', 'y', 'centro', 'medio', 'atras'), capa: 'exterior', geometria }
  if (/FRENTE|PUERTA/.test(n)) return { colocacion: col('x', 'y', 'centro', 'repartido', 'frente'), capa: 'exterior', geometria }
  if (/TAPA|CUBIERTA/.test(n)) return { colocacion: col('x', 'z', 'centro', 'tope', 'centro'), capa: 'exterior', geometria }
  if (/PANEL/.test(n)) return { colocacion: col('x', 'y', 'centro', 'repartido', 'centro'), capa: 'exterior', geometria }
  if (/BASE|PISO/.test(n)) return { colocacion: col('x', 'z', 'centro', 'piso', 'centro'), capa: 'base', geometria }
  if (/ENTREPA|CHAROLA|REPISA|GAVETA|CAJON/.test(n)) return { colocacion: col('x', 'z', 'centro', 'repartido', 'centro'), capa: 'interior', geometria }
  if (/TRAVES|LARGUERO|AMARRE|REF/.test(n)) return { colocacion: col('x', 'z', 'centro', 'repartido', 'ambos'), capa: 'estructura', geometria }
  return { colocacion: col('x', 'z', 'centro', 'repartido', 'centro'), capa: perfil ? 'estructura' : 'interior', geometria }
}

/* ═══════════════════════════════════════
   TAMAÑOS Y POSICIONES
   ═══════════════════════════════════════ */

/** Tamaño de la pieza en x, y, z según hacia dónde corren su largo y su ancho */
function tamano(c: ComponenteBOM, col: Colocacion3D, geometria: Geometria3D): [number, number, number] {
  const med = medidasDe(c.ancho)
  const perfil = esPerfil(c.material, geometria)
  const largo = Math.max(c.largo_mm ?? med[0] ?? 60, 8)
  const ancho = Math.max(med[0] ?? (perfil ? 30 : 60), 6)
  // Espesor visible: la sección del perfil; en lámina doblada, el cuerpo que forma el doblez
  const espesor = perfil
    ? Math.max(med[1] ?? med[0] ?? 25, 6)
    : geometria === 'lamina_doblada' ? Math.max(c.espesor_mm ?? 0, 14)
    : Math.max(c.espesor_mm ?? 0, geometria === 'placa' ? 5 : 3)

  const ejeLargo = col.eje_largo
  const ejeAncho = col.eje_ancho !== ejeLargo ? col.eje_ancho : EJES.find(e => e !== ejeLargo)!
  const ejeEspesor = EJES.find(e => e !== ejeLargo && e !== ejeAncho)!
  const size: [number, number, number] = [0, 0, 0]
  size[IDX[ejeLargo]] = largo
  size[IDX[ejeAncho]] = ancho
  size[IDX[ejeEspesor]] = espesor
  return size
}

/** Dimensiones generales: las del BOM, o "942 x 636 x 1600", o las de la pieza más grande */
function dimensiones(bom: PlantillaBOM) {
  const texto = `${bom.dimensiones ?? ''} ${bom.descripcion ?? ''}`.match(/(\d{3,4})\s*[xX×]\s*(\d{2,4})\s*[xX×]\s*(\d{3,4})/)
  const largos = bom.subensambles.flatMap(s => s.componentes).map(c => c.largo_mm ?? 0)
  const mayor = Math.max(...largos, 400)
  return {
    ancho: bom.ancho_mm || (texto ? Number(texto[1]) : mayor),
    fondo: bom.profundidad_mm || (texto ? Number(texto[2]) : Math.max(mayor * 0.5, 300)),
    alto: bom.alto_mm || (texto ? Number(texto[3]) : mayor),
  }
}

/** Centros a lo largo de un eje para n piezas dentro de [min, min+total] */
function centros(palabra: string, n: number, min: number, total: number, tam: number, vertical: boolean): number[] {
  const maxC = min + total - tam / 2
  const minC = min + tam / 2
  const ajustar = (c: number) => (minC > maxC ? min + total / 2 : Math.min(Math.max(c, minC), maxC))

  if (n >= 2) {
    // Dos piezas espejeadas van a los extremos (salvo que estén "repartidas" a lo alto)
    if (n === 2 && (palabra === 'ambos' || (!vertical && palabra !== 'repartido'))) return [minC, maxC].map(ajustar)
    return Array.from({ length: n }, (_, i) => ajustar(min + ((i + 0.5) * total) / n))
  }
  const centro = min + total / 2
  const fijo: Record<string, number> = {
    izquierda: minC, derecha: maxC, frente: maxC, atras: minC,
    piso: minC, abajo: Math.max(minC, min + total * 0.05 + tam / 2), medio: centro, arriba: min + total * 0.8, tope: maxC,
    centro, ambos: centro, repartido: centro,
  }
  return [ajustar(fijo[palabra] ?? centro)]
}

/** Reparte el total de piezas entre los ejes: "ambos" vale 2, "repartido" absorbe lo que falte */
function multiplicidades(col: Colocacion3D, total: number, cabenALoAncho = false): [number, number, number] {
  const palabras = [col.lado_x, col.altura_y, col.fondo_z]
  const m: [number, number, number] = [1, 1, 1]
  let resto = total
  for (const i of [0, 2, 1]) {
    if (palabras[i] === 'ambos' && resto % 2 === 0 && resto >= 2) { m[i] = 2; resto /= 2 }
  }
  if (resto > 1) {
    // Lo que falta va en un eje "repartido" (primero a lo alto, luego ancho, luego fondo).
    // Si no hay ninguno: una pieza "al frente/atrás" o "izquierda/derecha" se espejea en ese eje.
    // Si caben una junto a otra a lo ancho (una por módulo), se reparten primero así
    const orden = cabenALoAncho ? [0, 1, 2] : [1, 0, 2]
    const i = orden.find(k => palabras[k] === 'repartido')
      ?? (['frente', 'atras'].includes(palabras[2]) && m[2] === 1 ? 2 : undefined)
      ?? (['izquierda', 'derecha'].includes(palabras[0]) && m[0] === 1 ? 0 : undefined)
      ?? [1, 0, 2].find(k => m[k] === 1) ?? 1
    m[i] *= resto
  }
  return m
}

/* ═══════════════════════════════════════
   ENSAMBLE
   ═══════════════════════════════════════ */

export function ensamblar(bom: PlantillaBOM): Ensamble {
  let aproximado = false
  const dims = dimensiones(bom)
  const subs = bom.subensambles
  // Un subensamble puede ser más profundo que la cota general que leyó el análisis
  dims.fondo = Math.max(dims.fondo, ...subs.map(s => (s.ubicacion && !s.dentro_de ? s.profundidad_mm || 0 : 0)))
  const raiz: Caja = { min: [-dims.ancho / 2, 0, -dims.fondo / 2], size: [dims.ancho, dims.alto, dims.fondo] }
  const piezas: PiezaArmada[] = []

  const porNombre = new Map<string, number>()
  subs.forEach((s, i) => { if (!porNombre.has(normalizar(s.nombre))) porNombre.set(normalizar(s.nombre), i) })

  // Altura de lo que se apoya en el piso: una cubierta "en el tope" descansa encima, no flota
  const apoyo = Math.max(0, ...subs.map(s => (s.ubicacion && !s.dentro_de && ['piso', 'abajo'].includes(s.ubicacion.altura_y) ? s.alto_mm || 0 : 0)))

  // ── Espacios de cada subensamble: una caja por cada vez que aparece en el producto ──
  const cajas = new Map<number, Caja[]>()
  const cajasDe = (si: number, visitando: Set<number> = new Set()): Caja[] => {
    const lista = cajas.get(si)
    if (lista) return lista
    const sub = subs[si]
    const iPadre = sub.dentro_de ? porNombre.get(normalizar(sub.dentro_de)) : undefined
    const padres = iPadre !== undefined && iPadre !== si && !visitando.has(iPadre)
      ? cajasDe(iPadre, new Set(visitando).add(si))
      : [raiz]

    let resultado: Caja[]
    if (!sub.ubicacion) {
      resultado = padres
    } else {
      const u = sub.ubicacion
      const palabras = [u.lado_x, u.altura_y, u.fondo_z]
      const medidas = [sub.ancho_mm, sub.alto_mm, sub.profundidad_mm]
      // Veces que aparece dentro de CADA espacio del subensamble que lo contiene
      const veces = Math.max(1, Math.min(Math.round((sub.cantidad || 1) / padres.length), 12))
      const m = multiplicidades({ eje_largo: 'x', eje_ancho: 'z', lado_x: u.lado_x, altura_y: u.altura_y, fondo_z: u.fondo_z }, veces)
      resultado = padres.flatMap(padre => {
        const tam = [0, 1, 2].map(i => Math.min(medidas[i] || padre.size[i] / m[i], padre.size[i]))
        const ejes = [0, 1, 2].map(i => centros(palabras[i], m[i], padre.min[i], padre.size[i], tam[i], i === 1))
        if (padre === raiz && u.altura_y === 'tope' && apoyo > 0 && apoyo + tam[1] <= dims.alto + 1) ejes[1] = [apoyo + tam[1] / 2]
        return ejes[0].flatMap(x => ejes[1].flatMap(y => ejes[2].map((z): Caja => ({
          min: [x - tam[0] / 2, y - tam[1] / 2, z - tam[2] / 2],
          size: [tam[0], tam[1], tam[2]],
        }))))
      })
    }
    cajas.set(si, resultado)
    return resultado
  }

  // ── Piezas con posición exacta leída del plano: se dibujan tal cual ──
  // Si una caja se sale de las medidas generales, se recorta y se recorre hacia adentro.
  const exactas = new Set<string>()
  const limite = [dims.ancho * 1.03, dims.alto * 1.03, dims.fondo * 1.03]
  const dentro = (centro: number, tam: number, min: number, max: number) => Math.min(Math.max(centro, min + tam / 2), max - tam / 2)
  subs.forEach((sub, si) => {
    const inicioSub = piezas.length
    sub.componentes.forEach((c, ci) => {
      const [dx, dy, dz] = c.armado ?? []
      const pos = (c.posiciones ?? []).filter(p => p.length >= 3 && p.every(Number.isFinite)).map(p => ({ x: p[0], y: p[1], z: p[2] }))
      if (!pos.length || !(dx > 0 && dy > 0 && dz > 0)) return
      const a = { dx, dy, dz }
      exactas.add(`${si}-${ci}`)
      const deducida = colocacionPorNombre(c)
      // El largo corre por el lado mayor de la caja armada
      const ejeLargo: Eje3D = a.dx >= a.dy && a.dx >= a.dz ? 'x' : a.dy >= a.dz ? 'y' : 'z'
      const size: [number, number, number] = [
        Math.min(Math.max(a.dx, 2), limite[0]), Math.min(Math.max(a.dy, 2), limite[1]), Math.min(Math.max(a.dz, 2), limite[2]),
      ]
      // Apariciones encimadas en el mismo punto (dos paneles que van uno sobre otro):
      // se apilan a lo largo del lado de la pieza donde el producto tiene más espacio libre.
      const grupos = new Map<string, typeof pos>()
      for (const p of pos) {
        const k = `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`
        grupos.set(k, [...(grupos.get(k) ?? []), p])
      }
      for (const grupo of grupos.values()) {
        if (grupo.length < 2) continue
        const ejes = ([0, 1, 2] as const).filter(i => size[i] > Math.min(...size) * 3)
        const eje = (ejes.length ? ejes : ([0, 1, 2] as const)).reduce((m, i) => (limite[i] - size[i] > limite[m] - size[m] ? i : m))
        const k = (['x', 'y', 'z'] as const)[eje]
        const min = eje === 1 ? 0 : -limite[eje] / 2
        const max = eje === 1 ? limite[eje] : limite[eje] / 2
        const tramo = size[eje] * grupo.length
        const inicio = Math.min(Math.max(grupo[0][k] - tramo / 2, min), Math.max(min, max - tramo))
        grupo.forEach((p, i) => { p[k] = inicio + size[eje] * (i + 0.5) })
      }
      pos.slice(0, 60).forEach((p, n) => {
        piezas.push({
          key: `${si}-${ci}-e${n}`,
          compKey: `${si}-${ci}`,
          nombre: c.descripcion,
          subensamble: sub.nombre,
          material: c.material,
          acabado: c.acabado ?? '',
          tipoMaterial: tipoMaterialDe(c),
          inclinacion: Math.max(0, Math.min(c.inclinacion_grados ?? 0, 60)),
          area: c.area,
          capa: c.capa ?? deducida.capa,
          geometria: c.geometria ?? deducida.geometria,
          cantidad: c.cantidad,
          total: pos.length,
          largo: c.largo_mm,
          ancho: c.ancho,
          pagina: c.pagina,
          notas: c.notas,
          pos: [
            dentro(p.x, size[0], -limite[0] / 2, limite[0] / 2),
            dentro(p.y, size[1], 0, limite[1]),
            dentro(p.z, size[2], -limite[2] / 2, limite[2] / 2),
          ],
          size,
          ejeLargo,
        })
      })
    })

    // El plano detalló UNA vez un subensamble que se repite (2 gavetas iguales): las demás
    // copias se apilan hacia donde el producto tiene más espacio libre.
    const propias = piezas.slice(inicioSub)
    const veces = Math.min(Math.round(sub.cantidad || 1), 12)
    const unaSolaCopia = propias.length > 0 && sub.componentes.every(c => !c.posiciones?.length || c.posiciones.length <= (c.cantidad || 1))
    if (veces > 1 && unaSolaCopia) {
      const min = [0, 1, 2].map(i => Math.min(...propias.map(p => p.pos[i] - p.size[i] / 2)))
      const max = [0, 1, 2].map(i => Math.max(...propias.map(p => p.pos[i] + p.size[i] / 2)))
      const tam = [0, 1, 2].map(i => max[i] - min[i])
      const eje = [0, 1, 2].reduce((m, i) => (limite[i] - tam[i] > limite[m] - tam[m] ? i : m))
      const desde = eje === 1 ? 0 : -limite[eje] / 2
      const hasta = eje === 1 ? limite[eje] : limite[eje] / 2
      // Paso entre copias: su propio tamaño, o lo que quepa
      const paso = Math.min(tam[eje], (hasta - desde) / veces)
      const inicio = Math.min(Math.max(min[eje], desde), Math.max(desde, hasta - paso * veces))
      for (let n = veces - 1; n >= 0; n--) {
        const corrimiento = inicio + paso * n - min[eje]
        for (const p of propias) {
          if (n === 0) { p.pos[eje] += corrimiento; p.total *= veces; continue }
          const copia: PiezaArmada = { ...p, key: `${p.key}-c${n}`, pos: [...p.pos], total: p.total * veces }
          copia.pos[eje] += corrimiento
          piezas.push(copia)
        }
      }
    }
  })

  subs.forEach((sub, si) => {
    const espacios = cajasDe(si)
    // Con ubicación propia, cada caja es UN subensamble; sin ella, la caja general lleva todos
    const porCaja = sub.ubicacion ? Math.max(1, Math.round((sub.cantidad || 1) / espacios.length)) : (sub.cantidad || 1)

    const lista = sub.componentes.map((c, ci) => ({ c, ci })).filter(({ ci }) => !exactas.has(`${si}-${ci}`)).map(({ c, ci }) => {
      const deducida = colocacionPorNombre(c)
      if (!c.colocacion) aproximado = true
      const colocacion = c.colocacion ?? deducida.colocacion
      const geometria = c.geometria ?? deducida.geometria
      const total = Math.max(1, Math.min((c.cantidad || 1) * porCaja, 60))
      const size = tamano(c, colocacion, geometria)
      const caben = total * size[0] <= espacios[0].size[0] * 1.02
      return { c, ci, colocacion, geometria, capa: c.capa ?? deducida.capa, size, m: multiplicidades(colocacion, total, caben) }
    })
    // Piezas "repartidas a lo alto" del mismo subensamble comparten las franjas de altura
    const franjas = lista.reduce((n, p) => n + (p.colocacion.altura_y === 'repartido' ? p.m[1] : 0), 0)

    espacios.forEach((caja, ei) => {
      let franja = 0
      let apilado = 0 // alto ya ocupado por piezas horizontales en el tope (hule sobre su cama)
      for (const p of lista) {
        const palabras = [p.colocacion.lado_x, p.colocacion.altura_y, p.colocacion.fondo_z]
        const size: [number, number, number] = [
          Math.min(p.size[0], caja.size[0]), Math.min(p.size[1], caja.size[1]), Math.min(p.size[2], caja.size[2]),
        ]
        const xs = centros(palabras[0], p.m[0], caja.min[0], caja.size[0], size[0], false)
        let ys: number[]
        if (palabras[1] === 'repartido' && franjas > p.m[1]) {
          ys = Array.from({ length: p.m[1] }, (_, i) => caja.min[1] + ((franja + i + 0.5) * caja.size[1]) / franjas)
          franja += p.m[1]
        } else {
          ys = centros(palabras[1], p.m[1], caja.min[1], caja.size[1], size[1], true)
        }
        const zs = centros(palabras[2], p.m[2], caja.min[2], caja.size[2], size[2], false)
        // Tapas horizontales en el tope: se apilan en el orden del plano en vez de encimarse
        const horizontal = size[1] < Math.min(size[0], size[2]) && size[0] > caja.size[0] * 0.5 && size[2] > caja.size[2] * 0.5
        if (palabras[1] === 'tope' && horizontal && ys.length === 1) {
          ys = [caja.min[1] + caja.size[1] - apilado - size[1] / 2]
          apilado += size[1]
        }
        // Piezas que no caben una junto a otra (puertas corredizas): se alternan en dos carriles
        const traslape = xs.length > 1 && size[0] * xs.length > caja.size[0] * 1.02 ? size[2] * 0.7 : 0

        let n = 0
        for (const [xi, x] of xs.entries()) for (const y of ys) for (const z0 of zs) {
          const z = z0 + (xi % 2 ? -traslape : traslape)
          piezas.push({
            key: `${si}-${p.ci}-${ei}-${n++}`,
            compKey: `${si}-${p.ci}`,
            nombre: p.c.descripcion,
            subensamble: sub.nombre,
            material: p.c.material,
            acabado: p.c.acabado ?? '',
            tipoMaterial: tipoMaterialDe(p.c),
            inclinacion: Math.max(0, Math.min(p.c.inclinacion_grados ?? 0, 60)),
            area: p.c.area,
            capa: p.capa,
            geometria: p.geometria,
            cantidad: p.c.cantidad,
            total: xs.length * ys.length * zs.length * espacios.length,
            largo: p.c.largo_mm,
            ancho: p.c.ancho,
            pagina: p.c.pagina,
            notas: p.c.notas,
            pos: [x, y, z],
            size,
            ejeLargo: p.colocacion.eje_largo,
          })
        }
      }
    })
  })

  return { piezas, dims, aproximado, exacto: exactas.size > 0 }
}
