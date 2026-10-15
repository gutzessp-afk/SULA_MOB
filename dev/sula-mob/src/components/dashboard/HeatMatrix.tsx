'use client'

import Link from 'next/link'
import { nombreCorto } from './HexagonGrid'

export interface FilaCalor {
  id: string
  codigo: string
  nombre: string
}

interface Props {
  proyectos: FilaCalor[]
  areas: { id: string; nombre: string }[]
  /** Avance (0 a 100) de cada proyecto en cada área: clave "proyecto|área"; sin clave = el área no aplica */
  celdas: Map<string, number>
}

const ESCALA: [number, string, string][] = [
  [100, 'rgba(16,185,129,0.5)', '100%'],
  [75, 'rgba(16,185,129,0.3)', '75–99%'],
  [50, 'rgba(59,130,246,0.3)', '50–74%'],
  [25, 'rgba(245,158,11,0.25)', '25–49%'],
  [1, 'rgba(239,68,68,0.25)', '1–24%'],
  [0, 'rgba(148,163,184,0.06)', '0%'],
]
const fondo = (v: number) => ESCALA.find(([min]) => v >= min)![1]

/** Mapa de calor proyecto × área: de un vistazo se ve dónde va bien cada pedido y dónde se atoró */
export function HeatMatrix({ proyectos, areas, celdas }: Props) {
  if (!proyectos.length) return <p className="py-8 text-center text-xs text-white/40">No hay proyectos que mostrar.</p>

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#0b0f17]/90 px-2 text-left font-semibold text-white/40" scope="col">Proyecto</th>
              {areas.map(a => (
                <th key={a.id} scope="col" className="min-w-[42px] px-1 text-center font-semibold text-white/50" title={a.nombre}>{nombreCorto(a.nombre)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proyectos.map(p => (
              <tr key={p.id}>
                <th scope="row" className="sticky left-0 z-10 bg-[#0b0f17]/90 px-2 text-left font-mono font-bold text-blue-300 whitespace-nowrap">
                  <Link href={`/admin/proyectos/${p.id}`} className="hover:underline" title={p.nombre}>{p.codigo}</Link>
                </th>
                {areas.map(a => {
                  const v = celdas.get(`${p.id}|${a.id}`)
                  return (
                    <td
                      key={a.id}
                      className="h-8 rounded-md text-center font-mono font-semibold text-white/85"
                      style={{ backgroundColor: v === undefined ? 'transparent' : fondo(v) }}
                      title={v === undefined ? `${p.codigo} → ${a.nombre}: no pasa por esta área` : `${p.codigo} → ${a.nombre}: ${v}%`}
                    >
                      {v === undefined ? <span className="text-white/15">·</span> : v === 0 ? <span className="text-white/30">0</span> : v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/50" aria-label="Escala de colores">
        {ESCALA.slice().reverse().map(([, color, texto]) => (
          <li key={texto} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-white/10" style={{ backgroundColor: color }} />{texto}</li>
        ))}
        <li className="inline-flex items-center gap-1.5"><span className="text-white/25">·</span> no pasa por el área</li>
      </ul>
    </div>
  )
}
