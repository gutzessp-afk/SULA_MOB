/**
 * /api/push — suscripción a las notificaciones push del administrador
 *   POST   { endpoint, keys: { p256dh, auth } }  guarda (o actualiza) este dispositivo
 *   DELETE { endpoint }                          deja de enviarle notificaciones
 *   PATCH  { endpoint }                          le manda una notificación de prueba
 * Solo administradores.
 *
 * RUTA: src/app/api/push/route.ts
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { enviarPrueba } from '@/lib/push'

async function idSesion(): Promise<string | null> {
  try {
    return JSON.parse((await cookies()).get('sula_session')?.value ?? '')?.id ?? null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })
  const cuerpo = await request.json().catch(() => null)
  const endpoint = cuerpo?.endpoint
  const p256dh = cuerpo?.keys?.p256dh
  const auth = cuerpo?.keys?.auth
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'Suscripción inválida.' }, { status: 400 })
  }

  const { error } = await supabaseServidor()
    .from('push_suscripciones')
    .upsert(
      { endpoint, p256dh, auth, usuario_id: (await idSesion()) ?? 'admin', dispositivo: request.headers.get('user-agent')?.slice(0, 200) ?? null },
      { onConflict: 'endpoint' },
    )
  if (error) {
    const falta = /push_suscripciones/.test(error.message) && /(does not exist|schema cache)/.test(error.message)
    return NextResponse.json({ error: falta ? 'Falta crear la tabla: corre sql/push_suscripciones.sql en Supabase.' : error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })
  const endpoint = (await request.json().catch(() => null))?.endpoint
  if (typeof endpoint !== 'string') return NextResponse.json({ error: 'Falta el endpoint.' }, { status: 400 })
  await supabaseServidor().from('push_suscripciones').delete().eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  if (!(await esAdmin())) return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 })
  const endpoint = (await request.json().catch(() => null))?.endpoint
  if (typeof endpoint !== 'string') return NextResponse.json({ error: 'Falta el endpoint.' }, { status: 400 })
  // Solo a una suscripción ya guardada (no a cualquier dirección que manden)
  const { data } = await supabaseServidor().from('push_suscripciones').select('endpoint, p256dh, auth').eq('endpoint', endpoint).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Este dispositivo no está suscrito. Activa las notificaciones primero.' }, { status: 404 })
  const error = await enviarPrueba(data)
  return error ? NextResponse.json({ error }, { status: 500 }) : NextResponse.json({ ok: true })
}
