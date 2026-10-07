import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { cn } from '@/lib/utils'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'SULA MOB',
  description: 'Sistema de Mantenimiento y Operaciones',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
}

// El viewport va en su propio export (así lo maneja Next.js)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,        // permite hacer zoom (accesibilidad)
  userScalable: true,
  viewportFit: 'cover',   // iPhone con notch: la app usa toda la pantalla
  themeColor: '#07080c',  // barra del navegador del color del fondo
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={cn('dark', 'font-sans', geist.variable)}>
      <body className="bg-[#0b0c10] text-slate-100 antialiased selection:bg-red-500 selection:text-white">
        {children}
      </body>
    </html>
  )
}