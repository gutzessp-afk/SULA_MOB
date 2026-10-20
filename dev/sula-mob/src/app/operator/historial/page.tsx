'use client'

/**
 * Historial — /operator/historial
 * Los PDF de evidencia de cada día (avance, piezas por hora, pausas y reportes de todas las áreas),
 * de todos los proyectos, para llevar control de la productividad día con día.
 * Los PDF se generan desde cada proyecto con "Enviar al historial y al administrador".
 *
 * RUTA: src/app/operator/historial/page.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { History, FileText, ExternalLink, Loader2, CalendarDays } from 'lucide-react'
import { listarHistorial, type PdfHistorial } from '../historial-actions'

function fechaLarga(fecha: string) {
  // fecha viene como AAAA-MM-DD (día de México); se arma a mediodía para que no se recorra de día
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function HistorialPage() {
  const [cargando, setCargando] = useState(true)
  const [pdfs, setPdfs] = useState<PdfHistorial[]>([])
  const [proyecto, setProyecto] = useState('')

  useEffect(() => {
    let vigente = true
    listarHistorial().then((data) => {
      if (!vigente) return
      setPdfs(data)
      setCargando(false)
    })
    return () => {
      vigente = false
    }
  }, [])

  const proyectos = useMemo(() => {
    const mapa = new Map<string, string>()
    pdfs.forEach((p) => mapa.set(p.proyectoId, p.proyectoCodigo ? `${p.proyectoCodigo} · ${p.proyectoNombre}` : p.proyectoNombre))
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [pdfs])

  // Agrupado por día, del más reciente al más viejo
  const dias = useMemo(() => {
    const grupos = new Map<string, PdfHistorial[]>()
    pdfs
      .filter((p) => !proyecto || p.proyectoId === proyecto)
      .forEach((p) => grupos.set(p.fecha, [...(grupos.get(p.fecha) ?? []), p]))
    return [...grupos.entries()]
  }, [pdfs, proyecto])

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
            <History className="w-5 h-5 text-red-600" />
            <span className="text-red-600">Historial</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            PDF del día con lo que hizo cada área: avance, piezas por hora, pausas y reportes.
          </p>
        </div>

        {proyectos.length > 1 && (
          <select
            value={proyecto}
            onChange={(e) => setProyecto(e.target.value)}
            aria-label="Filtrar por proyecto"
            className="min-h-[44px] w-full sm:w-72 rounded-xl border border-slate-700 bg-[#121824] px-3 text-sm text-white outline-none focus:border-blue-500"
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {cargando ? (
        <div className="flex items-center gap-3 bg-[#0e1017]/80 border border-slate-800 p-6 rounded-2xl text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando historial...
        </div>
      ) : dias.length === 0 ? (
        <div className="bg-[#0e1017]/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <FileText className="w-8 h-8 text-slate-700 mx-auto" />
          <p className="text-sm text-slate-400">Todavía no hay PDFs en el historial.</p>
          <p className="text-xs text-slate-500">
            Se guardan desde cada proyecto en{' '}
            <Link href="/operator/avances" className="text-blue-400 underline underline-offset-2">
              Registrar avance
            </Link>{' '}
            → «Enviar al historial y al administrador», y solos al hacer cambio de turno.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {dias.map(([fecha, lista]) => (
            <section key={fecha} className="space-y-2">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 first-letter:uppercase">
                <CalendarDays className="w-4 h-4 text-slate-500" />
                {fechaLarga(fecha)}
              </h2>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map((p) => (
                  <a
                    key={p.id}
                    href={p.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] flex items-start gap-3 p-4 rounded-2xl border border-slate-800 bg-[#0e1017]/80 hover:border-slate-600 transition"
                  >
                    <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {p.proyectoCodigo && (
                        <div className="text-[10px] font-bold text-blue-400">{p.proyectoCodigo}</div>
                      )}
                      <div className="text-sm font-bold text-white truncate">{p.proyectoNombre}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {hora(p.creadoEn)} · {p.creadoPor}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-500 flex-shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
