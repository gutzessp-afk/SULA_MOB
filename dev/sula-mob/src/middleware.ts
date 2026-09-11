import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('sula_session')
  const { pathname } = request.url ? new URL(request.url) : { pathname: request.nextUrl.pathname }

  // Si intenta entrar a admin u operador sin la cookie de sesión, mandar al login
  if ((pathname.startsWith('/admin') || pathname.startsWith('/operador')) && !sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/operador/:path*'],
}