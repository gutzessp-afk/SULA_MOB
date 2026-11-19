'use server'

/**
 * Acciones del panel ERP (/erp: compras, finanzas, almacén).
 *
 * sesionErp() → id, nombre y rol de la sesión para el menú lateral y la campana. Solo lee la cookie `sula_session`
 * (httpOnly, el navegador no la puede leer directo).
 *
 * RUTA: src/app/erp/actions.ts
 */

import { cookies } from 'next/headers'

export interface SesionErp {
  /** id de usuarios (para la campana: notificaciones.destinatario_id) */
  id: string
  nombre: string
  correo: string
  rol: 'admin' | 'compras' | 'finanzas' | 'almacen'
}

const ROLES = ['admin', 'compras', 'finanzas', 'almacen'] as const

export async function sesionErp(): Promise<SesionErp | null> {
  const valor = (await cookies()).get('sula_session')?.value
  if (!valor) return null
  try {
    const s = JSON.parse(valor)
    const rol = String(s?.rol ?? '').toLowerCase() as SesionErp['rol']
    if (!ROLES.includes(rol)) return null
    return {
      id: String(s.id ?? ''),
      nombre: String(s.nombre || s.username || s.correo || (rol === 'admin' ? 'Administrador' : rol)),
      correo: String(s.correo ?? ''),
      rol,
    }
  } catch {
    return null
  }
}
