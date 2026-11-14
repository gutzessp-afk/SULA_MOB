/**
 * /api/bom/revisiones/lineas/route.ts
 * ───────────────────────────────────
 * Materiales de la revisión editable (tabla bom_revision_lineas).
 *
 *   POST   { explosion_id, unidad?, ...campos }      → agrega una línea al final
 *   PATCH  { explosion_id, linea_id, ...campos }     → cambia clave, descripcion, unidad, clasificacion,
 *                                                      moneda, costo, cantidad u orden
 *   DELETE ?explosion_id=UUID&linea_id=UUID          → quita una línea
 *
 * Todas escriben en la revisión editable (src/lib/explosion-servidor.ts → revisionEditable): si la
 * última revisión está cerrada, aquí se crea la siguiente (REV-01…) y el cambio va a la copia.
 * La respuesta trae `creada: true` en ese caso para que la página recargue.
 * OC y Compra todavía no se editan (se definen después).
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/bom/revisiones/lineas/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { obtenerUsuarioDeSesion } from '@/lib/registrar-actividad'
import { bloqueoEdicion, errorJson, leerExplosion, lineaEnRevision, revisionEditable } from '@/lib/explosion-servidor'

/** Campos editables que vienen en el body, ya validados */
function camposDe(body: Record<string, unknown>): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  const textoMax = (k: string, max: number) => { if (typeof body[k] === 'string') c[k] = (body[k] as string).slice(0, max) }
  textoMax('clave', 100)
  textoMax('descripcion', 1000)
  textoMax('unidad', 30)
  textoMax('clasificacion', 50)
  textoMax('moneda', 40)
  for (const k of ['costo', 'cantidad']) {
    const n = body[k]
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9) c[k] = Math.round(n * 10000) / 10000
  }
  if (typeof body.orden === 'number' && Number.isInteger(body.orden)) c.orden = body.orden
  return c
}

/** Explosión editable + revisión donde escribir; o la respuesta de error */
async function preparar(explosionId: unknown) {
  if (!explosionId || typeof explosionId !== 'string') return { error: errorJson('Falta explosion_id.', 400) }
  const supabase = supabaseServidor()
  const explosion = await leerExplosion(supabase, explosionId)
  const bloqueo = bloqueoEdicion(explosion)
  if (bloqueo) return { error: bloqueo }
  const usuario = await obtenerUsuarioDeSesion()
  const r = await revisionEditable(supabase, explosion!, usuario.nombre)
  if ('error' in r) return { error: r.error }
  return { supabase, explosion: explosion!, revision: r.revision, creada: r.creada }
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const body = await request.json().catch(() => null)
  const p = await preparar(body?.explosion_id)
  if ('error' in p) return p.error

  const { data: ultimo } = await p.supabase
    .from('bom_revision_lineas')
    .select('orden')
    .eq('revision_id', p.revision.id)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await p.supabase
    .from('bom_revision_lineas')
    .insert({
      unidad: 'Pieza',
      moneda: 'Peso Mexicano',
      ...camposDe(body ?? {}),
      revision_id: p.revision.id,
      explosion_id: p.explosion.id,
      origen_id: null,
      orden: (ultimo?.orden ?? -1) + 1,
    })
    .select()
    .single()
  if (error) return errorJson(error.message, 500)
  return NextResponse.json({ linea: data, creada: p.creada })
}

export async function PATCH(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const body = await request.json().catch(() => null)
  const lineaId = body?.linea_id
  if (!lineaId || typeof lineaId !== 'string') return errorJson('Falta linea_id.', 400)
  const campos = camposDe(body ?? {})
  if (!Object.keys(campos).length) return errorJson('No hay campos para actualizar.', 400)

  const p = await preparar(body?.explosion_id)
  if ('error' in p) return p.error

  const linea = await lineaEnRevision(p.supabase, p.revision.id, lineaId)
  if (!linea) return errorJson('Ese material ya no está en la revisión actual. Recarga la página.', 409)

  const { data, error } = await p.supabase.from('bom_revision_lineas').update(campos).eq('id', linea.id).select().single()
  if (error) return errorJson(error.message, 500)
  return NextResponse.json({ linea: data, creada: p.creada })
}

export async function DELETE(request: NextRequest) {
  if (!(await esAdmin())) return errorJson('Solo administradores.', 403)
  const params = request.nextUrl.searchParams
  const lineaId = params.get('linea_id')
  if (!lineaId) return errorJson('Falta linea_id.', 400)

  const p = await preparar(params.get('explosion_id'))
  if ('error' in p) return p.error

  const linea = await lineaEnRevision(p.supabase, p.revision.id, lineaId)
  if (!linea) return NextResponse.json({ ok: true, creada: p.creada })

  const { error } = await p.supabase.from('bom_revision_lineas').delete().eq('id', linea.id)
  if (error) return errorJson(error.message, 500)
  return NextResponse.json({ ok: true, creada: p.creada })
}
