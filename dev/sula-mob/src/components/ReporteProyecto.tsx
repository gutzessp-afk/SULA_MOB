'use client';

/**
 * ReporteProyecto.tsx
 * ───────────────────
 * Modal con el reporte de un proyecto terminado: duración y resultado contra la
 * entrega, tiempos y piezas por área, quién hizo qué y los retrasos reportados.
 * Los datos salen de /api/proyectos/{id}/reporte.
 *
 * RUTA: src/components/ReporteProyecto.tsx
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Printer, Users, X } from 'lucide-react';
import { fechaLegible } from '@/lib/entregas';
import type { ReporteProyecto as Reporte } from '@/app/api/proyectos/[id]/reporte/route';

/** 3 d 4 h · 5 h · 20 min */
function duracion(ms: number) {
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} d${h % 24 ? ` ${h % 24} h` : ''}`;
  if (h > 0) return `${h} h`;
  return `${min} min`;
}

function fechaHora(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Dato({ label, valor, color = 'text-white' }: { label: string; valor: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.05] p-3 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`mt-1 text-base font-semibold leading-tight ${color}`}>{valor}</p>
    </div>
  );
}

export default function ReporteProyecto({ proyectoId, onCerrar }: { proyectoId: string; onCerrar: () => void }) {
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    fetch(`/api/proyectos/${proyectoId}/reporte`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
        if (vigente) setReporte(json as Reporte);
      })
      .catch((err) => {
        if (vigente) setError(err instanceof Error ? err.message : 'No se pudo generar el reporte.');
      });
    return () => { vigente = false; };
  }, [proyectoId]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const p = reporte?.proyecto;
  const vsEntrega = p?.diasVsEntrega;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reporte del proyecto"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.08] bg-[#0d1117]/95 p-4 sm:p-5 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-mono text-white/40">{p?.codigo || 'Reporte'}</p>
            <h2 className="text-lg font-bold text-white leading-tight truncate">{p ? [p.nombre, p.cliente].filter(Boolean).join(' - ') : 'Reporte del proyecto'}</h2>
          </div>
          <div className="flex shrink-0 gap-2 print:hidden">
            {reporte && (
              <button type="button" onClick={() => window.print()} title="Imprimir o guardar como PDF" className="rounded-lg p-2.5 text-white/60 hover:bg-white/[0.08] hover:text-white">
                <Printer className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onCerrar} title="Cerrar" className="rounded-lg p-2.5 text-white/60 hover:bg-white/[0.08] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error ? (
          <p className="m-5 text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>
        ) : !reporte || !p ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> Generando reporte...
          </div>
        ) : (
          <div className="space-y-5 p-4 sm:p-5">
            {/* ── Resumen ── */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Dato label="Alta" valor={fechaLegible(p.creado)} />
              <Dato label={p.fin ? 'Completado' : 'Avance'} valor={p.fin ? fechaLegible(p.fin) : `${p.progreso}%`} color={p.fin ? 'text-emerald-300' : 'text-white'} />
              <Dato label={p.fin ? 'Duración total' : 'En curso desde hace'} valor={duracion(p.duracionMs)} />
              <Dato
                label="Contra la entrega"
                valor={vsEntrega == null ? (p.entrega ? fechaLegible(p.entrega) : 'Sin entrega') : vsEntrega > 0 ? `${vsEntrega} día${vsEntrega === 1 ? '' : 's'} antes` : vsEntrega === 0 ? 'Justo a tiempo' : `${-vsEntrega} día${vsEntrega === -1 ? '' : 's'} tarde`}
                color={vsEntrega == null ? 'text-white' : vsEntrega >= 0 ? 'text-emerald-300' : 'text-red-300'}
              />
            </div>
            <p className="text-[11px] text-white/45">
              {reporte.totales.piezas} piezas registradas en {reporte.totales.registros} registro{reporte.totales.registros === 1 ? '' : 's'} ·{' '}
              {reporte.totales.horasTrabajadas} h trabajadas · {reporte.retrasos.length} retraso{reporte.retrasos.length === 1 ? '' : 's'}
              {reporte.totales.horasRetraso ? ` (${reporte.totales.horasRetraso} h estimadas)` : ''}
            </p>

            {/* ── Áreas ── */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-white">Por área</h3>
              {reporte.areas.length === 0 ? (
                <p className="text-xs text-white/40">Sin áreas registradas.</p>
              ) : (
                <div className="space-y-2">
                  {reporte.areas.map((a) => (
                    <div key={a.nombre} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-semibold text-white">{a.nombre}</p>
                        <span className={`font-mono text-xs font-bold ${a.pct >= 100 ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {a.totales ? `${a.hechas}/${a.totales} pzas · ` : ''}{a.pct}%
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/45">
                        {fechaHora(a.inicio)} → {a.fin ? fechaHora(a.fin) : 'sin terminar'}
                        {a.inicio && a.fin ? ` · ${duracion(Date.parse(a.fin) - Date.parse(a.inicio))} de principio a fin` : ''}
                        {a.horasTrabajadas ? ` · ${a.horasTrabajadas} h trabajadas` : ''}
                      </p>
                      {a.operadores.length > 0 && (
                        <p className="mt-1 text-[11px] text-white/60">
                          {a.operadores.map((o) => `${o.nombre} (${o.piezas})`).join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Operadores ── */}
            {reporte.operadores.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Users className="h-4 w-4 text-sky-400" /> Operadores</h3>
                <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Operador</th>
                        <th className="px-3 py-2 text-right font-semibold">Piezas</th>
                        <th className="px-3 py-2 text-right font-semibold">Horas</th>
                        <th className="px-3 py-2 text-right font-semibold">Registros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] text-white/80">
                      {reporte.operadores.map((o) => (
                        <tr key={o.nombre}>
                          <td className="px-3 py-2">{o.nombre}</td>
                          <td className="px-3 py-2 text-right font-mono">{o.piezas}</td>
                          <td className="px-3 py-2 text-right font-mono">{o.horas}</td>
                          <td className="px-3 py-2 text-right font-mono">{o.registros}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Retrasos ── */}
            {reporte.retrasos.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white"><AlertTriangle className="h-4 w-4 text-red-400" /> Retrasos</h3>
                <ul className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06]">
                  {reporte.retrasos.map((r, i) => (
                    <li key={i} className="px-3 py-2 text-xs">
                      <p className="text-white/80"><span className="font-semibold text-white">{r.area}</span> · {r.motivo}{r.horas ? ` · ${r.horas} h` : ''}</p>
                      <p className="text-[11px] text-white/40">{r.operador} · {fechaHora(r.fecha)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-right text-[10px] text-white/30">Generado el {fechaHora(reporte.generado)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
