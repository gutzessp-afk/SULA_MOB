/**
 * notificar-erp.ts
 * ────────────────
 * Avisos de la explosión entre perfiles (campana de /erp, src/components/erp/CampanaErp.tsx):
 *   · Finanzas pone una partida en PARCIALMENTE PAGADO / PAGADO → avisa a almacén
 *   · Almacén pone PARCIALMENTE RECIBIDO / RECIBIDO             → avisa a compras y finanzas
 * avisarRol() inserta una fila en `notificaciones` para cada usuario ACTIVO con ese rol y, después de
 * responder, manda push a los que tengan suscripción. Solo servidor.
 *
 * No lanza errores: devuelve { avisados, error } para que quien llama decida qué mostrar
 * (el cambio de estado ya quedó guardado; si el aviso falla se dice, no se oculta).
 *
 * RUTA: src/lib/notificar-erp.ts
 */

import { after } from 'next/server'
import { enviarPushUsuarios } from '@/lib/push'
import type { Supabase } from '@/lib/explosion-servidor'

export type RolAviso = 'almacen' | 'finanzas' | 'compras'

interface RoleData { nombre: string }

/** Ids de los usuarios activos con alguno de esos roles */
async function usuariosConRol(supabase: Supabase, roles: RolAviso[]): Promise<string[]> {
  const { data, error } = await supabase.from('usuarios').select('id, activo, roles ( nombre )')
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter(u => {
      const rel = u.roles as unknown as RoleData | RoleData[] | null
      const nombre = (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre)?.toLowerCase()
      return u.activo !== false && !!nombre && (roles as string[]).includes(nombre)
    })
    .map(u => String(u.id))
}

/**
 * Inserta el aviso para todos los usuarios activos de esos roles (+ push).
 * remitenteId solo se guarda si es un usuario de la tabla usuarios (las cuentas admin de Supabase Auth
 * pueden no tener fila).
 */
export async function avisarRol(
  supabase: Supabase,
  roles: RolAviso | RolAviso[],
  aviso: { mensaje: string; tipo: 'bom_pago' | 'bom_almacen'; proyectoId: string | null; remitenteId: string | null; url: string },
): Promise<{ avisados: number; error?: string }> {
  try {
    const lista = Array.isArray(roles) ? roles : [roles]
    const destinatarios = (await usuariosConRol(supabase, lista)).filter(id => id !== aviso.remitenteId)
    if (!destinatarios.length) return { avisados: 0 }

    let remitente: string | null = null
    if (aviso.remitenteId) {
      const { data } = await supabase.from('usuarios').select('id').eq('id', aviso.remitenteId).maybeSingle()
      remitente = data?.id ?? null
    }

    const { data: insertadas, error } = await supabase
      .from('notificaciones')
      .insert(destinatarios.map(id => ({
        remitente_id: remitente,
        destinatario_id: id,
        proyecto_id: aviso.proyectoId,
        tipo: aviso.tipo,
        mensaje: aviso.mensaje.slice(0, 1000),
        leida: false,
      })))
      .select('id')
    if (error) return { avisados: 0, error: error.message }
    if (!insertadas?.length) return { avisados: 0, error: 'la base de datos no guardó el aviso' }

    // Push después de responder: si falla, solo queda en consola
    after(() => enviarPushUsuarios(destinatarios, {
      titulo: aviso.tipo === 'bom_pago' ? '💳 Pago de material' : '📦 Material recibido',
      cuerpo: aviso.mensaje,
      url: aviso.url,
      etiqueta: `${aviso.tipo}-${aviso.proyectoId ?? 'sin-alta'}`,
    }))
    return { avisados: insertadas.length }
  } catch (e) {
    return { avisados: 0, error: e instanceof Error ? e.message : 'error desconocido' }
  }
}
