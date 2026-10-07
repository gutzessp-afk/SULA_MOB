'use client'

/**
 * PartidaCard.tsx
 * ───────────────
 * Tarjeta colapsable de una partida del proyecto. Según su estado muestra:
 *   - sin plano:    zona para arrastrar o elegir el PDF del plano
 *   - plano listo:  el archivo elegido y el botón "Analizar este plano"
 *   - analizando:   indicador de espera
 *   - analizado:    pestañas Despiece y Vista 3D, y la descarga de la
 *                   Matriz de Corte de ese plano (Excel o PDF, sin usar IA)
 *
 * El estado vive en la página (src/app/admin/proyectos/[id]/page.tsx);
 * esta tarjeta solo lo muestra y avisa de las acciones.
 *
 * RUTA: src/components/PartidaCard.tsx
 */

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { AlertTriangle, Box, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, FileSpreadsheet, FileText, Loader2, Paperclip, RefreshCw, Trash2, Upload } from 'lucide-react'
import { AreaBadge } from './AreaBadge'
import { EtiquetaCalidad } from './CalidadPlano'
import { DespieceView, medidas } from './DespieceView'
import { construirMatriz } from '@/lib/matriz-corte'
import type { PlantillaBOM } from '@/lib/types'

// Three.js solo se descarga cuando alguien abre la pestaña "Vista 3D"
const Visor3D = dynamic(() => import('./Visor3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-[4/3] lg:aspect-auto lg:h-[500px] rounded-xl bg-[#0a0a0f] border border-white/[0.08] flex items-center justify-center gap-2 text-xs text-white/40">
      <Loader2 className="w-4 h-4 animate-spin" /> Cargando visor 3D...
    </div>
  ),
})

export interface EstadoPartida {
  archivo?: File                       // plano elegido, aún sin analizar
  analizando?: boolean
  bom?: PlantillaBOM
  origen?: 'cache' | 'pdf' | 'ia'      // de dónde salió el BOM
  error?: string
  advertencias?: string[]
}

interface Props {
  clave: string
  descripcion: string
  cantidad: number
  cliente: string                      // para el encabezado de la Matriz de Corte
  proyecto: string                     // código del pedido, ej. "PED-3401"
  estado: EstadoPartida
  ocupado: boolean                     // hay otro análisis en curso
  onArchivo: (file: File) => void
  onAnalizar: () => void
  onEliminar: () => void
}

const ORIGEN: Record<string, string> = { cache: 'Plantilla guardada', pdf: 'Leído del plano', ia: 'Analizado con IA' }

export function PartidaCard({ clave, descripcion, cantidad, cliente, proyecto, estado, ocupado, onArchivo, onAnalizar, onEliminar }: Props) {
  const [abierta, setAbierta] = useState(false)
  const [pestana, setPestana] = useState<'despiece' | '3d'>('despiece')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  // Sube cada vez que se elige una pieza en la lista: el visor acerca la cámara a ella
  const [enfoque, setEnfoque] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const { bom } = estado
  const piezas = bom ? bom.subensambles.reduce((n, s) => n + s.componentes.length, 0) : 0

  // Color del borde y resumen del encabezado según el estado
  const borde = bom ? 'border-l-emerald-500/40' : estado.analizando || estado.archivo ? 'border-l-blue-500/40' : 'border-l-amber-500/40'
  const resumen = estado.analizando ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-blue-300"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando</span>
  ) : bom ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400/90"><CheckCircle2 className="w-3.5 h-3.5" /> {bom.subensambles.length} subensambles · {piezas} pzas</span>
  ) : estado.archivo ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-blue-300"><FileText className="w-3.5 h-3.5" /> Plano listo</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-400/80"><Paperclip className="w-3.5 h-3.5" /> Sin plano</span>
  )

  /** Descarga la Matriz de Corte de este plano. No usa IA: da formato al despiece guardado */
  const [generando, setGenerando] = useState<'excel' | 'pdf' | null>(null)
  const [errorMatriz, setErrorMatriz] = useState('')
  const descargarMatriz = async (formato: 'excel' | 'pdf') => {
    if (!bom) return
    setGenerando(formato)
    setErrorMatriz('')
    const datos = { clave, descripcion, cantidad, cliente, proyecto, fecha: new Date().toLocaleDateString('es-MX') }
    try {
      if (formato === 'pdf') {
        const { descargarMatrizPDF } = await import('@/lib/matriz-corte-pdf')
        await descargarMatrizPDF(construirMatriz(bom, datos))
      } else {
        const res = await fetch('/api/matriz-corte-plano', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bom, ...datos }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Error ${res.status}`)
        const url = URL.createObjectURL(await res.blob())
        const a = document.createElement('a')
        a.href = url
        a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `MATRIZ_DE_CORTE_${clave}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setErrorMatriz('No se pudo generar la Matriz de Corte: ' + (err instanceof Error ? err.message : 'error desconocido'))
    } finally {
      setGenerando(null)
    }
  }

  const elegir = (file: File | undefined) => {
    if (file) onArchivo(file)
  }

  /** Clic en una pieza del 3D: se resalta en la lista y se desplaza hasta ella */
  const seleccionar = (key: string | null) => {
    setSeleccion(key)
    if (key) listaRef.current?.querySelector(`[data-pieza="${key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }

  return (
    <div className={`bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] border-l-2 ${borde} rounded-2xl overflow-hidden ${estado.analizando ? 'animate-pulse' : ''}`}>
      {/* Encabezado: siempre visible */}
      <button
        type="button"
        onClick={() => setAbierta(a => !a)}
        aria-expanded={abierta}
        className="w-full px-4 sm:px-5 py-4 min-h-[56px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {abierta ? <ChevronDown className="w-4 h-4 text-white/50 mt-0.5 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/50 mt-0.5 flex-shrink-0" />}
          <p className="text-sm font-medium text-white leading-snug min-w-0">
            <span className="font-mono text-sky-300">{clave}</span>
            <span className="text-white/30"> · </span>
            {descripcion}
          </p>
        </div>
        <div className="flex items-center gap-3 pl-6 sm:pl-0 flex-shrink-0">
          <span className="text-xs font-mono font-bold text-white/80 bg-white/10 rounded-md px-2 py-0.5">×{cantidad}</span>
          <EtiquetaCalidad calidad={bom?.calidad} />
          {resumen}
        </div>
      </button>

      {abierta && (
        <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-white/[0.05] space-y-4">
          {estado.error && (
            <p className="text-xs font-semibold text-red-200 bg-red-500/10 border border-red-400/25 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {estado.error}
            </p>
          )}

          {estado.analizando ? (
            <div className="py-8 flex flex-col items-center gap-2 text-sm text-white/60">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              Leyendo el plano... puede tardar hasta un minuto.
            </div>
          ) : bom ? (
            <>
              {/* Pestañas */}
              <div className="flex items-center gap-1 border-b border-white/[0.08]">
                {([['despiece', 'Despiece', ClipboardList], ['3d', 'Vista 3D', Box]] as const).map(([id, texto, Icono]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPestana(id)}
                    className={`inline-flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-sm font-medium border-b-2 -mb-px transition-colors ${
                      pestana === id ? 'text-white border-blue-500' : 'text-white/40 border-transparent hover:text-white/60'
                    }`}
                  >
                    <Icono className="w-4 h-4" /> {texto}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-white/35 hidden sm:inline">{estado.origen ? ORIGEN[estado.origen] : ''}</span>
              </div>

              {estado.advertencias && estado.advertencias.length > 0 && (
                <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {estado.advertencias.join(' ')}
                </p>
              )}

              {pestana === 'despiece' ? (
                <DespieceView bom={bom} cantidadPedido={cantidad} />
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2 min-w-0">
                    <Visor3D bom={bom} seleccion={seleccion} onSeleccion={seleccionar} enfoque={enfoque} />
                  </div>
                  {/* Lista de piezas: fila deslizable en móvil, columna en escritorio */}
                  <div
                    ref={listaRef}
                    className="lg:col-span-1 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[548px] snap-x pb-1 lg:pb-0 lg:pr-1"
                  >
                    {bom.subensambles.flatMap((sub, si) =>
                      sub.componentes.map((c, ci) => {
                        const key = `${si}-${ci}`
                        const activa = seleccion === key
                        return (
                          <button
                            key={key}
                            type="button"
                            data-pieza={key}
                            onClick={() => { setSeleccion(activa ? null : key); if (!activa) setEnfoque(n => n + 1) }}
                            className={`snap-start flex-shrink-0 w-44 lg:w-auto text-left rounded-lg px-3 py-2 min-h-[44px] border-l-2 transition-colors ${
                              activa ? 'bg-amber-500/10 border-amber-400' : 'bg-white/[0.05] border-transparent hover:bg-white/[0.08]'
                            }`}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-xs font-semibold text-white leading-snug">{c.descripcion}</span>
                              <span className="text-[11px] font-mono text-white/60 flex-shrink-0">×{c.cantidad}</span>
                            </span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                              <AreaBadge area={c.area} />
                              <span className="text-[11px] text-white/45 font-mono">{medidas(c.largo_mm, c.ancho)}</span>
                            </span>
                            <span className="hidden lg:block text-[10px] text-white/30 mt-0.5 truncate">{sub.nombre}</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Matriz de Corte de este plano */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-emerald-500/[0.06] border border-emerald-400/20 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Matriz de Corte de este plano</p>
                  <p className="text-[11px] text-white/50">Todas las piezas por subensamble y por área, para {cantidad} unidad(es). No consume IA.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => descargarMatriz('excel')}
                    disabled={generando !== null}
                    className="inline-flex items-center justify-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-xl px-4 py-2.5 min-h-[44px] transition-colors"
                  >
                    {generando === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => descargarMatriz('pdf')}
                    disabled={generando !== null}
                    className="inline-flex items-center justify-center gap-2 text-xs font-bold text-white bg-red-600/90 hover:bg-red-500 disabled:opacity-40 rounded-xl px-4 py-2.5 min-h-[44px] transition-colors"
                  >
                    {generando === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
                  </button>
                </div>
              </div>
              {errorMatriz && <p className="text-xs font-semibold text-red-200 bg-red-500/10 border border-red-400/25 rounded-lg px-3 py-2">{errorMatriz}</p>}

              {/* Acciones sobre la plantilla */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60 hover:text-white border border-white/15 hover:bg-white/10 disabled:opacity-40 rounded-lg px-3 py-2 min-h-[36px] transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Volver a analizar con otro plano
                </button>
                <button
                  type="button"
                  onClick={onEliminar}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-300 border border-red-400/30 hover:bg-red-500/15 disabled:opacity-40 rounded-lg px-3 py-2 min-h-[36px] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar plantilla
                </button>
              </div>
            </>
          ) : estado.archivo ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="flex-1 min-w-0 inline-flex items-center gap-2 text-sm text-white/70">
                <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="truncate">{estado.archivo.name}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="text-xs font-semibold text-white/60 hover:text-white border border-white/15 hover:bg-white/10 rounded-xl px-3 py-2.5 min-h-[44px] transition-colors"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={onAnalizar}
                  disabled={ocupado}
                  className="inline-flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl px-4 py-2.5 min-h-[44px] transition-colors"
                >
                  <Upload className="w-4 h-4" /> Analizar este plano
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-white/50">Sube el plano PDF de esta clave para generar su despiece automáticamente.</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={e => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files?.[0]) }}
                className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  arrastrando ? 'border-blue-400/70 bg-blue-500/10' : 'border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.02]'
                }`}
              >
                <FileText className="w-7 h-7 text-white/30 mx-auto mb-2" />
                <span className="block text-sm text-white/70">Arrastra el plano aquí</span>
                <span className="block text-xs text-white/40 mt-0.5">o haz clic para seleccionar (PDF, máximo 4.4 MB)</span>
              </button>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => { elegir(e.target.files?.[0]); e.target.value = '' }}
          />
        </div>
      )}
    </div>
  )
}
