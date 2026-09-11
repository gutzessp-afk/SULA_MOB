'use client'

import Image from 'next/image'
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

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<'admin' | 'operador'>('admin')

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#07080c] text-slate-100 selection:bg-red-600 selection:text-white">

      {/* PANEL IZQUIERDO */}
      <div className="relative w-full lg:w-1/2 min-h-[40vh] lg:min-h-screen flex flex-col justify-between p-8 lg:p-14 overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-900">

        <div className="absolute inset-0 z-0">
          <Image
            src="/sula-mob-fondo.png"
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover object-center opacity-[0.55]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-red-950/20 via-[#07080c]/60 to-[#07080c]" />
        </div>

        <div
          className="absolute inset-0 z-0 opacity-20"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 -mt-4 lg:-mt-6">
          <Image
            src="/logo-sula.png"
            alt="SULA MOB"
            width={112}
            height={112}
            priority
            className="object-contain w-20 h-20 lg:w-28 lg:h-28"
          />
        </div>

        <div className="relative z-10 space-y-5">
          <span className="text-xs font-bold text-red-500 tracking-widest uppercase inline-block">
            Control de Manufactura
          </span>
          <h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Cada proyecto, cada área, cada pieza.
          </h1>
          <p className="text-sm text-slate-400 max-w-md leading-relaxed">
            Seguimiento de proyectos por área, registro de producción y reportes en un solo lugar.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-6 pt-6 border-t border-slate-800/60 max-w-sm">
          <div>
            <p className="text-2xl lg:text-3xl font-black text-white">
              <LiveOdometer end={128} />
            </p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Proyectos</p>
          </div>
          <div>
            <p className="text-2xl lg:text-3xl font-black text-white">
              <LiveOdometer end={8} />
            </p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Áreas</p>
          </div>
          <div>
            <p className="text-2xl lg:text-3xl font-black text-white">
              <LiveOdometer end={34} />
            </p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Operadores</p>
          </div>
        </div>
      </div>

      {/* PANEL DERECHO */}
      <div className="relative w-full lg:w-1/2 min-h-[60vh] lg:min-h-screen bg-[#0a0b0f] flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-sm space-y-6">

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole('admin')}
              className={`py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${
                role === 'admin'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                  : 'bg-[#13151b] border border-slate-800 text-slate-300 hover:bg-[#1a1d25] hover:border-slate-700'
              }`}
            >
              Administrador
            </button>
            <button
              type="button"
              onClick={() => setRole('operador')}
              className={`py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${
                role === 'operador'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                  : 'bg-[#13151b] border border-slate-800 text-slate-300 hover:bg-[#1a1d25] hover:border-slate-700'
              }`}
            >
              Operadores
            </button>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}