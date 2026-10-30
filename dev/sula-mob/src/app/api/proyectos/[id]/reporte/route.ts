/**
 * /api/proyectos/[id]/reporte/route.ts
 * ────────────────────────────────────
 * Reporte del ciclo de vida de un proyecto (pensado para cuando llega al 100%):
 *   - datos generales: alta, fecha de fin, duración total y cómo quedó contra la entrega
 *   - por área: cuándo empezó y terminó, horas trabajadas, piezas y quién las hizo
 *   - operadores: piezas y horas de cada uno en todo el proyecto
 *   - retrasos reportados por los operadores
 *
 * GET /api/proyectos/{id}/reporte → JSON (solo administradores)
 *
 * RUTA DEL ARCHIVO: src/app/api/proyectos/[id]/reporte/route.ts
 */

import { NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { diasEntre, fechaEntrega, ZONA_HORARIA } from '@/lib/entregas'

const PAGINA = 1000

export interface ReporteProyecto {
  proyecto: {
    codigo: string
    nombre: string
    cliente: string
    progreso: number
    creado: string
    /** Cuándo llegó al 100% (null si todavía no) */
    fin: string | null
    entrega: string
    /** Días de anticipación (+) o de atraso (−) contra la entrega; null sin entrega o sin terminar */
    diasVsEntrega: number | null
    duracionMs: number
  }
  areas: {
    nombre: string
    pct: number
    hechas: number
    totales: number
    inicio: string | null
    fin: string | null
    horasTrabajadas: number
    operadores: { nombre: string; piezas: number }[]
  }[]
  operadores: { nombre: string; piezas: number; horas: number; registros: number }[]
  retrasos: { fecha: string; area: string; operador: string; motivo: string; horas: number | null }[]
  totales: { piezas: number; horasTrabajadas: number; registros: number; horasRetraso: number }
  generado: string
}

interface FilaAvance {
  area_id: string
  piezas: number | null
  estado: string | null
  iniciado_at: string | null
  terminado_at: string | null
  created_at: string
  usuarios: unknown
}

function relacion<T>(valor: T | T[] | null | undefined): T | null {
  return Array.isArray(valor) ? valor[0] ?? null : valor ?? null
}

function nombreOperador(usuarios: unknown) {
  const u = relacion(usuarios as { nombre: string | null; apellidos: string | null } | null)
  return (u && `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim()) || 'Operador'
}

/** Horas entre el inicio y el fin de un registro terminado (0 si le falta alguno) */
function horasDe(a: FilaAvance): number {
  if (a.estado !== 'terminado' || !a.iniciado_at || !a.terminado_at) return 0
  return Math.max(0, Date.parse(a.terminado_at) - Date.parse(a.iniciado_at)) / 3_600_000
}

const redondear = (n: number) => Math.round(n * 10) / 10
const diaMexico = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden ver el reporte.' }, { status: 403 })
  }
  const { id } = await params
  const supabase = supabaseServidor()

  // Todos los avances del proyecto, de mil en mil (Supabase no regresa más de mil filas por consulta)
  const leerAvances = async () => {
    const filas: FilaAvance[] = []
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from('avances')
        .select('area_id, piezas, estado, iniciado_at, terminado_at, created_at, usuarios ( nombre, apellidos )')
        .eq('proyecto_id', id)
        .order('created_at', { ascending: true })
        .range(desde, desde + PAGINA - 1)
      if (error) throw error
      filas.push(...((data ?? []) as FilaAvance[]))
      if (!data || data.length < PAGINA) return filas
    }
  }

  const [proyectoRes, areasRes, avanceRes, retrasosRes, avancesRes] = await Promise.all([
    supabase
      .from('proyectos')
      .select('codigo, nombre, cliente, referencia_sucursal, descripcion, progreso, fecha_maxima, fecha_real_fin, created_at')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('areas').select('id, nombre').eq('activo', true).order('orden', { ascending: true }),
    supabase
      .from('producto_area_avance')
      .select('area_id, porcentaje, completado, piezas_completadas, piezas_totales, proyecto_productos!inner ( proyecto_id )')
      .eq('proyecto_productos.proyecto_id', id),
    supabase
      .from('retrasos')
      .select('motivo, tiempo_estimado_retraso, created_at, areas ( nombre ), usuarios ( nombre, apellidos )')
      .eq('proyecto_id', id)
      .order('created_at', { ascending: true }),
    leerAvances().then((data) => ({ data, error: null }), (error) => ({ data: [] as FilaAvance[], error })),
  ])
  const proyecto = proyectoRes.data
  if (proyectoRes.error) return NextResponse.json({ error: 'No se pudo leer el proyecto.' }, { status: 500 })
  if (!proyecto) return NextResponse.json({ error: 'No se encontró el proyecto.' }, { status: 404 })
  const fallo = areasRes.error || avanceRes.error || retrasosRes.error || avancesRes.error
  if (fallo) {
    console.error('[reporte] Error:', fallo)
    return NextResponse.json({ error: 'No se pudo leer el historial del proyecto.' }, { status: 500 })
  }

  const avances = avancesRes.data
  const filasArea = (avanceRes.data ?? []) as { area_id: string; porcentaje: number | null; completado: boolean | null; piezas_completadas: number | null; piezas_totales: number | null }[]

  // ── Por área ──
  const areas: ReporteProyecto['areas'] = []
  for (const area of areasRes.data ?? []) {
    const filas = filasArea.filter((f) => f.area_id === area.id)
    const propios = avances.filter((a) => a.area_id === area.id)
    if (!filas.length && !propios.length) continue

    const pcts = filas.map((f) =>
      f.piezas_totales && f.piezas_totales > 0
        ? Math.min(100, Math.round(((f.piezas_completadas || 0) / f.piezas_totales) * 100))
        : f.porcentaje || (f.completado ? 100 : 0),
    )
    const pct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0
    const porOperador = new Map<string, number>()
    for (const a of propios) {
      const nombre = nombreOperador(a.usuarios)
      porOperador.set(nombre, (porOperador.get(nombre) ?? 0) + (a.piezas ?? 0))
    }
    const inicios = propios.map((a) => a.iniciado_at || a.created_at).sort()
    const fines = propios.map((a) => a.terminado_at).filter((f): f is string => !!f).sort()

    areas.push({
      nombre: area.nombre as string,
      pct,
      hechas: filas.reduce((s, f) => s + Math.min(f.piezas_completadas || 0, f.piezas_totales || f.piezas_completadas || 0), 0),
      totales: filas.reduce((s, f) => s + (f.piezas_totales || 0), 0),
      inicio: inicios[0] ?? null,
      fin: pct >= 100 ? fines.at(-1) ?? null : null,
      horasTrabajadas: redondear(propios.reduce((s, a) => s + horasDe(a), 0)),
      operadores: [...porOperador].map(([nombre, piezas]) => ({ nombre, piezas })).sort((a, b) => b.piezas - a.piezas),
    })
  }

  // ── Por operador, en todo el proyecto ──
  const operadores = new Map<string, ReporteProyecto['operadores'][number]>()
  for (const a of avances) {
    const nombre = nombreOperador(a.usuarios)
    const o = operadores.get(nombre) ?? { nombre, piezas: 0, horas: 0, registros: 0 }
    o.piezas += a.piezas ?? 0
    o.horas += horasDe(a)
    o.registros++
    operadores.set(nombre, o)
  }

  const retrasos = (retrasosRes.data ?? []).map((r) => ({
    fecha: r.created_at as string,
    area: relacion(r.areas as { nombre: string } | { nombre: string }[] | null)?.nombre || 'Sin área',
    operador: nombreOperador(r.usuarios),
    motivo: (r.motivo as string | null) || 'Sin motivo',
    horas: r.tiempo_estimado_retraso as number | null,
  }))

  const creado = proyecto.created_at as string
  const fin = (proyecto.fecha_real_fin as string | null) || null
  const entrega = fechaEntrega(proyecto)

  const reporte: ReporteProyecto = {
    proyecto: {
      codigo: (proyecto.codigo as string | null) || '',
      nombre: proyecto.nombre as string,
      cliente: (proyecto.referencia_sucursal as string | null) || (proyecto.cliente as string | null) || '',
      progreso: Number(proyecto.progreso) || 0,
      creado,
      fin,
      entrega,
      diasVsEntrega: fin && entrega ? diasEntre(diaMexico(fin), entrega) : null,
      duracionMs: Math.max(0, (fin ? Date.parse(fin) : Date.now()) - Date.parse(creado)),
    },
    areas,
    operadores: [...operadores.values()].map((o) => ({ ...o, horas: redondear(o.horas) })).sort((a, b) => b.piezas - a.piezas),
    retrasos,
    totales: {
      piezas: avances.reduce((s, a) => s + (a.piezas ?? 0), 0),
      horasTrabajadas: redondear(avances.reduce((s, a) => s + horasDe(a), 0)),
      registros: avances.length,
      horasRetraso: redondear(retrasos.reduce((s, r) => s + (r.horas ?? 0), 0)),
    },
    generado: new Date().toISOString(),
  }
  return NextResponse.json(reporte, { headers: { 'Cache-Control': 'no-store' } })
}
