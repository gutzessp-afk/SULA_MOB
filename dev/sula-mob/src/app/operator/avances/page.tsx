'use client'

/**
 * Registrar avance — lista de proyectos del operador (/operator/avances)
 * Tarjetas grandes en cuadrícula que ocupan todo el ancho, con el mismo estilo tipo aplicación
 * de las pantallas del proyecto: franja de color por estado, anillo de avance y prioridad.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ChevronRight, FolderOpen } from 'lucide-react'
import { fuenteOperador } from '@/lib/operador/fuente'
import { getProyectosLista, type ProyectoLista } from '../actions'

type Estado = 'por_iniciar' | 'en_proceso' | 'terminado'

const ESTADOS: Record<Estado, { etiqueta: string; color: string }> = {
  por_iniciar: { etiqueta: 'Por iniciar', color: '#4f8cff' },
  en_proceso: { etiqueta: 'En proceso', color: '#2ee6c8' },
  terminado: { etiqueta: 'Terminado', color: '#22d39a' },
}

const PRIORIDAD: Record<string, { etiqueta: string; color: string }> = {
  alta: { etiqueta: 'Prioridad alta', color: '#ff5a6e' },
  media: { etiqueta: 'Prioridad media', color: '#ffb020' },
  baja: { etiqueta: 'Prioridad baja', color: '#8fa0bf' },
}

const estadoDe = (p: ProyectoLista): Estado =>
  p.progreso >= 100 ? 'terminado' : p.progreso > 0 ? 'en_proceso' : 'por_iniciar'

/** Anillo con el % de avance */
function Anillo({ pct, color }: { pct: number; color: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative w-[68px] h-[68px] flex-shrink-0">
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#26314a" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-extrabold text-white tabular-nums">
        {pct}%
      </span>
    </div>
  )
}

export default function AvancesPage() {
  const [proyectos, setProyectos] = useState<ProyectoLista[]>([])
  const [cargando, setCargando] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<Estado | 'todos'>('todos')

  useEffect(() => {
    getProyectosLista().then((p) => {
      setProyectos(p)
      setCargando(false)
    })
  }, [])

  const conteo = useMemo(() => {
    const c: Record<Estado, number> = { por_iniciar: 0, en_proceso: 0, terminado: 0 }
    proyectos.forEach((p) => c[estadoDe(p)]++)
    return c
  }, [proyectos])

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return proyectos.filter(
      (p) =>
        (filtro === 'todos' || estadoDe(p) === filtro) &&
        (!q || `${p.codigo} ${p.nombre} ${p.cliente}`.toLowerCase().includes(q))
    )
  }, [proyectos, buscar, filtro])

  const chips: { id: Estado | 'todos'; etiqueta: string; n: number; color: string }[] = [
    { id: 'todos', etiqueta: 'Todos', n: proyectos.length, color: '#ffffff' },
    ...(Object.keys(ESTADOS) as Estado[]).map((id) => ({ id, etiqueta: ESTADOS[id].etiqueta, n: conteo[id], color: ESTADOS[id].color })),
  ]

  return (
    <div className={`${fuenteOperador.className} w-full pb-12 space-y-6`}>
      {/* Encabezado */}
      <div className="relative overflow-hidden rounded-3xl border border-[#26314a] bg-gradient-to-br from-[#1a2a55] via-[#121a2b] to-[#0d1220] p-5 sm:p-7 shadow-[0_24px_60px_-30px_#2563ff]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#2563ff]/25 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7fa8ff]">Producción</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Registrar <span className="text-[#4f8cff]">avance</span>
            </h1>
            <p className="mt-1.5 text-sm text-[#a9b6cf]">Elige un proyecto, entra a tu área con su contraseña y registra tus piezas.</p>
          </div>

          <label className="relative block w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d8cab]" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar pedido o cliente"
              aria-label="Buscar proyecto"
              className="h-12 w-full rounded-2xl border border-[#2c3a58] bg-[#0b1120]/80 pl-10 pr-4 text-[15px] text-white outline-none placeholder:text-[#6b7a99] focus:border-[#4f8cff] focus:ring-4 focus:ring-[#4f8cff]/20"
            />
          </label>
        </div>

        {/* Resumen / filtros */}
        <div className="relative mt-5 flex flex-wrap gap-2">
          {chips.map((c) => {
            const activo = filtro === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setFiltro(c.id)}
                aria-pressed={activo}
                className={`min-h-[44px] inline-flex items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition ${
                  activo ? 'bg-white text-[#0b1120] border-white' : 'border-[#2c3a58] bg-[#0b1120]/60 text-[#cbd6ea] hover:border-[#4f8cff]'
                }`}
              >
                {c.id !== 'todos' && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />}
                {c.etiqueta}
                <span className={`tabular-nums rounded-lg px-1.5 text-xs ${activo ? 'bg-[#0b1120]/10' : 'bg-white/10'}`}>{c.n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Proyectos */}
      {cargando ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[150px] animate-pulse rounded-3xl border border-[#26314a] bg-[#121a2b]" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-3xl border border-[#26314a] bg-[#121a2b] p-12 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-[#3b4a6b]" />
          <p className="mt-3 text-sm text-[#a9b6cf]">
            {proyectos.length === 0 ? 'No hay proyectos para mostrar.' : 'Ningún proyecto coincide con la búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p) => {
            const estado = ESTADOS[estadoDe(p)]
            const prioridad = PRIORIDAD[p.prioridad?.toLowerCase()] ?? null
            return (
              <Link
                key={p.id}
                href={`/operator/avances/${p.id}`}
                className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-[#26314a] bg-gradient-to-b from-[#16203a] to-[#111929] p-5 sm:p-6 transition hover:-translate-y-0.5 hover:border-[#3a4d78] active:scale-[0.99]"
                style={{ borderLeft: `6px solid ${estado.color}`, boxShadow: `0 18px 40px -26px ${estado.color}` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="inline-block rounded-full border border-[#4f8cff]/30 bg-[#4f8cff]/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#a9c2ff]">
                      {p.codigo || 'Sin código'}
                    </span>
                    <h2 className="mt-2 text-xl sm:text-[22px] font-extrabold leading-tight tracking-tight text-white">{p.nombre}</h2>
                    <p className="mt-1 truncate text-sm font-medium text-[#a9b6cf]">{p.cliente || 'Sin cliente'}</p>
                  </div>
                  <Anillo pct={p.progreso} color={estado.color} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ color: estado.color, background: `${estado.color}1a`, border: `1px solid ${estado.color}44` }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: estado.color }} />
                      {estado.etiqueta}
                    </span>
                    {prioridad && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{ color: prioridad.color, background: `${prioridad.color}14`, border: `1px solid ${prioridad.color}40` }}
                      >
                        {prioridad.etiqueta}
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-[#7fa8ff] transition group-hover:gap-2">
                    Entrar <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
