
'use client'

import Sidebar from '@/components/Sidebar'

// Layout del área de operador.
// Guard de rol (solo operador) + navegación propia. Responsable: Dev 1 (base) / Dev 3 (contenido).
export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen w-full bg-[#0b0c10] text-slate-100 flex overflow-x-hidden">
      {/* Sidebar Fijo Lateral */}
      <Sidebar userRole="operador" />

      {/* Área Principal con offset para el Sidebar */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen bg-[#07080b]">
        {/* Cabecera / Topbar */}
        <header className="h-16 border-b border-slate-800/60 bg-[#0e1017]/50 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Sistema en Línea • Turno Activo
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-bold text-white leading-none">Operador</p>
              <p className="text-[10px] text-slate-500 font-mono mt-1">Área asignada</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-red-500">
              OP
            </div>
          </div>
        </header>

        {/* Contenido Dinámico de las Vistas (`page.tsx`) */}
        <div className="p-8 space-y-8 max-w-7xl w-full mx-auto">
          <main className="w-full">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}