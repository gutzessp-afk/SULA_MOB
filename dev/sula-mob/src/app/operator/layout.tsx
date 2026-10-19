
'use client'

import { useEffect, useState } from 'react'
import InstallPWA from '@/components/InstallPWA'
import MobiChat from '@/components/MobiChat'
import OperatorSidebar from '@/components/operator/OperatorSidebar'
import { getUsuarioActual } from './actions'

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [nombre, setNombre] = useState('Operador')

  useEffect(() => {
    getUsuarioActual().then((u) => {
      if (u?.nombre) setNombre(u.nombre)
    })
  }, [])

  const inicial = nombre.trim().charAt(0).toUpperCase() || 'O'

  return (
    <div className="sula-fondo min-h-screen w-full bg-[#0b0c10] text-slate-100 flex overflow-x-hidden">
      <OperatorSidebar />

      <div className="flex-1 md:ml-64 flex flex-col min-h-screen min-w-0 sula-fondo bg-[#07080b]">
        <header className="h-16 border-b border-slate-800/60 bg-[#0e1017]/95 md:bg-[#0e1017]/50 md:backdrop-blur-md px-4 md:px-8 flex items-center justify-end md:justify-between sticky top-0 z-30">
          <div className="hidden md:flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Sistema en Línea
            </span>
          </div>

          <div className="flex items-center gap-3 pl-12 md:pl-0">
            <p className="text-xs font-bold text-white truncate max-w-[160px]">{nombre}</p>
            <div className="w-8 h-8 rounded-full bg-blue-950 border border-blue-800 flex items-center justify-center font-bold text-xs text-blue-300">
              {inicial}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
          <main className="w-full min-w-0">{children}</main>
        </div>
      </div>

      <MobiChat />
      <InstallPWA />
    </div>
  )
}