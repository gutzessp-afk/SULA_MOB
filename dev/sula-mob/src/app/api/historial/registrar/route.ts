/**
 * /api/historial/registrar/route.ts
 * ─────────────────────────────────
 * Registra en el historial lo que pasa en el navegador sin tocar las APIs que lo hacen
 * (ej. un plano analizado con /api/analizar-plano, un pedido creado desde la página Proyectos).
 *
 *   POST { tipo, referenciaId?, referenciaTipo?, detalle? }
 *
 * Solo los tipos que nacen en el navegador: entradas, salidas, pedidos completados y
 * migraciones se registran en el servidor y no se pueden inventar desde aquí.
 * Solo administradores.
 *
 * RUTA: src/app/api/historial/registrar/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin } from '@/lib/admin-api'
import { registrarActividad, obtenerUsuarioDeSesion, type TipoActividad } from '@/lib/registrar-actividad'

const TIPOS_NAVEGADOR: TipoActividad[] = ['pedido_creado', 'plano_analizado', 'despiece_generado']

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const tipo = body?.tipo as TipoActividad
  if (!TIPOS_NAVEGADOR.includes(tipo)) return NextResponse.json({ error: `Tipo no válido: ${String(body?.tipo)}` }, { status: 400 })

  const detalle = body.detalle && typeof body.detalle === 'object' && !Array.isArray(body.detalle) ? body.detalle : {}
  if (JSON.stringify(detalle).length > 4000) return NextResponse.json({ error: 'El detalle es demasiado grande.' }, { status: 400 })

  const usuario = await obtenerUsuarioDeSesion()
  await registrarActividad({
    tipo,
    usuarioId: usuario.id,
    usuarioNombre: usuario.nombre,
    referenciaId: typeof body.referenciaId === 'string' ? body.referenciaId.slice(0, 200) : undefined,
    referenciaTipo: body.referenciaTipo === 'proyecto' || body.referenciaTipo === 'plano' ? body.referenciaTipo : undefined,
    detalle,
  })
  return NextResponse.json({ ok: true })
}
