/**
 * /api/bom/route.ts
 * ─────────────────
 * Explosiones de material (tabla bom_explosiones).
 *
 *   GET    /api/bom                        → lista con datos del proyecto y conteos (sin los
 *                                            pedidos terminados, progreso 100%)
 *   GET    /api/bom?estado=pendiente,...   → filtro por estado (coma-separados)
 *   GET    /api/bom?id=UUID                → una explosión con proyecto, partidas y materiales
 *   GET    /api/bom?proyecto_id=UUID       → la explosión de un proyecto (para el ⚡ de Proyectos)
 *   POST   /api/bom  { proyecto_id }       → crea explosión 'pendiente' (o devuelve la que ya hay)
 *   GET    /api/bom?resumen=1              → { resumen: { [proyecto_id]: tiempos y estatus } } de TODOS
 *                                            los pedidos (columna BOM de Proyectos)
 *   PATCH  /api/bom  { id, accion }        → iniciar | pausar | reanudar | reiniciar | finalizar | reabrir
 *                                            | cancelar (deshace el inicio: vuelve a 'pendiente' como si
 *                                              nunca se hubiera iniciado; materiales y estatus se quedan)
 *   PATCH  /api/bom  { id, accion: 'editar_tiempo', segundos } → corrige el cronómetro a mano
 *   PATCH  /api/bom  { id, accion: 'guardar_estatus', motivos, notas }
 *          → motivos por los que no se puede explosionar (src/lib/bom-motivos.ts); iniciar
 *            se rechaza mientras haya alguno sin resolver
 *
 * Cronómetro: tiempo trabajado = acumulado_seg + (ahora - tramo_inicio); tramo_inicio NULL = pausada
 * (columnas de sql/bom_pausa.sql). duracion_seg guarda el tiempo trabajado sin las pausas;
 * checklist.pausas cuenta las pausas. reiniciar = 00:00:00 detenido (la fecha_inicio se conserva).
 *
 * Finalizar exige que todas las líneas de material (bom_detalles) estén marcadas.
 * El Historial (bom_iniciado / bom_completado) se registra SOLO aquí, no en la página.
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { registrarActividad, obtenerUsuarioDeSesion, type RegistroActividad } from '@/lib/registrar-actividad'
import { MOTIVOS_PREDEFINIDOS, motivosDe, motivosSinResolver, type MotivoBloqueo } from '@/lib/bom-motivos'
import { pausasDe, segundosTrabajados } from '@/lib/bom-tiempo'

const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'completado']

/**
 * Valida los motivos que manda la página y conserva quién/cuándo los reportó o resolvió.
 * Devuelve null si el body no es válido.
 */
function normalizarMotivos(entrada: unknown, anteriores: MotivoBloqueo[], usuario: string): MotivoBloqueo[] | null {
  if (!Array.isArray(entrada) || entrada.length > 30) return null
  const ahora = new Date().toISOString()
  const previos = new Map(anteriores.map(m => [m.id, m]))
  const vistos = new Set<string>()
  const resultado: MotivoBloqueo[] = []
  for (const item of entrada) {
    const id = typeof item?.id === 'string' ? item.id.slice(0, 60) : ''
    if (!id || vistos.has(id)) continue
    const predefinido = MOTIVOS_PREDEFINIDOS.find(m => m.id === id)
    const texto = predefinido?.texto ?? (id.startsWith('otro-') && typeof item.texto === 'string' ? item.texto.trim().slice(0, 200) : '')
    if (!texto) continue
    vistos.add(id)
    const previo = previos.get(id)
    const resuelto = item.resuelto === true
    resultado.push({
      id,
      texto,
      detalle: typeof item.detalle === 'string' ? item.detalle.slice(0, 500) : '',
      resuelto,
      reportado_en: previo?.reportado_en ?? ahora,
      reportado_por: previo?.reportado_por ?? usuario,
      resuelto_en: resuelto ? (previo?.resuelto ? previo.resuelto_en : ahora) : null,
      resuelto_por: resuelto ? (previo?.resuelto ? previo.resuelto_por : usuario) : null,
    })
  }
  return resultado
}

const SIN_CACHE = { headers: { 'Cache-Control': 'no-store' } }

export async function GET(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const supabase = supabaseServidor()
  const params = request.nextUrl.searchParams

  /* ── Resumen por proyecto (todos, también los terminados) ── */
  if (params.get('resumen')) {
    const { data, error } = await supabase
      .from('bom_explosiones')
      .select('id, proyecto_id, estado, fecha_inicio, fecha_termino, duracion_seg, acumulado_seg, tramo_inicio, checklist')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const resumen = Object.fromEntries((data ?? []).map(e => [e.proyecto_id, e]))
    return NextResponse.json({ resumen }, SIN_CACHE)
  }

  /* ── La explosión de un proyecto ── */
  const proyectoId = params.get('proyecto_id')
  if (proyectoId) {
    const { data, error } = await supabase
      .from('bom_explosiones')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ explosion: data }, SIN_CACHE)
  }

  /* ── Una explosión completa (espacio de trabajo) ── */
  const id = params.get('id')
  if (id) {
    const { data: explosion, error } = await supabase
      .from('bom_explosiones')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!explosion) return NextResponse.json({ error: 'Explosión no encontrada.' }, { status: 404 })

    const [{ data: proyecto }, { data: partidas }, { data: detalles }] = await Promise.all([
      supabase.from('proyectos').select('id, codigo, nombre, cliente, referencia_sucursal, prioridad').eq('id', explosion.proyecto_id).maybeSingle(),
      supabase.from('partidas').select('id, clave, descripcion, cantidad, orden').eq('proyecto_id', explosion.proyecto_id).order('orden', { ascending: true }),
      supabase.from('bom_detalles').select('*').eq('explosion_id', id).order('orden', { ascending: true }),
    ])

    return NextResponse.json(
      { explosion: { ...explosion, proyecto, partidas: partidas ?? [], detalles: detalles ?? [] } },
      SIN_CACHE,
    )
  }

  /* ── Lista ── */
  const estadosFiltro = (params.get('estado') || '')
    .split(',')
    .filter(e => ESTADOS_VALIDOS.includes(e))

  let query = supabase
    .from('bom_explosiones')
    .select('*')
    .order('created_at', { ascending: false })
  if (estadosFiltro.length > 0) query = query.in('estado', estadosFiltro)

  const { data: explosiones, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const proyectoIds = [...new Set((explosiones ?? []).map(e => e.proyecto_id as string))]
  const explosionIds = (explosiones ?? []).map(e => e.id as string)
  const proyectos: Record<string, { codigo: string; nombre: string; sucursal: string | null; prioridad: string; progreso: number }> = {}
  const partidasPorProyecto: Record<string, number> = {}
  const materiales: Record<string, { total: number; checked: number }> = {}

  if (proyectoIds.length > 0) {
    const [{ data: proys }, { data: pts }, { data: dets }] = await Promise.all([
      supabase.from('proyectos').select('id, codigo, nombre, referencia_sucursal, prioridad, progreso').in('id', proyectoIds),
      supabase.from('partidas').select('proyecto_id').in('proyecto_id', proyectoIds),
      supabase.from('bom_detalles').select('explosion_id, checked').in('explosion_id', explosionIds),
    ])
    for (const p of proys ?? []) {
      proyectos[p.id] = { codigo: p.codigo, nombre: p.nombre, sucursal: p.referencia_sucursal, prioridad: p.prioridad, progreso: Number(p.progreso) || 0 }
    }
    for (const pt of pts ?? []) {
      partidasPorProyecto[pt.proyecto_id] = (partidasPorProyecto[pt.proyecto_id] || 0) + 1
    }
    for (const d of dets ?? []) {
      const c = (materiales[d.explosion_id] ??= { total: 0, checked: 0 })
      c.total++
      if (d.checked) c.checked++
    }
  }

  // Los pedidos terminados (100%, módulo Terminados) ya no necesitan explosión
  const resultado = (explosiones ?? []).filter(e => proyectos[e.proyecto_id] && proyectos[e.proyecto_id].progreso < 100).map(e => ({
    ...e,
    proyecto: proyectos[e.proyecto_id] || null,
    total_partidas: partidasPorProyecto[e.proyecto_id] || 0,
    detalles_count: materiales[e.id] || { total: 0, checked: 0 },
  }))

  return NextResponse.json({ explosiones: resultado }, SIN_CACHE)
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const proyectoId = body?.proyecto_id
  if (!proyectoId || typeof proyectoId !== 'string')
    return NextResponse.json({ error: 'Falta proyecto_id.' }, { status: 400 })

  const supabase = supabaseServidor()

  const { data: proy } = await supabase.from('proyectos').select('id').eq('id', proyectoId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })

  // Si ya tiene explosión, se devuelve la misma (no se duplica)
  const { data: existente } = await supabase.from('bom_explosiones').select('*').eq('proyecto_id', proyectoId).maybeSingle()
  if (existente) return NextResponse.json({ explosion: existente })

  const usuario = await obtenerUsuarioDeSesion()
  const { data, error } = await supabase
    .from('bom_explosiones')
    .insert({ proyecto_id: proyectoId, estado: 'pendiente', usuario_id: usuario.id || null, usuario_nombre: usuario.nombre })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ explosion: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string')
    return NextResponse.json({ error: 'Falta id de la explosión.' }, { status: 400 })

  const accion = body?.accion as string
  const supabase = supabaseServidor()
  const usuario = await obtenerUsuarioDeSesion()

  const { data: actual } = await supabase.from('bom_explosiones').select('*').eq('id', id).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Explosión no encontrada.' }, { status: 404 })

  let updateData: Record<string, unknown> = {}
  // Se registra en el Historial solo si la actualización se guarda
  let actividad: RegistroActividad | null = null

  switch (accion) {
    case 'iniciar': {
      if (actual.estado !== 'pendiente')
        return NextResponse.json({ error: 'Solo se puede iniciar una explosión pendiente.' }, { status: 400 })
      const bloqueos = motivosSinResolver(actual.checklist)
      if (bloqueos.length > 0)
        return NextResponse.json({ error: `No se puede iniciar: falta resolver ${bloqueos.length} motivo(s) del estatus.` }, { status: 400 })
      const ahora = new Date().toISOString()
      updateData = {
        estado: 'en_proceso',
        fecha_inicio: ahora,
        tramo_inicio: ahora,
        acumulado_seg: 0,
        checklist: { ...(actual.checklist ?? {}), pausas: 0 },
        usuario_id: usuario.id || null,
        usuario_nombre: usuario.nombre,
      }
      actividad = {
        tipo: 'bom_iniciado',
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        referenciaId: actual.proyecto_id,
        referenciaTipo: 'proyecto',
        detalle: { explosion_id: id },
      }
      break
    }

    case 'finalizar': {
      if (actual.estado !== 'en_proceso')
        return NextResponse.json({ error: 'Solo se puede terminar una explosión en proceso.' }, { status: 400 })

      // Las líneas que quedaron vacías (sin material ni descripción) se descartan
      await supabase.from('bom_detalles').delete().eq('explosion_id', id).eq('material', '').eq('descripcion', '')
      const { data: dets, error: errDets } = await supabase.from('bom_detalles').select('checked').eq('explosion_id', id)
      if (errDets) return NextResponse.json({ error: errDets.message }, { status: 500 })
      if (!dets?.length)
        return NextResponse.json({ error: 'Agrega al menos un material antes de terminar.' }, { status: 400 })
      const faltan = dets.filter(d => !d.checked).length
      if (faltan > 0)
        return NextResponse.json({ error: `Faltan ${faltan} material(es) por marcar.` }, { status: 400 })

      const ahora = new Date()
      const duracionSeg = segundosTrabajados(actual, ahora.getTime())
      updateData = {
        estado: 'completado',
        fecha_termino: ahora.toISOString(),
        duracion_seg: duracionSeg,
        acumulado_seg: duracionSeg,
        tramo_inicio: null,
      }
      actividad = {
        tipo: 'bom_completado',
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        referenciaId: actual.proyecto_id,
        referenciaTipo: 'proyecto',
        detalle: {
          explosion_id: id,
          duracion_seg: duracionSeg,
          pausas: pausasDe(actual.checklist),
          materiales: dets.length,
          fecha_inicio: actual.fecha_inicio,
          fecha_termino: ahora.toISOString(),
        },
      }
      break
    }

    case 'guardar_estatus': {
      if (actual.estado === 'completado')
        return NextResponse.json({ error: 'La explosión ya está terminada.' }, { status: 400 })
      const motivos = normalizarMotivos(body?.motivos, motivosDe(actual.checklist), usuario.nombre)
      if (!motivos) return NextResponse.json({ error: 'Motivos no válidos.' }, { status: 400 })
      updateData = {
        checklist: { ...(actual.checklist ?? {}), motivos },
        ...(typeof body?.notas === 'string' ? { notas: body.notas.slice(0, 4000) } : {}),
      }
      break
    }

    case 'pausar': {
      if (actual.estado !== 'en_proceso' || !actual.tramo_inicio)
        return NextResponse.json({ error: 'Solo se puede pausar una explosión que está corriendo.' }, { status: 400 })
      updateData = {
        acumulado_seg: segundosTrabajados(actual),
        tramo_inicio: null,
        checklist: { ...(actual.checklist ?? {}), pausas: pausasDe(actual.checklist) + 1 },
      }
      break
    }

    case 'reanudar': {
      if (actual.estado !== 'en_proceso' || actual.tramo_inicio)
        return NextResponse.json({ error: 'Solo se puede reanudar una explosión en pausa.' }, { status: 400 })
      updateData = { tramo_inicio: new Date().toISOString() }
      break
    }

    case 'reiniciar': {
      // 00:00:00 detenido, como si no hubiera empezado; sigue en proceso y conserva la fecha de inicio
      // y los materiales. Con "Reanudar" vuelve a correr.
      if (actual.estado !== 'en_proceso')
        return NextResponse.json({ error: 'Solo se puede reiniciar el tiempo de una explosión en proceso.' }, { status: 400 })
      updateData = {
        acumulado_seg: 0,
        tramo_inicio: null,
        duracion_seg: 0,
        checklist: { ...(actual.checklist ?? {}), pausas: 0 },
      }
      break
    }

    case 'cancelar': {
      // Por si se dio "Iniciar" por accidente: regresa a pendiente sin fechas ni tiempos
      if (actual.estado !== 'en_proceso' && actual.estado !== 'completado')
        return NextResponse.json({ error: 'La explosión todavía no se ha iniciado.' }, { status: 400 })
      updateData = {
        estado: 'pendiente',
        fecha_inicio: null,
        fecha_termino: null,
        tramo_inicio: null,
        acumulado_seg: 0,
        duracion_seg: 0,
        checklist: { ...(actual.checklist ?? {}), pausas: 0 },
      }
      break
    }

    case 'editar_tiempo': {
      // Corrige el cronómetro a mano; si estaba corriendo sigue corriendo desde el valor nuevo
      if (actual.estado !== 'en_proceso')
        return NextResponse.json({ error: 'Solo se puede editar el tiempo de una explosión en proceso.' }, { status: 400 })
      const segundos = Number(body?.segundos)
      if (!Number.isInteger(segundos) || segundos < 0 || segundos > 999 * 3600)
        return NextResponse.json({ error: 'Tiempo no válido.' }, { status: 400 })
      updateData = {
        acumulado_seg: segundos,
        tramo_inicio: actual.tramo_inicio ? new Date().toISOString() : null,
      }
      break
    }

    case 'reabrir': {
      // Vuelve a "en_proceso" para corregir; el cronómetro sigue desde el tiempo que llevaba
      if (actual.estado !== 'completado')
        return NextResponse.json({ error: 'Solo se puede reabrir una explosión completada.' }, { status: 400 })
      updateData = {
        estado: 'en_proceso',
        fecha_termino: null,
        acumulado_seg: actual.duracion_seg || 0,
        tramo_inicio: new Date().toISOString(),
      }
      break
    }

    default:
      return NextResponse.json({ error: `Acción no válida: ${accion}` }, { status: 400 })
  }

  const { data, error } = await supabase.from('bom_explosiones').update(updateData).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (actividad) await registrarActividad(actividad)

  return NextResponse.json({ explosion: data })
}
