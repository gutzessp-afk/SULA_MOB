'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function forgotPasswordAction(prevState: unknown, formData: FormData) {
  const email = (formData.get('email') as string)?.trim()

  if (!email) {
    return { error: 'Por favor, ingresa tu correo electrónico.' }
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

  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const redirectTo = `${origin}/reset-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (error) {
      return { error: error.message }
    }

    return { 
      success: true, 
      message: 'Se ha enviado un enlace de recuperación a tu correo electrónico. Revisa tu bandeja de entrada o spam.' 
    }
  } catch (err) {
    const error = err as Error
    return { error: 'Error al procesar la solicitud: ' + error.message }
  }
}