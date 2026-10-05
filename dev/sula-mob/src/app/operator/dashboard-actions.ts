
'use server'

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from './actions'
import type { Activity } from '@/components/operator/activity-card'

export interface ProyectoResumen {
  id: string
  codigo: string
  nombre: string
  cliente: string
  prioridad: string
  progreso: number
}

export interface ProduccionLinea {
  area: string
  operacion: string
  piezas: number
  hora: string
}

export interface ProduccionProyecto {
  proyecto: string
  total: number
  lineas: ProduccionLinea[]
}

export interface ResumenDashboard {
  proyectos: ProyectoResumen[]
  pendientes: number
  realizadas: number
  piezasHoy: number
  produccion: ProduccionProyecto[]
}

interface FilaProyecto {
  id: string
  codigo: string | null
  nombre: string
  cliente: string | null
  prioridad: string | null
  progreso: number | null
}

interface FilaEstado {
  porcentaje: number | null
  completado: boolean | null
}

interface FilaAvanceHoy {
  piezas: number | null
  operacion: string | null
  hora_inicio: string | null
  areas: { nombre: string } | null
  proyectos: { nombre: string } | null
}

export async function getResumenDashboard(desdeISO: string): Promise<ResumenDashboard> {
  const vacio: ResumenDashboard = {
    proyectos: [],
    pendientes: 0,
    realizadas: 0,
    piezasHoy: 0,
    produccion: [],
  }

  const usuario = await getUsuarioActual()
  if (!usuario) return vacio

  const supabase = await createClient()

  const [proyectosRes, estadosRes, avancesRes] = await Promise.all([
    supabase
      .from('proyectos')
      .select('id, codigo, nombre, cliente, prioridad, progreso')
      .order('created_at', { ascending: false }),
    supabase.from('producto_area_avance').select('porcentaje, completado'),
    supabase
      .from('avances')
      .select('piezas, operacion, hora_inicio, areas ( nombre ), proyectos ( nombre )')
      .eq('operador_id', usuario.id)
      .gte('created_at', desdeISO)
      .order('created_at', { ascending: true }),
  ])

  if (proyectosRes.error || estadosRes.error || avancesRes.error) {
    console.error('Error en dashboard:', proyectosRes.error, estadosRes.error, avancesRes.error)
    return vacio
  }

  const proyectos = ((proyectosRes.data ?? []) as FilaProyecto[]).map((p) => ({
    id: p.id,
    codigo: p.codigo ?? '',
    nombre: p.nombre,
    cliente: p.cliente ?? '',
    prioridad: p.prioridad ?? 'media',
    progreso: p.progreso ?? 0,
  }))

  const estados = (estadosRes.data ?? []) as FilaEstado[]
  const esCompleto = (e: FilaEstado) => !!e.completado || (e.porcentaje ?? 0) >= 100
  const realizadas = estados.filter(esCompleto).length
  const pendientes = estados.length - realizadas

  const avances = (avancesRes.data ?? []) as unknown as FilaAvanceHoy[]
  const porProyecto = new Map<string, ProduccionProyecto>()
  let piezasHoy = 0

  avances.forEach((a) => {
    const nombre = a.proyectos?.nombre ?? 'Proyecto'
    const piezas = a.piezas ?? 0
    piezasHoy += piezas

    if (!porProyecto.has(nombre)) {
      porProyecto.set(nombre, { proyecto: nombre, total: 0, lineas: [] })
    }
    const grupo = porProyecto.get(nombre)!
    grupo.total += piezas
    grupo.lineas.push({
      area: a.areas?.nombre ?? '—',
      operacion: a.operacion ?? '',
      piezas,
      hora: a.hora_inicio ?? '',
    })
  })

  return {
    proyectos,
    pendientes,
    realizadas,
    piezasHoy,
    produccion: Array.from(porProyecto.values()),
  }
}

interface FilaActividad {
  area_id: string
  piezas_completadas: number | null
  piezas_totales: number | null
  created_at: string | null
  areas: { nombre: string } | null
  proyecto_productos: {
    proyecto_id: string
    proyectos: { nombre: string } | null
  } | null
}

// Un renglón del tablero por proyecto + módulo, sumando todos sus productos.
export async function getActividades(): Promise<Activity[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('producto_area_avance')
    .select(
      'area_id, piezas_completadas, piezas_totales, created_at, areas ( nombre ), proyecto_productos ( proyecto_id, proyectos ( nombre ) )'
    )

  if (error) {
    console.error('Error al traer actividades:', error)
    return []
  }

  const filas = (data ?? []) as unknown as FilaActividad[]

  interface Grupo {
    proyecto: string
    area: string
    hechas: number
    total: number
    fecha: string
  }
  const grupos = new Map<string, Grupo>()

  filas.forEach((f) => {
    if (!f.proyecto_productos) return
    const clave = `${f.proyecto_productos.proyecto_id}|${f.area_id}`
    const existente = grupos.get(clave)
    const hechas = f.piezas_completadas ?? 0
    const total = f.piezas_totales ?? 0
    const fecha = f.created_at ?? ''

    if (existente) {
      existente.hechas += hechas
      existente.total += total
      if (fecha > existente.fecha) existente.fecha = fecha
    } else {
      grupos.set(clave, {
        proyecto: f.proyecto_productos.proyectos?.nombre ?? 'Proyecto',
        area: f.areas?.nombre ?? '—',
        hechas,
        total,
        fecha,
      })
    }
  })

  return Array.from(grupos.entries()).map(([clave, g]) => {
    const status =
      g.total > 0 && g.hechas >= g.total ? 'completado' : g.hechas > 0 ? 'en_proceso' : 'pendiente'

    return {
      id: clave,
      proyecto: g.proyecto,
      area: g.area,
      descripcion: `${g.area}: ${g.hechas} de ${g.total} piezas`,
      status: status as Activity['status'],
      fecha: g.fecha
        ? new Date(g.fecha).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : '',
    }
  })
}