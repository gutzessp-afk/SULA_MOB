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

/** Rol de la cookie de sesión ('admin', 'madera', 'operador'…) o null si no hay sesión */
export async function rolSesion(): Promise<string | null> {
  const session = (await cookies()).get('sula_session')
  if (!session?.value) return null
  try {
    const rol = JSON.parse(session.value)?.rol
    return typeof rol === 'string' ? rol.toLowerCase() : null
  } catch {
    return null
  }
}

/** true si la cookie de sesión es de un administrador */
export async function esAdmin(): Promise<boolean> {
  return (await rolSesion()) === 'admin'
}

/** Roles que ven el BOM (explosiones): lista, hoja y descargas */
export const ROLES_BOM = ['admin', 'madera', 'compras', 'finanzas', 'almacen'] as const

/** Perfiles ERP (panel /erp): solo Dashboard y BOM */
export const ROLES_ERP = ['compras', 'finanzas', 'almacen'] as const

/**
 * true si la sesión puede VER explosiones (lista, hoja, descargar Excel/PDF).
 * Lo que cada perfil puede ESCRIBIR se revisa con puede(accion); lo demás sigue con esAdmin().
 */
export async function puedeVerBom(): Promise<boolean> {
  return (ROLES_BOM as readonly string[]).includes((await rolSesion()) ?? '')
}

export type AccionBom = 'excel' | 'oc' | 'pagos' | 'almacen'

/** Quién puede escribir qué en el BOM (docs/specs/SPEC-perfiles-erp.md) */
const PERMISOS: Record<AccionBom, readonly string[]> = {
  excel: ['admin', 'madera', 'compras'], // subir/reemplazar el Excel de explosión
  oc: ['admin', 'madera', 'compras'], // folio OC, PDF de OC, Compra + fecha
  pagos: ['admin', 'madera', 'finanzas'], // pagado, pagada, fecha de pago
  almacen: ['admin', 'madera', 'almacen'], // Almacén + fecha
}

/** true si el rol de la sesión puede hacer esa acción del BOM */
export async function puede(accion: AccionBom): Promise<boolean> {
  const rol = await rolSesion()
  return !!rol && PERMISOS[accion].includes(rol)
}

/** Almacén no ve costos, importes, totales en $ ni pagos */
export async function verCostos(): Promise<boolean> {
  return (await rolSesion()) !== 'almacen'
}

/**
 * true si la sesión es del área de madera. Madera ve los pedidos con explosión iniciada y sus
 * revisiones, pero de los materiales solo los de Clasificación = Madera.
 */
export async function esSesionMadera(): Promise<boolean> {
  return (await rolSesion()) === 'madera'
}

/** true si la clasificación de un material es Madera */
export const esClasifMadera = (clasificacion: unknown) => String(clasificacion ?? '').trim().toLowerCase() === 'madera'

/** Cliente de Supabase para el servidor: usa la service role key si existe (salta RLS); si no, la anon key */
export function supabaseServidor() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}
