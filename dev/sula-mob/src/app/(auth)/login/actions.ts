'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import bcrypt from 'bcryptjs'

export async function loginAction(prevState: any, formData: FormData) {
  const identifier = (formData.get('identifier') as string)?.trim()
  const password = formData.get('password') as string

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

      return { success: true, redirectUrl: '/admin' }
    }
  } catch (e) {
    // Si falla Supabase Auth pasa al siguiente paso
  }

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
        const userRole = (usuario.roles as any)?.nombre || 'operador'

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

        const destination = userRole === 'admin' ? '/admin' : '/operador'
        return { success: true, redirectUrl: destination }
      }
    }
  } catch (e) {
    return { error: 'Error al consultar la base de datos de usuarios.' }
  }

  return { error: 'Credenciales incorrectas. Verifica tu usuario y contraseña.' }
}