'use server'

/**
 * Acciones del perfil del administrador (/admin/perfil).
 * Siempre editan la cuenta de la sesión actual (id de la cookie `sula_session`),
 * nunca un id que mande el navegador.
 *
 * Hay dos tipos de cuenta de administrador:
 *   - 'usuario': fila de la tabla `usuarios` (contraseña con bcrypt). Edita nombre,
 *     apellidos, usuario, correo y contraseña.
 *   - 'auth': cuenta de Supabase Auth (sin fila en `usuarios`). Solo cambia su contraseña.
 *
 * RUTA: src/app/admin/perfil/actions.ts
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import bcrypt from 'bcryptjs'
import { supabaseServidor } from '@/lib/admin-api'

export interface Perfil {
  tipo: 'usuario' | 'auth'
  nombre: string
  apellidos: string
  username: string
  correo: string
  creado: string | null
}

type Resultado = { ok: true; mensaje: string } | { ok: false; error: string }

// Sin comas ni paréntesis: se usa dentro de un filtro .or() de Supabase
const CORREO = /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/
const USUARIO = /^[a-zA-Z0-9._-]{3,30}$/

/** Id y rol de la sesión; null si no hay sesión de administrador */
async function sesionAdmin(): Promise<{ id: string; correo: string } | null> {
  const valor = (await cookies()).get('sula_session')?.value
  if (!valor) return null
  try {
    const s = JSON.parse(valor)
    return s?.rol === 'admin' && typeof s.id === 'string' ? { id: s.id, correo: s.correo ?? '' } : null
  } catch {
    return null
  }
}

/** Cliente de Supabase con las cookies de Supabase Auth (para cuentas tipo 'auth') */
async function clienteAuth() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (lista) => {
        try { lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })
}

export async function obtenerPerfil(): Promise<Perfil | null> {
  const sesion = await sesionAdmin()
  if (!sesion) return null
  const { data } = await supabaseServidor()
    .from('usuarios')
    .select('nombre, apellidos, username, correo, created_at')
    .eq('id', sesion.id)
    .maybeSingle()
  if (!data) return { tipo: 'auth', nombre: '', apellidos: '', username: '', correo: sesion.correo, creado: null }
  return {
    tipo: 'usuario',
    nombre: data.nombre ?? '',
    apellidos: data.apellidos ?? '',
    username: data.username ?? '',
    correo: data.correo ?? '',
    creado: data.created_at ?? null,
  }
}

export async function guardarDatos(datos: { nombre: string; apellidos: string; username: string; correo: string }): Promise<Resultado> {
  const sesion = await sesionAdmin()
  if (!sesion) return { ok: false, error: 'Tu sesión terminó. Vuelve a iniciar sesión.' }

  const nombre = datos.nombre.trim()
  const apellidos = datos.apellidos.trim()
  const username = datos.username.trim().toLowerCase()
  const correo = datos.correo.trim().toLowerCase()
  if (!nombre) return { ok: false, error: 'El nombre es obligatorio.' }
  if (!USUARIO.test(username)) return { ok: false, error: 'El usuario debe tener de 3 a 30 letras, números, punto, guion o guion bajo, sin espacios.' }
  if (correo && !CORREO.test(correo)) return { ok: false, error: 'El correo no es válido.' }

  const supabase = supabaseServidor()
  const { data: actual } = await supabase.from('usuarios').select('id').eq('id', sesion.id).maybeSingle()
  if (!actual) return { ok: false, error: 'Esta cuenta se administra en Supabase; aquí solo puedes cambiar la contraseña.' }

  // Usuario y correo no pueden repetirse con otra cuenta (se usan para iniciar sesión)
  const { data: repetidos } = await supabase
    .from('usuarios')
    .select('id, username, correo')
    .neq('id', sesion.id)
    .or(correo ? `username.ilike.${username},correo.ilike.${correo}` : `username.ilike.${username}`)
  if (repetidos?.some(u => u.username?.toLowerCase() === username)) return { ok: false, error: `El usuario "${username}" ya lo tiene otra persona.` }
  if (correo && repetidos?.some(u => u.correo?.toLowerCase() === correo)) return { ok: false, error: `El correo ${correo} ya lo tiene otra cuenta.` }

  const { data: guardado, error } = await supabase
    .from('usuarios')
    .update({ nombre, apellidos: apellidos || null, username, correo: correo || null, updated_at: new Date().toISOString() })
    .eq('id', sesion.id)
    .select('id')
  if (error) return { ok: false, error: 'No se pudo guardar: ' + error.message }
  if (!guardado?.length) return { ok: false, error: 'La base no permitió guardar los cambios (permisos).' }
  return { ok: true, mensaje: 'Datos guardados.' }
}

export async function cambiarContrasena(actual: string, nueva: string): Promise<Resultado> {
  const sesion = await sesionAdmin()
  if (!sesion) return { ok: false, error: 'Tu sesión terminó. Vuelve a iniciar sesión.' }
  if (nueva.length < 8) return { ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' }
  if (nueva === actual) return { ok: false, error: 'La nueva contraseña debe ser distinta de la actual.' }

  const supabase = supabaseServidor()
  const { data: usuario } = await supabase.from('usuarios').select('password_hash').eq('id', sesion.id).maybeSingle()

  if (usuario) {
    const hash = (usuario.password_hash ?? '').replace(/^\$2a\$/, '$2b$')
    if (!hash || !(await bcrypt.compare(actual, hash))) return { ok: false, error: 'La contraseña actual no es correcta.' }
    const { data: guardado, error } = await supabase
      .from('usuarios')
      .update({ password_hash: await bcrypt.hash(nueva, 10), updated_at: new Date().toISOString() })
      .eq('id', sesion.id)
      .select('id')
    if (error || !guardado?.length) return { ok: false, error: 'No se pudo cambiar la contraseña' + (error ? ': ' + error.message : '.') }
    return { ok: true, mensaje: 'Contraseña actualizada. Úsala la próxima vez que inicies sesión.' }
  }

  // Cuenta de Supabase Auth: se comprueba la actual iniciando sesión y se cambia con su API
  const auth = await clienteAuth()
  const { error: errLogin } = await auth.auth.signInWithPassword({ email: sesion.correo, password: actual })
  if (errLogin) return { ok: false, error: 'La contraseña actual no es correcta.' }
  const { error } = await auth.auth.updateUser({ password: nueva })
  if (error) return { ok: false, error: 'No se pudo cambiar la contraseña: ' + error.message }
  return { ok: true, mensaje: 'Contraseña actualizada.' }
}
