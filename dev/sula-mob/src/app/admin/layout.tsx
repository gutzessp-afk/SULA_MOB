'use client'

import Sidebar from '@/components/Sidebar'
import { useEffect, useState } from 'react'

// Un solo dígito que "gira" verticalmente hasta el número correcto
function OdometerDigit({ digit }: { digit: number }) {
  return (
    <span
      className="relative inline-block overflow-hidden align-bottom"
      style={{ height: '1em', width: '0.62em' }}
    >
      <span
        className="flex flex-col transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]"
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="leading-none" style={{ height: '1em' }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  )
}

// Arma el número completo dígito por dígito (con ceros a la izquierda fijos)
function Odometer({ value, digitCount }: { value: number; digitCount: number }) {
  const digits = String(value).padStart(digitCount, '0').split('').map(Number)
  return (
    <span className="inline-flex tabular-nums">
      {digits.map((d, i) => (
        <OdometerDigit key={i} digit={d} />
      ))}
    </span>
  )
}

// Cicla el valor entre 0 y el número real cada cierto tiempo, en loop
function LiveOdometer({ end }: { end: number }) {
  const digitCount = String(end).length
  const [target, setTarget] = useState(end)

  useEffect(() => {
    const interval = setInterval(() => {
      setTarget((prev) => (prev === end ? 0 : end))
    }, 3000)
    return () => clearInterval(interval)
  }, [end])

  return <Odometer value={target} digitCount={digitCount} />
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen w-full bg-[#0b0c10] text-slate-100 flex overflow-x-hidden">
      {/* Sidebar Fijo Lateral */}
      <Sidebar userRole="admin" />

      {/* Área Principal con offset para el Sidebar */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen bg-[#07080b]">
        {/* Cabecera / Topbar */}
        <header className="h-16 border-b border-slate-800/60 bg-[#0e1017]/50 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Sistema en Línea • Servidor Producción
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-bold text-white leading-none">Gibran Sula</p>
              <p className="text-[10px] text-slate-500 font-mono mt-1">Administrador</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-red-500">
              GS
            </div>
          </div>
        </header>

        {/* Sección del Branding + Muestras Técnicas integradas en el Dashboard */}
        <div className="p-8 space-y-8 max-w-7xl w-full mx-auto">
          {/* Hero Banner / Branding integrando los textos e indicadores */}
          <div className="relative overflow-hidden rounded-2xl p-8 bg-gradient-to-br from-[#121318] via-[#0d0e12] to-[#070709] border border-slate-800/60 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black tracking-wider text-white">
                    SULA <span className="text-red-600">MOB</span>
                  </span>
                  <span className="text-[10px] font-bold tracking-widest text-red-500 uppercase bg-red-950/60 border border-red-800/50 px-2.5 py-1 rounded-full">
                    Control de Manufactura
                  </span>
                </div>
                <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-white leading-tight">
                  Cada proyecto, cada área, cada pieza.
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Seguimiento de proyectos por área, registro de producción y reportes en un solo lugar.
                </p>
              </div>

              {/* Indicadores numéricos con animación odómetro */}
              <div className="grid grid-cols-3 gap-6 pt-6 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-800/80 lg:pl-8 min-w-[280px]">
                <div>
                  <p className="text-3xl font-extrabold text-white">
                    <LiveOdometer end={128} />
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mt-1">Proyectos</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-white">
                    <LiveOdometer end={8} />
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mt-1">Áreas</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-white">
                    <LiveOdometer end={34} />
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mt-1">Operadores</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contenido Dinámico de las Vistas (`page.tsx`) */}
          <main className="w-full">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}