/**
 * /api/plano-versiones/route.ts
 * ─────────────────────────────
 * Historial de versiones del despiece de una clave (tabla plano_versiones).
 *
 *   GET  ?clave=X               → { versiones: [...] } de la más nueva a la más vieja (sin el BOM)
 *   GET  ?clave=X&version=N     → { version: {..., bom_snapshot} } para restaurarla
 *   POST { clave, bom, descripcion? } → guarda el despiece corregido a mano como versión nueva
 *        y lo deja como plantilla vigente. Respuesta: { ok, version, cambios }
 *
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/plano-versiones/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { esBOM } from '@/lib/validar-bom'
import { faltaEsquema, registrarVersion } from '@/lib/versiones-plano'
import type { BomSource, PlantillaBOM } from '@/lib/types'

const noAutorizado = () => NextResponse.json({ error: 'Solo los administradores pueden ver el historial de planos.' }, { status: 403 })
const sinTabla = () => NextResponse.json({ error: 'Falta correr sql/plano_versiones.sql en Supabase.' }, { status: 503 })

export async function GET(request: NextRequest) {
  if (!(await esAdmin())) return noAutorizado()
  const params = request.nextUrl.searchParams
  const clave = params.get('clave')?.trim()
  if (!clave) return NextResponse.json({ error: 'Falta la clave.' }, { status: 400 })
  const supabase = supabaseServidor()

  const version = Number(params.get('version'))
  if (version) {
    const { data, error } = await supabase.from('plano_versiones').select('*').eq('clave', clave).eq('version', version).maybeSingle()
    if (faltaEsquema(error)) return sinTabla()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: `No existe la versión ${version} de ${clave}.` }, { status: 404 })
    return NextResponse.json({ ok: true, version: data })
  }

  const { data, error } = await supabase
    .from('plano_versiones')
    .select('version, created_at, archivo_nombre, analizado_por, cambios')
    .eq('clave', clave)
    .order('version', { ascending: false })
  if (faltaEsquema(error)) return sinTabla()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, versiones: data ?? [] })
}

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return noAutorizado()
  const body = await request.json().catch(() => null)
  const clave = typeof body?.clave === 'string' ? body.clave.trim() : ''
  if (!clave) return NextResponse.json({ error: 'Falta la clave.' }, { status: 400 })
  if (!esBOM(body?.bom)) return NextResponse.json({ error: 'El despiece no tiene el formato esperado.' }, { status: 400 })
  const bom = body.bom as PlantillaBOM
  const supabase = supabaseServidor()

  const { data: previa, error: errLeer } = await supabase.from('plantilla_despiece').select('bom, plano_nombre, source').eq('clave', clave).maybeSingle()
  if (errLeer) return NextResponse.json({ error: errLeer.message }, { status: 500 })

  try {
    // La versión se registra antes de tocar la plantilla: si no hay tabla, no se cambia nada
    const registro = await registrarVersion(supabase, {
      clave, bom, archivo_nombre: null, archivo_hash: null, analizado_por: 'manual',
      previoSinHistorial: previa ? { bom: previa.bom as PlantillaBOM, archivo_nombre: previa.plano_nombre as string | null, analizado_por: (previa.source as BomSource | null) ?? 'ia' } : null,
    })
    if (!registro) return sinTabla()

    const cambios = { bom, editado_manualmente: true, version_actual: registro.version, updated_at: new Date().toISOString() }
    const { error } = previa
      ? await supabase.from('plantilla_despiece').update(cambios).eq('clave', clave)
      : await supabase.from('plantilla_despiece').insert({
          ...cambios, clave, clave_completa: bom.modelo || clave,
          descripcion: bom.descripcion || String(body?.descripcion ?? '').slice(0, 300) || null, linea: bom.linea || null, source: 'manual',
        })
    if (error) throw new Error('Se guardó la versión, pero no se pudo actualizar la plantilla: ' + error.message)
    return NextResponse.json({ ok: true, version: registro.version, cambios: registro.cambios })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo guardar.' }, { status: 500 })
  }
}
