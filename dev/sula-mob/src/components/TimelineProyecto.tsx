'use client';

/**
 * TimelineProyecto.tsx
 * ────────────────────
 * Seguimiento de un proyecto en su página de detalle:
 *   - Progreso: estado, %, entrega, días y cómo va contra el plan lineal, con las áreas en cuadrícula
 *   - Actividad reciente (área, quién hizo qué, producto) con scroll propio
 *   - Incidencias: las del admin y los retrasos de operadores (en celular van antes que la línea de tiempo)
 * Los datos salen de /api/proyectos/{id}/seguimiento.
 *
 * RUTA: src/components/TimelineProyecto.tsx
 */

import { useEffect, useState } from 'react';
import { CalendarClock, Clock, Loader2 } from 'lucide-react';
import ProgresoAreas from '@/components/ProgresoAreas';
import IncidenciasProyecto from '@/components/IncidenciasProyecto';
import { EnVivo } from '@/components/EnVivo';
import { useRealtimeAvances, type EstadoRealtime } from '@/hooks/useRealtimeAvances';
import { ETIQUETA_ESTADO, diasEntre, fechaHoy, fechaLegible, ZONA_HORARIA, type EstadoEntrega } from '@/lib/entregas';
import type { Seguimiento, TipoEvento } from '@/app/api/proyectos/[id]/seguimiento/route';

const TARJETA = 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl';

const PUNTO: Record<TipoEvento, string> = {
  creacion: 'bg-amber-400',
  avance: 'bg-emerald-400',
  completado: 'bg-emerald-300 ring-2 ring-emerald-400/30',
  incidencia: 'bg-red-400',
};

const COLOR_ESTADO: Record<EstadoEntrega, string> = {
  completado: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  cancelado: 'border-white/15 bg-white/10 text-white/60',
  atrasado: 'border-red-500/30 bg-red-500/15 text-red-300',
  en_proceso: 'border-blue-500/30 bg-blue-500/15 text-blue-300',
  pendiente: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
};

function hace(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

function fechaHora(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Encabezado del progreso en una sola franja: estado, barra con el %, entrega,
 * días que faltan (o de atraso) y diferencia contra el plan lineal (0% en el alta → 100% en la entrega)
 */
function ProgresoTotal({ p, estado, enVivo }: { p: Seguimiento['proyecto']; estado: EstadoEntrega; enVivo: EstadoRealtime }) {
  const hoy = fechaHoy();
  const pct = Math.min(100, Math.max(0, p.progreso));
  const alta = p.creado ? new Date(p.creado).toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA }) : '';
  const plazo = p.entrega && alta ? diasEntre(alta, p.entrega) : 0;
  const planeado = !p.entrega || !alta ? null : plazo <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((diasEntre(alta, hoy) / plazo) * 100)));
  const diferencia = planeado === null ? null : pct - planeado;
  const faltan = p.entrega ? diasEntre(hoy, p.entrega) : null;
  const atrasado = faltan !== null && faltan < 0 && pct < 100;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold text-white">Progreso por área</h2>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COLOR_ESTADO[estado]}`}>
            {ETIQUETA_ESTADO[estado]}
          </span>
          <EnVivo estado={enVivo} />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-black/40 sm:w-36">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-lg font-bold leading-none text-white">{pct}%</span>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/45">
        <span className={`inline-flex items-center gap-1.5 ${atrasado ? 'font-bold text-red-400' : ''}`}>
          <CalendarClock className="h-3 w-3" />
          {p.entrega ? `Entrega: ${fechaLegible(p.entrega)}` : 'Sin fecha de entrega'}
        </span>
        {faltan !== null && (
          <span className={`inline-flex items-center gap-1.5 ${atrasado ? 'font-bold text-red-400' : faltan <= 3 && pct < 100 ? 'text-amber-300' : ''}`}>
            <Clock className="h-3 w-3" />
            {faltan > 0 ? `Faltan ${faltan} día${faltan === 1 ? '' : 's'}` : faltan === 0 ? 'Se entrega hoy' : `${-faltan} día${faltan === -1 ? '' : 's'} de atraso`}
          </span>
        )}
        {diferencia !== null && pct < 100 && (
          <span className={diferencia >= 0 ? 'text-emerald-300' : 'text-red-300'} title={`El plan lineal pedía ${planeado}% para hoy`}>
            {diferencia >= 0 ? `Adelantado ${diferencia} pp` : `Atrasado ${-diferencia} pp`} contra el plan
          </span>
        )}
      </p>
    </div>
  );
}

export default function TimelineProyecto({ proyectoId }: { proyectoId: string }) {
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [error, setError] = useState('');
  // Sube cada vez que un operador registra algo en este proyecto: vuelve a pedir el seguimiento
  const [version, setVersion] = useState(0);
  const enVivo = useRealtimeAvances(() => setVersion(v => v + 1), { proyectoId });

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
  }, [proyectoId, version]);

  if (error) {
    return <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>;
  }
  if (!datos) {
    return (
      <div className={`${TARJETA} p-6 flex items-center justify-center gap-2 text-sm text-white/50`}>
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> Cargando seguimiento...
      </div>
    );
  }

  const { proyecto, areas, eventos, incidencias } = datos;

  return (
    <div className="space-y-3">
      <section className={`${TARJETA} space-y-4 p-4 sm:p-5`}>
        <ProgresoTotal p={proyecto} estado={proyecto.estado as EstadoEntrega} enVivo={enVivo} />
        {areas.length === 0 ? (
          <p className="text-sm text-white/40">Este proyecto todavía no tiene áreas asignadas.</p>
        ) : (
          <ProgresoAreas areas={areas} />
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className={`${TARJETA} flex min-w-0 flex-col overflow-hidden`}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <Clock className="h-4 w-4 text-sky-400" /> Actividad reciente
            </h2>
            <span className="text-[10px] uppercase text-white/35">{eventos.length} registro{eventos.length === 1 ? '' : 's'}</span>
          </div>
          {eventos.length === 0 ? (
            <p className="p-6 text-center text-xs text-white/35">Todavía no hay actividad.</p>
          ) : (
            <ol className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto">
              {eventos.map((ev) => (
                <li key={ev.id} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02]">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[ev.tipo]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white">{ev.titulo}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55">
                      {ev.texto}{ev.detalle ? <span className="text-white/35"> · {ev.detalle}</span> : null}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[10px] text-white/30" title={fechaHora(ev.fecha)}>{hace(ev.fecha)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Incidencias: en celular van primero porque son lo urgente */}
        <IncidenciasProyecto proyectoId={proyectoId} reportes={incidencias} className="order-first lg:order-none" />
      </div>
    </div>
  );
}
