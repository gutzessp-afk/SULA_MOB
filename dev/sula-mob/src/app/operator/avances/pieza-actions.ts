
'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  areasAbiertas,
  cerrarAccesoArea,
  tieneAccesoArea,
  validarClaveArea,
  validarClaveGeneral,
} from '@/lib/operador/acceso'
import {
  actualizarAvanceAdmin,
  productoDePiezaDespiece,
  registrarEnAdmin,
  sincronizarDespiece,
  INTEGRACION_ACTIVA,
  ORIGEN_DESPIECE,
} from '@/lib/operador/despiece'
import { getUsuarioActual } from '../actions'
import { avisarRetrasoDespues } from '@/lib/push'

type Supabase = Awaited<ReturnType<typeof createClient>>

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const ORDEN_AREAS = [
  'corte de lamina',
  'corte de laser',
  'corte de tubo',
  'troquel',
  'doblez',
  'punteado',
  'soldadura y pulido',
  'pintura',
  'empaque',
  'vidrio',
  'melamina',
  'aluminio',
  'herraje',
]
// Las 9 areas de siempre: un producto sin ruta definida aparece en todas ellas
const AREAS_BASE = ORDEN_AREAS.slice(0, 9)
const TIPOS_PAUSA_AREA = ['pausa_area', 'cambio_turno']

/* ------------------------------------------------------------------ */
/*  Tipos que usa la pantalla                                          */
/* ------------------------------------------------------------------ */

export interface Resultado {
  error?: string
  success?: boolean
  areaCompleta?: boolean
  afectadas?: number
}

export interface AreaOperador {
  areaId: string
  nombre: string
  hechas: number
  meta: number
  porcentaje: number
  piezas: number
  enCurso: number
  pausa: { tipo: string; motivo: string } | null
  cerrada: boolean
  desbloqueada: boolean
}

export interface ProyectoOperador {
  id: string
  codigo: string
  nombre: string
  cliente: string
  /** Sucursal o destino del pedido (ej. "KFC HOSPICIO"): distingue pedidos del mismo cliente */
  referencia_sucursal: string
  progreso: number
  usaPdf: boolean
  areas: AreaOperador[]
  ahora: string
}

export interface PausaAbierta {
  tipo: string
  motivo: string
  inicio: string
}

export interface TrabajoEnCurso {
  id: string
  inicio: string
  pausadoSeg: number
  pausaAbierta: PausaAbierta | null
}

export type TipoPieza = 'pdf' | 'producto'

export interface PiezaOperador {
  id: string
  tipo: TipoPieza
  nombre: string
  modulo: string | null
  material: string | null
  medidas: string | null
  notas: string | null
  meta: number
  hechas: number
  faltan: number
  trabajo: TrabajoEnCurso | null
}

export interface AreaVista {
  areaNombre: string
  usaPdf: boolean
  piezas: PiezaOperador[]
  pausa: { tipo: string; motivo: string } | null
  cerrada: boolean
  ahora: string
}

export interface EvidenciaFila {
  trabajoId: string
  proyecto: string
  area: string
  pieza: string
  operador: string
  inicio: string
  fin: string
  piezas: number
  segTotal: number
  segPausa: number
  segReporte: number
  segTrabajado: number
  reportes: { motivo: string; seg: number }[]
  pausas: { motivo: string; seg: number }[]
}

export interface ResumenAreaDia {
  area: string
  piezasMeta: number
  piezasHechas: number
  porcentaje: number
  enCurso: number
  pausa: string | null
}

export interface ReporteDia {
  hora: string
  area: string
  operador: string
  motivo: string
  nota: string | null
  horasPerdidas: number
  fotoUrl: string | null
}

export interface EvidenciaDia {
  fecha: string
  proyecto: string | null
  codigo: string | null
  filas: EvidenciaFila[]
  areas: ResumenAreaDia[]
  reportes: ReporteDia[]
}

export interface EvidenciaGuardada {
  id: string
  fecha: string
  pdfUrl: string
  creadoEn: string
  creadoPor: string
}

/* ------------------------------------------------------------------ */
/*  Utilidades internas                                                */
/* ------------------------------------------------------------------ */

function ahoraISO() {
  return new Date().toISOString()
}

function ms(iso: string) {
  return new Date(iso).getTime()
}

function norm(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

function texto(fila: Record<string, unknown>, claves: string[]): string | null {
  for (const c of claves) {
    const v = fila[c]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function detalleError(e: { message?: string } | null | undefined) {
  return e?.message ? ` (${e.message})` : ''
}

interface FilaAvance {
  producto_id: string
  area_id: string
  piezas_completadas: number | null
  piezas_totales: number | null
}

interface PiezaPdf {
  id: string
  area_id: string
  descripcion: string
  modulo: string | null
  material: string | null
  medidas: string | null
  notas: string | null
  meta: number
}

interface PausaFila {
  id: string
  trabajo_id: string
  tipo: string
  motivo: string
  inicio: string
  fin: string | null
  retraso_id: string | null
}

async function cargarFilas(supabase: Supabase, productoIds: string[]): Promise<FilaAvance[]> {
  if (productoIds.length === 0) return []
  const { data, error } = await supabase
    .from('producto_area_avance')
    .select('producto_id, area_id, piezas_completadas, piezas_totales')
    .in('producto_id', productoIds)
  if (error) console.error('Error al traer avances por area:', error)
  return (data ?? []) as FilaAvance[]
}

// Piezas que vienen del PDF (Matriz de Corte) de un proyecto
async function cargarPiezasPdf(supabase: Supabase, proyectoId: string): Promise<PiezaPdf[]> {
  const { data, error } = await supabase
    .from('piezas_proyecto')
    .select('id, area_id, descripcion, modulo, material, medidas, notas, meta')
    .eq('proyecto_id', proyectoId)
    // Las piezas que salieron del despiece del plano no se muestran mientras la integración esté apagada
    .or(INTEGRACION_ACTIVA ? 'origen.is.null,origen.not.is.null' : `origen.is.null,origen.neq.${ORIGEN_DESPIECE}`)
    .order('orden')
  if (error) {
    console.error('Error al traer piezas del PDF (¿ya corriste el SQL del paso 2?):', error)
    return []
  }
  return (data ?? []) as PiezaPdf[]
}

// Piezas hechas por pieza del PDF = suma de todos los trabajos finalizados
async function hechasPdf(supabase: Supabase, piezaIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (piezaIds.length === 0) return mapa
  const { data, error } = await supabase
    .from('trabajos_pieza')
    .select('pieza_id, piezas_hechas')
    .eq('estado', 'finalizado')
    .in('pieza_id', piezaIds)
  if (error) console.error('Error al sumar piezas hechas:', error)
  ;(data ?? []).forEach((t) => {
    const id = t.pieza_id as string
    mapa.set(id, (mapa.get(id) ?? 0) + ((t.piezas_hechas as number | null) ?? 0))
  })
  return mapa
}

function esVisible(
  nombreArea: string,
  productoId: string,
  areaId: string,
  claves: Set<string>,
  conFilas: Set<string>
) {
  if (claves.has(`${productoId}|${areaId}`)) return true
  return !conFilas.has(productoId) && AREAS_BASE.includes(norm(nombreArea))
}

async function pausasDe(supabase: Supabase, trabajoIds: string[]): Promise<PausaFila[]> {
  if (trabajoIds.length === 0) return []
  const { data, error } = await supabase
    .from('pausas_pieza')
    .select('id, trabajo_id, tipo, motivo, inicio, fin, retraso_id')
    .in('trabajo_id', trabajoIds)
  if (error) console.error('Error al traer pausas:', error)
  return (data ?? []) as PausaFila[]
}

// Cierra pausas y, si eran un reporte al admin, guarda las horas perdidas en "retrasos"
async function cerrarPausas(supabase: Supabase, pausas: PausaFila[]) {
  const ahora = new Date()
  const horasPorReporte = new Map<string, number>()
  for (const p of pausas) {
    await supabase.from('pausas_pieza').update({ fin: ahora.toISOString() }).eq('id', p.id)
    if (p.retraso_id) {
      const horas = Math.round(((ahora.getTime() - ms(p.inicio)) / 3600000) * 100) / 100
      // un mismo reporte puede detener varias piezas: se guarda el mayor tiempo perdido
      horasPorReporte.set(p.retraso_id, Math.max(horasPorReporte.get(p.retraso_id) ?? 0, horas))
    }
  }
  for (const [retrasoId, horas] of horasPorReporte) {
    await supabase.from('retrasos').update({ tiempo_estimado_retraso: horas }).eq('id', retrasoId)
  }
}

function trabajoDe(
  t: { id: string; inicio: string },
  pausas: PausaFila[]
): TrabajoEnCurso {
  const propias = pausas.filter((x) => x.trabajo_id === t.id)
  const abierta = propias.find((x) => x.fin === null) ?? null
  const pausadoSeg = propias
    .filter((x) => x.fin !== null)
    .reduce((s, x) => s + Math.max(0, (ms(x.fin as string) - ms(x.inicio)) / 1000), 0)
  return {
    id: t.id,
    inicio: t.inicio,
    pausadoSeg: Math.round(pausadoSeg),
    pausaAbierta: abierta
      ? { tipo: abierta.tipo, motivo: abierta.motivo, inicio: abierta.inicio }
      : null,
  }
}

/* ---- Progreso de productos (misma formula que usa tu actions.ts) ---- */

async function obtenerFila(
  supabase: Supabase,
  productoId: string,
  areaId: string
): Promise<{
  fila?: { id: string; piezas_completadas: number | null; piezas_totales: number | null }
  error?: string
}> {
  const { data: existente } = await supabase
    .from('producto_area_avance')
    .select('id, piezas_completadas, piezas_totales')
    .eq('producto_id', productoId)
    .eq('area_id', areaId)
    .maybeSingle()

  if (existente) return { fila: existente }

  const { data: producto } = await supabase
    .from('proyecto_productos')
    .select('cantidad')
    .eq('id', productoId)
    .maybeSingle()

  if (!producto) return { error: 'No se encontró la pieza.' }

  const { data: nueva, error } = await supabase
    .from('producto_area_avance')
    .insert({
      producto_id: productoId,
      area_id: areaId,
      piezas_completadas: 0,
      piezas_totales: producto.cantidad ?? 0,
      porcentaje: 0,
      completado: false,
    })
    .select('id, piezas_completadas, piezas_totales')
    .single()

  if (error || !nueva) {
    console.error('Error creando producto_area_avance:', error)
    return { error: 'No se pudo preparar el avance de esta área.' }
  }
  return { fila: nueva }
}

async function recalcularProgreso(supabase: Supabase, proyectoId: string) {
  const { data: productos } = await supabase
    .from('proyecto_productos')
    .select('id')
    .eq('proyecto_id', proyectoId)

  if (!productos || productos.length === 0) return

  const ids = productos.map((p) => p.id as string)

  const [filasRes, areasRes] = await Promise.all([
    supabase
      .from('producto_area_avance')
      .select('producto_id, area_id, piezas_completadas, piezas_totales, porcentaje')
      .in('producto_id', ids),
    supabase.from('areas').select('id, peso'),
  ])

  const filas = filasRes.data ?? []
  const pesoPorArea = new Map<string, number>()
  ;(areasRes.data ?? []).forEach((a) => pesoPorArea.set(a.id as string, Number(a.peso)))

  let sumaGlobal = 0

  for (const producto of productos) {
    const propias = filas.filter((f) => f.producto_id === producto.id)
    let pesoTotal = 0
    let pesoAvanzado = 0

    propias.forEach((f) => {
      const peso = pesoPorArea.get(f.area_id as string) ?? 14.28
      const total = f.piezas_totales ?? 0
      const pct =
        total > 0
          ? Math.min(100, Math.round(((f.piezas_completadas ?? 0) / total) * 100))
          : (f.porcentaje ?? 0)
      pesoTotal += peso
      pesoAvanzado += (peso * pct) / 100
    })

    const pctProducto = pesoTotal > 0 ? (pesoAvanzado / pesoTotal) * 100 : 0

    await supabase
      .from('proyecto_productos')
      .update({ progreso: Math.round(pctProducto) })
      .eq('id', producto.id)

    sumaGlobal += pctProducto / productos.length
  }

  await supabase
    .from('proyectos')
    .update({ progreso: Math.min(100, Math.round(sumaGlobal)) })
    .eq('id', proyectoId)
}

// Proyectos con PDF: el % del proyecto se calcula con el peso de cada area (igual que el admin)
async function actualizarProgresoPdf(
  supabase: Supabase,
  proyectoId: string,
  areaId: string
): Promise<boolean> {
  const piezas = await cargarPiezasPdf(supabase, proyectoId)
  if (piezas.length === 0) return false

  const hechas = await hechasPdf(
    supabase,
    piezas.map((p) => p.id)
  )
  const { data: areas } = await supabase.from('areas').select('id, peso')
  const peso = new Map<string, number>()
  ;(areas ?? []).forEach((a) => peso.set(a.id as string, Number(a.peso)))

  const porArea = new Map<string, { h: number; m: number }>()
  piezas.forEach((p) => {
    const a = porArea.get(p.area_id) ?? { h: 0, m: 0 }
    a.h += Math.min(hechas.get(p.id) ?? 0, p.meta)
    a.m += p.meta
    porArea.set(p.area_id, a)
  })

  let pesoTotal = 0
  let pesoAvanzado = 0
  porArea.forEach((v, id) => {
    const w = peso.get(id) ?? 14.28
    pesoTotal += w
    pesoAvanzado += w * (v.m > 0 ? v.h / v.m : 0)
  })

  const progreso = pesoTotal > 0 ? Math.min(100, Math.round((pesoAvanzado / pesoTotal) * 100)) : 0
  await supabase.from('proyectos').update({ progreso }).eq('id', proyectoId)

  const propia = porArea.get(areaId)
  return Boolean(propia && propia.m > 0 && propia.h >= propia.m)
}

/* ------------------------------------------------------------------ */
/*  Lectura: proyecto con sus areas                                    */
/* ------------------------------------------------------------------ */

/**
 * Al abrir un proyecto: reparte por área las piezas del despiece de sus planos (lo que el admin
 * analizó). Se llama una vez al entrar, no en cada actualización de la pantalla.
 */
export async function prepararProyecto(proyectoId: string): Promise<boolean> {
  const usuario = await getUsuarioActual()
  if (!usuario) return false
  const supabase = await createClient()
  const cambio = await sincronizarDespiece(supabase, proyectoId)
  // El avance del admin se recalcula después de responder: la pantalla no espera
  if (cambio) after(() => actualizarAvanceAdmin(supabase, proyectoId))
  return cambio
}

export async function getProyectoOperador(proyectoId: string): Promise<ProyectoOperador | null> {
  const usuario = await getUsuarioActual()
  if (!usuario) return null

  const supabase = await createClient()

  const [proyRes, prodRes, areasRes, cierresRes, abiertas, trabRes, piezasPdf] =
    await Promise.all([
      supabase
        .from('proyectos')
        .select('id, codigo, nombre, cliente, referencia_sucursal, progreso')
        .eq('id', proyectoId)
        .maybeSingle(),
      supabase.from('proyecto_productos').select('id, cantidad').eq('proyecto_id', proyectoId),
      supabase.from('areas').select('id, nombre').eq('activo', true),
      supabase.from('area_cierres').select('area_id').eq('proyecto_id', proyectoId),
      areasAbiertas(supabase, usuario),
      supabase
        .from('trabajos_pieza')
        .select('id, area_id')
        .eq('proyecto_id', proyectoId)
        .eq('estado', 'en_curso'),
      cargarPiezasPdf(supabase, proyectoId),
    ])

  if (proyRes.error || !proyRes.data) {
    console.error('Error al traer proyecto:', proyRes.error)
    return null
  }
  if (prodRes.error || areasRes.error) {
    console.error('Error al traer piezas o áreas:', prodRes.error, areasRes.error)
    return null
  }

  const usaPdf = piezasPdf.length > 0
  const productos = prodRes.data ?? []
  const trabajos = (trabRes.data ?? []) as { id: string; area_id: string }[]

  // Lo que no depende entre sí se pide al mismo tiempo
  const [filas, hechasMapa, pausasTodas] = await Promise.all([
    usaPdf ? Promise.resolve([] as FilaAvance[]) : cargarFilas(supabase, productos.map((p) => p.id as string)),
    usaPdf ? hechasPdf(supabase, piezasPdf.map((p) => p.id)) : Promise.resolve(new Map<string, number>()),
    pausasDe(supabase, trabajos.map((t) => t.id)),
  ])
  const claves = new Map<string, FilaAvance>()
  filas.forEach((f) => claves.set(`${f.producto_id}|${f.area_id}`, f))
  const conFilas = new Set(filas.map((f) => f.producto_id))
  const clavesSet = new Set(claves.keys())

  const cerradas = new Set((cierresRes.data ?? []).map((c) => c.area_id as string))

  const pausas = pausasTodas.filter((p) => p.fin === null)
  const areaDeTrabajo = new Map(trabajos.map((t) => [t.id, t.area_id]))

  const areas: AreaOperador[] = (areasRes.data ?? [])
    .map((area) => {
      const areaId = area.id as string
      const nombre = area.nombre as string

      let piezas = 0
      let hechas = 0
      let meta = 0

      if (usaPdf) {
        const propias = piezasPdf.filter((p) => p.area_id === areaId)
        piezas = propias.length
        propias.forEach((p) => {
          meta += p.meta
          hechas += Math.min(hechasMapa.get(p.id) ?? 0, p.meta)
        })
      } else {
        const visibles = productos.filter((p) =>
          esVisible(nombre, p.id as string, areaId, clavesSet, conFilas)
        )
        piezas = visibles.length
        visibles.forEach((p) => {
          const f = claves.get(`${p.id}|${areaId}`)
          hechas += f?.piezas_completadas ?? 0
          meta += f?.piezas_totales ?? (p.cantidad as number | null) ?? 0
        })
      }

      const enCurso = trabajos.filter((t) => t.area_id === areaId).length
      const pausaArea = pausas.find(
        (p) => areaDeTrabajo.get(p.trabajo_id) === areaId && TIPOS_PAUSA_AREA.includes(p.tipo)
      )

      return {
        areaId,
        nombre,
        hechas,
        meta,
        porcentaje: meta > 0 ? Math.min(100, Math.round((hechas / meta) * 100)) : 0,
        piezas,
        enCurso,
        pausa: pausaArea ? { tipo: pausaArea.tipo, motivo: pausaArea.motivo } : null,
        cerrada: cerradas.has(areaId),
        desbloqueada: abiertas.has(areaId),
      }
    })
    // En proyectos con PDF se muestran todas las areas (las vacias dicen "Sin piezas")
    .filter((a) => usaPdf || a.piezas > 0)
    .sort((a, b) => {
      const ia = ORDEN_AREAS.indexOf(norm(a.nombre))
      const ib = ORDEN_AREAS.indexOf(norm(b.nombre))
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })

  return {
    id: proyRes.data.id as string,
    codigo: (proyRes.data.codigo as string | null) ?? '',
    nombre: proyRes.data.nombre as string,
    cliente: (proyRes.data.cliente as string | null) ?? '',
    referencia_sucursal: (proyRes.data.referencia_sucursal as string | null) ?? '',
    progreso: (proyRes.data.progreso as number | null) ?? 0,
    usaPdf,
    areas,
    ahora: ahoraISO(),
  }
}

/* ------------------------------------------------------------------ */
/*  Lectura: piezas de un area                                         */
/* ------------------------------------------------------------------ */

export async function getAreaOperador(
  proyectoId: string,
  areaId: string
): Promise<{ vista?: AreaVista; error?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  const [acceso, areaRes, prodRes, cierreRes, trabRes, piezasPdf] = await Promise.all([
    tieneAccesoArea(supabase, usuario, areaId),
    supabase.from('areas').select('id, nombre').eq('id', areaId).maybeSingle(),
    supabase.from('proyecto_productos').select('*').eq('proyecto_id', proyectoId).order('created_at'),
    supabase
      .from('area_cierres')
      .select('id')
      .eq('proyecto_id', proyectoId)
      .eq('area_id', areaId)
      .maybeSingle(),
    supabase
      .from('trabajos_pieza')
      .select('id, producto_id, pieza_id, inicio')
      .eq('proyecto_id', proyectoId)
      .eq('area_id', areaId)
      .eq('estado', 'en_curso'),
    cargarPiezasPdf(supabase, proyectoId),
  ])

  if (!acceso) return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }
  if (!areaRes.data) return { error: 'No se encontró el área.' }
  if (prodRes.error) {
    console.error('Error al traer piezas:', prodRes.error)
    return { error: 'No se pudieron cargar las piezas.' }
  }

  const nombreArea = areaRes.data.nombre as string
  const usaPdf = piezasPdf.length > 0

  const trabajos = (trabRes.data ?? []) as {
    id: string
    producto_id: string | null
    pieza_id: string | null
    inicio: string
  }[]
  const propias = piezasPdf.filter((p) => p.area_id === areaId)
  const productosArea = (prodRes.data ?? []) as Record<string, unknown>[]

  // Pausas y avance de las piezas al mismo tiempo
  const [pausas, hechasMapa, filasProducto] = await Promise.all([
    pausasDe(supabase, trabajos.map((t) => t.id)),
    usaPdf ? hechasPdf(supabase, propias.map((p) => p.id)) : Promise.resolve(new Map<string, number>()),
    usaPdf ? Promise.resolve([] as FilaAvance[]) : cargarFilas(supabase, productosArea.map((p) => p.id as string)),
  ])

  let piezas: PiezaOperador[]

  if (usaPdf) {

    piezas = propias.map((p) => {
      const hechas = hechasMapa.get(p.id) ?? 0
      const t = trabajos.find((x) => x.pieza_id === p.id)
      return {
        id: p.id,
        tipo: 'pdf' as const,
        nombre: p.descripcion,
        modulo: p.modulo,
        material: p.material,
        medidas: p.medidas,
        notas: p.notas,
        meta: p.meta,
        hechas,
        faltan: Math.max(0, p.meta - hechas),
        trabajo: t ? trabajoDe(t, pausas) : null,
      }
    })
  } else {
    const claves = new Map<string, FilaAvance>()
    filasProducto.forEach((f) => claves.set(`${f.producto_id}|${f.area_id}`, f))
    const clavesSet = new Set(claves.keys())
    const conFilas = new Set(filasProducto.map((f) => f.producto_id))

    piezas = productosArea
      .filter((p) => esVisible(nombreArea, p.id as string, areaId, clavesSet, conFilas))
      .map((p) => {
        const id = p.id as string
        const f = claves.get(`${id}|${areaId}`)
        const meta = f?.piezas_totales ?? (p.cantidad as number | null) ?? 0
        const hechas = f?.piezas_completadas ?? 0
        const t = trabajos.find((x) => x.producto_id === id)

        return {
          id,
          tipo: 'producto' as const,
          nombre: (p.nombre as string | null) ?? 'Pieza',
          modulo: texto(p, ['modulo', 'subensamble', 'modulo_nombre']),
          material: texto(p, ['material']),
          medidas: texto(p, ['medidas', 'dimensiones']),
          notas: texto(p, ['notas', 'observaciones', 'nota']),
          meta,
          hechas,
          faltan: Math.max(0, meta - hechas),
          trabajo: t ? trabajoDe(t, pausas) : null,
        }
      })
  }

  const pausaArea = pausas.find((p) => p.fin === null && TIPOS_PAUSA_AREA.includes(p.tipo))

  return {
    vista: {
      areaNombre: nombreArea,
      usaPdf,
      piezas,
      pausa: pausaArea ? { tipo: pausaArea.tipo, motivo: pausaArea.motivo } : null,
      cerrada: Boolean(cierreRes.data),
      ahora: ahoraISO(),
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Clave de area (teclado)                                            */
/* ------------------------------------------------------------------ */

// Con areaId: el operador tocó un área y escribe SU clave (los fallos cuentan solo en esa área).
// Sin areaId: botón "Entrar a mi área", la clave sola dice cuál es el área.
export async function entrarConClave(
  clave: string,
  areaId?: string
): Promise<{ error?: string; areaId?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()
  if (!areaId) return validarClaveGeneral(supabase, usuario, clave)

  const r = await validarClaveArea(supabase, usuario, areaId, clave)
  return r.error ? r : { areaId }
}

// Salir NO detiene ningun reloj: solo cierra el acceso de este dispositivo al area
export async function salirArea(areaId: string): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()
  await cerrarAccesoArea(supabase, usuario, areaId)

  return { success: true }
}

/* ------------------------------------------------------------------ */
/*  Iniciar / Finalizar una pieza                                      */
/* ------------------------------------------------------------------ */

export async function iniciarPieza(
  proyectoId: string,
  areaId: string,
  id: string,
  tipo: TipoPieza
): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  // Revisiones al mismo tiempo: acceso, área cerrada, la pieza, lo hecho y si ya está en curso
  const [acceso, cierreRes, piezaRes, hechasMapa, enCursoRes] = await Promise.all([
    tieneAccesoArea(supabase, usuario, areaId),
    supabase.from('area_cierres').select('id').eq('proyecto_id', proyectoId).eq('area_id', areaId).maybeSingle(),
    tipo === 'pdf'
      ? supabase.from('piezas_proyecto').select('id, meta').eq('id', id).eq('proyecto_id', proyectoId).eq('area_id', areaId).maybeSingle()
      : Promise.resolve({ data: null }),
    tipo === 'pdf' ? hechasPdf(supabase, [id]) : Promise.resolve(new Map<string, number>()),
    tipo === 'pdf'
      ? supabase.from('trabajos_pieza').select('id').eq('pieza_id', id).eq('estado', 'en_curso').maybeSingle()
      : supabase.from('trabajos_pieza').select('id').eq('producto_id', id).eq('area_id', areaId).eq('estado', 'en_curso').maybeSingle(),
  ])

  if (!acceso) return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }
  if (cierreRes.data) return { error: 'Esta área ya fue marcada como terminada en este proyecto.' }
  if (enCursoRes.data) return { error: 'Esta pieza ya está en curso.' }

  if (tipo === 'pdf') {
    const pieza = piezaRes.data as { meta: number } | null
    if (!pieza) return { error: 'No se encontró la pieza en esta área.' }

    const hechas = hechasMapa.get(id) ?? 0
    if ((pieza.meta as number) - hechas <= 0) return { error: 'Esta pieza ya está completa.' }

    const { error } = await supabase.from('trabajos_pieza').insert({
      proyecto_id: proyectoId,
      pieza_id: id,
      area_id: areaId,
      operador_id: usuario.id,
      estado: 'en_curso',
    })
    if (error) {
      console.error('Error al iniciar pieza:', error)
      return { error: `No se pudo iniciar la pieza${detalleError(error)}` }
    }
    return { success: true }
  }

  const { fila, error: errorFila } = await obtenerFila(supabase, id, areaId)
  if (errorFila || !fila) return { error: errorFila ?? 'No se encontró la pieza.' }

  const faltan = (fila.piezas_totales ?? 0) - (fila.piezas_completadas ?? 0)
  if (faltan <= 0) return { error: 'Esta pieza ya está completa.' }

  const { error } = await supabase.from('trabajos_pieza').insert({
    proyecto_id: proyectoId,
    producto_id: id,
    area_id: areaId,
    operador_id: usuario.id,
    estado: 'en_curso',
  })

  if (error) {
    console.error('Error al iniciar pieza:', error)
    return { error: `No se pudo iniciar la pieza${detalleError(error)}` }
  }
  return { success: true }
}

export async function finalizarPieza(trabajoId: string, piezas: number): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  if (!Number.isInteger(piezas) || piezas <= 0) {
    return { error: 'Escribe cuántas piezas hiciste.' }
  }

  const supabase = await createClient()

  const { data: trabajo } = await supabase
    .from('trabajos_pieza')
    .select('id, proyecto_id, producto_id, pieza_id, area_id, inicio, estado')
    .eq('id', trabajoId)
    .maybeSingle()

  if (!trabajo || trabajo.estado !== 'en_curso') {
    return { error: 'Esta pieza ya no está en curso.' }
  }

  const areaId = trabajo.area_id as string
  const proyectoId = trabajo.proyecto_id as string
  const productoId = trabajo.producto_id as string | null
  const piezaId = trabajo.pieza_id as string | null

  // Acceso, meta, lo ya hecho y las pausas abiertas: al mismo tiempo
  const [acceso, piezaRes, hechasMapa, pausasTrabajo] = await Promise.all([
    tieneAccesoArea(supabase, usuario, areaId),
    piezaId
      ? supabase.from('piezas_proyecto').select('meta').eq('id', piezaId).maybeSingle()
      : Promise.resolve({ data: null }),
    piezaId ? hechasPdf(supabase, [piezaId]) : Promise.resolve(new Map<string, number>()),
    pausasDe(supabase, [trabajoId]),
  ])

  if (!acceso) return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }

  // ---- cuanto falta ----
  let meta = 0
  let previas = 0
  let filaId: string | null = null

  if (piezaId) {
    meta = ((piezaRes.data as { meta: number } | null)?.meta as number | null) ?? 0
    previas = hechasMapa.get(piezaId) ?? 0
  } else if (productoId) {
    const { fila, error: errorFila } = await obtenerFila(supabase, productoId, areaId)
    if (errorFila || !fila) return { error: errorFila ?? 'No se encontró el avance.' }
    meta = fila.piezas_totales ?? 0
    previas = fila.piezas_completadas ?? 0
    filaId = fila.id
  } else {
    return { error: 'Este registro no tiene pieza asignada.' }
  }

  if (meta > 0 && piezas > meta - previas) {
    return { error: `Solo faltan ${Math.max(0, meta - previas)} piezas.` }
  }

  // cierra cualquier pausa abierta para que cuente el tiempo perdido
  const abiertas = pausasTrabajo.filter((p) => p.fin === null)
  if (abiertas.length > 0) await cerrarPausas(supabase, abiertas)

  const ahora = ahoraISO()

  const { error: errorTrabajo } = await supabase
    .from('trabajos_pieza')
    .update({ fin: ahora, piezas_hechas: piezas, estado: 'finalizado' })
    .eq('id', trabajoId)

  if (errorTrabajo) {
    console.error('Error al cerrar trabajo:', errorTrabajo)
    return { error: `No se pudo guardar. Intenta de nuevo${detalleError(errorTrabajo)}` }
  }

  // Piezas del PDF: el avance sale de sumar los trabajos. El % del proyecto y lo que ve el admin
  // se recalculan DESPUÉS de responder: el operador no espera (el admin lo recibe en vivo)
  if (piezaId) {
    after(async () => {
      await actualizarProgresoPdf(supabase, proyectoId, areaId)
      await registrarEnAdmin(supabase, {
        proyectoId,
        areaId,
        piezaId,
        piezas,
        inicio: trabajo.inicio as string,
        fin: ahora,
        operadorId: usuario.id,
      })
    })
    return { success: true }
  }

  // Productos de siempre: se actualiza el avance que ve el administrador
  const nuevas = previas + piezas
  const porcentaje = meta > 0 ? Math.min(100, Math.round((nuevas / meta) * 100)) : 0

  const { error: errorUpdate } = await supabase
    .from('producto_area_avance')
    .update({ piezas_completadas: nuevas, porcentaje, completado: porcentaje >= 100 })
    .eq('id', filaId as string)

  if (errorUpdate) {
    console.error('Error actualizando avance:', errorUpdate)
    return { error: 'Se guardó el tiempo, pero no se pudo actualizar el avance.' }
  }

  // Historial que ve el admin (tabla avances) y % del proyecto: después de responder
  after(async () => {
    const { error: errorAvance } = await supabase.from('avances').insert({
      proyecto_id: proyectoId,
      area_id: areaId,
      producto_id: productoId,
      operador_id: usuario.id,
      estado: 'terminado',
      iniciado_at: trabajo.inicio,
      terminado_at: ahora,
      piezas,
      porcentaje,
      operacion: '',
      actividad: '',
    })
    if (errorAvance) console.error('No se pudo escribir en avances:', errorAvance)
    await recalcularProgreso(supabase, proyectoId)
  })

  return { success: true }
}

/* ------------------------------------------------------------------ */
/*  Corregir las piezas registradas (error al capturar la cantidad)     */
/* ------------------------------------------------------------------ */

/** Suma `delta` (positivo o negativo) a las filas más recientes, sin dejar ninguna en negativo */
function repartirAjuste(filas: { id: string; piezas: number }[], delta: number) {
  const cambios: { id: string; piezas: number }[] = []
  if (delta > 0 && filas.length > 0) {
    cambios.push({ id: filas[0].id, piezas: filas[0].piezas + delta })
  } else if (delta < 0) {
    let quitar = -delta
    for (const f of filas) {
      if (quitar <= 0) break
      const menos = Math.min(quitar, f.piezas)
      if (menos > 0) cambios.push({ id: f.id, piezas: f.piezas - menos })
      quitar -= menos
    }
  }
  return cambios
}

/**
 * El operador escribe el TOTAL correcto de piezas hechas de una pieza en su área (0 a la meta).
 * Se ajustan sus registros de reloj (para que el PDF de evidencia cuadre), el avance que ve el
 * administrador y su historial de registros. Las piezas con el reloj corriendo no se tocan.
 */
export async function corregirPieza(
  proyectoId: string,
  areaId: string,
  id: string,
  tipo: TipoPieza,
  total: number
): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }
  if (!Number.isInteger(total) || total < 0) return { error: 'Escribe cuántas piezas van en total.' }

  const supabase = await createClient()
  if (!(await tieneAccesoArea(supabase, usuario, areaId))) {
    return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }
  }

  // Lo que hay hoy (igual que lo que ve la pantalla) y la meta
  let meta = 0
  let actuales = 0
  let productoAdmin: string | null = null
  if (tipo === 'pdf') {
    const { data: pieza } = await supabase
      .from('piezas_proyecto')
      .select('meta')
      .eq('id', id)
      .eq('proyecto_id', proyectoId)
      .eq('area_id', areaId)
      .maybeSingle()
    if (!pieza) return { error: 'No se encontró la pieza en esta área.' }
    meta = (pieza.meta as number) ?? 0
    actuales = (await hechasPdf(supabase, [id])).get(id) ?? 0
    productoAdmin = await productoDePiezaDespiece(supabase, proyectoId, id)
  } else {
    const { fila, error } = await obtenerFila(supabase, id, areaId)
    if (error || !fila) return { error: error ?? 'No se encontró la pieza.' }
    meta = fila.piezas_totales ?? 0
    actuales = fila.piezas_completadas ?? 0
    productoAdmin = id
  }

  if (meta > 0 && total > meta) return { error: `La meta es de ${meta} piezas.` }
  const delta = total - actuales
  if (delta === 0) return { success: true }

  // 1. Registros de reloj terminados de esta pieza (lo que cuenta el PDF de evidencia)
  let consulta = supabase
    .from('trabajos_pieza')
    .select('id, piezas_hechas')
    .eq('estado', 'finalizado')
    .eq('area_id', areaId)
    .order('fin', { ascending: false })
  consulta = tipo === 'pdf' ? consulta.eq('pieza_id', id) : consulta.eq('producto_id', id)
  const { data: trabajos } = await consulta
  const filasTrabajo = (trabajos ?? []).map((t) => ({ id: t.id as string, piezas: (t.piezas_hechas as number | null) ?? 0 }))

  if (delta > 0 && filasTrabajo.length === 0) {
    // Nunca se registró con reloj: queda un registro sin tiempo con las piezas que faltaban
    const ahora = ahoraISO()
    const { error } = await supabase.from('trabajos_pieza').insert({
      proyecto_id: proyectoId,
      area_id: areaId,
      operador_id: usuario.id,
      estado: 'finalizado',
      inicio: ahora,
      fin: ahora,
      piezas_hechas: delta,
      ...(tipo === 'pdf' ? { pieza_id: id } : { producto_id: id }),
    })
    if (error) {
      console.error('Error al corregir piezas:', error)
      return { error: `No se pudo corregir${detalleError(error)}` }
    }
  } else {
    for (const c of repartirAjuste(filasTrabajo, delta)) {
      // Si queda en 0 ya no se registró nada: se borra para que no salga en el PDF de evidencia
      if (c.piezas === 0) await supabase.from('pausas_pieza').delete().eq('trabajo_id', c.id)
      const { error } =
        c.piezas === 0
          ? await supabase.from('trabajos_pieza').delete().eq('id', c.id)
          : await supabase.from('trabajos_pieza').update({ piezas_hechas: c.piezas }).eq('id', c.id)
      if (error) {
        console.error('Error al corregir piezas:', error)
        return { error: `No se pudo corregir${detalleError(error)}` }
      }
    }
  }

  // 3a. Proyecto por producto: el avance que ve la pantalla se corrige ya
  if (tipo !== 'pdf') {
    const porcentaje = meta > 0 ? Math.min(100, Math.round((total / meta) * 100)) : 0
    const { error } = await supabase
      .from('producto_area_avance')
      .update({ piezas_completadas: total, porcentaje, completado: porcentaje >= 100 })
      .eq('producto_id', id)
      .eq('area_id', areaId)
    if (error) {
      console.error('Error al corregir el avance:', error)
      return { error: 'Se corrigió el registro, pero no el avance del proyecto.' }
    }
  }

  // 2 y 3b. Historial del admin y % del proyecto: después de responder (el operador no espera)
  after(async () => {
  if (productoAdmin) {
    const { data: registros } = await supabase
      .from('avances')
      .select('id, piezas')
      .eq('proyecto_id', proyectoId)
      .eq('area_id', areaId)
      .eq('producto_id', productoAdmin)
      .eq('estado', 'terminado')
      .order('created_at', { ascending: false })
    const filasAvance = (registros ?? []).map((r) => ({ id: r.id as string, piezas: (r.piezas as number | null) ?? 0 }))
    for (const c of repartirAjuste(filasAvance, delta)) {
      if (c.piezas === 0) await supabase.from('avances').delete().eq('id', c.id)
      else await supabase.from('avances').update({ piezas: c.piezas }).eq('id', c.id)
    }
  }

  if (tipo === 'pdf') {
    await actualizarProgresoPdf(supabase, proyectoId, areaId)
    if (productoAdmin) await actualizarAvanceAdmin(supabase, proyectoId)
  } else {
    await recalcularProgreso(supabase, proyectoId)
  }
  })

  return { success: true }
}

/* ------------------------------------------------------------------ */
/*  Reporte de UNA pieza (avisa al admin y detiene solo esa pieza)     */
/* ------------------------------------------------------------------ */

export async function reportarPieza(
  trabajoId: string,
  motivo: string,
  nota: string,
  evidenciaUrl?: string
): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  const { data: trabajo } = await supabase
    .from('trabajos_pieza')
    .select('id, proyecto_id, producto_id, pieza_id, area_id, estado')
    .eq('id', trabajoId)
    .maybeSingle()

  if (!trabajo || trabajo.estado !== 'en_curso') {
    return { error: 'Esta pieza ya no está en curso.' }
  }

  const areaId = trabajo.area_id as string
  if (!(await tieneAccesoArea(supabase, usuario, areaId))) {
    return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }
  }

  const [prodRes, pdfRes, areaRes] = await Promise.all([
    trabajo.producto_id
      ? supabase.from('proyecto_productos').select('nombre').eq('id', trabajo.producto_id).maybeSingle()
      : Promise.resolve({ data: null }),
    trabajo.pieza_id
      ? supabase
          .from('piezas_proyecto')
          .select('descripcion, modulo')
          .eq('id', trabajo.pieza_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('areas').select('nombre').eq('id', areaId).maybeSingle(),
  ])

  // si la pieza estaba en pausa de area, esa pausa se cierra y empieza la del reporte
  const abiertas = (await pausasDe(supabase, [trabajoId])).filter((p) => p.fin === null)
  if (abiertas.some((p) => p.tipo === 'reporte_pieza')) {
    return { error: 'Esta pieza ya tiene un reporte abierto.' }
  }
  await cerrarPausas(supabase, abiertas)

  const nombrePieza =
    (pdfRes.data?.descripcion as string | undefined) ??
    (prodRes.data?.nombre as string | undefined) ??
    'Pieza'
  const modulo = (pdfRes.data?.modulo as string | null | undefined) ?? null
  const nombreArea = (areaRes.data?.nombre as string | undefined) ?? 'Área'

  const { data: retraso, error: errorRetraso } = await supabase
    .from('retrasos')
    .insert({
      proyecto_id: trabajo.proyecto_id,
      area_id: areaId,
      operador_id: usuario.id,
      motivo,
      descripcion: `Pieza "${nombrePieza}"${modulo ? ` (${modulo})` : ''} en ${nombreArea}`,
      tiempo_estimado_retraso: 0,
      comentario: nota || null,
      evidencia_url: evidenciaUrl || null,
    })
    .select('id')
    .single()

  if (errorRetraso || !retraso) {
    console.error('Error al crear reporte:', errorRetraso)
    return { error: `No se pudo enviar el reporte al administrador${detalleError(errorRetraso)}` }
  }
  // Notificación en el celular de los administradores (después de responder)
  avisarRetrasoDespues(retraso.id as string)

  const { error } = await supabase.from('pausas_pieza').insert({
    trabajo_id: trabajoId,
    tipo: 'reporte_pieza',
    motivo,
    nota: nota || null,
    retraso_id: retraso.id,
  })

  if (error) {
    console.error('Error al pausar pieza:', error)
    return { error: 'Se envió el reporte, pero no se pudo detener el reloj.' }
  }
  return { success: true }
}

export async function reanudarPieza(trabajoId: string): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()
  const abiertas = (await pausasDe(supabase, [trabajoId])).filter((p) => p.fin === null)
  await cerrarPausas(supabase, abiertas)
  return { success: true }
}

/* ------------------------------------------------------------------ */
/*  Reportes de area                                                   */
/* ------------------------------------------------------------------ */

// "Reporte del area": solo pausa los relojes, NO avisa al admin
export async function pausarArea(
  proyectoId: string,
  areaId: string,
  tipo: 'pausa_area' | 'cambio_turno',
  motivo: string
): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  if (!(await tieneAccesoArea(supabase, usuario, areaId))) {
    return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }
  }

  const { data: trabajos } = await supabase
    .from('trabajos_pieza')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .eq('area_id', areaId)
    .eq('estado', 'en_curso')

  const ids = (trabajos ?? []).map((t) => t.id as string)
  const conPausa = new Set(
    (await pausasDe(supabase, ids)).filter((p) => p.fin === null).map((p) => p.trabajo_id)
  )
  const libres = ids.filter((id) => !conPausa.has(id))

  if (libres.length > 0) {
    const { error } = await supabase
      .from('pausas_pieza')
      .insert(libres.map((id) => ({ trabajo_id: id, tipo, motivo })))
    if (error) {
      console.error('Error al pausar area:', error)
      return { error: 'No se pudo pausar el área.' }
    }
  }

  return { success: true, afectadas: libres.length }
}

export async function reanudarArea(proyectoId: string, areaId: string): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  if (!(await tieneAccesoArea(supabase, usuario, areaId))) {
    return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }
  }

  const { data: trabajos } = await supabase
    .from('trabajos_pieza')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .eq('area_id', areaId)
    .eq('estado', 'en_curso')

  const ids = (trabajos ?? []).map((t) => t.id as string)
  const deArea = (await pausasDe(supabase, ids)).filter(
    (p) => p.fin === null && TIPOS_PAUSA_AREA.includes(p.tipo)
  )
  await cerrarPausas(supabase, deArea)
  return { success: true }
}

// "Reporte al administrador" del area: llega a /admin/reportes y DETIENE los relojes
// del area hasta que el operador toque "Reanudar area" (por ejemplo, cuando regresa la luz)
export async function reportarArea(
  proyectoId: string,
  areaId: string,
  motivo: string,
  nota: string,
  evidenciaUrl?: string
): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  if (motivo === 'Otro' && !nota.trim()) {
    return { error: 'Escribe qué pasó para poder enviar el reporte.' }
  }

  const supabase = await createClient()

  if (!(await tieneAccesoArea(supabase, usuario, areaId))) {
    return { error: 'Esta área está bloqueada. Escribe tu clave para entrar.' }
  }

  const { data: area } = await supabase.from('areas').select('nombre').eq('id', areaId).maybeSingle()

  const { data: retraso, error } = await supabase
    .from('retrasos')
    .insert({
      proyecto_id: proyectoId,
      area_id: areaId,
      operador_id: usuario.id,
      motivo,
      descripcion: `Problema en ${(area?.nombre as string | undefined) ?? 'el área'}`,
      tiempo_estimado_retraso: 0,
      comentario: nota.trim() || null,
      evidencia_url: evidenciaUrl || null,
    })
    .select('id')
    .single()

  if (error || !retraso) {
    console.error('Error al reportar area:', error)
    return { error: `No se pudo enviar el reporte al administrador${detalleError(error)}` }
  }
  // Notificación en el celular de los administradores (después de responder)
  avisarRetrasoDespues(retraso.id as string)

  // detiene los relojes de las piezas en curso de esta area (las que ya estan en pausa se quedan igual)
  const { data: trabajos } = await supabase
    .from('trabajos_pieza')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .eq('area_id', areaId)
    .eq('estado', 'en_curso')

  const ids = (trabajos ?? []).map((t) => t.id as string)
  const conPausa = new Set(
    (await pausasDe(supabase, ids)).filter((p) => p.fin === null).map((p) => p.trabajo_id)
  )
  const libres = ids.filter((id) => !conPausa.has(id))

  if (libres.length > 0) {
    const { error: errorPausa } = await supabase.from('pausas_pieza').insert(
      libres.map((id) => ({
        trabajo_id: id,
        tipo: 'pausa_area',
        motivo,
        nota: nota.trim() || null,
        retraso_id: retraso.id,
      }))
    )
    if (errorPausa) {
      console.error('Error al detener relojes:', errorPausa)
      return { error: 'Se envió el reporte, pero no se pudieron detener los relojes.' }
    }
  }

  return { success: true, afectadas: libres.length }
}

async function avisarAdmins(
  supabase: Supabase,
  remitenteId: string,
  proyectoId: string | null,
  tipo: string,
  mensaje: string
) {
  const { data } = await supabase.from('usuarios').select('id, roles ( nombre )').eq('activo', true)

  const idsAdmin = (data ?? [])
    .filter((u) => {
      const rol = u.roles as unknown as { nombre: string } | { nombre: string }[] | null
      const nombreRol = Array.isArray(rol) ? rol[0]?.nombre : rol?.nombre
      return nombreRol === 'admin'
    })
    .map((u) => u.id as string)

  if (idsAdmin.length === 0) return

  const { error } = await supabase.from('notificaciones').insert(
    idsAdmin.map((adminId) => ({
      remitente_id: remitenteId,
      destinatario_id: adminId,
      proyecto_id: proyectoId,
      tipo,
      mensaje,
      leida: false,
    }))
  )
  if (error) console.error('Error al avisar a los administradores:', error)
}

// Sube la foto de evidencia de un reporte (bucket publico "evidencias")
export async function subirEvidenciaReporte(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const foto = formData.get('foto')
  if (!(foto instanceof Blob) || foto.size === 0) return { error: 'No se recibió la foto.' }
  if (foto.size > 4 * 1024 * 1024) return { error: 'La foto es muy pesada. Toma otra.' }

  const supabase = await createClient()
  const ruta = `reportes/${usuario.id}/${Date.now()}.jpg`
  const bytes = new Uint8Array(await foto.arrayBuffer())

  const { error } = await supabase.storage
    .from('evidencias')
    .upload(ruta, bytes, { contentType: 'image/jpeg', upsert: false })

  if (error) {
    console.error('Error al subir foto:', error)
    return { error: `No se pudo subir la foto (${error.message}). Revisa que exista el almacén "evidencias".` }
  }

  const { data } = supabase.storage.from('evidencias').getPublicUrl(ruta)
  return { url: data.publicUrl }
}

/* ------------------------------------------------------------------ */
/*  Evidencia diaria (para el PDF)                                     */
/* ------------------------------------------------------------------ */

export async function getEvidenciaDia(
  proyectoId: string | null,
  fecha: string
): Promise<{ data?: EvidenciaDia; error?: string }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha no válida.' }

  const supabase = await createClient()

  // Mexico no usa horario de verano: siempre UTC-6
  const desde = new Date(`${fecha}T00:00:00-06:00`)
  const hasta = new Date(desde.getTime() + 24 * 3600000)

  let consulta = supabase
    .from('trabajos_pieza')
    .select('id, proyecto_id, producto_id, pieza_id, area_id, operador_id, inicio, fin, piezas_hechas')
    .eq('estado', 'finalizado')
    .gt('piezas_hechas', 0)
    .gte('fin', desde.toISOString())
    .lt('fin', hasta.toISOString())
    .order('fin')

  if (proyectoId) consulta = consulta.eq('proyecto_id', proyectoId)

  const { data: trabajos, error } = await consulta
  if (error) {
    console.error('Error al traer evidencia:', error)
    return { error: 'No se pudo cargar el historial del día.' }
  }

  const lista = (trabajos ?? []) as {
    id: string
    proyecto_id: string
    producto_id: string | null
    pieza_id: string | null
    area_id: string
    operador_id: string
    inicio: string
    fin: string
    piezas_hechas: number
  }[]

  const unicos = (campo: 'proyecto_id' | 'producto_id' | 'pieza_id' | 'area_id' | 'operador_id') =>
    Array.from(new Set(lista.map((t) => t[campo]).filter((v): v is string => Boolean(v))))

  const vacio = Promise.resolve({ data: [] as Record<string, unknown>[] })

  const [proyRes, prodRes, pdfRes, areaRes, usuRes, pausas] = await Promise.all([
    unicos('proyecto_id').length
      ? supabase.from('proyectos').select('id, nombre').in('id', unicos('proyecto_id'))
      : vacio,
    unicos('producto_id').length
      ? supabase.from('proyecto_productos').select('id, nombre').in('id', unicos('producto_id'))
      : vacio,
    unicos('pieza_id').length
      ? supabase
          .from('piezas_proyecto')
          .select('id, descripcion, modulo')
          .in('id', unicos('pieza_id'))
      : vacio,
    unicos('area_id').length
      ? supabase.from('areas').select('id, nombre').in('id', unicos('area_id'))
      : vacio,
    unicos('operador_id').length
      ? supabase.from('usuarios').select('id, nombre, apellidos').in('id', unicos('operador_id'))
      : vacio,
    pausasDe(
      supabase,
      lista.map((t) => t.id)
    ),
  ])

  const nombres = (rows: Record<string, unknown>[] | null, campo: string) =>
    new Map((rows ?? []).map((r) => [r.id as string, (r[campo] as string | null) ?? '']))

  const proyectos = nombres(proyRes.data as Record<string, unknown>[] | null, 'nombre')
  const productos = nombres(prodRes.data as Record<string, unknown>[] | null, 'nombre')
  const areas = nombres(areaRes.data as Record<string, unknown>[] | null, 'nombre')
  const piezasPdf = new Map(
    ((pdfRes.data ?? []) as Record<string, unknown>[]).map((r) => [
      r.id as string,
      `${r.descripcion as string}${r.modulo ? ` (${r.modulo as string})` : ''}`,
    ])
  )
  const operadores = new Map(
    ((usuRes.data ?? []) as Record<string, unknown>[]).map((u) => [
      u.id as string,
      `${u.nombre as string} ${(u.apellidos as string | null) ?? ''}`.trim(),
    ])
  )

  const filas: EvidenciaFila[] = lista.map((t) => {
    const propias = pausas.filter((p) => p.trabajo_id === t.id)
    const dur = (p: PausaFila) =>
      Math.max(0, Math.round(((p.fin ? ms(p.fin) : ms(t.fin)) - ms(p.inicio)) / 1000))

    const esReporte = (p: PausaFila) => p.tipo === 'reporte_pieza' || Boolean(p.retraso_id)
    const reportes = propias
      .filter(esReporte)
      .map((p) => ({ motivo: p.motivo, seg: dur(p) }))
    const pausasArea = propias
      .filter((p) => !esReporte(p))
      .map((p) => ({ motivo: p.motivo, seg: dur(p) }))

    const segTotal = Math.max(0, Math.round((ms(t.fin) - ms(t.inicio)) / 1000))
    const segReporte = reportes.reduce((s, r) => s + r.seg, 0)
    const segPausa = pausasArea.reduce((s, r) => s + r.seg, 0)

    return {
      trabajoId: t.id,
      proyecto: proyectos.get(t.proyecto_id) || 'Proyecto',
      area: areas.get(t.area_id) || 'Área',
      pieza:
        (t.pieza_id ? piezasPdf.get(t.pieza_id) : undefined) ||
        (t.producto_id ? productos.get(t.producto_id) : undefined) ||
        'Pieza',
      operador: operadores.get(t.operador_id) || 'Operador',
      inicio: t.inicio,
      fin: t.fin,
      piezas: t.piezas_hechas,
      segTotal,
      segPausa,
      segReporte,
      segTrabajado: Math.max(0, segTotal - segPausa - segReporte),
      reportes,
      pausas: pausasArea,
    }
  })

  // ---- resumen de TODAS las areas (aunque hoy no hayan hecho nada) ----
  const detalle = proyectoId ? await getProyectoOperador(proyectoId) : null
  const resumenAreas: ResumenAreaDia[] = (detalle?.areas ?? []).map((a) => ({
    area: a.nombre,
    piezasMeta: a.meta,
    piezasHechas: a.hechas,
    porcentaje: a.porcentaje,
    enCurso: a.enCurso,
    pausa: a.pausa?.motivo ?? null,
  }))

  // ---- reportes al administrador del dia ----
  let consultaRetrasos = supabase
    .from('retrasos')
    .select(
      'id, proyecto_id, area_id, operador_id, motivo, comentario, tiempo_estimado_retraso, evidencia_url, created_at'
    )
    .gte('created_at', desde.toISOString())
    .lt('created_at', hasta.toISOString())
    .order('created_at')
  if (proyectoId) consultaRetrasos = consultaRetrasos.eq('proyecto_id', proyectoId)
  const { data: retrasos } = await consultaRetrasos

  const filasRetraso = (retrasos ?? []) as {
    area_id: string | null
    operador_id: string | null
    motivo: string
    comentario: string | null
    tiempo_estimado_retraso: number | null
    evidencia_url: string | null
    created_at: string
  }[]

  const idsAreaR = Array.from(new Set(filasRetraso.map((r) => r.area_id).filter((v): v is string => Boolean(v))))
  const idsOpR = Array.from(new Set(filasRetraso.map((r) => r.operador_id).filter((v): v is string => Boolean(v))))
  const [areasR, opsR] = await Promise.all([
    idsAreaR.length ? supabase.from('areas').select('id, nombre').in('id', idsAreaR) : vacio,
    idsOpR.length ? supabase.from('usuarios').select('id, nombre, apellidos').in('id', idsOpR) : vacio,
  ])
  const nombreAreaR = nombres(areasR.data as Record<string, unknown>[] | null, 'nombre')
  const nombreOpR = new Map(
    ((opsR.data ?? []) as Record<string, unknown>[]).map((u) => [
      u.id as string,
      `${u.nombre as string} ${(u.apellidos as string | null) ?? ''}`.trim(),
    ])
  )

  const reportes: ReporteDia[] = filasRetraso.map((r) => ({
    hora: r.created_at,
    area: (r.area_id && nombreAreaR.get(r.area_id)) || 'Área',
    operador: (r.operador_id && nombreOpR.get(r.operador_id)) || 'Operador',
    motivo: r.motivo,
    nota: r.comentario,
    horasPerdidas: Number(r.tiempo_estimado_retraso ?? 0),
    fotoUrl: r.evidencia_url,
  }))

  return {
    data: {
      fecha,
      proyecto: proyectoId ? (proyectos.get(proyectoId) ?? detalle?.nombre ?? null) : null,
      codigo: detalle?.codigo ?? null,
      filas,
      areas: resumenAreas,
      reportes,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Historial de evidencias (PDF guardado + aviso al administrador)    */
/* ------------------------------------------------------------------ */

// El PDF lo sube el navegador directo a Storage (las acciones de servidor solo aceptan 1 MB
// y el PDF del día suele pesar más). Aquí solo se revisa que el archivo exista en la carpeta
// de ese proyecto y se registra en el historial.
export async function guardarEvidenciaDia(
  proyectoId: string,
  fecha: string,
  ruta: string
): Promise<{ url?: string; error?: string; avisados?: boolean }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha no válida.' }

  const carpeta = `evidencia-dia/${proyectoId}`
  const archivo = ruta.slice(carpeta.length + 1)
  if (!ruta.startsWith(`${carpeta}/`) || !new RegExp(`^${fecha}-\\d+\\.pdf$`).test(archivo)) {
    return { error: 'Ruta del PDF no válida.' }
  }

  const supabase = await createClient()

  const { data: encontrados, error: errorLista } = await supabase.storage
    .from('evidencias')
    .list(carpeta, { search: archivo, limit: 1 })
  if (errorLista || !encontrados?.some((f) => f.name === archivo)) {
    console.error('No se encontró el PDF subido:', errorLista)
    return { error: 'No se encontró el PDF en el almacén. Intenta de nuevo.' }
  }

  const { data: publico } = supabase.storage.from('evidencias').getPublicUrl(ruta)
  const url = publico.publicUrl

  const { error: errorTabla } = await supabase.from('evidencias_dia').insert({
    proyecto_id: proyectoId,
    fecha,
    pdf_url: url,
    creado_por: usuario.id,
  })
  if (errorTabla) {
    console.error('Error al guardar historial:', errorTabla)
    return { error: `Se subió el PDF, pero no se pudo guardar en el historial${detalleError(errorTabla)}` }
  }

  const { data: proyecto } = await supabase
    .from('proyectos')
    .select('nombre')
    .eq('id', proyectoId)
    .maybeSingle()

  await avisarAdmins(
    supabase,
    usuario.id,
    proyectoId,
    'evidencia_dia',
    `${usuario.nombre ?? usuario.correo} envió la evidencia del ${fecha} de ${
      (proyecto?.nombre as string | undefined) ?? 'un proyecto'
    }: ${url}`
  )

  return { url, avisados: true }
}

export async function listarEvidencias(proyectoId: string): Promise<EvidenciaGuardada[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('evidencias_dia')
    .select('id, fecha, pdf_url, created_at, creado_por')
    .eq('proyecto_id', proyectoId)
    .order('created_at', { ascending: false })
    .limit(15)

  const filas = (data ?? []) as {
    id: string
    fecha: string
    pdf_url: string
    created_at: string
    creado_por: string | null
  }[]

  const ids = Array.from(new Set(filas.map((f) => f.creado_por).filter((v): v is string => Boolean(v))))
  const { data: usuarios } = ids.length
    ? await supabase.from('usuarios').select('id, nombre, apellidos').in('id', ids)
    : { data: [] as Record<string, unknown>[] }
  const quien = new Map(
    ((usuarios ?? []) as Record<string, unknown>[]).map((u) => [
      u.id as string,
      `${u.nombre as string} ${(u.apellidos as string | null) ?? ''}`.trim(),
    ])
  )

  return filas.map((f) => ({
    id: f.id,
    fecha: f.fecha,
    pdfUrl: f.pdf_url,
    creadoEn: f.created_at,
    creadoPor: (f.creado_por && quien.get(f.creado_por)) || 'Operador',
  }))
}