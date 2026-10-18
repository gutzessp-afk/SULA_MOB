'use client';

/**
 * IncidenciasProyecto.tsx
 * ───────────────────────
 * Incidencias de un proyecto, de dos fuentes:
 *   - Las que reporta el admin aquí (tabla `incidencias`): tipo, descripción y
 *     botón "Resolver".
 *   - Los retrasos que reportan los operadores desde su panel (tabla `retrasos`):
 *     solo lectura, con motivo, área, operador y horas.
 * Primero van las pendientes y, dentro de ellas, las más recientes.
 * Si no recibe `reportes` (los retrasos ya cargados por el seguimiento), los pide él.
 *
 * RUTA: src/components/IncidenciasProyecto.tsx
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface ReporteOperador {
  id: string;
  fecha: string;
  area: string;
  motivo: string;
  descripcion: string;
  horas: number | null;
  operador: string;
}

type Tipo = 'material' | 'calidad' | 'retraso' | 'otro';

interface Incidencia {
  id: string;
  tipo: Tipo;
  descripcion: string;
  resuelta: boolean | null;
  resuelta_en: string | null;
  created_at: string;
}

const TIPOS: Record<Tipo, { icono: string; nombre: string }> = {
  material: { icono: '🔧', nombre: 'Material' },
  calidad: { icono: '⚠️', nombre: 'Calidad' },
  retraso: { icono: '⏰', nombre: 'Retraso' },
  otro: { icono: '📝', nombre: 'Otro' },
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

/** Retrasos de operadores con el nombre del área y del operador */
async function cargarReportes(proyectoId: string): Promise<ReporteOperador[]> {
  const { data } = await supabase
    .from('retrasos')
    .select('id, motivo, descripcion, tiempo_estimado_retraso, created_at, areas (nombre), usuarios (nombre, apellidos)')
    .eq('proyecto_id', proyectoId)
    .order('created_at', { ascending: false });
  type Uno<T> = T | T[] | null;
  const uno = <T,>(x: Uno<T>) => (Array.isArray(x) ? x[0] : x) ?? null;
  return (data ?? []).map(r => {
    const u = uno(r.usuarios as Uno<{ nombre: string | null; apellidos: string | null }>);
    return {
      id: r.id as string,
      fecha: r.created_at as string,
      area: uno(r.areas as Uno<{ nombre: string }>)?.nombre || 'Sin área',
      motivo: (r.motivo as string | null) || 'Sin motivo',
      descripcion: (r.descripcion as string | null) || '',
      horas: r.tiempo_estimado_retraso as number | null,
      operador: u ? `${u.nombre ?? ''} ${u.apellidos ?? ''}`.trim() || 'Operador' : 'Operador',
    };
  });
}

const TARJETA = 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl';

export default function IncidenciasProyecto({ proyectoId, reportes: reportesDados, className = '' }: {
  proyectoId: string;
  reportes?: ReporteOperador[];
  className?: string;
}) {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [reportesPropios, setReportesPropios] = useState<ReporteOperador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [formAbierto, setFormAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<Tipo>('material');
  const [guardando, setGuardando] = useState(false);
  const [resolviendo, setResolviendo] = useState('');
  const reportes = reportesDados ?? reportesPropios;

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('incidencias')
      .select('id, tipo, descripcion, resuelta, resuelta_en, created_at')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false });
    if (err) setError('No se pudieron cargar las incidencias: ' + err.message);
    else setIncidencias((data ?? []) as Incidencia[]);
    setCargando(false);
  }, [proyectoId]);

  useEffect(() => {
    let vigente = true;
    const t = setTimeout(() => {
      void cargar();
      if (!reportesDados) void cargarReportes(proyectoId).then(r => { if (vigente) setReportesPropios(r); });
    }, 0);
    return () => { vigente = false; clearTimeout(t); };
  }, [cargar, proyectoId, reportesDados]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setGuardando(true);
    const { error: err } = await supabase.from('incidencias').insert({ proyecto_id: proyectoId, tipo, descripcion: texto.trim() });
    setGuardando(false);
    if (err) { setError('No se pudo guardar la incidencia: ' + err.message); return; }
    setError('');
    setTexto('');
    setFormAbierto(false);
    await cargar();
  };

  const resolver = async (id: string) => {
    setResolviendo(id);
    const { error: err } = await supabase.from('incidencias').update({ resuelta: true, resuelta_en: new Date().toISOString() }).eq('id', id);
    if (err) setError('No se pudo marcar como resuelta: ' + err.message);
    else setError('');
    await cargar();
    setResolviendo('');
  };

  // Una sola lista: pendientes primero, luego por fecha (más recientes arriba)
  const items = [
    ...incidencias.map(i => ({ clave: `i-${i.id}`, fecha: i.created_at, pendiente: !i.resuelta, incidencia: i, reporte: null })),
    ...reportes.map(r => ({ clave: `r-${r.id}`, fecha: r.fecha, pendiente: true, incidencia: null, reporte: r })),
  ].sort((a, b) => Number(b.pendiente) - Number(a.pendiente) || Date.parse(b.fecha) - Date.parse(a.fecha));
  const pendientes = items.filter(i => i.pendiente).length;

  return (
    <section className={`${TARJETA} flex min-w-0 flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          Incidencias
          {pendientes > 0 && (
            <span className="min-w-[18px] rounded-full bg-red-500/20 px-1.5 py-0.5 text-center text-[10px] font-bold text-red-300">{pendientes}</span>
          )}
        </h2>
        {!formAbierto && (
          <button type="button" onClick={() => setFormAbierto(true)} className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-bold text-blue-400 hover:underline">
            <Plus className="h-3 w-3" /> Reportar
          </button>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto">
      {formAbierto && (
        <form onSubmit={guardar} className="space-y-2 border-b border-white/[0.06] bg-white/[0.02] p-3">
          <textarea
            autoFocus
            required
            placeholder="¿Qué pasó?"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={2}
            className="max-sm:text-base w-full resize-none rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/40"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as Tipo)}
              aria-label="Tipo de incidencia"
              className="max-sm:text-base min-h-[36px] rounded-lg border border-white/15 bg-[#121824] px-2 py-1.5 text-[11px] text-white"
            >
              {(Object.keys(TIPOS) as Tipo[]).map(t => <option key={t} value={t}>{TIPOS[t].icono} {TIPOS[t].nombre}</option>)}
            </select>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => { setFormAbierto(false); setTexto(''); }} className="min-h-[36px] rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-500 disabled:opacity-50">
                {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </form>
      )}

      {error && <p className="border-b border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-300">{error}</p>}

      {cargando ? (
        <div className="flex items-center justify-center gap-2 p-6 text-xs text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
      ) : items.length === 0 ? (
        <p className="p-4 text-center text-[11px] text-white/30">Sin incidencias</p>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {items.map(({ clave, incidencia: inc, reporte: rep }) => {
            if (inc) {
              const t = TIPOS[inc.tipo] ?? TIPOS.otro;
              return (
                <li key={clave} className={`flex items-start gap-2.5 px-3 py-2.5 ${inc.resuelta ? 'opacity-60' : ''}`}>
                  <span className="mt-0.5 shrink-0 text-sm" title={t.nombre}>{t.icono}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs leading-snug text-white/80">{inc.descripcion}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[10px] text-white/30">{t.nombre} · {hace(inc.created_at)}</span>
                      {inc.resuelta && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                          <Check className="h-3 w-3" /> Resuelta{inc.resuelta_en ? ` ${hace(inc.resuelta_en)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {!inc.resuelta && (
                    <button
                      type="button"
                      onClick={() => resolver(inc.id)}
                      disabled={resolviendo !== ''}
                      className="mt-0.5 inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded border border-emerald-400/25 px-1.5 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {resolviendo === inc.id && <Loader2 className="h-3 w-3 animate-spin" />} Resolver
                    </button>
                  )}
                </li>
              );
            }
            return (
              <li key={clave} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-sm" title="Reporte de operador">⏰</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-snug text-red-300">{rep!.motivo}</p>
                  <p className="mt-0.5 text-[11px] text-white/55">{rep!.area} · {rep!.operador}</p>
                  {rep!.descripcion && <p className="mt-0.5 break-words text-[11px] text-white/65">“{rep!.descripcion}”</p>}
                  <p className="mt-1 text-[10px] text-white/30">
                    Reporte de operador · {hace(rep!.fecha)}{rep!.horas != null ? ` · ${rep!.horas} h de retraso` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </section>
  );
}
