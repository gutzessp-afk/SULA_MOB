'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import bcrypt from 'bcryptjs'

interface RoleData {
  nombre: string
}

export async function loginAction(prevState: unknown, formData: FormData) {
  const identifier = (formData.get('identifier') as string)?.trim()
  const password = formData.get('password') as string
  const selectedRole = (formData.get('role') as string)?.trim().toLowerCase() // 'admin' u 'operador'

  if (!identifier || !password) {
    return { error: 'Por favor, ingresa tu usuario/correo y contraseña.' }
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  // 1. Intentar validar directamente con Supabase Auth
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: identifier,
      password: password,
    })

    if (authData?.user && !authError) {
      // Si seleccionó Operador pero es un usuario Auth (Admin)
      if (selectedRole === 'operador') {
        return { error: 'Esta cuenta es de Administrador. Por favor selecciona el perfil Administrador.' }
      }

      cookieStore.set('sula_session', JSON.stringify({
        id: authData.user.id,
        correo: authData.user.email,
        rol: 'admin',
      }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      })

      return { success: true, redirectUrl: '/admin/dashboard' }
    }
  } catch {}

  // 2. Si no es Supabase Auth, buscar en la tabla public.usuarios
  try {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select(`
        id,
        nombre,
        apellidos,
        correo,
        username,
        password_hash,
        activo,
        roles ( nombre )
      `)
      .or(`correo.ilike.${identifier},username.ilike.${identifier}`)
      .maybeSingle()

    if (usuario && usuario.activo && usuario.password_hash) {
      const formattedHash = usuario.password_hash.replace(/^\$2a\$/, '$2b$')
      const isPasswordValid = await bcrypt.compare(password, formattedHash)

      if (isPasswordValid) {
        const roleRelation = usuario.roles as unknown as RoleData | RoleData[] | null
        const rawRoleName = Array.isArray(roleRelation) 
          ? roleRelation[0]?.nombre 
          : roleRelation?.nombre

        const userRole = (rawRoleName || 'operador').toLowerCase()

        // VALIDACIÓN ESTRICTA DEL ROL SELECCIONADO EN EL LOGIN
        if (selectedRole === 'admin' && userRole !== 'admin') {
          return { error: 'Esta cuenta no tiene permisos de Administrador. Cambia el perfil a Operador.' }
        }

        if (selectedRole === 'operador' && userRole === 'admin') {
          return { error: 'Esta cuenta es de Administrador. Por favor selecciona el perfil Administrador.' }
        }

        // Guardar sesión en cookie
        cookieStore.set('sula_session', JSON.stringify({
          id: usuario.id,
          nombre: `${usuario.nombre} ${usuario.apellidos || ''}`.trim(),
          correo: usuario.correo,
          username: usuario.username,
          rol: userRole,
        }), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        })

        const destination = userRole === 'admin' ? '/admin/dashboard' : '/operador'
        return { success: true, redirectUrl: destination }
      }
    }
  } catch {
    return { error: 'Error al consultar la base de datos de usuarios.' }
  }

  return { error: 'Credenciales incorrectas. Verifica tu usuario y contraseña.' }
}