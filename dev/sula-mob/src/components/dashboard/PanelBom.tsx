'use client';

/**
 * PanelBom.tsx
 * ────────────
 * Estado de las explosiones de material en el Panel de Control (/admin/dashboard):
 * conteo por estatus y la lista de lo que está pasando ahora — explosiones en curso
 * (con su cronómetro en vivo), en pausa, bloqueadas (con sus motivos) y las últimas
 * terminadas. Se actualiza en tiempo real: al iniciar una explosión aparece aquí al momento.
 *
 * RUTA: src/components/dashboard/PanelBom.tsx
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Pause, Zap } from 'lucide-react';
import { useResumenBom, type ResumenBom } from '@/components/admin/EstadoBom';
import { motivosSinResolver } from '@/lib/bom-motivos';
import { ESTATUS_BOM, duracionLegible, estatusBom, formatTiempo, segundosTrabajados, type EstatusBom } from '@/lib/bom-tiempo';

interface ProyectoBom { id: string; codigo: string; nombre: string; progreso: number; referencia_sucursal?: string | null }

const ORDEN: EstatusBom[] = ['en_proceso', 'pausado', 'bloqueado', 'pendiente', 'completado'];
const ETIQUETA: Record<EstatusBom, string> = {
  en_proceso: 'En proceso', pausado: 'En pausa', bloqueado: 'Bloqueados', pendiente: 'Pendientes', completado: 'Completados',
};
const MAX_FILAS = 6;

/** Cronómetro que corre solo si la explosión no está en pausa */
function TiempoVivo({ resumen }: { resumen: ResumenBom }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!resumen.tramo_inicio) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resumen.tramo_inicio]);
  return <span className="font-mono tabular-nums">{formatTiempo(segundosTrabajados(resumen, ahora))}</span>;
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function PanelBom({ proyectos, tarjeta }: { proyectos: ProyectoBom[]; tarjeta: string }) {
  const resumen = useResumenBom();
  const porId = new Map(proyectos.map(p => [p.id, p]));

  // Pedidos activos (no terminados al 100%), más los que terminaron su explosión aunque ya estén al 100%
  const filas = Object.values(resumen)
    .map(r => ({ r, p: porId.get(r.proyecto_id), est: estatusBom(r) }))
    .filter(f => f.p && (f.p.progreso < 100 || f.est === 'completado' || f.est === 'en_proceso' || f.est === 'pausado'));

  const conteo = Object.fromEntries(ORDEN.map(e => [e, filas.filter(f => f.est === e).length])) as Record<EstatusBom, number>;

  // Lo que importa ver primero: en curso, en pausa, bloqueados y las últimas terminadas
  const visibles = [
    ...filas.filter(f => f.est === 'en_proceso' || f.est === 'pausado')
      .sort((a, b) => (b.r.tramo_inicio ?? b.r.fecha_inicio ?? '').localeCompare(a.r.tramo_inicio ?? a.r.fecha_inicio ?? '')),
    ...filas.filter(f => f.est === 'bloqueado'),
    ...filas.filter(f => f.est === 'completado')
      .sort((a, b) => (b.r.fecha_termino ?? '').localeCompare(a.r.fecha_termino ?? ''))
      .slice(0, 3),
  ].slice(0, MAX_FILAS);

  return (
    <section className={`sula-entrada ${tarjeta} overflow-hidden`} style={{ animationDelay: '175ms' }}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Zap className="h-4 w-4 text-amber-400" /> Explosión de material
          {conteo.en_proceso > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" /> {conteo.en_proceso} en curso
            </span>
          )}
        </h3>
        <Link href="/admin/bom" className="-my-2 whitespace-nowrap py-2 text-[11px] font-semibold text-blue-400 hover:underline">Ver BOM →</Link>
      </div>

      {/* Conteo por estatus */}
      <div className="grid grid-cols-5 divide-x divide-white/[0.06] border-b border-white/[0.06]">
        {ORDEN.map(e => (
          <div key={e} className="px-2 py-3 text-center">
            <p className={`text-xl font-bold tabular-nums ${conteo[e] ? ESTATUS_BOM[e].css.split(' ').find(c => c.startsWith('text-')) : 'text-white/25'}`}>{conteo[e]}</p>
            <p className="truncate text-[10px] uppercase tracking-wide text-white/45">{ETIQUETA[e]}</p>
          </div>
        ))}
      </div>

      {/* Lo que está pasando */}
      {visibles.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/40">Ninguna explosión en curso, en pausa ni bloqueada.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {visibles.map(({ r, p, est }) => {
            const conf = ESTATUS_BOM[est];
            const motivos = est === 'bloqueado' ? motivosSinResolver(r.checklist) : [];
            return (
              <li key={r.id}>
                <Link href={`/admin/bom/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] sm:px-5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${conf.css}`}>
                    {est === 'en_proceso' ? <Clock className="h-4 w-4 animate-pulse" />
                      : est === 'pausado' ? <Pause className="h-4 w-4" />
                        : est === 'bloqueado' ? <AlertTriangle className="h-4 w-4" />
                          : <CheckCircle2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="font-mono font-bold text-blue-400">{p!.codigo}</span>
                      <span className="truncate text-white/80">{p!.referencia_sucursal || p!.nombre}</span>
                    </p>
                    <p className="truncate text-[11px] text-white/45">
                      {est === 'bloqueado'
                        ? motivos.map(m => m.texto).join(' · ')
                        : est === 'completado' && r.fecha_termino
                          ? `Terminó ${fechaHora(r.fecha_termino)} · tardó ${duracionLegible(r.duracion_seg || 0)}`
                          : r.fecha_inicio ? `Inició ${fechaHora(r.fecha_inicio)}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-lg border px-2 py-0.5 text-[10px] font-bold ${conf.css}`}>{conf.txt}</span>
                    {(est === 'en_proceso' || est === 'pausado') && (
                      <p className={`mt-0.5 text-xs ${est === 'pausado' ? 'text-amber-300' : 'text-blue-300'}`}><TiempoVivo resumen={r} /></p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
