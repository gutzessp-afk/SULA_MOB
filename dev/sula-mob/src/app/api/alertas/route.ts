/**
 * /api/alertas/route.ts
 * ─────────────────────
 * Calcula las alertas de producción en el momento (no se guardan en la base):
 *   - crítica:     proyecto con la fecha de entrega vencida y sin terminar
 *   - advertencia: proyecto que se entrega hoy o en los próximos 2 días
 *   - avance:      proyecto con 90% o más de avance
 *   - advertencia: proyecto urgente con menos de 30% de avance
 *   - info:        proyecto terminado en los últimos 7 días
 *   - info:        área que terminó hoy todas sus piezas de un proyecto
 *   - advertencia: área con piezas pendientes en proyectos activos y sin avances en 24 horas
 *
 * GET /api/alertas → { alertas, resumen }
 *
 * RUTA DEL ARCHIVO: src/app/api/alertas/route.ts
 */

import { NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { diasEntre, estadoEntrega, fechaEntrega, fechaHoy, fechaLegible } from '@/lib/entregas'

const DIAS_POR_VENCER = 2
const AVANCE_CASI_LISTO = 90
const AVANCE_EN_RIESGO = 30
const DIAS_TERMINADO_RECIENTE = 7

export type TipoAlerta = 'critica' | 'advertencia' | 'avance' | 'info'

export interface Alerta {
  id: string
  tipo: TipoAlerta
  titulo: string
  descripcion: string
  proyecto_id: string
  /** Código del pedido al que se refiere (vacío si la alerta abarca varios) */
  codigo: string
}

interface AvanceFila {
  area_id: string
  porcentaje: number | null
  completado: boolean | null
  piezas_completadas: number | null
  piezas_totales: number | null
  proyecto_productos: { proyecto_id: string } | { proyecto_id: string }[] | null
}

const ORDEN: Record<TipoAlerta, number> = { critica: 0, advertencia: 1, avance: 2, info: 3 }

function relacion<T>(valor: T | T[] | null | undefined): T | null {
  return Array.isArray(valor) ? valor[0] ?? null : valor ?? null
}

const terminada = (f: AvanceFila) =>
  f.piezas_totales && f.piezas_totales > 0 ? (f.piezas_completadas || 0) >= f.piezas_totales : (f.porcentaje || 0) >= 100 || !!f.completado

export async function GET() {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden ver las alertas.' }, { status: 403 })
  }

  const supabase = supabaseServidor()
  const hoy = fechaHoy()

  const [proyectosRes, areasRes] = await Promise.all([
    supabase
      .from('proyectos')
      .select('id, codigo, nombre, cliente, descripcion, progreso, prioridad, fecha_maxima, fecha_real_fin, updated_at, estados:estado_id ( nombre )')
      .order('created_at', { ascending: false }),
    supabase.from('areas').select('id, nombre'),
  ])
  if (proyectosRes.error || areasRes.error) {
    console.error('[alertas] Error:', proyectosRes.error || areasRes.error)
    return NextResponse.json({ error: 'No se pudieron calcular las alertas.' }, { status: 500 })
  }

  const alertas: (Alerta & { peso: number })[] = []
  const etiqueta = new Map<string, string>()

  for (const p of proyectosRes.data ?? []) {
    const id = p.id as string
    const nombre = (p.codigo as string | null) || (p.nombre as string)
    etiqueta.set(id, nombre)

    const progreso = Number(p.progreso) || 0
    const entrega = fechaEntrega(p)
    const estado = estadoEntrega(progreso, entrega, relacion(p.estados as { nombre: string } | { nombre: string }[] | null)?.nombre || '', hoy)
    if (estado === 'completado') {
      const fin = String(p.fecha_real_fin || p.updated_at || '').slice(0, 10)
      if (fin && diasEntre(fin, hoy) <= DIAS_TERMINADO_RECIENTE) {
        alertas.push({
          id: `terminado-${id}`, tipo: 'info', proyecto_id: id, codigo: nombre, peso: diasEntre(fin, hoy),
          titulo: `${nombre} terminado`,
          descripcion: `Se completó el ${fechaLegible(fin)} · ${(p.cliente as string | null) || 'Cliente no especificado'}`,
        })
      }
      continue
    }
    if (estado === 'cancelado') continue

    const cliente = `Cliente: ${(p.cliente as string | null) || 'No especificado'}`
    if (estado === 'atrasado') {
      const dias = diasEntre(entrega, hoy)
      alertas.push({
        id: `critica-${id}`, tipo: 'critica', proyecto_id: id, codigo: nombre, peso: -dias,
        titulo: `${nombre} está atrasado`,
        descripcion: `${dias} día${dias === 1 ? '' : 's'} de atraso (entrega ${fechaLegible(entrega)}) · Avance ${progreso}% · ${cliente}`,
      })
    } else if (p.prioridad === 'urgente' && progreso < AVANCE_EN_RIESGO) {
      alertas.push({
        id: `riesgo-${id}`, tipo: 'advertencia', proyecto_id: id, codigo: nombre, peso: progreso - 50,
        titulo: `${nombre} es urgente y va al ${progreso}%`,
        descripcion: `Prioridad urgente con menos de ${AVANCE_EN_RIESGO}% de avance · ${cliente}`,
      })
    } else if (entrega && diasEntre(hoy, entrega) <= DIAS_POR_VENCER) {
      const dias = diasEntre(hoy, entrega)
      alertas.push({
        id: `advertencia-${id}`, tipo: 'advertencia', proyecto_id: id, codigo: nombre, peso: dias,
        titulo: `${nombre} se entrega ${dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}`,
        descripcion: `Avance ${progreso}% · ${cliente}`,
      })
    }
    if (progreso >= AVANCE_CASI_LISTO) {
      alertas.push({
        id: `avance-${id}`, tipo: 'avance', proyecto_id: id, codigo: nombre, peso: -progreso,
        titulo: `${nombre} está casi listo`,
        descripcion: `Avance ${progreso}% · ${cliente}`,
      })
    }
  }

  // Áreas que terminaron hoy: registraron un avance hoy y ya tienen completos todos sus productos del proyecto
  // México ya no cambia de horario: siempre va 6 horas detrás de UTC
  const inicioHoy = new Date(`${hoy}T00:00:00-06:00`)
  const { data: avancesHoy, error: errorAvance } = await supabase
    .from('avances')
    .select('proyecto_id, area_id')
    .gte('created_at', inicioHoy.toISOString())
  if (errorAvance) console.error('[alertas] Error leyendo avances de hoy:', errorAvance)

  const movidas = new Set((avancesHoy ?? []).map((a) => `${a.proyecto_id}|${a.area_id}`))
  const proyectosConMovimiento = [...new Set((avancesHoy ?? []).map((a) => a.proyecto_id as string))]
  if (proyectosConMovimiento.length) {
    const { data: filas } = await supabase
      .from('producto_area_avance')
      .select('area_id, porcentaje, completado, piezas_completadas, piezas_totales, proyecto_productos!inner ( proyecto_id )')
      .in('proyecto_productos.proyecto_id', proyectosConMovimiento)

    const nombreArea = new Map((areasRes.data ?? []).map((a) => [a.id as string, a.nombre as string]))
    const grupos = new Map<string, AvanceFila[]>()
    for (const f of (filas ?? []) as unknown as AvanceFila[]) {
      const clave = `${relacion(f.proyecto_productos)?.proyecto_id}|${f.area_id}`
      if (movidas.has(clave)) grupos.set(clave, [...(grupos.get(clave) ?? []), f])
    }
    for (const [clave, grupo] of grupos) {
      if (!grupo.every(terminada)) continue
      const [proyectoId, areaId] = clave.split('|')
      const piezas = grupo.reduce((suma, f) => suma + (f.piezas_totales || 0), 0)
      alertas.push({
        id: `info-${clave}`, tipo: 'info', proyecto_id: proyectoId, codigo: etiqueta.get(proyectoId) || '', peso: 0,
        titulo: `${nombreArea.get(areaId) || 'Un área'} terminó ${etiqueta.get(proyectoId) || 'un proyecto'}`,
        descripcion: piezas ? `${piezas} piezas terminadas hoy` : 'Terminó hoy',
      })
    }
  }

  // Áreas paradas: tienen piezas pendientes en proyectos activos y nadie registró avances en 24 horas
  const activos = new Map<string, string>()
  for (const p of proyectosRes.data ?? []) {
    const progreso = Number(p.progreso) || 0
    const estado = estadoEntrega(progreso, fechaEntrega(p), relacion(p.estados as { nombre: string } | { nombre: string }[] | null)?.nombre || '', hoy)
    if (estado !== 'completado' && estado !== 'cancelado') activos.set(p.id as string, (p.codigo as string | null) || (p.nombre as string))
  }
  if (activos.size) {
    const hace24h = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const [pendientesRes, recientesRes] = await Promise.all([
      supabase
        .from('producto_area_avance')
        .select('area_id, porcentaje, completado, piezas_completadas, piezas_totales, proyecto_productos!inner ( proyecto_id )')
        .in('proyecto_productos.proyecto_id', [...activos.keys()]),
      supabase.from('avances').select('area_id').gte('created_at', hace24h),
    ])
    const conActividad = new Set((recientesRes.data ?? []).map((a) => a.area_id as string))
    const pendientes = new Map<string, Set<string>>()
    for (const f of (pendientesRes.data ?? []) as unknown as AvanceFila[]) {
      if (terminada(f) || conActividad.has(f.area_id)) continue
      const proyecto = relacion(f.proyecto_productos)?.proyecto_id
      if (!proyecto) continue
      pendientes.set(f.area_id, (pendientes.get(f.area_id) ?? new Set()).add(proyecto))
    }
    // Una sola alerta con todas las áreas paradas (una por área llenaba el panel)
    const nombreArea = new Map((areasRes.data ?? []).map((a) => [a.id as string, a.nombre as string]))
    const paradas = [...pendientes].filter(([areaId]) => nombreArea.has(areaId))
    if (paradas.length) {
      const proyectos = [...new Set(paradas.flatMap(([, p]) => [...p]))]
      alertas.push({
        id: 'areas-paradas', tipo: 'advertencia', proyecto_id: proyectos[0], codigo: proyectos.length === 1 ? activos.get(proyectos[0]) || '' : '', peso: 100,
        titulo: paradas.length === 1 ? `${nombreArea.get(paradas[0][0])} sin actividad en 24 h` : `${paradas.length} áreas sin actividad en 24 h`,
        descripcion: `${paradas.map(([id]) => nombreArea.get(id)).join(', ')} · piezas pendientes en ${proyectos.map((id) => activos.get(id)).join(', ')}`,
      })
    }
  }

  alertas.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo] || a.peso - b.peso)
  const cuenta = (tipo: TipoAlerta) => alertas.filter((a) => a.tipo === tipo).length

  return NextResponse.json(
    {
      alertas: alertas.map(({ id, tipo, titulo, descripcion, proyecto_id, codigo }): Alerta => ({ id, tipo, titulo, descripcion, proyecto_id, codigo })),
      resumen: { criticas: cuenta('critica'), advertencias: cuenta('advertencia'), avances: cuenta('avance'), info: cuenta('info'), total: alertas.length },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
