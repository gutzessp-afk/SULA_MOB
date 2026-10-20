/**
 * /api/proyectos/[id]/seguimiento/route.ts
 * ────────────────────────────────────────
 * Seguimiento de un proyecto para su página de detalle:
 *   - avance por área (piezas hechas y totales)
 *   - línea de tiempo: alta del proyecto, avances registrados, áreas terminadas y retrasos
 *   - incidencias reportadas por los operadores
 *
 * GET /api/proyectos/{id}/seguimiento → JSON
 *
 * RUTA DEL ARCHIVO: src/app/api/proyectos/[id]/seguimiento/route.ts
 */

import { NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { estadoEntrega, fechaEntrega } from '@/lib/entregas'

const MAX_EVENTOS = 40
const MAX_AVANCES = 300

interface AvanceArea {
  area_id: string
  porcentaje: number | null
  completado: boolean | null
  piezas_completadas: number | null
  piezas_totales: number | null
}

export type TipoEvento = 'creacion' | 'avance' | 'completado' | 'incidencia'

export interface Seguimiento {
  proyecto: { progreso: number; estado: string; entrega: string; creado: string }
  areas: { id: string; nombre: string; hechas: number; totales: number; pct: number }[]
  /** titulo = área (o "Proyecto creado"), texto = quién hizo qué, detalle = producto */
  eventos: { id: string; fecha: string; tipo: TipoEvento; titulo: string; texto: string; detalle?: string }[]
  incidencias: { id: string; fecha: string; area: string; motivo: string; descripcion: string; horas: number | null; operador: string }[]
}

function relacion<T>(valor: T | T[] | null | undefined): T | null {
  return Array.isArray(valor) ? valor[0] ?? null : valor ?? null
}

/** Porcentaje (0 a 100) de un producto en un área: por piezas si las tiene, si no el que está guardado */
function porcentajeDe(f: AvanceArea): number {
  if (f.piezas_totales && f.piezas_totales > 0) {
    return Math.min(100, Math.round(((f.piezas_completadas || 0) / f.piezas_totales) * 100))
  }
  return f.porcentaje || (f.completado ? 100 : 0)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden ver el seguimiento.' }, { status: 403 })
  }
  const { id } = await params
  const supabase = supabaseServidor()

  // Todo en un solo viaje a la base: las consultas no dependen unas de otras
  // (los nombres de los operadores vienen dentro de avances y retrasos)
  const [proyectoRes, areasRes, avanceRes, avancesRes, retrasosRes] = await Promise.all([
    supabase
      .from('proyectos')
      .select('id, nombre, descripcion, progreso, fecha_maxima, created_at, estados:estado_id ( nombre )')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('areas').select('id, nombre').eq('activo', true).order('orden', { ascending: true }),
    supabase
      .from('producto_area_avance')
      .select('area_id, porcentaje, completado, piezas_completadas, piezas_totales, proyecto_productos!inner ( proyecto_id )')
      .eq('proyecto_productos.proyecto_id', id),
    supabase
      .from('avances')
      .select('id, area_id, piezas, operador_id, created_at, areas ( nombre ), proyecto_productos ( nombre ), usuarios ( nombre, apellidos )')
      .eq('proyecto_id', id)
      .order('created_at', { ascending: false })
      .limit(MAX_AVANCES),
    supabase
      .from('retrasos')
      .select('id, motivo, descripcion, tiempo_estimado_retraso, operador_id, created_at, areas ( nombre ), usuarios ( nombre, apellidos )')
      .eq('proyecto_id', id)
      .order('created_at', { ascending: false }),
  ])
  const proyecto = proyectoRes.data
  if (proyectoRes.error) return NextResponse.json({ error: 'No se pudo leer el proyecto.' }, { status: 500 })
  if (!proyecto) return NextResponse.json({ error: 'No se encontró el proyecto.' }, { status: 404 })
  const fallo = areasRes.error || avanceRes.error || avancesRes.error || retrasosRes.error
  if (fallo) {
    console.error('[seguimiento] Error:', fallo)
    return NextResponse.json({ error: 'No se pudo leer el seguimiento del proyecto.' }, { status: 500 })
  }

  // Nombre del operador que viene en la misma fila (relación operador_id → usuarios)
  const operador = (usuarios: unknown) => {
    const u = relacion(usuarios as { nombre: string | null; apellidos: string | null } | { nombre: string | null; apellidos: string | null }[] | null)
    return (u && `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim()) || 'Operador'
  }

  const filasAvance = (avanceRes.data ?? []) as unknown as AvanceArea[]
  const eventos: Seguimiento['eventos'] = []

  const areas = (areasRes.data ?? [])
    .map((area) => {
      const filas = filasAvance.filter((f) => f.area_id === area.id)
      if (!filas.length) return null
      const pcts = filas.map(porcentajeDe)
      const pct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
      // Topadas al total de cada producto: a veces se capturan piezas de más
      const hechas = filas.reduce((suma, f) => suma + Math.min(f.piezas_completadas || 0, f.piezas_totales || f.piezas_completadas || 0), 0)
      const totales = filas.reduce((suma, f) => suma + (f.piezas_totales || 0), 0)

      // El área terminó cuando se registró su último avance (vienen del más reciente al más viejo)
      const terminada = pcts.every((p) => p >= 100)
      const ultima = (avancesRes.data ?? []).find((a) => a.area_id === area.id)?.created_at as string | undefined
      if (terminada && ultima) {
        eventos.push({
          id: `completado-${area.id}`,
          fecha: ultima,
          tipo: 'completado',
          titulo: area.nombre as string,
          texto: `Terminó todas sus piezas${totales ? ` (${totales})` : ''}`,
        })
      }
      return { id: area.id as string, nombre: area.nombre as string, hechas, totales, pct }
    })
    .filter((a) => a !== null)

  for (const a of avancesRes.data ?? []) {
    const area = relacion(a.areas as { nombre: string } | { nombre: string }[] | null)?.nombre || 'Área sin nombre'
    const producto = relacion(a.proyecto_productos as { nombre: string } | { nombre: string }[] | null)?.nombre
    eventos.push({
      id: `avance-${a.id}`,
      fecha: a.created_at as string,
      tipo: 'avance',
      titulo: area,
      texto: `${operador(a.usuarios)} registró ${a.piezas ?? 0} pza${a.piezas === 1 ? '' : 's'}`,
      detalle: producto || undefined,
    })
  }

  const incidencias = (retrasosRes.data ?? []).map((r) => ({
    id: r.id as string,
    fecha: r.created_at as string,
    area: relacion(r.areas as { nombre: string } | { nombre: string }[] | null)?.nombre || 'Sin área',
    motivo: (r.motivo as string | null) || 'Sin motivo',
    descripcion: (r.descripcion as string | null) || '',
    horas: r.tiempo_estimado_retraso as number | null,
    operador: operador(r.usuarios),
  }))
  for (const i of incidencias) {
    eventos.push({ id: `incidencia-${i.id}`, fecha: i.fecha, tipo: 'incidencia', titulo: i.area, texto: `${i.operador} reportó un retraso: ${i.motivo}` })
  }

  eventos.push({ id: 'creacion', fecha: proyecto.created_at as string, tipo: 'creacion', titulo: 'Proyecto creado', texto: proyecto.nombre as string })
  eventos.sort((a, b) => b.fecha.localeCompare(a.fecha))

  const progreso = Number(proyecto.progreso) || 0
  const entrega = fechaEntrega(proyecto)
  const estadoGuardado = relacion(proyecto.estados as { nombre: string } | { nombre: string }[] | null)?.nombre || ''

  const respuesta: Seguimiento = {
    proyecto: { progreso, estado: estadoEntrega(progreso, entrega, estadoGuardado), entrega, creado: proyecto.created_at as string },
    areas,
    eventos: eventos.slice(0, MAX_EVENTOS),
    incidencias,
  }
  return NextResponse.json(respuesta, { headers: { 'Cache-Control': 'no-store' } })
}
