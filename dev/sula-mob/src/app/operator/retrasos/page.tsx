
'use client'

import { useState } from 'react'
import { AlertOctagon, Clock, Send } from 'lucide-react'

// Página de registro de retrasos (/operator/retrasos).
// El operador reporta un retraso; el motivo es obligatorio. Responsable: Dev 3.

interface Retraso {
  id: string
  proyecto: string
  area: string
  motivo: string
  evidencia: string
  fecha: string
  tiempoEstimado: string
}

export default function RetrasosPage() {
  // Datos simulados de retrasos ya reportados (se conectarán a Supabase más adelante)
  const [retrasos] = useState<Retraso[]>([
    {
      id: '1',
      proyecto: 'Proyecto ABC',
      area: 'Ensamblaje',
      motivo: 'Falta de material',
      evidencia: 'No llegó el lote de piezas metálicas programado para hoy.',
      fecha: '17/09/2026',
      tiempoEstimado: '1 día',
    },
    {
      id: '2',
      proyecto: 'Proyecto XYZ',
      area: 'Empaque',
      motivo: 'Falla de maquinaria',
      evidencia: 'La selladora presentó fallas y se detuvo la línea.',
      fecha: '16/09/2026',
      tiempoEstimado: '4 horas',
    },
  ])

  // Estado del formulario
  const [proyecto, setProyecto] = useState('')
  const [area, setArea] = useState('')
  const [motivo, setMotivo] = useState('')
  const [evidencia, setEvidencia] = useState('')
  const [tiempoEstimado, setTiempoEstimado] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validación: el motivo es obligatorio
    if (!motivo.trim()) {
      setError('El motivo del retraso es obligatorio.')
      return
    }

    setError('')
    // Aquí, más adelante, se guardará en Supabase
    alert('Retraso registrado (simulado). Próximamente se guardará en la base de datos.')

    // Limpia el formulario
    setProyecto('')
    setArea('')
    setMotivo('')
    setEvidencia('')
    setTiempoEstimado('')
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Título */}
      <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
        <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-red-600" />
          Reportar <span className="text-red-600">Retraso</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Registra un retraso en tu área. El motivo es obligatorio para notificar al administrador.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario (2 columnas) */}
        <div className="lg:col-span-2 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6">
            Nuevo Retraso
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">
                  Proyecto
                </label>
                <select
                  value={proyecto}
                  onChange={(e) => setProyecto(e.target.value)}
                  className="w-full bg-[#08090d] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-700"
                >
                  <option value="">Selecciona un proyecto</option>
                  <option value="Proyecto ABC">Proyecto ABC</option>
                  <option value="Proyecto XYZ">Proyecto XYZ</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">
                  Área
                </label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full bg-[#08090d] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-700"
                >
                  <option value="">Selecciona un área</option>
                  <option value="Ensamblaje">Ensamblaje</option>
                  <option value="Empaque">Empaque</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">
                Motivo del retraso <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Falta de material, falla de maquinaria..."
                className="w-full bg-[#08090d] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700"
              />
              {error && (
                <p className="text-[11px] text-red-500 mt-1.5">{error}</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">
                Descripción
              </label>
              <textarea
                value={evidencia}
                onChange={(e) => setEvidencia(e.target.value)}
                rows={3}
                placeholder="Detalla qué pasó..."
                className="w-full bg-[#08090d] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700 resize-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">
                Tiempo estimado de retraso
              </label>
              <input
                type="text"
                value={tiempoEstimado}
                onChange={(e) => setTiempoEstimado(e.target.value)}
                placeholder="Ej: 2 horas, 1 día..."
                className="w-full bg-[#08090d] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-700"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wide py-3 rounded-xl transition"
            >
              <Send className="w-4 h-4" />
              Notificar al Administrador
            </button>
          </form>
        </div>

        {/* Lista de retrasos recientes (1 columna) */}
        <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-600" />
            Retrasos Reportados
          </h2>

          <div className="space-y-4">
            {retrasos.map((r) => (
              <div key={r.id} className="pb-4 border-b border-slate-800/60 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{r.proyecto}</span>
                  <span className="text-[10px] text-slate-600">{r.fecha}</span>
                </div>
                <p className="text-[11px] text-red-400 font-semibold mb-1">{r.motivo}</p>
                <p className="text-[11px] text-slate-400 mb-1">{r.evidencia}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-600">
                  <span className="text-red-500">{r.area}</span>
                  <span>Retraso: {r.tiempoEstimado}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}