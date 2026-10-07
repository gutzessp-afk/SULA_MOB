'use client'

/**
 * DespieceView.tsx
 * ────────────────
 * Especificaciones del plano de una partida, en tres bloques:
 *   1. Ficha del producto: modelo, revisión, dimensiones, acabado, materiales.
 *   2. Totales: subensambles, componentes, piezas a fabricar, piezas por revisar.
 *   3. Lista de piezas, agrupada "Por subensamble" (como el plano) o
 *      "Por área" (como la reparte producción). Tabla en pantallas grandes
 *      y renglones compactos en el teléfono.
 *
 * Usa los mismos datos que la Matriz de Corte (src/lib/matriz-corte.ts), así
 * lo que se ve aquí es lo que sale en el Excel y en el PDF.
 *
 * RUTA: src/components/DespieceView.tsx
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { CalidadPlano } from './CalidadPlano'
import { colorArea, construirMatriz, type FilaMatriz } from '@/lib/matriz-corte'
import type { PlantillaBOM } from '@/lib/types'

/** "1508mm × 900mm", o el perfil si es tubo */
export function medidas(largo: number | null, ancho: string) {
  const a = ancho?.trim()
  const anchoTxt = a ? (/^\d+(\.\d+)?$/.test(a) ? `${a}mm` : a) : ''
  return [largo !== null ? `${largo}mm` : '', anchoTxt].filter(Boolean).join(' × ')
}

/** Etiqueta de área con los mismos colores que la Matriz de Corte */
function Area({ area }: { area: string }) {
  const c = colorArea(area)
  return (
    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap" style={{ backgroundColor: `#${c.claro}`, color: `#${c.fuerte}` }}>
      {area}
    </span>
  )
}

const Revisar = () => (
  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded px-1.5 py-px whitespace-nowrap" title="Esta medida no aparece impresa en el plano: compruébala antes de cortar">
    <AlertTriangle className="w-3 h-3" /> Revisar
  </span>
)

interface Grupo { id: string; titulo: string; detalle: string; color?: string; filas: FilaMatriz[] }

export function DespieceView({ bom, cantidadPedido }: { bom: PlantillaBOM; cantidadPedido: number }) {
  const [vista, setVista] = useState<'subensamble' | 'area'>('subensamble')
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({})

  const m = useMemo(
    () => construirMatriz(bom, { clave: '', descripcion: '', cantidad: cantidadPedido, cliente: '', proyecto: '', fecha: '' }),
    [bom, cantidadPedido]
  )
  const porRevisar = m.secciones.flatMap(s => s.filas).filter(f => f.revisar).length

  const grupos: Grupo[] = vista === 'subensamble'
    ? m.secciones.map(s => ({
        id: `s-${s.nombre}`,
        titulo: s.nombre,
        detalle: [`×${s.cantidad} por producto`, s.pagina !== null ? `hoja ${s.pagina}` : ''].filter(Boolean).join(' · '),
        filas: s.filas,
      }))
    : m.porArea.map(g => ({
        id: `a-${g.area}`,
        titulo: g.area,
        detalle: `${g.filas.length} componente(s) · ${g.piezas} pzas.`,
        color: colorArea(g.area).fuerte,
        filas: g.filas,
      }))

  const ficha: [string, string][] = [
    ['Modelo', [m.modelo, m.revision].filter(Boolean).join(' · ')],
    ['Dimensiones', m.dimensiones],
    ['Acabado', m.acabado],
    ['Materiales', (bom.materiales ?? []).map(x => (x.codigo ? `${x.codigo} ${x.descripcion}` : x.descripcion)).join(' · ')],
  ]
  const totales: [string, number, boolean?][] = [
    ['Subensambles', m.resumen.subensambles],
    ['Componentes', m.resumen.componentes],
    [`Piezas a fabricar (×${m.total})`, m.resumen.piezas],
    ['Por revisar', porRevisar, porRevisar > 0],
  ]
  const boton = (activo: boolean) =>
    `px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${activo ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1]'}`

  return (
    <div className="space-y-4">
      {/* Revisión de calidad del plano: lo primero que hay que leer */}
      <CalidadPlano calidad={bom.calidad} />

      {/* 1. Ficha del producto */}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
        {ficha.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-white/35">{etiqueta}</dt>
            <dd className={`text-sm leading-snug ${valor ? 'text-white/85' : 'text-amber-300/80'}`}>{valor || 'No se encontró en el plano'}</dd>
          </div>
        ))}
      </dl>

      {/* 2. Totales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {totales.map(([etiqueta, valor, alerta]) => (
          <div key={etiqueta} className={`rounded-xl px-3 py-2.5 border ${alerta ? 'bg-amber-500/10 border-amber-400/30' : 'bg-white/[0.03] border-white/[0.06]'}`}>
            <p className={`text-xl font-bold font-mono leading-none ${alerta ? 'text-amber-300' : 'text-white'}`}>{valor}</p>
            <p className="text-[11px] text-white/45 mt-1">{etiqueta}</p>
          </div>
        ))}
      </div>

      {/* 3. Lista de piezas */}
      <div className="flex gap-1" role="group" aria-label="Agrupar piezas">
        <button type="button" onClick={() => setVista('subensamble')} aria-pressed={vista === 'subensamble'} className={boton(vista === 'subensamble')}>Por subensamble</button>
        <button type="button" onClick={() => setVista('area')} aria-pressed={vista === 'area'} className={boton(vista === 'area')}>Por área</button>
      </div>

      {grupos.map(g => {
        const abierto = !cerrados[g.id]
        return (
          <section key={g.id} className="rounded-xl border border-white/[0.08] overflow-hidden">
            <button
              type="button"
              onClick={() => setCerrados(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
              aria-expanded={abierto}
              className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] text-left bg-white/[0.07] hover:bg-white/[0.1] transition-colors"
              style={g.color ? { borderLeft: `3px solid #${g.color}` } : undefined}
            >
              {abierto ? <ChevronDown className="w-4 h-4 text-white/50 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/50 flex-shrink-0" />}
              <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{g.titulo}</span>
              <span className="text-[11px] text-white/50 flex-shrink-0">{g.detalle}</span>
            </button>

            {abierto && (
              <>
                {/* Tabla: pantallas medianas en adelante */}
                <table className="hidden md:table w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-white/35 text-left">
                      <th className="font-semibold px-4 py-2">Pieza</th>
                      <th className="font-semibold px-2 py-2">Material</th>
                      <th className="font-semibold px-2 py-2 text-right">Largo</th>
                      <th className="font-semibold px-2 py-2 text-right">Ancho</th>
                      <th className="font-semibold px-2 py-2 text-center">Cant.</th>
                      <th className="font-semibold px-2 py-2 text-center">Total</th>
                      <th className="font-semibold px-4 py-2">{vista === 'subensamble' ? 'Área' : 'Subensamble'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.filas.map(f => (
                      <tr key={f.n} className="border-t border-white/[0.05] align-top hover:bg-white/[0.02]">
                        <td className="px-4 py-2">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-white">{f.descripcion}{f.revisar && <Revisar />}</span>
                          {f.notas && <span className="block text-[11px] text-white/40 mt-0.5">{f.notas}</span>}
                        </td>
                        <td className="px-2 py-2 text-white/55">{f.material}</td>
                        <td className="px-2 py-2 text-right font-mono text-white/80 whitespace-nowrap">{f.largo ?? '—'}</td>
                        <td className="px-2 py-2 text-right font-mono text-white/80 whitespace-nowrap">{f.ancho || '—'}</td>
                        <td className="px-2 py-2 text-center font-mono text-white/60">{f.cantidad}</td>
                        <td className="px-2 py-2 text-center font-mono font-bold text-sky-300">{f.total}</td>
                        <td className="px-4 py-2">
                          {vista === 'subensamble' ? <Area area={f.area} /> : <span className="text-white/50">{f.subensamble}</span>}
                          {f.pagina !== null && <span className="block text-[10px] text-white/30 mt-0.5">hoja {f.pagina}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Renglones compactos: teléfono */}
                <ul className="md:hidden divide-y divide-white/[0.05]">
                  {g.filas.map(f => (
                    <li key={f.n} className="px-3 py-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-white">{f.descripcion}{f.revisar && <Revisar />}</p>
                        <p className="text-sm font-mono font-bold text-sky-300 flex-shrink-0">{f.total} <span className="text-[10px] font-normal text-white/40">pzas</span></p>
                      </div>
                      <p className="text-xs text-white/50">{f.material}</p>
                      <p className="text-xs font-mono text-white/75">{medidas(f.largo, f.ancho) || 'sin medidas'} <span className="text-white/40">· ×{f.cantidad}</span></p>
                      {f.notas && <p className="text-[11px] text-white/40">{f.notas}</p>}
                      <p className="flex items-center gap-2">
                        {vista === 'subensamble' ? <Area area={f.area} /> : <span className="text-[11px] text-white/50">{f.subensamble}</span>}
                        {f.pagina !== null && <span className="text-[10px] text-white/30">hoja {f.pagina}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
