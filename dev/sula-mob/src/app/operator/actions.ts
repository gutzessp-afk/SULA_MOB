
'use server'

import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
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

function ahoraISO() {
  return new Date().toISOString()
}

interface Resultado {
  error?: string
  success?: boolean
  areaCompleta?: boolean
}

/* ------------------------------------------------------------------ */
/*  Compatibilidad con Reportar retraso (esa pantalla no se modifica)   */
/* ------------------------------------------------------------------ */

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

interface FilaProductoRetraso {
  id: string
  nombre: string
  cantidad: number | null
  proyecto_id: string
  proyectos: { nombre: string } | null
}

export async function getModulosDeProduccion(): Promise<AreaDelOperador[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()

  const [areasRes, productosRes] = await Promise.all([
    supabase.from('areas').select('id, nombre').eq('activo', true).order('orden', { ascending: true }),
    supabase
      .from('proyecto_productos')
      .select('id, nombre, cantidad, proyecto_id, proyectos ( nombre )'),
  ])

  if (areasRes.error || productosRes.error) {
    console.error('Error al traer módulos:', areasRes.error, productosRes.error)
    return []
  }

  const productos = (productosRes.data ?? []) as unknown as FilaProductoRetraso[]

  return (areasRes.data ?? []).map((area) => ({
    areaId: area.id as string,
    areaNombre: area.nombre as string,
    productos: productos.map((p) => ({
      productoId: p.id,
      productoNombre: p.nombre,
      proyectoId: p.proyecto_id,
      proyectoNombre: p.proyectos?.nombre ?? 'Proyecto',
      piezasCompletadas: 0,
      piezasTotales: p.cantidad ?? 0,
    })),
  }))
}

/* ------------------------------------------------------------------ */
/*  Lista de proyectos                                                 */
/* ------------------------------------------------------------------ */

export interface ProyectoLista {
  id: string
  codigo: string
  nombre: string
  cliente: string
  prioridad: string
  progreso: number
}

export async function getProyectosLista(): Promise<ProyectoLista[]> {
  const usuario = await getUsuarioActual()
  if (!usuario) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('proyectos')
    .select('id, codigo, nombre, cliente, prioridad, progreso')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error al traer proyectos:', error)
    return []
  }

  return (data ?? []).map((p) => ({
    id: p.id as string,
    codigo: (p.codigo as string | null) ?? '',
    nombre: p.nombre as string,
    cliente: (p.cliente as string | null) ?? '',
    prioridad: (p.prioridad as string | null) ?? 'media',
    progreso: (p.progreso as number | null) ?? 0,
  }))
}

/* ------------------------------------------------------------------ */
/*  Registro en producción                                             */
/* ------------------------------------------------------------------ */

export interface RegistroActivo {
  avanceId: string
  proyectoId: string
  proyectoNombre: string
  areaId: string
  areaNombre: string
  productoId: string
  productoNombre: string
  iniciadoAt: string
}

interface FilaActivo {
  id: string
  proyecto_id: string | null
  area_id: string
  producto_id: string | null
  iniciado_at: string | null
  created_at: string
  areas: { nombre: string } | null
  proyectos: { nombre: string } | null
  proyecto_productos: { nombre: string } | null
}

async function buscarActivo(
  supabase: Supabase,
  usuarioId: string
): Promise<RegistroActivo | null> {
  const { data, error } = await supabase
    .from('avances')
    .select(
      'id, proyecto_id, area_id, producto_id, iniciado_at, created_at, areas ( nombre ), proyectos ( nombre ), proyecto_productos ( nombre )'
    )
    .eq('operador_id', usuarioId)
    .eq('estado', 'en_proceso')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error al buscar registro activo:', error)
    return null
  }

  const f = ((data ?? []) as unknown as FilaActivo[])[0]
  if (!f) return null

  return {
    avanceId: f.id,
    proyectoId: f.proyecto_id ?? '',
    proyectoNombre: f.proyectos?.nombre ?? 'Proyecto',
    areaId: f.area_id,
    areaNombre: f.areas?.nombre ?? 'Área',
    productoId: f.producto_id ?? '',
    productoNombre: f.proyecto_productos?.nombre ?? 'Producto',
    iniciadoAt: f.iniciado_at ?? f.created_at,
  }
}

export async function getRegistroActivo(): Promise<RegistroActivo | null> {
  const usuario = await getUsuarioActual()
  if (!usuario) return null
  const supabase = await createClient()
  return buscarActivo(supabase, usuario.id)
}

/* ------------------------------------------------------------------ */
/*  Detalle de un proyecto: todas las áreas, con candado                */
/* ------------------------------------------------------------------ */

export interface ProductoArea {
  productoId: string
  productoNombre: string
  hechas: number
  meta: number
}

export interface AreaProyecto {
  areaId: string
  areaNombre: string
  peso: number
  hechas: number
  meta: number
  porcentaje: number
  productos: ProductoArea[]
  cerrada: boolean
  desbloqueada: boolean
}

export interface DetalleProyecto {
  id: string
  codigo: string
  nombre: string
  cliente: string
  progreso: number
  areas: AreaProyecto[]
  activo: RegistroActivo | null
}

interface FilaAvanceArea {
  producto_id: string
  area_id: string
  piezas_completadas: number | null
  piezas_totales: number | null
}

export async function getDetalleProyecto(proyectoId: string): Promise<DetalleProyecto | null> {
  const usuario = await getUsuarioActual()
  if (!usuario) return null

  const supabase = await createClient()

  const [proyRes, prodRes, areasRes, cierresRes, accesosRes, activo] = await Promise.all([
    supabase
      .from('proyectos')
      .select('id, codigo, nombre, cliente, progreso')
      .eq('id', proyectoId)
      .maybeSingle(),
    supabase
      .from('proyecto_productos')
      .select('id, nombre, cantidad')
      .eq('proyecto_id', proyectoId)
      .order('created_at'),
    supabase.from('areas').select('id, nombre, peso').eq('activo', true).order('orden', { ascending: true }),
    supabase.from('area_cierres').select('area_id').eq('proyecto_id', proyectoId),
    supabase
      .from('area_accesos')
      .select('area_id')
      .eq('operador_id', usuario.id)
      .gt('expira_at', ahoraISO()),
    buscarActivo(supabase, usuario.id),
  ])

  if (proyRes.error || !proyRes.data) {
    console.error('Error al traer proyecto:', proyRes.error)
    return null
  }
  if (prodRes.error || areasRes.error) {
    console.error('Error al traer productos o áreas:', prodRes.error, areasRes.error)
    return null
  }

  const productos = prodRes.data ?? []
  const ids = productos.map((p) => p.id as string)

  let filas: FilaAvanceArea[] = []
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('producto_area_avance')
      .select('producto_id, area_id, piezas_completadas, piezas_totales')
      .in('producto_id', ids)
    if (error) console.error('Error al traer avances por área:', error)
    filas = (data ?? []) as FilaAvanceArea[]
  }

  const porClave = new Map<string, FilaAvanceArea>()
  filas.forEach((f) => porClave.set(`${f.producto_id}|${f.area_id}`, f))

  const cerradas = new Set((cierresRes.data ?? []).map((c) => c.area_id as string))
  const abiertas = new Set((accesosRes.data ?? []).map((a) => a.area_id as string))
  if (activo) abiertas.add(activo.areaId)

  const areas: AreaProyecto[] = (areasRes.data ?? []).map((area) => {
    const prods: ProductoArea[] = productos.map((p) => {
      const fila = porClave.get(`${p.id}|${area.id}`)
      return {
        productoId: p.id as string,
        productoNombre: p.nombre as string,
        hechas: fila?.piezas_completadas ?? 0,
        meta: fila?.piezas_totales ?? (p.cantidad as number | null) ?? 0,
      }
    })

    const hechas = prods.reduce((s, p) => s + p.hechas, 0)
    const meta = prods.reduce((s, p) => s + p.meta, 0)

    return {
      areaId: area.id as string,
      areaNombre: area.nombre as string,
      peso: Number(area.peso ?? 0),
      hechas,
      meta,
      porcentaje: meta > 0 ? Math.min(100, Math.round((hechas / meta) * 100)) : 0,
      productos: prods,
      cerrada: cerradas.has(area.id as string),
      desbloqueada: abiertas.has(area.id as string),
    }
  })

  return {
    id: proyRes.data.id as string,
    codigo: (proyRes.data.codigo as string | null) ?? '',
    nombre: proyRes.data.nombre as string,
    cliente: (proyRes.data.cliente as string | null) ?? '',
    progreso: (proyRes.data.progreso as number | null) ?? 0,
    areas,
    activo,
  }
}

/* ------------------------------------------------------------------ */
/*  Contraseña de área                                                 */
/* ------------------------------------------------------------------ */

const MAX_INTENTOS = 5
const MINUTOS_BLOQUEO = 5
const HORAS_MAXIMAS_DESBLOQUEO = 12

async function tieneAcceso(supabase: Supabase, usuarioId: string, areaId: string) {
  const { data } = await supabase
    .from('area_accesos')
    .select('area_id')
    .eq('operador_id', usuarioId)
    .eq('area_id', areaId)
    .gt('expira_at', ahoraISO())
    .maybeSingle()

  if (data) return true

  const activo = await buscarActivo(supabase, usuarioId)
  return activo?.areaId === areaId
}

export async function desbloquearArea(areaId: string, pin: string): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const clave = pin.trim()
  if (!clave) return { error: 'Escribe la contraseña del área.' }

  const supabase = await createClient()

  const { data: area } = await supabase
    .from('areas')
    .select('id, pin_hash')
    .eq('id', areaId)
    .maybeSingle()

  if (!area) return { error: 'No se encontró el área.' }
  if (!area.pin_hash) {
    return { error: 'Esta área todavía no tiene contraseña. Avisa al administrador.' }
  }

  const { data: intento } = await supabase
    .from('area_intentos')
    .select('fallidos, bloqueado_hasta')
    .eq('operador_id', usuario.id)
    .eq('area_id', areaId)
    .maybeSingle()

  if (intento?.bloqueado_hasta && new Date(intento.bloqueado_hasta as string) > new Date()) {
    const minutos = Math.ceil(
      (new Date(intento.bloqueado_hasta as string).getTime() - Date.now()) / 60000
    )
    return { error: `Demasiados intentos. Intenta de nuevo en ${minutos} min.` }
  }

  const hash = (area.pin_hash as string).replace(/^\$2a\$/, '$2b$')
  const correcta = await bcrypt.compare(clave, hash)

  if (!correcta) {
    const fallidos = ((intento?.fallidos as number | null) ?? 0) + 1
    const bloquear = fallidos >= MAX_INTENTOS

    await supabase.from('area_intentos').upsert(
      {
        operador_id: usuario.id,
        area_id: areaId,
        fallidos: bloquear ? 0 : fallidos,
        bloqueado_hasta: bloquear
          ? new Date(Date.now() + MINUTOS_BLOQUEO * 60000).toISOString()
          : null,
      },
      { onConflict: 'operador_id,area_id' }
    )

    return {
      error: bloquear
        ? `Demasiados intentos. Intenta de nuevo en ${MINUTOS_BLOQUEO} min.`
        : 'Contraseña incorrecta.',
    }
  }

  await supabase
    .from('area_intentos')
    .delete()
    .eq('operador_id', usuario.id)
    .eq('area_id', areaId)

  const { error } = await supabase.from('area_accesos').upsert(
    {
      operador_id: usuario.id,
      area_id: areaId,
      expira_at: new Date(Date.now() + HORAS_MAXIMAS_DESBLOQUEO * 3600000).toISOString(),
    },
    { onConflict: 'operador_id,area_id' }
  )

  if (error) {
    console.error('Error al desbloquear:', error)
    return { error: 'No se pudo desbloquear el área.' }
  }

  return { success: true }
}

export async function bloquearArea(areaId: string): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  const activo = await buscarActivo(supabase, usuario.id)
  if (activo?.areaId === areaId) {
    return { error: 'Termina primero el registro que tienes en producción.' }
  }

  await supabase
    .from('area_accesos')
    .delete()
    .eq('operador_id', usuario.id)
    .eq('area_id', areaId)

  return { success: true }
}

/* ------------------------------------------------------------------ */
/*  Cálculo de progreso (misma fórmula ponderada que /admin/proyectos)  */
/* ------------------------------------------------------------------ */

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

async function areaCompleta(
  supabase: Supabase,
  proyectoId: string,
  areaId: string
): Promise<boolean> {
  const { data: productos } = await supabase
    .from('proyecto_productos')
    .select('id, cantidad')
    .eq('proyecto_id', proyectoId)

  if (!productos || productos.length === 0) return false

  const { data: filas } = await supabase
    .from('producto_area_avance')
    .select('producto_id, piezas_completadas, piezas_totales')
    .eq('area_id', areaId)
    .in(
      'producto_id',
      productos.map((p) => p.id as string)
    )

  return productos.every((p) => {
    const fila = (filas ?? []).find((f) => f.producto_id === p.id)
    const meta = (fila?.piezas_totales as number | null) ?? (p.cantidad as number | null) ?? 0
    const hechas = (fila?.piezas_completadas as number | null) ?? 0
    return meta > 0 && hechas >= meta
  })
}

async function obtenerFilaProductoArea(
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

  if (!producto) return { error: 'No se encontró el producto.' }

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

  await supabase.from('notificaciones').insert(
    idsAdmin.map((adminId) => ({
      remitente_id: remitenteId,
      destinatario_id: adminId,
      proyecto_id: proyectoId,
      tipo,
      mensaje,
      leida: false,
    }))
  )
}

/* ------------------------------------------------------------------ */
/*  Iniciar, terminar, cancelar y marcar área terminada                 */
/* ------------------------------------------------------------------ */

export interface IniciarProduccionParams {
  proyectoId: string
  areaId: string
  productoId: string
}

export async function iniciarProduccion(params: IniciarProduccionParams): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  if (!(await tieneAcceso(supabase, usuario.id, params.areaId))) {
    return { error: 'Esta área está bloqueada. Escribe su contraseña para entrar.' }
  }

  const activo = await buscarActivo(supabase, usuario.id)
  if (activo) return { error: 'Termina primero el registro que tienes en producción.' }

  const { data: cierre } = await supabase
    .from('area_cierres')
    .select('id')
    .eq('proyecto_id', params.proyectoId)
    .eq('area_id', params.areaId)
    .maybeSingle()

  if (cierre) return { error: 'Esta área ya fue marcada como terminada en este proyecto.' }

  const { error: errorFila } = await obtenerFilaProductoArea(
    supabase,
    params.productoId,
    params.areaId
  )
  if (errorFila) return { error: errorFila }

  const { error } = await supabase.from('avances').insert({
    proyecto_id: params.proyectoId,
    area_id: params.areaId,
    producto_id: params.productoId,
    operador_id: usuario.id,
    estado: 'en_proceso',
    iniciado_at: ahoraISO(),
    porcentaje: 0,
    operacion: '',
    actividad: '',
  })

  if (error) {
    console.error('Error al iniciar producción:', error)
    return { error: 'No se pudo iniciar el registro.' }
  }

  return { success: true }
}

export async function terminarProduccion(avanceId: string, piezas: number): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  if (!Number.isInteger(piezas) || piezas <= 0) {
    return { error: 'Escribe cuántas piezas fabricaste.' }
  }

  const supabase = await createClient()

  const { data: avance } = await supabase
    .from('avances')
    .select('id, proyecto_id, producto_id, area_id, estado')
    .eq('id', avanceId)
    .eq('operador_id', usuario.id)
    .maybeSingle()

  if (!avance || avance.estado !== 'en_proceso' || !avance.producto_id) {
    return { error: 'Este registro ya no está en producción.' }
  }

  const { fila, error: errorFila } = await obtenerFilaProductoArea(
    supabase,
    avance.producto_id as string,
    avance.area_id as string
  )
  if (errorFila || !fila) return { error: errorFila ?? 'No se encontró el avance del proyecto.' }

  const meta = fila.piezas_totales ?? 0
  const previas = fila.piezas_completadas ?? 0

  if (meta > 0 && piezas > meta - previas) {
    return { error: `Solo faltan ${Math.max(0, meta - previas)} piezas.` }
  }

  const nuevas = previas + piezas
  const porcentaje = meta > 0 ? Math.min(100, Math.round((nuevas / meta) * 100)) : 0

  const { error: errorUpdate } = await supabase
    .from('producto_area_avance')
    .update({
      piezas_completadas: nuevas,
      porcentaje,
      completado: porcentaje >= 100,
    })
    .eq('id', fila.id)

  if (errorUpdate) {
    console.error('Error actualizando producto_area_avance:', errorUpdate)
    return { error: 'No se pudo actualizar el avance del proyecto.' }
  }

  const { error: errorAvance } = await supabase
    .from('avances')
    .update({
      piezas,
      porcentaje,
      estado: 'terminado',
      terminado_at: ahoraISO(),
    })
    .eq('id', avanceId)

  if (errorAvance) {
    console.error('Error cerrando avance:', errorAvance)
    return { error: 'El proyecto se actualizó, pero no se pudo cerrar tu registro.' }
  }

  await recalcularProgreso(supabase, avance.proyecto_id as string)

  const completa = await areaCompleta(
    supabase,
    avance.proyecto_id as string,
    avance.area_id as string
  )

  // Si el área llegó a su meta, queda abierta para que marques "Área terminada".
  // Si todavía faltan piezas, se bloquea otra vez.
  if (!completa) {
    await supabase
      .from('area_accesos')
      .delete()
      .eq('operador_id', usuario.id)
      .eq('area_id', avance.area_id)
  }

  return { success: true, areaCompleta: completa }
}

export async function cancelarProduccion(avanceId: string): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('avances')
    .delete()
    .eq('id', avanceId)
    .eq('operador_id', usuario.id)
    .eq('estado', 'en_proceso')

  if (error) {
    console.error('Error al cancelar:', error)
    return { error: 'No se pudo cancelar el registro.' }
  }

  return { success: true }
}

export async function marcarAreaTerminada(proyectoId: string, areaId: string): Promise<Resultado> {
  const usuario = await getUsuarioActual()
  if (!usuario) return { error: 'No autenticado' }

  const supabase = await createClient()

  if (!(await tieneAcceso(supabase, usuario.id, areaId))) {
    return { error: 'Esta área está bloqueada. Escribe su contraseña para entrar.' }
  }

  const activo = await buscarActivo(supabase, usuario.id)
  if (activo?.areaId === areaId) {
    return { error: 'Termina primero el registro que tienes en producción.' }
  }

  if (!(await areaCompleta(supabase, proyectoId, areaId))) {
    return { error: 'Todavía faltan piezas para terminar esta área.' }
  }

  const { error } = await supabase
    .from('area_cierres')
    .upsert(
      { proyecto_id: proyectoId, area_id: areaId, operador_id: usuario.id },
      { onConflict: 'proyecto_id,area_id', ignoreDuplicates: true }
    )

  if (error) {
    console.error('Error al marcar área terminada:', error)
    return { error: 'No se pudo marcar el área como terminada.' }
  }

  await supabase
    .from('area_accesos')
    .delete()
    .eq('operador_id', usuario.id)
    .eq('area_id', areaId)

  const [areaRes, proyectoRes] = await Promise.all([
    supabase.from('areas').select('nombre').eq('id', areaId).maybeSingle(),
    supabase.from('proyectos').select('nombre').eq('id', proyectoId).maybeSingle(),
  ])

  await avisarAdmins(
    supabase,
    usuario.id,
    proyectoId,
    'area_terminada',
    `${usuario.nombre ?? usuario.correo} terminó ${areaRes.data?.nombre ?? 'un área'} en ${proyectoRes.data?.nombre ?? 'un proyecto'}`
  )

  return { success: true }
}