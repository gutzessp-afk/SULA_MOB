'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import ProgresoAreas from '@/components/ProgresoAreas';
import { ETIQUETA_ESTADO, type EstadoEntrega } from '@/lib/entregas';
import type { Seguimiento, TipoEvento } from '@/app/api/proyectos/[id]/seguimiento/route';

const TARJETA = 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-5 sm:p-6';

const COLOR_EVENTO: Record<TipoEvento, string> = {
  creacion: 'border-blue-400 bg-blue-500/40',
  avance: 'border-amber-400 bg-amber-500/40',
  completado: 'border-emerald-400 bg-emerald-500/40',
  incidencia: 'border-red-400 bg-red-500/40',
};

const COLOR_ESTADO: Record<EstadoEntrega, string> = {
  completado: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  cancelado: 'border-white/15 bg-white/10 text-white/60',
  atrasado: 'border-red-500/30 bg-red-500/15 text-red-300',
  en_proceso: 'border-blue-500/30 bg-blue-500/15 text-blue-300',
  pendiente: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
};

function fechaHora(timestamp: string): string {
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Seguimiento de un proyecto: avance por área, línea de tiempo e incidencias.
 * Los datos salen de /api/proyectos/{id}/seguimiento.
 */
export default function TimelineProyecto({ proyectoId }: { proyectoId: string }) {
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    fetch(`/api/proyectos/${proyectoId}/seguimiento`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
        if (vigente) setDatos(json as Seguimiento);
      })
      .catch((err) => {
        if (vigente) setError(err instanceof Error ? err.message : 'No se pudo cargar el seguimiento.');
      });
    return () => { vigente = false; };
  }, [proyectoId]);

  if (error) {
    return <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>;
  }
  if (!datos) {
    return (
      <div className={`${TARJETA} flex items-center justify-center gap-2 text-sm text-white/50`}>
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> Cargando seguimiento...
      </div>
    );
  }

  const { proyecto, areas, eventos, incidencias } = datos;
  const estado = proyecto.estado as EstadoEntrega;

  return (
    <div className="space-y-4">
      <section className={TARJETA}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Progreso por área</h2>
          <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${COLOR_ESTADO[estado]}`}>
            {ETIQUETA_ESTADO[estado]}
          </span>
        </div>
        {areas.length === 0 ? (
          <p className="text-sm text-white/40">Este proyecto todavía no tiene áreas asignadas.</p>
        ) : (
          <ProgresoAreas areas={areas} total={proyecto.progreso} />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={TARJETA}>
          <h2 className="mb-4 text-base font-semibold text-white">Línea de tiempo</h2>
          {/* El margen izquierdo va dentro del área con scroll para que no recorte los puntos */}
          <div className="max-h-96 overflow-y-auto pl-1.5">
            <ol className="relative space-y-5 border-l border-white/[0.1] pl-5">
              {eventos.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border ${COLOR_EVENTO[ev.tipo]}`} />
                  <p className="text-sm text-white/75">{ev.texto}</p>
                  <p className="mt-0.5 text-xs text-white/35">{fechaHora(ev.fecha)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={TARJETA}>
          <h2 className="mb-4 flex items-center justify-between text-base font-semibold text-white">
            Incidencias <span className="text-sm font-normal text-white/40">{incidencias.length}</span>
          </h2>
          {incidencias.length === 0 ? (
            <p className="text-sm text-white/40">Sin retrasos reportados en este proyecto.</p>
          ) : (
            <ul className="max-h-96 space-y-3 overflow-y-auto">
              {incidencias.map((i) => (
                <li key={i.id} className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3">
                  <p className="flex items-start gap-2 text-sm font-semibold text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{i.area}: {i.motivo}</span>
                  </p>
                  {i.descripcion && <p className="mt-1 text-sm text-white/70">{i.descripcion}</p>}
                  <p className="mt-1 text-xs text-white/40">
                    {i.operador} · {fechaHora(i.fecha)}{i.horas != null ? ` · ${i.horas} h de retraso` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
