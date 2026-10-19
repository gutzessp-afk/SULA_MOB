/**
 * admin-api.ts
 * ────────────
 * Utilidades de servidor para las API de administrador (planos, plantillas
 * y matriz de corte). Solo se importa desde archivos route.ts.
 *
 * RUTA: src/lib/admin-api.ts
 */

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/** true si la cookie de sesión es de un administrador */
export async function esAdmin(): Promise<boolean> {
  const session = (await cookies()).get('sula_session')
  if (!session?.value) return false
  try {
    return JSON.parse(session.value)?.rol === 'admin'
  } catch {
    return false
  }
}

/** Cliente de Supabase para el servidor: usa la service role key si existe (salta RLS); si no, la anon key */
export function supabaseServidor() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}
