import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Rol guardado en la cookie de sesión, o null si no hay sesión válida */
function rolDeSesion(request: NextRequest): string | null {
  const valor = request.cookies.get('sula_session')?.value
  if (!valor) return null
  for (const texto of [valor, decodeURIComponent(valor)]) {
    try {
      const sesion = JSON.parse(texto)
      if (sesion && typeof sesion === 'object') return String(sesion.rol || 'operador').toLowerCase()
    } catch {
      // Se intenta con la otra forma de leerla
    }
  }
  return null
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const rol = rolDeSesion(request)

  // Sin sesión (o con la cookie dañada) no se entra a admin ni a operator
  if (!rol) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Un operador no entra al panel de administración
  if (pathname.startsWith('/admin') && rol !== 'admin') {
    return NextResponse.redirect(new URL('/operator', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/operator/:path*'],
}
