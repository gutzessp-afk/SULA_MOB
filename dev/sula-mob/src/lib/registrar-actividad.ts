/**
 * registrar-actividad.ts
 * ──────────────────────
 * Registra eventos en la tabla activity_log (página Historial, /admin/despiece/historial):
 * entradas y salidas, pedidos creados y completados, planos analizados o actualizados.
 * Solo en el servidor.
 *
 * Nunca interrumpe a quien lo llama: si el registro falla, solo se anota en consola.
 *
 * RUTA: src/lib/registrar-actividad.ts
 */

import { cookies } from 'next/headers'
import { supabaseServidor } from '@/lib/admin-api'

export const TIPOS_ACTIVIDAD = [
  'login', 'logout', 'pedido_creado', 'pedido_completado',
  'plano_analizado', 'plano_actualizado', 'despiece_generado',
] as const

export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number]

export interface RegistroActividad {
  tipo: TipoActividad
  usuarioId?: string
  usuarioNombre?: string
  referenciaId?: string
  referenciaTipo?: 'proyecto' | 'plano'
  detalle?: Record<string, unknown>
}

export async function registrarActividad(registro: RegistroActividad) {
  try {
    const { error } = await supabaseServidor().from('activity_log').insert({
      tipo: registro.tipo,
      usuario_id: registro.usuarioId || null,
      usuario_nombre: registro.usuarioNombre || 'Sistema',
      referencia_id: registro.referenciaId || null,
      referencia_tipo: registro.referenciaTipo || null,
      detalle: registro.detalle || {},
    })
    if (error) console.error('[registrarActividad]', registro.tipo, error.message)
  } catch (err) {
    console.error('[registrarActividad]', registro.tipo, err)
  }
}

/** Usuario de la cookie de sesión. Los admins de Supabase Auth no traen nombre: se usa su correo */
export async function obtenerUsuarioDeSesion(): Promise<{ id: string; nombre: string }> {
  try {
    const s = JSON.parse((await cookies()).get('sula_session')?.value || '{}')
    return { id: s.id || '', nombre: s.nombre || s.username || s.correo || 'Admin' }
  } catch {
    return { id: '', nombre: 'Admin' }
  }
}
