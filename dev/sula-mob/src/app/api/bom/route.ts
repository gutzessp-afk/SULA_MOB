/**
 * /api/bom/route.ts
 * ─────────────────
 * CRUD de explosiones de material (tabla bom_explosiones).
 *
 *   GET    /api/bom                        → lista todas con datos del proyecto
 *   GET    /api/bom?estado=pendiente       → filtro por estado (coma-separados)
 *   GET    /api/bom?proyecto_id=UUID       → una explosión específica por proyecto
 *   POST   /api/bom  { proyecto_id }       → crea explosión en estado 'pendiente'
 *   PATCH  /api/bom  { id, accion, ... }   → actualiza estado/tiempos/checklist
 *
 * Acciones de PATCH: iniciar, finalizar, verificar, reabrir, actualizar_checklist,
 * actualizar_notas. Iniciar y finalizar se registran en el Historial (activity_log).
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { registrarActividad, obtenerUsuarioDeSesion, type RegistroActividad } from '@/lib/registrar-actividad'

const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'completado', 'verificado']

export async function GET(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const supabase = supabaseServidor()
  const params = request.nextUrl.searchParams

  // Por proyecto específico
  const proyectoId = params.get('proyecto_id')
  if (proyectoId) {
    const { data, error } = await supabase
      .from('bom_explosiones')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ explosion: data }, { headers: { 'Cache-Control': 'no-store' } })
  }

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

  // Join manual con proyectos y conteo de partidas
  const proyectoIds = [...new Set((explosiones ?? []).map(e => e.proyecto_id as string))]
  const proyectos: Record<string, { codigo: string; nombre: string; cliente: string | null; prioridad: string }> = {}
  const partidasPorProyecto: Record<string, number> = {}

  if (proyectoIds.length > 0) {
    const [{ data: proys }, { data: pts }] = await Promise.all([
      supabase.from('proyectos').select('id, codigo, nombre, cliente, prioridad').in('id', proyectoIds),
      supabase.from('partidas').select('proyecto_id').in('proyecto_id', proyectoIds),
    ])
    for (const p of proys ?? []) {
      proyectos[p.id] = { codigo: p.codigo, nombre: p.nombre, cliente: p.cliente, prioridad: p.prioridad }
    }
    for (const pt of pts ?? []) {
      partidasPorProyecto[pt.proyecto_id] = (partidasPorProyecto[pt.proyecto_id] || 0) + 1
    }
  }

  const resultado = (explosiones ?? []).map(e => ({
    ...e,
    proyecto: proyectos[e.proyecto_id] || null,
    total_partidas: partidasPorProyecto[e.proyecto_id] || 0,
  }))

  return NextResponse.json({ explosiones: resultado }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const proyectoId = body?.proyecto_id
  if (!proyectoId || typeof proyectoId !== 'string')
    return NextResponse.json({ error: 'Falta proyecto_id.' }, { status: 400 })

  const supabase = supabaseServidor()

  const { data: proy } = await supabase
    .from('proyectos')
    .select('id')
    .eq('id', proyectoId)
    .maybeSingle()
  if (!proy)
    return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })

  const { data: existente } = await supabase
    .from('bom_explosiones')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .maybeSingle()
  if (existente)
    return NextResponse.json({ error: 'Este proyecto ya tiene una explosión de material.' }, { status: 409 })

  const usuario = await obtenerUsuarioDeSesion()

  const { data, error } = await supabase
    .from('bom_explosiones')
    .insert({
      proyecto_id: proyectoId,
      estado: 'pendiente',
      usuario_id: usuario.id || null,
      usuario_nombre: usuario.nombre,
    })
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

  const { data: actual } = await supabase
    .from('bom_explosiones')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!actual)
    return NextResponse.json({ error: 'Explosión no encontrada.' }, { status: 404 })

  let updateData: Record<string, unknown> = {}
  // Se registra en el Historial solo si la actualización se guarda
  let actividad: RegistroActividad | null = null

  switch (accion) {
    case 'iniciar': {
      if (actual.estado !== 'pendiente')
        return NextResponse.json({ error: 'Solo se puede iniciar una explosión pendiente.' }, { status: 400 })

      updateData = {
        estado: 'en_proceso',
        fecha_inicio: new Date().toISOString(),
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
        return NextResponse.json({ error: 'Solo se puede finalizar una explosión en proceso.' }, { status: 400 })

      const ahora = new Date()
      const inicio = actual.fecha_inicio ? new Date(actual.fecha_inicio) : ahora
      const duracionSeg = Math.max(0, Math.round((ahora.getTime() - inicio.getTime()) / 1000))

      updateData = {
        estado: 'completado',
        fecha_termino: ahora.toISOString(),
        duracion_seg: duracionSeg,
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
          fecha_inicio: actual.fecha_inicio,
          fecha_termino: ahora.toISOString(),
        },
      }
      break
    }

    case 'verificar': {
      if (actual.estado !== 'completado')
        return NextResponse.json({ error: 'Solo se puede verificar una explosión completada.' }, { status: 400 })
      updateData = { estado: 'verificado' }
      break
    }

    case 'actualizar_checklist': {
      const checklist = body?.checklist
      if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist))
        return NextResponse.json({ error: 'Falta checklist.' }, { status: 400 })
      if (actual.estado === 'verificado')
        return NextResponse.json({ error: 'La explosión ya está verificada.' }, { status: 400 })
      updateData = { checklist }
      break
    }

    case 'actualizar_notas': {
      updateData = { notas: typeof body?.notas === 'string' ? body.notas : '' }
      break
    }

    case 'reabrir': {
      // Vuelve a "en_proceso" para corregir; el cronómetro sigue desde la fecha_inicio original
      if (actual.estado !== 'completado')
        return NextResponse.json({ error: 'Solo se puede reabrir una explosión completada.' }, { status: 400 })
      updateData = { estado: 'en_proceso', fecha_termino: null, duracion_seg: 0 }
      break
    }

    default:
      return NextResponse.json({ error: `Acción no válida: ${accion}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bom_explosiones')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (actividad) await registrarActividad(actividad)

  return NextResponse.json({ explosion: data })
}
