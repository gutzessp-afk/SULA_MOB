'use client'

/**
 * CalidadPlano.tsx
 * ────────────────
 * Muestra la revisión de calidad de un plano: si está bien hecho, si tiene
 * observaciones o si es deficiente, y la lista de problemas encontrados
 * (hoja, gravedad y descripción) para mandarlos a corregir con ingeniería.
 *
 * La revisión la hace /api/analizar-plano al leer el plano.
 *
 * RUTA: src/components/CalidadPlano.tsx
 */

import { useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import type { CalidadPlano as Calidad } from '@/lib/types'

const NIVEL = {
  bueno: { titulo: 'Plano bien hecho', caja: 'bg-emerald-500/10 border-emerald-400/25', texto: 'text-emerald-300', Icono: CheckCircle2 },
  con_observaciones: { titulo: 'Plano con observaciones', caja: 'bg-amber-500/10 border-amber-400/30', texto: 'text-amber-300', Icono: AlertTriangle },
  deficiente: { titulo: 'Plano deficiente', caja: 'bg-red-500/10 border-red-400/40', texto: 'text-red-300', Icono: AlertOctagon },
} as const

const GRAVEDAD = {
  alta: 'bg-red-500/20 text-red-300 border-red-400/40',
  media: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
  baja: 'bg-white/10 text-white/60 border-white/20',
} as const

/** Etiqueta corta para el encabezado de la tarjeta de la partida */
export function EtiquetaCalidad({ calidad }: { calidad?: Calidad }) {
  if (!calidad || calidad.nivel === 'bueno') return null
  const n = NIVEL[calidad.nivel]
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-md border px-2 py-0.5 ${n.caja} ${n.texto}`}>
      <n.Icono className="w-3.5 h-3.5" /> {n.titulo}
    </span>
  )
}

export function CalidadPlano({ calidad }: { calidad?: Calidad }) {
  // Un plano deficiente empieza abierto: hay que leer los problemas antes de fabricar
  const [abierto, setAbierto] = useState(calidad?.nivel === 'deficiente')
  if (!calidad) return null
  const n = NIVEL[calidad.nivel]
  const altas = calidad.problemas.filter(p => p.gravedad === 'alta').length
  const resumen = calidad.nivel === 'bueno'
    ? calidad.problemas.length ? `Sin contradicciones ni datos faltantes. ${calidad.problemas.length} detalle(s) menor(es).` : 'No se encontraron contradicciones ni datos faltantes.'
    : calidad.nivel === 'deficiente'
    ? `${altas} problema(s) grave(s) de ${calidad.problemas.length} encontrados. No conviene fabricar sin corregirlo con ingeniería.`
    : `${calidad.problemas.length} observación(es). Se puede fabricar, pero revísalas antes.`

  return (
    <section className={`rounded-xl border ${n.caja}`}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        disabled={!calidad.problemas.length}
        aria-expanded={abierto}
        className="w-full flex items-start gap-3 px-4 py-3 min-h-[44px] text-left"
      >
        <n.Icono className={`w-5 h-5 flex-shrink-0 mt-0.5 ${n.texto}`} />
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-bold ${n.texto}`}>{n.titulo}</span>
          <span className="block text-xs text-white/60">{resumen}</span>
        </span>
        {calidad.problemas.length > 0 && (abierto ? <ChevronDown className="w-4 h-4 text-white/50 mt-1" /> : <ChevronRight className="w-4 h-4 text-white/50 mt-1" />)}
      </button>

      {abierto && calidad.problemas.length > 0 && (
        <ul className="border-t border-white/10 divide-y divide-white/[0.06]">
          {calidad.problemas.map((p, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-2.5">
              <span className={`flex-shrink-0 w-14 text-center text-[10px] font-bold uppercase rounded border px-1.5 py-0.5 ${GRAVEDAD[p.gravedad]}`}>{p.gravedad}</span>
              <span className="flex-1 min-w-0 text-xs text-white/80 leading-snug">{p.descripcion}</span>
              {p.hoja !== null && <span className="flex-shrink-0 text-[11px] text-white/40 whitespace-nowrap">hoja {p.hoja}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
