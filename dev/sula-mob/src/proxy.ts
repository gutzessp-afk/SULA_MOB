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

const ERP = ['compras', 'finanzas', 'almacen']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const rol = rolDeSesion(request)

  // Sin sesión (o con la cookie dañada) no se entra a admin, operator, madera ni erp
  if (!rol) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Área de madera: solo su panel (/madera). Si intenta entrar a admin u operator, regresa a su panel
  if (rol === 'madera') {
    if (!pathname.startsWith('/madera')) return NextResponse.redirect(new URL('/madera', request.url))
    return NextResponse.next()
  }

  // Perfiles ERP (compras, finanzas, almacén): solo su panel (/erp, Dashboard y BOM)
  if (ERP.includes(rol)) {
    if (!pathname.startsWith('/erp')) return NextResponse.redirect(new URL('/erp', request.url))
    return NextResponse.next()
  }

  // /erp es solo para esos perfiles y administradores (el admin puede revisarlo)
  if (pathname.startsWith('/erp') && rol !== 'admin') {
    return NextResponse.redirect(new URL('/operator', request.url))
  }

  // El panel de madera es solo para madera y administradores (el admin puede revisarlo)
  if (pathname.startsWith('/madera') && rol !== 'admin') {
    return NextResponse.redirect(new URL('/operator', request.url))
  }

  // Un operador no entra al panel de administración
  if (pathname.startsWith('/admin') && rol !== 'admin') {
    return NextResponse.redirect(new URL('/operator', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/operator/:path*', '/madera/:path*', '/erp/:path*'],
}
