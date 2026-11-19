/**
 * explosion-revisiones.ts
 * ───────────────────────
 * Tipos y reglas de la "Hoja de explosión" con revisiones (REV-00, REV-01…), compartidos por la
 * página /admin/bom/[id] (HojaExplosion.tsx) y las API de /api/bom/revisiones.
 * No importa nada de servidor: se puede usar en el navegador.
 *
 * Colores tomados de los Excel reales de SULA:
 *   · Clasificación (columna D): Acero azul, Pintura verde, Madera rojizo, Herrajes lila,
 *     Accesorios gris, Empaque durazno.
 *   · Leyenda de revisiones (la imagen que traen los Excel):
 *       azul claro  = ACTUALIZACIÓN ACTUAL       (cambió en esta revisión)
 *       rosa        = ACTUALIZACIÓN ANTERIOR     (cambió en la revisión pasada)
 *       rojo        = DISMINUCIÓN DE MATERIALES  (bajó la cantidad o se quitó)
 *
 * RUTA: src/lib/explosion-revisiones.ts
 */

/* ═══ Tipos ═══ */

export interface EncabezadoRev {
  /** YYYY-MM-DD */
  fecha: string
  cliente: string
  /** Renglón debajo del cliente en el formato (ej. "MUESTRAS MANGO CORNER & TIENDA") */
  proyecto: string
  pedido: string
  orden_produccion: string
  usuario: string
}

export interface LineaRev {
  id: string
  revision_id: string
  explosion_id: string
  /** Línea equivalente en la revisión anterior; null = material nuevo */
  origen_id: string | null
  orden: number
  clave: string
  descripcion: string
  unidad: string
  clasificacion: string
  moneda: string
  costo: number
  cantidad: number
  oc: string
  comprado: boolean
  /** YYYY-MM-DD o null */
  fecha_compra: string | null
  /** Ya se recibió en almacén */
  almacen: boolean
  /** YYYY-MM-DD o null */
  fecha_almacen: string | null
  /** Columna "SE COMPRA O NO" del Excel: true = SI, false = NO, null = no dice (sql/bom_se_compra.sql) */
  se_compra?: boolean | null
  /** FINANZAS: estado del pago de la partida (sql/explosion_estados.sql) */
  estado_pago?: EstadoPago
  /** YYYY-MM-DD: se pone sola cada vez que cambia el estado de pago */
  fecha_estado_pago?: string | null
  /** ALMACÉN: lo cambia almacén a mano (nunca un pago); RECIBIDO ⇔ almacen = true */
  estado_almacen?: EstadoAlmacen
  /** Cuánto llegó (PARCIALMENTE RECIBIDO o RECIBIDO) */
  cantidad_recibida?: number | null
}

/* ═══ Estados de FINANZAS y ALMACÉN por partida ═══ */

export const ESTADOS_PAGO = ['PENDIENTE DE PAGO', 'PARCIALMENTE PAGADO', 'PAGADO'] as const
export const ESTADOS_ALMACEN = ['PENDIENTE DE RECIBIR', 'PARCIALMENTE RECIBIDO', 'RECIBIDO'] as const
export type EstadoPago = (typeof ESTADOS_PAGO)[number]
export type EstadoAlmacen = (typeof ESTADOS_ALMACEN)[number]

/**
 * Texto del Excel o de la API → estado. Acepta minúsculas, acentos, espacios de más y el error de la
 * plantilla de SULA "PEDIENTE DE RECIBIR". null si no es ningún estado.
 */
export function normalizarEstado(texto: unknown): EstadoPago | EstadoAlmacen | null {
  const t = normalizar(texto).replace(/^pediente/, 'pendiente')
  if (!t) return null
  return [...ESTADOS_PAGO, ...ESTADOS_ALMACEN].find(e => normalizar(e) === t) ?? null
}

export const esEstadoPago = (v: unknown): v is EstadoPago => (ESTADOS_PAGO as readonly unknown[]).includes(v)
export const esEstadoAlmacen = (v: unknown): v is EstadoAlmacen => (ESTADOS_ALMACEN as readonly unknown[]).includes(v)

/** Colores de la leyenda (rojo = pendiente, ámbar = parcial, verde = completo) */
export const COLOR_ESTADO: Record<EstadoPago | EstadoAlmacen, { fondo: string; texto: string }> = {
  'PENDIENTE DE PAGO': { fondo: '#FEE4E2', texto: '#B42318' },
  'PENDIENTE DE RECIBIR': { fondo: '#FEE4E2', texto: '#B42318' },
  'PARCIALMENTE PAGADO': { fondo: '#FEF0C7', texto: '#B54708' },
  'PARCIALMENTE RECIBIDO': { fondo: '#FEF0C7', texto: '#B54708' },
  PAGADO: { fondo: '#D1FADF', texto: '#05603A' },
  RECIBIDO: { fondo: '#D1FADF', texto: '#05603A' },
}

/** Nombre corto para la tabla, el PDF y las pastillas */
export const ESTADO_CORTO: Record<EstadoPago | EstadoAlmacen, string> = {
  'PENDIENTE DE PAGO': 'Pend. de pago',
  'PARCIALMENTE PAGADO': 'Parcial',
  PAGADO: 'Pagado',
  'PENDIENTE DE RECIBIR': 'Por recibir',
  'PARCIALMENTE RECIBIDO': 'Parcial',
  RECIBIDO: 'Recibido',
}

export const estadoPagoDe = (l: Pick<LineaRev, 'estado_pago'>): EstadoPago => (esEstadoPago(l.estado_pago) ? l.estado_pago : 'PENDIENTE DE PAGO')
export const estadoAlmacenDe = (l: Pick<LineaRev, 'estado_almacen' | 'almacen'>): EstadoAlmacen =>
  esEstadoAlmacen(l.estado_almacen) ? l.estado_almacen : l.almacen ? 'RECIBIDO' : 'PENDIENTE DE RECIBIR'

const redondear3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Estado de almacén que corresponde a una cantidad recibida (una sola regla para la hoja, el
 * servidor y el Excel): 0 o vacío → PENDIENTE DE RECIBIR · menos de lo necesario → PARCIALMENTE
 * RECIBIDO · lo necesario o más → RECIBIDO.
 */
export function estadoAlmacenPorCantidad(recibido: number | null | undefined, necesaria: number): EstadoAlmacen {
  const r = Number(recibido) || 0
  if (r <= 0) return 'PENDIENTE DE RECIBIR'
  return r >= (Number(necesaria) || 0) ? 'RECIBIDO' : 'PARCIALMENTE RECIBIDO'
}

/** Lo que falta por llegar: max(0, necesaria − recibido) */
export const faltanDe = (l: Pick<LineaRev, 'cantidad' | 'cantidad_recibida'>) =>
  redondear3(Math.max(0, (Number(l.cantidad) || 0) - (Number(l.cantidad_recibida) || 0)))

/** Días que puede seguir "por recibir" algo pagado antes de contarlo como pagado incompleto */
export const DIAS_ESPERA_PAGADO = 3

/**
 * PAGADO pero no ha llegado completo: parcialmente recibido, o todavía por recibir pasados
 * DIAS_ESPERA_PAGADO días desde que se pagó.
 */
export function pagadoIncompleto(l: Pick<LineaRev, 'estado_pago' | 'fecha_estado_pago' | 'estado_almacen' | 'almacen'>, hoy = hoyMexico()): boolean {
  if (estadoPagoDe(l) !== 'PAGADO') return false
  const a = estadoAlmacenDe(l)
  if (a === 'PARCIALMENTE RECIBIDO') return true
  if (a !== 'PENDIENTE DE RECIBIR' || !l.fecha_estado_pago) return false
  const dias = (Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${l.fecha_estado_pago}T12:00:00Z`)) / 86_400_000
  return dias >= DIAS_ESPERA_PAGADO
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa' en hora de México (sin recorrer el día por zona horaria) */
export function fechaMx(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ''
  return new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** ¿La columna OC ("5621, 5630") trae ese folio? */
export function tieneFolio(oc: unknown, folio: string): boolean {
  const f = folio.trim()
  return !!f && String(oc ?? '').split(/[,;/]+/).some(x => x.trim() === f)
}

/** Conteos de pago y de almacén (solo partidas con clave o descripción) */
export function resumenEstados(lineas: Pick<LineaRev, 'clave' | 'descripcion' | 'estado_pago' | 'fecha_estado_pago' | 'estado_almacen' | 'almacen'>[]) {
  const r = { pagadas: 0, pagoParcial: 0, pagoPendiente: 0, recibidas: 0, recibidoParcial: 0, porRecibir: 0, pagadoIncompleto: 0 }
  const hoy = hoyMexico()
  for (const l of lineas) {
    if (!(l.clave.trim() || l.descripcion.trim())) continue
    const p = estadoPagoDe(l)
    if (p === 'PAGADO') r.pagadas++
    else if (p === 'PARCIALMENTE PAGADO') r.pagoParcial++
    else r.pagoPendiente++
    const a = estadoAlmacenDe(l)
    if (a === 'RECIBIDO') r.recibidas++
    else if (a === 'PARCIALMENTE RECIBIDO') r.recibidoParcial++
    else r.porRecibir++
    if (pagadoIncompleto(l, hoy)) r.pagadoIncompleto++
  }
  return r
}

export type EstadoRev = 'borrador' | 'cerrada'

export interface Revision {
  id: string
  explosion_id: string
  numero: number
  estado: EstadoRev
  encabezado: EncabezadoRev
  motivo: string
  origen: 'importado' | 'manual'
  archivo_nombre: string | null
  creado_por: string | null
  created_at: string
  cerrada_en: string | null
  cerrada_por: string | null
  lineas: LineaRev[]
}

/** Campos de una línea que el admin puede editar (OC y Compra quedan para después) */
export const CAMPOS_EDITABLES = ['clave', 'descripcion', 'unidad', 'clasificacion', 'moneda', 'costo', 'cantidad'] as const
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number]
export type CambiosLinea = Partial<Pick<LineaRev, CampoEditable | 'se_compra'>>

/* ═══ Estado de compra de cada material ("YA PEDIDO") ═══ */

/** Etapa más avanzada: no se compra · falta pedir · pedido (tiene OC) · comprado · en almacén */
export type EstadoPedido = 'no_se_compra' | 'falta' | 'pedido' | 'comprado' | 'almacen'

export function estadoPedido(l: Pick<LineaRev, 'oc' | 'comprado' | 'almacen' | 'se_compra'>): EstadoPedido {
  if (l.almacen) return 'almacen'
  if (l.comprado) return 'comprado'
  if (String(l.oc ?? '').trim()) return 'pedido'
  return l.se_compra === false ? 'no_se_compra' : 'falta'
}

/** Cuántos materiales ya están pedidos (con OC, comprados o en almacén) de los que se compran */
export function resumenPedidos(lineas: Pick<LineaRev, 'clave' | 'descripcion' | 'oc' | 'comprado' | 'almacen' | 'se_compra'>[]) {
  let pedidos = 0, faltan = 0, noSeCompran = 0
  for (const l of lineas) {
    if (!(l.clave.trim() || l.descripcion.trim())) continue
    const e = estadoPedido(l)
    if (e === 'no_se_compra') noSeCompran++
    else if (e === 'falta') faltan++
    else pedidos++
  }
  return { pedidos, faltan, noSeCompran, seCompran: pedidos + faltan }
}

/* ═══ Catálogos ═══ */

export const CLASIFICACIONES: { nombre: string; color: string }[] = [
  { nombre: 'Acero', color: '#C6D9F1' },
  { nombre: 'Pintura', color: '#D7E4BD' },
  { nombre: 'Madera', color: '#D99694' },
  { nombre: 'Herrajes', color: '#CCC1DA' },
  { nombre: 'Accesorios', color: '#D9D9D9' },
  { nombre: 'Empaque', color: '#FCD5B5' },
]

export const UNIDADES = ['Pieza', 'Kilo', 'Metro', 'Litro', 'Juego', 'Par', 'Rollo', 'Caja']
export const MONEDAS = ['Peso Mexicano', 'Dólar Americano']

export type Marca = 'actual' | 'anterior' | 'disminucion'

export const LEYENDA: { marca: Marca; texto: string; color: string }[] = [
  { marca: 'anterior', texto: 'Actualización anterior', color: '#E6B8B7' },
  { marca: 'actual', texto: 'Actualización actual', color: '#93CDDD' },
  { marca: 'disminucion', texto: 'Disminución de materiales', color: '#FF0000' },
]

export const colorMarca = (m: Marca) => LEYENDA.find(l => l.marca === m)!.color

/** Color de la clasificación (sin distinguir mayúsculas/acentos); gris claro si no es conocida */
export function colorClasificacion(nombre: string): string {
  const n = normalizar(nombre)
  return CLASIFICACIONES.find(c => normalizar(c.nombre) === n)?.color ?? '#EEEEEE'
}

/* ═══ Helpers ═══ */

/** minúsculas, sin acentos ni espacios dobles: para comparar textos del Excel */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** 1 → "REV-01" */
export const etiquetaRev = (numero: number) => `REV-${String(Math.max(0, numero)).padStart(2, '0')}`

const redondear2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** Costo estimado = costo × cantidad (columna H del Excel) */
export const costoEstimado = (l: Pick<LineaRev, 'costo' | 'cantidad'>) => redondear2(Number(l.costo) * Number(l.cantidad))

/** Una línea cuenta cuando tiene clave o descripción */
export const lineaConContenido = (l: Pick<LineaRev, 'clave' | 'descripcion'>) => !!(l.clave.trim() || l.descripcion.trim())

/** Fecha de hoy en hora de México, YYYY-MM-DD */
export function hoyMexico(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export interface GrupoUnidad {
  unidad: string
  lineas: LineaRev[]
  totalCantidad: number
  totalCosto: number
}

/** Agrupa por unidad (Kilo, Pieza…) en el orden en que aparece cada una, como el Excel */
export function agruparPorUnidad(lineas: LineaRev[]): GrupoUnidad[] {
  const grupos = new Map<string, GrupoUnidad>()
  for (const l of [...lineas].sort((a, b) => a.orden - b.orden)) {
    const unidad = l.unidad.trim() || 'Pieza'
    const g = grupos.get(unidad) ?? { unidad, lineas: [], totalCantidad: 0, totalCosto: 0 }
    g.lineas.push(l)
    g.totalCantidad = redondear2(g.totalCantidad + Number(l.cantidad))
    g.totalCosto = redondear2(g.totalCosto + costoEstimado(l))
    grupos.set(unidad, g)
  }
  return [...grupos.values()]
}

/* ═══ Comparación entre revisiones ═══ */

const CAMPOS_COMPARADOS: CampoEditable[] = ['clave', 'descripcion', 'unidad', 'clasificacion', 'moneda', 'costo', 'cantidad']

const mismoValor = (a: unknown, b: unknown) =>
  typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : String(a ?? '').trim() === String(b ?? '').trim()

/** Campos que cambiaron de `antes` a `ahora` */
export function camposCambiados(ahora: LineaRev, antes: LineaRev): CampoEditable[] {
  return CAMPOS_COMPARADOS.filter(c => !mismoValor(ahora[c], antes[c]))
}

export interface ResultadoComparacion {
  /** id de línea → marca de color (las que no cambiaron no aparecen) */
  marcas: Record<string, Marca>
  /** id de línea → qué campos cambiaron contra la revisión anterior */
  cambios: Record<string, CampoEditable[]>
  /** Líneas de la revisión anterior que ya no están en esta (se quitaron) */
  eliminadas: LineaRev[]
  resumen: { nuevas: number; modificadas: number; disminuciones: number; eliminadas: number }
}

/** Ids de las líneas que cambiaron en `rev` contra `previa` (nuevas o modificadas) */
function idsCambiados(rev: Revision, previa: Revision | undefined): Set<string> {
  const ids = new Set<string>()
  if (!previa) return ids
  const porId = new Map(previa.lineas.map(l => [l.id, l]))
  for (const l of rev.lineas) {
    const antes = l.origen_id ? porId.get(l.origen_id) : undefined
    if (!antes || camposCambiados(l, antes).length > 0) ids.add(l.id)
  }
  return ids
}

/**
 * Colores de la revisión `revisiones[indice]` (lista ordenada por número):
 *   rojo  = bajó la cantidad contra la revisión anterior
 *   azul  = nueva o modificada en esta revisión
 *   rosa  = sin cambios ahora, pero cambió en la revisión anterior
 * REV-00 (o la primera que haya) no lleva colores.
 */
export function compararRevision(revisiones: Revision[], indice: number): ResultadoComparacion {
  const rev = revisiones[indice]
  const previa = revisiones[indice - 1]
  const antepenultima = revisiones[indice - 2]
  const vacio: ResultadoComparacion = { marcas: {}, cambios: {}, eliminadas: [], resumen: { nuevas: 0, modificadas: 0, disminuciones: 0, eliminadas: 0 } }
  if (!rev || !previa) return vacio

  const resultado = vacio
  const previasPorId = new Map(previa.lineas.map(l => [l.id, l]))
  const cambiadasAntes = idsCambiados(previa, antepenultima)
  const usadas = new Set<string>()

  for (const l of rev.lineas) {
    if (!lineaConContenido(l)) continue
    const antes = l.origen_id ? previasPorId.get(l.origen_id) : undefined
    if (!antes) {
      resultado.marcas[l.id] = 'actual'
      resultado.resumen.nuevas++
      continue
    }
    usadas.add(antes.id)
    const campos = camposCambiados(l, antes)
    if (campos.length > 0) resultado.cambios[l.id] = campos
    if (Number(l.cantidad) < Number(antes.cantidad)) {
      resultado.marcas[l.id] = 'disminucion'
      resultado.resumen.disminuciones++
    } else if (campos.length > 0) {
      resultado.marcas[l.id] = 'actual'
      resultado.resumen.modificadas++
    } else if (cambiadasAntes.has(antes.id)) {
      resultado.marcas[l.id] = 'anterior'
    }
  }

  resultado.eliminadas = previa.lineas.filter(l => !usadas.has(l.id) && lineaConContenido(l))
  resultado.resumen.eliminadas = resultado.eliminadas.length
  return resultado
}

/* ═══ Nombre del archivo ═══ */

export type NombrarPor = 'pedido' | 'sucursal'

/**
 * "EXPLOSION DE MATERIALES PED-3518 REV-01.xlsx" (o con la sucursal en lugar del pedido).
 * Se quitan los caracteres que Windows no acepta en nombres de archivo.
 */
export function nombreArchivoExplosion(numero: number, referencia: string): string {
  const ref = referencia.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'SIN-PEDIDO'
  return `EXPLOSION DE MATERIALES ${ref} ${etiquetaRev(numero)}.xlsx`
}
