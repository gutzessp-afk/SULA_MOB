/**
 * /api/plantilla-despiece/route.ts
 * ────────────────────────────────
 * Consulta y borrado de las plantillas de BOM (tabla plantilla_despiece).
 *
 *   GET    /api/plantilla-despiece                  → lista todas (sin el bom)
 *   GET    /api/plantilla-despiece?clave=X          → una plantilla completa con su bom
 *   GET    /api/plantilla-despiece?claves=X,Y       → { existentes: { X: true, Y: false } }
 *   GET    /api/plantilla-despiece?claves=X,Y&detalle=1 → { plantillas: { X: {...con bom} } }
 *   DELETE /api/plantilla-despiece?clave=X          → elimina esa plantilla
 *
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/plantilla-despiece/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'

const noAutorizado = () =>
  NextResponse.json({ error: 'Solo los administradores pueden consultar las plantillas.' }, { status: 403 })

export async function GET(request: NextRequest) {
  if (!(await esAdmin())) return noAutorizado()
  const supabase = supabaseServidor()
  const params = request.nextUrl.searchParams

  // Varias claves → qué claves ya tienen plantilla
  const claves = params.get('claves')
  if (claves !== null) {
    const lista = [...new Set(claves.split(',').map(c => c.trim()).filter(Boolean))].slice(0, 300)

    // Con detalle=1 se devuelven además los BOM completos (para la página de detalle del proyecto)
    if (params.get('detalle') === '1') {
      const plantillas: Record<string, unknown> = {}
      if (lista.length > 0) {
        const { data, error } = await supabase.from('plantilla_despiece').select('*').in('clave', lista)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        for (const fila of data ?? []) plantillas[fila.clave as string] = fila
      }
      return NextResponse.json({ plantillas })
    }

    const existentes: Record<string, boolean> = Object.fromEntries(lista.map(c => [c, false]))
    if (lista.length > 0) {
      const { data, error } = await supabase.from('plantilla_despiece').select('clave').in('clave', lista)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      for (const fila of data ?? []) existentes[fila.clave as string] = true
    }
    return NextResponse.json({ existentes })
  }

  // Una clave → plantilla completa
  const clave = params.get('clave')
  if (clave) {
    const { data, error } = await supabase.from('plantilla_despiece').select('*').eq('clave', clave).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: `No hay plantilla para la clave ${clave}.` }, { status: 404 })
    return NextResponse.json({ plantilla: data })
  }

  // Sin parámetros → todas, sin el bom (que es pesado)
  const { data, error } = await supabase
    .from('plantilla_despiece')
    .select('id, clave, clave_completa, descripcion, linea, plano_nombre, created_at, updated_at')
    .order('clave')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plantillas: data ?? [] })
}

export async function DELETE(request: NextRequest) {
  if (!(await esAdmin())) return noAutorizado()
  const clave = request.nextUrl.searchParams.get('clave')
  if (!clave) return NextResponse.json({ error: 'Falta la clave.' }, { status: 400 })

  const { error } = await supabaseServidor().from('plantilla_despiece').delete().eq('clave', clave)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
