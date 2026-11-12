/**
 * /api/bom/detalles/route.ts
 * ──────────────────────────
 * Líneas de material de una explosión (tabla bom_detalles).
 *
 *   GET    ?explosion_id=UUID            → lista las líneas de una explosión
 *   POST   { explosion_id, partida_id, ...campos } → agrega una línea (partida_id null = material general)
 *   PATCH  { id, ...campos }             → actualiza partida_id, clave (propia), material, descripcion, cantidad, unidad, checked u orden
 *   DELETE ?id=UUID                      → elimina una línea
 *
 * Solo se puede escribir mientras la explosión está 'en_proceso' (una completada se
 * reabre con "Editar" en /api/bom).
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/detalles/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'

type Supabase = ReturnType<typeof supabaseServidor>

/** Mensaje de error si la explosión no admite cambios; null si se puede editar */
async function bloqueoEdicion(supabase: Supabase, explosionId: string): Promise<NextResponse | null> {
  const { data } = await supabase.from('bom_explosiones').select('estado').eq('id', explosionId).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Explosión no encontrada.' }, { status: 404 })
  if (data.estado !== 'en_proceso')
    return NextResponse.json({ error: 'La explosión no está en proceso: iníciala o da clic en "Editar".' }, { status: 409 })
  return null
}

/** explosion_id de una línea, o null si no existe */
async function explosionDeLinea(supabase: Supabase, id: string): Promise<string | null> {
  const { data } = await supabase.from('bom_detalles').select('explosion_id').eq('id', id).maybeSingle()
  return data?.explosion_id ?? null
}

/** Campos editables que vienen en el body, ya validados */
function camposDe(body: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {}
  if (typeof body.material === 'string') campos.material = body.material.slice(0, 500)
  if (typeof body.descripcion === 'string') campos.descripcion = body.descripcion.slice(0, 1000)
  if (typeof body.cantidad === 'number' && Number.isFinite(body.cantidad)) campos.cantidad = body.cantidad
  if (typeof body.unidad === 'string') campos.unidad = body.unidad.slice(0, 30)
  if (typeof body.checked === 'boolean') campos.checked = body.checked
  if (typeof body.orden === 'number' && Number.isInteger(body.orden)) campos.orden = body.orden
  if (body.partida_id === null || typeof body.partida_id === 'string') campos.partida_id = body.partida_id
  if (typeof body.clave === 'string') campos.clave = body.clave.slice(0, 100)
  return campos
}

export async function GET(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const explosionId = request.nextUrl.searchParams.get('explosion_id')
  if (!explosionId) return NextResponse.json({ error: 'Falta explosion_id.' }, { status: 400 })

  const { data, error } = await supabaseServidor()
    .from('bom_detalles')
    .select('*')
    .eq('explosion_id', explosionId)
    .order('orden', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ detalles: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const explosionId = body?.explosion_id
  const partidaId: string | null = typeof body?.partida_id === 'string' ? body.partida_id : null
  if (!explosionId || typeof explosionId !== 'string')
    return NextResponse.json({ error: 'Falta explosion_id.' }, { status: 400 })

  const supabase = supabaseServidor()
  const bloqueo = await bloqueoEdicion(supabase, explosionId)
  if (bloqueo) return bloqueo

  // Siguiente orden dentro de la partida
  let ultimoQuery = supabase
    .from('bom_detalles')
    .select('orden')
    .eq('explosion_id', explosionId)
    .order('orden', { ascending: false })
    .limit(1)
  ultimoQuery = partidaId ? ultimoQuery.eq('partida_id', partidaId) : ultimoQuery.is('partida_id', null)
  const { data: ultimo } = await ultimoQuery.maybeSingle()

  const { data, error } = await supabase
    .from('bom_detalles')
    .insert({
      explosion_id: explosionId,
      material: '',
      descripcion: '',
      cantidad: 0,
      unidad: 'pza',
      checked: false,
      orden: (ultimo?.orden ?? -1) + 1,
      ...camposDe(body),
      partida_id: partidaId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ detalle: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Falta id.' }, { status: 400 })

  const campos = camposDe(body)

  if (Object.keys(campos).length === 0)
    return NextResponse.json({ error: 'No hay campos para actualizar.' }, { status: 400 })

  const supabase = supabaseServidor()
  const explosionId = await explosionDeLinea(supabase, id)
  if (!explosionId) return NextResponse.json({ error: 'Línea no encontrada.' }, { status: 404 })
  const bloqueo = await bloqueoEdicion(supabase, explosionId)
  if (bloqueo) return bloqueo

  const { data, error } = await supabase.from('bom_detalles').update(campos).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ detalle: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await esAdmin()))
    return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id.' }, { status: 400 })

  const supabase = supabaseServidor()
  const explosionId = await explosionDeLinea(supabase, id)
  if (!explosionId) return NextResponse.json({ ok: true })
  const bloqueo = await bloqueoEdicion(supabase, explosionId)
  if (bloqueo) return bloqueo

  const { error } = await supabase.from('bom_detalles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
