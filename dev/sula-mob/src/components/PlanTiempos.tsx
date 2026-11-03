'use client';

/**
 * PlanTiempos.tsx
 * ───────────────
 * Plan de tiempos contra el avance real de un proyecto: resumen (entrega, término
 * estimado y margen) y, por área, una barra con las fechas del plan, el avance real,
 * la marca de hoy y el semáforo. Si el proyecto no tiene plan no muestra nada
 * (ni consulta nada).
 *
 * RUTA: src/components/PlanTiempos.tsx
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Pencil } from 'lucide-react';
import { diasEntre, fechaHoy, fechaLegible } from '@/lib/entregas';
import { evaluarPlan, fechaCorta, nivelMargen, type Semaforo } from '@/lib/plan-tiempos';
import type { Plan } from '@/lib/plan-almacen';
import { usePlanes } from '@/hooks/usePlanes';
import { useAreasActivas, useAvanceReal } from '@/hooks/useAvanceReal';

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

const SEMAFORO: Record<Semaforo, { texto: string; chip: string; barra: string }> = {
  completada: { texto: 'Completada', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30', barra: 'bg-emerald-400' },
  pendiente: { texto: 'Pendiente', chip: 'bg-white/10 text-white/50 border-white/15', barra: 'bg-white/30' },
  verde: { texto: 'A tiempo', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30', barra: 'bg-emerald-400' },
  ambar: { texto: 'Atraso leve', chip: 'bg-amber-500/15 text-amber-300 border-amber-400/30', barra: 'bg-amber-400' },
  rojo: { texto: 'Atrasada', chip: 'bg-red-500/15 text-red-300 border-red-400/30', barra: 'bg-red-400' },
};

const COLOR_MARGEN = { verde: 'text-emerald-300', ambar: 'text-amber-300', rojo: 'text-red-300' };

/**
 * Indicador pequeño para la lista de Proyectos: "Est. 25 nov · +5 d". Solo se usa en
 * proyectos con plan, que se leen ya montada la pantalla (por eso puede tomar la fecha de hoy aquí).
 */
export function IndicadorPlan({ plan, avance, entrega }: { plan: Plan; avance: Record<string, number> | undefined; entrega: string }) {
  const { estimacion } = evaluarPlan(plan, avance ?? {}, fechaHoy(), entrega);
  if (estimacion.estado === 'terminado') return null;
  const margen = estimacion.margen;
  const color = margen === null ? 'text-white/50' : COLOR_MARGEN[nivelMargen(margen)];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold ${color}`}
      title={`Término estimado según el plan de tiempos: ${fechaLegible(estimacion.fin)}${margen === null ? '' : margen < 0 ? ` (${-margen} días después de la entrega)` : ` (${margen} días antes de la entrega)`}`}
    >
      <CalendarClock className="w-3 h-3" />
      Est. {fechaCorta(estimacion.fin)}{margen !== null && ` · ${margen >= 0 ? '+' : '−'}${Math.abs(margen)} d`}
    </span>
  );
}

export default function PlanTiempos({ proyectoId, entrega }: { proyectoId: string; entrega: string }) {
  const plan = usePlanes()[proyectoId];
  if (!plan) return null;
  return <PlanTiemposContenido proyectoId={proyectoId} entrega={entrega} plan={plan} />;
}

function PlanTiemposContenido({ proyectoId, entrega, plan }: { proyectoId: string; entrega: string; plan: Plan }) {
  const { areas } = useAreasActivas();
  const { avance } = useAvanceReal(useMemo(() => [proyectoId], [proyectoId]));
  const [hoy, setHoy] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setHoy(fechaHoy()), 0);
    return () => clearTimeout(t);
  }, []);

  const nombreDe = (areaId: string) => areas.find(a => a.id === areaId)?.nombre ?? 'Área';
  // Mientras llegan las áreas se muestran todas las del plan; después, solo las que siguen activas
  const validas = areas.length ? new Set(areas.map(a => a.id)) : undefined;
  const ev = hoy ? evaluarPlan(plan, avance[proyectoId] ?? {}, hoy, entrega, validas) : null;
  if (!ev || ev.plan.tramos.length === 0) return null;
  const { estimacion } = ev;

  // Escala de la línea de tiempo: del inicio (o hoy, si es antes) al último de fin del plan, estimado y entrega
  const desde = [ev.plan.inicio, hoy].sort()[0];
  const hasta = [ev.plan.fin, estimacion.fin, entrega].filter(Boolean).sort().at(-1)!;
  const total = diasEntre(desde, hasta) + 1;
  const pos = (f: string) => Math.max(0, Math.min(100, (diasEntre(desde, f) / total) * 100));
  const posHoy = pos(hoy) + 50 / total;
  const posEntrega = entrega ? pos(entrega) + 100 / total : null;

  return (
    <div className={`${TARJETA} p-4 sm:p-6 space-y-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-violet-300" /> Plan de tiempos
        </h2>
        <Link
          href={`/admin/proyectos/${proyectoId}/tiempos`}
          className="max-sm:min-h-[44px] self-start sm:self-auto bg-violet-500/15 hover:bg-violet-500/30 text-violet-200 border border-violet-400/30 text-xs font-bold px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 transition-all"
        >
          <Pencil className="w-3.5 h-3.5" /> Editar plan
        </Link>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
          <p className="text-[10px] text-white/40 uppercase font-bold mb-0.5">Entrega</p>
          <p className="text-sm text-white font-semibold">{entrega ? fechaLegible(entrega) : 'Sin fecha'}</p>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
          <p className="text-[10px] text-white/40 uppercase font-bold mb-0.5">Término estimado</p>
          <p className="text-sm text-white font-semibold">{estimacion.estado === 'terminado' ? 'Terminado' : fechaLegible(estimacion.fin)}</p>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
          <p className="text-[10px] text-white/40 uppercase font-bold mb-0.5">Margen</p>
          <p className={`text-sm font-semibold ${estimacion.margen === null ? 'text-white/50' : COLOR_MARGEN[nivelMargen(estimacion.margen)]}`}>
            {estimacion.margen === null
              ? '—'
              : `${Math.abs(estimacion.margen)} día${Math.abs(estimacion.margen) === 1 ? '' : 's'} de ${estimacion.margen < 0 ? 'riesgo' : 'margen'}`}
          </p>
        </div>
      </div>

      {/* Línea de tiempo: plan (barra tenue) y avance real (relleno) por área */}
      <div className="space-y-3">
        {ev.areas.map(({ tramo, real, semaforo }) => {
          const color = SEMAFORO[semaforo];
          const izquierda = pos(tramo.inicio);
          const ancho = Math.max(1.5, pos(tramo.fin) + 100 / total - izquierda);
          return (
            <div key={tramo.areaId} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-semibold text-white">{nombreDe(tramo.areaId)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${color.chip}`}>{color.texto}</span>
                <span className="ml-auto text-[11px] text-white/50 whitespace-nowrap">
                  {fechaCorta(tramo.inicio)} – {fechaCorta(tramo.fin)} · <strong className="font-mono text-white/80">{Math.round(real * 100)}%</strong>
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-black/40 border border-white/10">
                <div
                  className="absolute inset-y-0 rounded-full bg-white/15 overflow-hidden"
                  style={{ left: `${izquierda}%`, width: `${ancho}%` }}
                  title={`Plan: ${fechaLegible(tramo.inicio)} a ${fechaLegible(tramo.fin)} (${tramo.dias} día${tramo.dias === 1 ? '' : 's'})`}
                >
                  <div className={`h-full ${color.barra}`} style={{ width: `${real * 100}%` }} />
                </div>
                {posEntrega !== null && posEntrega <= 100 && (
                  <div className="absolute -inset-y-1 w-0 border-l border-dashed border-cyan-300/70" style={{ left: `${posEntrega}%` }} />
                )}
                <div className="absolute -inset-y-1 w-0.5 -ml-px bg-violet-300" style={{ left: `${posHoy}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold uppercase text-white/45">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-white/15" /> Plan</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-emerald-400" /> Avance real</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-violet-300" /> Hoy</span>
        {entrega && <span className="flex items-center gap-1.5"><span className="h-3 w-0 border-l border-dashed border-cyan-300/70" /> Entrega</span>}
        <span className="normal-case font-normal text-white/35">Plan guardado en este navegador</span>
      </div>
    </div>
  );
}
