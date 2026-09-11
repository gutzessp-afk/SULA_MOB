import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SULA MOB',
  description: 'Sistema de Mantenimiento y Operaciones',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-[#0b0c10] text-slate-100 antialiased selection:bg-red-500 selection:text-white">
        {children}
      </body>
    </html>
  )
}