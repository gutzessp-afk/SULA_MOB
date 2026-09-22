'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function signup(formData: FormData) {
  const nombre = (formData.get('fullName') as string)?.trim()
  const correo = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!nombre || !correo || !password) {
    return { error: 'Todos los campos son obligatorios.' }
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

  const { error } = await supabase.auth.signUp({
    email: correo,
    password,
    options: {
      data: { nombre },
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, message: 'Cuenta creada. Revisa tu correo para confirmar.' }
}