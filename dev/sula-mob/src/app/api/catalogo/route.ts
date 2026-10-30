/**
 * /api/catalogo/route.ts
 * ──────────────────────
 * Catálogo de planos (/admin/catalogo): todos los PDF de la carpeta PLANOS de Google Drive,
 * leídos directo de Drive (sin copiarlos), cada uno con su clave y, si ya se analizó,
 * su despiece guardado (plantilla_despiece) para bajar la Matriz de Corte sin IA.
 *
 *   GET              → { planos: [...], correo }
 *   GET ?refrescar=1 → igual, volviendo a leer el Drive (si no, se usa la lista de hace < 5 min)
 *
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/catalogo/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { claveDeNombre, correoCuentaServicio, planosDrive } from '@/lib/google-drive'

export const maxDuration = 60

export interface PlanoCatalogo {
  id: string
  nombre: string
  /** Carpeta dentro de PLANOS, ej. "VENTO" o "KFC/SILLAS" */
  carpeta: string
  clave: string | null
  bytes: number
  modificado: string
  /** Despiece guardado de esa clave (null = todavía no se analiza) */
  despiece: { descripcion: string | null; linea: string | null; actualizado: string } | null
}

export async function GET(request: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo los administradores pueden ver el catálogo.' }, { status: 403 })
  const refrescar = request.nextUrl.searchParams.get('refrescar') === '1'

  try {
    const [archivos, plantillasRes] = await Promise.all([
      planosDrive(refrescar),
      supabaseServidor().from('plantilla_despiece').select('clave, descripcion, linea, created_at, updated_at'),
    ])
    if (plantillasRes.error) throw new Error('No se pudieron leer los despieces guardados: ' + plantillasRes.error.message)
    const despieces = new Map((plantillasRes.data ?? []).map(p => [p.clave as string, p]))

    const planos: PlanoCatalogo[] = archivos.map(a => {
      const clave = claveDeNombre(a.nombre)
      const p = clave ? despieces.get(clave) : undefined
      return {
        id: a.id,
        nombre: a.nombre,
        carpeta: a.carpeta,
        clave,
        bytes: a.bytes,
        modificado: a.modificado,
        despiece: p ? { descripcion: p.descripcion as string | null, linea: p.linea as string | null, actualizado: (p.updated_at || p.created_at) as string } : null,
      }
    })
    return NextResponse.json({ planos, correo: correoCuentaServicio() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[catalogo]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo leer el Drive.', correo: correoCuentaServicio() }, { status: 500 })
  }
}
