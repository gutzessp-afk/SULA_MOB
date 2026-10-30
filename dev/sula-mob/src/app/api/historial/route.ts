/**
 * /api/historial/route.ts
 * ───────────────────────
 * Historial de actividad del sistema (tabla activity_log, src/lib/registrar-actividad.ts).
 *
 *   GET ?tipo=login,logout     uno o varios tipos separados por coma
 *       &desde=AAAA-MM-DD      &hasta=AAAA-MM-DD (días completos, hora de México)
 *       &usuario=texto         busca en el nombre de quien lo hizo
 *       &limite=50&pagina=1
 *   → { registros, total, pagina, limite, totalPaginas }
 *
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/historial/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { TIPOS_ACTIVIDAD } from '@/lib/registrar-actividad'

/** México no tiene horario de verano desde 2022 */
const OFFSET_MEXICO = '-06:00'
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export interface RegistroHistorial {
  id: string
  tipo: string
  usuario_id: string | null
  usuario_nombre: string | null
  referencia_id: string | null
  referencia_tipo: string | null
  detalle: Record<string, unknown> | null
  created_at: string
}

export async function GET(request: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo los administradores pueden ver el historial.' }, { status: 403 })

  const params = request.nextUrl.searchParams
  const tipos = (params.get('tipo') || '').split(',').filter((t) => (TIPOS_ACTIVIDAD as readonly string[]).includes(t))
  const desde = params.get('desde') || ''
  const hasta = params.get('hasta') || ''
  const usuario = (params.get('usuario') || '').trim().replace(/[%,()]/g, '')
  const limite = Math.min(Math.max(Number(params.get('limite')) || 50, 1), 200)
  const pagina = Math.max(Number(params.get('pagina')) || 1, 1)

  let query = supabaseServidor()
    .from('activity_log')
    .select('id, tipo, usuario_id, usuario_nombre, referencia_id, referencia_tipo, detalle, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (tipos.length) query = query.in('tipo', tipos)
  if (FECHA.test(desde)) query = query.gte('created_at', `${desde}T00:00:00${OFFSET_MEXICO}`)
  if (FECHA.test(hasta)) query = query.lte('created_at', `${hasta}T23:59:59.999${OFFSET_MEXICO}`)
  if (usuario) query = query.ilike('usuario_nombre', `%${usuario}%`)

  const offset = (pagina - 1) * limite
  const { data, error, count } = await query.range(offset, offset + limite - 1)
  if (error) return NextResponse.json({ error: 'No se pudo leer el historial: ' + error.message }, { status: 500 })

  const total = count ?? 0
  return NextResponse.json(
    { registros: (data ?? []) as RegistroHistorial[], total, pagina, limite, totalPaginas: Math.max(1, Math.ceil(total / limite)) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
