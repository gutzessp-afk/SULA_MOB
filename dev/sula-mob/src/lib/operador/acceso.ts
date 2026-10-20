// src/lib/operador/acceso.ts
// Acceso a las áreas con su clave de 3 dígitos. Solo se importa desde acciones de servidor.
//
// Todos los operadores entran con el mismo usuario compartido, así que:
// - el acceso a un área se guarda por dispositivo (el "dispositivo" de la cookie sula_session),
//   para que desbloquear un área en una tableta no la abra en las demás;
// - los intentos fallidos se cuentan por área, no por usuario;
// - el botón "Entrar a mi área" (la clave sola dice cuál es el área) prueba la clave contra
//   todas las áreas, así que lleva su propio contador en clave_intentos.

import bcrypt from 'bcryptjs'
import type { createClient } from '@/lib/supabase/server'
import type { UsuarioSesion } from '@/app/operator/actions'

type Supabase = Awaited<ReturnType<typeof createClient>>

const MAX_INTENTOS = 5
const MINUTOS_BLOQUEO = 5
const HORAS_ACCESO = 12
const CLAVE_BOTON_GENERAL = 'entrar-a-mi-area'

function ahoraISO() {
  return new Date().toISOString()
}

function minutosRestantes(hasta: number) {
  return Math.ceil((hasta - Date.now()) / 60000)
}

function bloqueadoHasta() {
  return new Date(Date.now() + MINUTOS_BLOQUEO * 60000).toISOString()
}

/** Identificador del dispositivo; las sesiones viejas (sin dispositivo) usan el id del usuario */
export function dispositivoDe(usuario: UsuarioSesion) {
  return usuario.dispositivo || usuario.id
}

async function claveCorrecta(pin: string, pinHash: string) {
  return bcrypt.compare(pin, pinHash.replace(/^\$2a\$/, '$2b$'))
}

export async function tieneAccesoArea(supabase: Supabase, usuario: UsuarioSesion, areaId: string) {
  const { data } = await supabase
    .from('area_accesos')
    .select('area_id')
    .eq('operador_id', usuario.id)
    .eq('dispositivo', dispositivoDe(usuario))
    .eq('area_id', areaId)
    .gt('expira_at', ahoraISO())
    .maybeSingle()
  return Boolean(data)
}

/** Áreas que este dispositivo tiene abiertas ahora mismo */
export async function areasAbiertas(supabase: Supabase, usuario: UsuarioSesion): Promise<Set<string>> {
  const { data } = await supabase
    .from('area_accesos')
    .select('area_id')
    .eq('operador_id', usuario.id)
    .eq('dispositivo', dispositivoDe(usuario))
    .gt('expira_at', ahoraISO())
  return new Set((data ?? []).map((a) => a.area_id as string))
}

/** Cierra el acceso de este dispositivo al área (no toca relojes ni a otros dispositivos) */
export async function cerrarAccesoArea(supabase: Supabase, usuario: UsuarioSesion, areaId: string) {
  await supabase
    .from('area_accesos')
    .delete()
    .eq('operador_id', usuario.id)
    .eq('dispositivo', dispositivoDe(usuario))
    .eq('area_id', areaId)
}

/* ---------------- Contadores de intentos ---------------- */

interface IntentoArea {
  operador_id: string
  fallidos: number | null
  bloqueado_hasta: string | null
}

/** Intentos del área (sin filtrar por usuario: todos comparten el mismo) */
async function intentosDeArea(supabase: Supabase, areaId: string) {
  const { data } = await supabase
    .from('area_intentos')
    .select('operador_id, fallidos, bloqueado_hasta')
    .eq('area_id', areaId)
  const filas = (data ?? []) as IntentoArea[]
  const hasta = Math.max(0, ...filas.map((i) => (i.bloqueado_hasta ? new Date(i.bloqueado_hasta).getTime() : 0)))
  return { filas, bloqueadaHasta: hasta > Date.now() ? hasta : 0 }
}

async function sumarFalloArea(supabase: Supabase, usuario: UsuarioSesion, areaId: string, filas: IntentoArea[]) {
  const propio = filas.find((i) => i.operador_id === usuario.id)
  const fallidos = (propio?.fallidos ?? 0) + 1
  const bloquear = fallidos >= MAX_INTENTOS

  await supabase.from('area_intentos').upsert(
    {
      operador_id: usuario.id,
      area_id: areaId,
      fallidos: bloquear ? 0 : fallidos,
      bloqueado_hasta: bloquear ? bloqueadoHasta() : null,
    },
    { onConflict: 'operador_id,area_id' }
  )
  return bloquear
}

/** Contador del botón "Entrar a mi área" (uno solo para toda la planta) */
async function intentosBotonGeneral(supabase: Supabase) {
  const { data } = await supabase
    .from('clave_intentos')
    .select('fallidos, bloqueado_hasta')
    .eq('clave', CLAVE_BOTON_GENERAL)
    .maybeSingle()
  const hasta = data?.bloqueado_hasta ? new Date(data.bloqueado_hasta as string).getTime() : 0
  return { fallidos: (data?.fallidos as number | null) ?? 0, bloqueadoHasta: hasta > Date.now() ? hasta : 0 }
}

async function sumarFalloBotonGeneral(supabase: Supabase, previos: number) {
  const fallidos = previos + 1
  const bloquear = fallidos >= MAX_INTENTOS
  await supabase.from('clave_intentos').upsert(
    {
      clave: CLAVE_BOTON_GENERAL,
      fallidos: bloquear ? 0 : fallidos,
      bloqueado_hasta: bloquear ? bloqueadoHasta() : null,
    },
    { onConflict: 'clave' }
  )
  return bloquear
}

/* ---------------- Entrar ---------------- */

async function abrirAcceso(supabase: Supabase, usuario: UsuarioSesion, areaId: string) {
  await supabase.from('area_intentos').delete().eq('area_id', areaId)

  const { error } = await supabase.from('area_accesos').upsert(
    {
      operador_id: usuario.id,
      dispositivo: dispositivoDe(usuario),
      area_id: areaId,
      expira_at: new Date(Date.now() + HORAS_ACCESO * 3600000).toISOString(),
    },
    { onConflict: 'operador_id,area_id,dispositivo' }
  )

  if (error) {
    console.error('Error al desbloquear:', error)
    return { error: 'No se pudo entrar al área.' }
  }
  return {}
}

/**
 * El operador tocó un área: valida la clave de ESA área y la abre en este dispositivo por 12 h.
 * 5 fallos seguidos en un área la bloquean 5 min para todos; las demás áreas siguen libres.
 */
export async function validarClaveArea(
  supabase: Supabase,
  usuario: UsuarioSesion,
  areaId: string,
  clave: string
): Promise<{ error?: string }> {
  const pin = clave.trim()
  if (!pin) return { error: 'Escribe la contraseña del área.' }

  const { data: area } = await supabase
    .from('areas')
    .select('id, pin_hash')
    .eq('id', areaId)
    .eq('activo', true)
    .maybeSingle()

  if (!area) return { error: 'No se encontró el área.' }
  if (!area.pin_hash) {
    return { error: 'Esta área todavía no tiene contraseña. Avisa al administrador.' }
  }

  const { filas, bloqueadaHasta } = await intentosDeArea(supabase, areaId)
  if (bloqueadaHasta) {
    return { error: `Demasiados intentos. Intenta de nuevo en ${minutosRestantes(bloqueadaHasta)} min.` }
  }

  if (!(await claveCorrecta(pin, area.pin_hash as string))) {
    const bloqueo = await sumarFalloArea(supabase, usuario, areaId, filas)
    return {
      error: bloqueo
        ? `Demasiados intentos. Intenta de nuevo en ${MINUTOS_BLOQUEO} min.`
        : 'Contraseña incorrecta.',
    }
  }

  return abrirAcceso(supabase, usuario, areaId)
}

/**
 * Botón "Entrar a mi área": la clave sola dice cuál es el área.
 * Respeta el bloqueo de cada área y además lleva su propio contador (5 fallos → 5 min);
 * mientras está bloqueado, se puede seguir entrando tocando el área.
 */
export async function validarClaveGeneral(
  supabase: Supabase,
  usuario: UsuarioSesion,
  clave: string
): Promise<{ error?: string; areaId?: string }> {
  const pin = clave.trim()
  if (!pin) return { error: 'Escribe la contraseña de tu área.' }

  const general = await intentosBotonGeneral(supabase)
  if (general.bloqueadoHasta) {
    return {
      error: `Demasiados intentos. Toca tu área para entrar, o espera ${minutosRestantes(general.bloqueadoHasta)} min.`,
    }
  }

  const { data: areas } = await supabase.from('areas').select('id, pin_hash').eq('activo', true)

  let areaId: string | null = null
  for (const a of areas ?? []) {
    if (a.pin_hash && (await claveCorrecta(pin, a.pin_hash as string))) {
      areaId = a.id as string
      break
    }
  }

  if (!areaId) {
    const bloqueo = await sumarFalloBotonGeneral(supabase, general.fallidos)
    return {
      error: bloqueo
        ? `Demasiados intentos. Toca tu área para entrar, o espera ${MINUTOS_BLOQUEO} min.`
        : 'Contraseña incorrecta.',
    }
  }

  // Si esa área está bloqueada por fallos, tampoco se entra por aquí
  const { bloqueadaHasta } = await intentosDeArea(supabase, areaId)
  if (bloqueadaHasta) {
    return { error: `Esa área está bloqueada por intentos. Intenta en ${minutosRestantes(bloqueadaHasta)} min.` }
  }

  if (general.fallidos > 0) await supabase.from('clave_intentos').delete().eq('clave', CLAVE_BOTON_GENERAL)

  const r = await abrirAcceso(supabase, usuario, areaId)
  return r.error ? r : { areaId }
}
