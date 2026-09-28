
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface UsuarioSesion {
  id: string
  nombre?: string
  correo: string
  username?: string
  rol: string
}

export async function getUsuarioActual(): Promise<UsuarioSesion | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('sula_session')

  if (!sessionCookie) return null

  try {
    return JSON.parse(sessionCookie.value) as UsuarioSesion
  } catch {
    return null
  }
}

export interface ProductoAsignado {
  productoId: string
  productoNombre: string
  proyectoId: string
  proyectoNombre: string
  piezasCompletadas: number
  piezasTotales: number
}

export interface AreaDelOperador {
  areaId: string
  areaNombre: string
  productos: ProductoAsignado[]
}

interface FilaProducto {
  id: string
  nombre: string
  cantidad: number | null
  proyecto_id: string
  proyectos: { id: string; nombre: string } | null
}

interface FilaAvanceArea {
  producto_id: string
  area_id: string
  piezas_completadas: number | null
  piezas_totales: number | null
}

// Módulos de cada proyecto que sube el admin.
// - Si el admin asignó estaciones al pedido, se muestran solo esas.
// - Si no asignó ninguna, se muestran todos los módulos y se crean al registrar.
export async function getModulosDeProduccion(): Promise<AreaDelOperador[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()

  const [areasRes, productosRes, filasRes] = await Promise.all([
    supabase.from('areas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('proyecto_productos')
      .select('id, nombre, cantidad, proyecto_id, proyectos ( id, nombre )'),
    supabase
      .from('producto_area_avance')
      .select('producto_id, area_id, piezas_completadas, piezas_totales'),
  ])

  if (areasRes.error || productosRes.error || filasRes.error) {
    console.error('Error al traer módulos:', areasRes.error, productosRes.error, filasRes.error)
    return []
  }

  const areas = areasRes.data ?? []
  const productos = (productosRes.data ?? []) as unknown as FilaProducto[]
  const filas = (filasRes.data ?? []) as FilaAvanceArea[]

  const porClave = new Map<string, FilaAvanceArea>()
  const conModulos = new Set<string>()
  filas.forEach((f) => {
    porClave.set(`${f.producto_id}|${f.area_id}`, f)
    conModulos.add(f.producto_id)
  })

  return areas
    .map((area) => ({
      areaId: area.id as string,
      areaNombre: area.nombre as string,
      productos: productos
        .filter((p) => !conModulos.has(p.id) || porClave.has(`${p.id}|${area.id}`))
        .map((p) => {
          const fila = porClave.get(`${p.id}|${area.id}`)
          return {
            productoId: p.id,
            productoNombre: p.nombre,
            proyectoId: p.proyecto_id,
            proyectoNombre: p.proyectos?.nombre ?? 'Proyecto',
            piezasCompletadas: fila?.piezas_completadas ?? 0,
            piezasTotales: fila?.piezas_totales ?? p.cantidad ?? 0,
          }
        })
        .sort(
          (a, b) =>
            a.proyectoNombre.localeCompare(b.proyectoNombre) ||
            a.productoNombre.localeCompare(b.productoNombre)
        ),
    }))
    .filter((a) => a.productos.length > 0)
}

export interface AvanceRegistrado {
  id: string
  areaId: string
  areaNombre: string
  proyectoNombre: string
  productoNombre: string
  operacion: string
  descripcion: string
  piezas: number
  horaInicio: string
  createdAt: string
}

interface FilaAvanceHistorial {
  id: string
  area_id: string
  piezas: number | null
  operacion: string | null
  actividad: string | null
  hora_inicio: string | null
  created_at: string
  areas: { nombre: string } | null
  proyectos: { nombre: string } | null
  proyecto_productos: { nombre: string } | null
}

// Registros del operador desde una fecha (inicio del día que manda el navegador)
export async function getAvancesDeHoy(desdeISO: string): Promise<AvanceRegistrado[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('avances')
    .select(
      'id, area_id, piezas, operacion, actividad, hora_inicio, created_at, areas ( nombre ), proyectos ( nombre ), proyecto_productos ( nombre )'
    )
    .eq('operador_id', usuario.id)
    .gte('created_at', desdeISO)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error al traer avances de hoy:', error)
    return []
  }

  const filas = (data ?? []) as unknown as FilaAvanceHistorial[]

  return filas.map((f) => ({
    id: f.id,
    areaId: f.area_id,
    areaNombre: f.areas?.nombre ?? '—',
    proyectoNombre: f.proyectos?.nombre ?? '—',
    productoNombre: f.proyecto_productos?.nombre ?? '—',
    operacion: f.operacion ?? '',
    descripcion: f.actividad ?? '',
    piezas: f.piezas ?? 0,
    horaInicio: f.hora_inicio ?? '',
    createdAt: f.created_at,
  }))
}

// Misma fórmula ponderada que usa /admin/proyectos: cada área pesa según
// areas.peso, el avance del producto sale de sus áreas, y el del proyecto
// es el promedio de sus productos.
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

export interface RegistrarAvanceParams {
  proyectoId: string
  areaId: string
  productoId: string
  piezas: number
  operacion: string
  descripcion: string
  horaInicio: string
}

// Guarda el registro del operador, suma las piezas en producto_area_avance
// y recalcula el porcentaje del producto y del proyecto para el admin.
export async function registrarAvance(
  params: RegistrarAvanceParams
): Promise<{ error?: string; success?: boolean }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  if (!Number.isFinite(params.piezas) || params.piezas <= 0) {
    return { error: 'El número de piezas debe ser mayor a 0.' }
  }

  const supabase = await createClient()

  let fila: {
    id: string
    piezas_completadas: number | null
    piezas_totales: number | null
  } | null = null

  const { data: existente } = await supabase
    .from('producto_area_avance')
    .select('id, piezas_completadas, piezas_totales')
    .eq('producto_id', params.productoId)
    .eq('area_id', params.areaId)
    .maybeSingle()

  fila = existente

  if (!fila) {
    // Si el admin asignó estaciones al producto y esta no es una de ellas, se bloquea.
    const { count } = await supabase
      .from('producto_area_avance')
      .select('id', { count: 'exact', head: true })
      .eq('producto_id', params.productoId)

    if ((count ?? 0) > 0) {
      return {
        error: 'Este módulo no está asignado a ese producto. El administrador debe agregarlo al proyecto.',
      }
    }

    // El admin no asignó estaciones: se crea el renglón con la meta igual a la cantidad.
    const { data: producto } = await supabase
      .from('proyecto_productos')
      .select('cantidad')
      .eq('id', params.productoId)
      .maybeSingle()

    if (!producto) return { error: 'No se encontró el producto seleccionado.' }

    const { data: nueva, error: errorInsert } = await supabase
      .from('producto_area_avance')
      .insert({
        producto_id: params.productoId,
        area_id: params.areaId,
        piezas_completadas: 0,
        piezas_totales: producto.cantidad ?? 0,
        porcentaje: 0,
        completado: false,
      })
      .select('id, piezas_completadas, piezas_totales')
      .single()

    if (errorInsert || !nueva) {
      console.error('Error creando producto_area_avance:', errorInsert)
      return { error: 'No se pudo preparar el avance de este módulo.' }
    }
    fila = nueva
  }

  const piezasTotales = fila.piezas_totales ?? 0
  const piezasNuevas = (fila.piezas_completadas ?? 0) + params.piezas
  const porcentaje =
    piezasTotales > 0
      ? Math.min(100, Math.round((piezasNuevas / piezasTotales) * 100))
      : 0

  const { error: errorUpdate } = await supabase
    .from('producto_area_avance')
    .update({
      piezas_completadas: piezasNuevas,
      porcentaje,
      completado: porcentaje >= 100,
    })
    .eq('id', fila.id)

  if (errorUpdate) {
    console.error('Error actualizando producto_area_avance:', errorUpdate)
    return { error: 'No se pudo actualizar el avance del proyecto.' }
  }

  await recalcularProgreso(supabase, params.proyectoId)

  const { error: errorAvance } = await supabase.from('avances').insert({
    proyecto_id: params.proyectoId,
    area_id: params.areaId,
    producto_id: params.productoId,
    operador_id: usuario.id,
    piezas: params.piezas,
    porcentaje,
    operacion: params.operacion,
    actividad: params.descripcion,
    hora_inicio: params.horaInicio,
  })

  if (errorAvance) {
    console.error('Error guardando en avances:', errorAvance)
    return { error: 'El proyecto se actualizó, pero no se guardó tu historial.' }
  }

  return { success: true }
}

// Borra un registro del operador, resta sus piezas del avance del proyecto
// y recalcula el porcentaje para el admin.
export async function eliminarAvance(
  avanceId: string
): Promise<{ error?: string; success?: boolean }> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  const { data: avance } = await supabase
    .from('avances')
    .select('id, proyecto_id, producto_id, area_id, piezas')
    .eq('id', avanceId)
    .eq('operador_id', usuario.id)
    .maybeSingle()

  if (!avance) return { error: 'No se encontró el registro.' }

  const { error: errorDelete } = await supabase.from('avances').delete().eq('id', avanceId)

  if (errorDelete) {
    console.error('Error eliminando avance:', errorDelete)
    return { error: 'No se pudo eliminar el registro.' }
  }

  if (avance.producto_id) {
    const { data: fila } = await supabase
      .from('producto_area_avance')
      .select('id, piezas_completadas, piezas_totales')
      .eq('producto_id', avance.producto_id)
      .eq('area_id', avance.area_id)
      .maybeSingle()

    if (fila) {
      const piezasNuevas = Math.max(0, (fila.piezas_completadas ?? 0) - (avance.piezas ?? 0))
      const total = fila.piezas_totales ?? 0
      const porcentaje =
        total > 0 ? Math.min(100, Math.round((piezasNuevas / total) * 100)) : 0

      const { error: errorUpdate } = await supabase
        .from('producto_area_avance')
        .update({
          piezas_completadas: piezasNuevas,
          porcentaje,
          completado: porcentaje >= 100,
        })
        .eq('id', fila.id)

      if (errorUpdate) {
        console.error('Error restando piezas:', errorUpdate)
        return { error: 'El registro se borró, pero no se pudo actualizar el avance del proyecto.' }
      }
    }
  }

  if (avance.proyecto_id) {
    await recalcularProgreso(supabase, avance.proyecto_id as string)
  }

  return { success: true }
}