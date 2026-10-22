'use client'

/**
 * DiferenciasBom.tsx
 * ──────────────────
 * Qué cambió entre dos versiones del despiece de un plano: piezas agregadas,
 * eliminadas y modificadas (con el valor anterior y el nuevo). Las calcula
 * src/lib/comparar-bom.ts.
 *
 * RUTA: src/components/DiferenciasBom.tsx
 */

import { AlertTriangle, MinusCircle, Pencil, PlusCircle } from 'lucide-react'
import type { Diferencia } from '@/lib/types'

const CAMPO: Record<string, string> = {
  cantidad: 'cantidad', largo_mm: 'largo', ancho: 'ancho', material: 'material', area: 'área', notas: 'notas',
}
const conUnidad = (campo: string | undefined, v: string | undefined) => (v ? (campo === 'largo_mm' && /^\d/.test(v) ? `${v} mm` : v) : '—')

const GRUPOS = [
  { tipo: 'agregado', titulo: 'Agregados', Icono: PlusCircle, clase: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20' },
  { tipo: 'eliminado', titulo: 'Eliminados', Icono: MinusCircle, clase: 'text-red-300 bg-red-500/10 border-red-400/20' },
  { tipo: 'modificado', titulo: 'Modificados', Icono: Pencil, clase: 'text-amber-300 bg-amber-500/10 border-amber-400/20' },
] as const

interface Props {
  diferencias: Diferencia[]
  /** Encabezado, ej. "Actualización detectada — versión 3" */
  titulo?: string
  /** Línea de ayuda, ej. "Comparado con la versión 2" */
  subtitulo?: string
  /** Dentro de otra tarjeta: sin borde propio */
  compacto?: boolean
}

export function DiferenciasBom({ diferencias, titulo, subtitulo, compacto }: Props) {
  if (!diferencias.length) {
    return <p className="text-xs text-white/50">Sin cambios en piezas, cantidades ni medidas.</p>
  }
  return (
    <div className={compacto ? 'space-y-3' : 'space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-4 sm:p-5'}>
      {titulo && (
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-amber-200"><AlertTriangle className="h-4 w-4" /> {titulo}</p>
          {subtitulo && <p className="mt-0.5 text-xs text-white/55">{subtitulo}</p>}
        </div>
      )}
      {GRUPOS.map(({ tipo, titulo: t, Icono, clase }) => {
        const lista = diferencias.filter(d => d.tipo === tipo)
        if (!lista.length) return null
        return (
          <div key={tipo} className={`rounded-xl border px-3.5 py-3 ${clase}`}>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold"><Icono className="h-3.5 w-3.5" /> {t} ({lista.length})</p>
            <ul className="space-y-1 text-xs text-white/80">
              {lista.map((d, i) => (
                <li key={i} className="leading-snug">
                  <span className="text-white/45">{d.subensamble}{d.componente ? ' → ' : ''}</span>
                  <span className="font-semibold">{d.componente}</span>
                  {d.tipo === 'modificado' && (
                    <span>
                      {d.componente ? ': ' : ' '}{CAMPO[d.campo ?? ''] ?? d.campo}{' '}
                      <span className="text-white/50 line-through decoration-white/30">{conUnidad(d.campo, d.valor_anterior)}</span>
                      {' → '}
                      <span className="font-semibold">{conUnidad(d.campo, d.valor_nuevo)}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
