'use server'

/**
 * Acciones del panel del área de madera (/madera).
 *
 * sesionPanel() → nombre y rol de la sesión para la barra superior. Solo lee la cookie
 * `sula_session` (httpOnly, el navegador no la puede leer directo).
 *
 * RUTA: src/app/madera/actions.ts
 */

import { cookies } from 'next/headers'

export interface SesionPanel {
  nombre: string
  correo: string
  rol: string
}

export async function sesionPanel(): Promise<SesionPanel | null> {
  const valor = (await cookies()).get('sula_session')?.value
  if (!valor) return null
  try {
    const s = JSON.parse(valor)
    const rol = String(s?.rol ?? '').toLowerCase()
    if (rol !== 'madera' && rol !== 'admin') return null
    return {
      nombre: String(s.nombre || s.username || s.correo || (rol === 'admin' ? 'Administrador' : 'Área de Madera')),
      correo: String(s.correo ?? ''),
      rol,
    }
  } catch {
    return null
  }
}
