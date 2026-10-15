'use client'

import { useState } from 'react'

export interface AreaHex {
  id: string
  nombre: string
  rendimiento: number
  hechas: number
  totales: number
}

const POR_FILA = 3
const RADIO = 30
const ANCHO = Math.sqrt(3) * RADIO

/** Nombre corto para que quepa en el hexágono: "Corte de Lamina" → "Lámina", "Soldadura Y Pulido" → "Soldadura" */
export function nombreCorto(nombre: string) {
  const sinCorte = nombre.replace(/^corte\s+de\s+/i, '').trim()
  const palabra = sinCorte.split(/\s+/)[0] || nombre
  const acentos: Record<string, string> = { lamina: 'Lámina', laser: 'Láser' }
  const clave = palabra.toLowerCase()
  return acentos[clave] ?? palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase()
}

function colores(r: number, conTrabajo: boolean) {
  if (!conTrabajo || r <= 0) return { relleno: 'rgba(148,163,184,0.06)', borde: '#64748b' }
  if (r >= 70) return { relleno: 'rgba(16,185,129,0.15)', borde: '#10b981' }
  if (r >= 30) return { relleno: 'rgba(245,158,11,0.15)', borde: '#f59e0b' }
  return { relleno: 'rgba(239,68,68,0.15)', borde: '#ef4444' }
}

/** Hexágono con punta arriba centrado en (cx, cy) */
function hexPath(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90)
    return `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  }).join(' ') + ' Z'
}

/** Las áreas como panal: filas de 3, las impares recorridas medio hexágono. Color según rendimiento */
export function HexagonGrid({ areas }: { areas: AreaHex[] }) {
  const [encima, setEncima] = useState<string | null>(null)
  const filas = Math.ceil(areas.length / POR_FILA)
  const anchoTotal = ANCHO * POR_FILA + ANCHO / 2 + 8
  const altoTotal = RADIO * 2 + (filas - 1) * RADIO * 1.5 + 8

  return (
    <svg viewBox={`0 0 ${anchoTotal} ${altoTotal}`} className="h-full w-full max-h-[260px]" role="list" aria-label="Rendimiento por área">
      {areas.map((a, i) => {
        const fila = Math.floor(i / POR_FILA)
        const cx = 4 + ANCHO / 2 + (i % POR_FILA) * ANCHO + (fila % 2 ? ANCHO / 2 : 0)
        const cy = 4 + RADIO + fila * RADIO * 1.5
        const { relleno, borde } = colores(a.rendimiento, a.totales > 0 || a.rendimiento > 0)
        const activo = encima === a.id
        return (
          <g
            key={a.id}
            role="listitem"
            aria-label={`${a.nombre}: ${a.rendimiento}%, ${a.hechas} de ${a.totales} piezas`}
            onMouseEnter={() => setEncima(a.id)}
            onMouseLeave={() => setEncima(null)}
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: activo ? 'scale(1.05)' : undefined, transition: 'transform 0.2s' }}
          >
            <title>{`${a.nombre}: ${a.rendimiento}% · ${a.hechas}/${a.totales} piezas`}</title>
            {activo && <path d={hexPath(cx, cy, RADIO - 1)} fill={borde} opacity={0.35} style={{ filter: 'blur(6px)' }} />}
            <path d={hexPath(cx, cy, RADIO - 2)} fill={relleno} stroke={borde} strokeWidth={1.4} />
            <text x={cx} y={cy - 6} textAnchor="middle" className="fill-white/80 font-semibold" style={{ fontSize: 7 }}>{nombreCorto(a.nombre)}</text>
            <text x={cx} y={cy + 7} textAnchor="middle" className="font-mono font-bold" style={{ fontSize: 10, fill: borde }}>{a.rendimiento}%</text>
            {activo && <text x={cx} y={cy + 17} textAnchor="middle" className="fill-white/55 font-mono" style={{ fontSize: 5.5 }}>{a.hechas}/{a.totales} pzas</text>}
          </g>
        )
      })}
    </svg>
  )
}
