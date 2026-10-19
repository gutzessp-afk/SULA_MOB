'use client';

/**
 * Calendario de entregas — /admin/calendario
 * ──────────────────────────────────────────
 * Cada proyecto aparece en el día de su fecha de entrega, con el color de su
 * estado. Debajo va la lista de entregas del mes, que es lo que se lee en celular.
 *
 * RUTA: src/app/admin/calendario/page.tsx
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ETIQUETA_ESTADO, estadoEntrega, fechaEntrega, fechaHoy, fechaLegible, type EstadoEntrega } from '@/lib/entregas';

interface Entrega {
  id: string;
  codigo: string;
  nombre: string;
  cliente: string;
  progreso: number;
  fecha: string; // AAAA-MM-DD
  estado: EstadoEntrega;
}

const COLOR: Record<EstadoEntrega, { punto: string; chip: string }> = {
  completado: { punto: 'bg-emerald-500', chip: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40' },
  en_proceso: { punto: 'bg-blue-500', chip: 'bg-blue-500/20 text-blue-200 border-blue-500/40' },
  pendiente: { punto: 'bg-amber-500', chip: 'bg-amber-500/20 text-amber-200 border-amber-500/40' },
  atrasado: { punto: 'bg-red-500', chip: 'bg-red-500/20 text-red-200 border-red-500/40' },
  cancelado: { punto: 'bg-slate-500', chip: 'bg-white/10 text-white/60 border-white/15' },
};
const LEYENDA: EstadoEntrega[] = ['completado', 'en_proceso', 'pendiente', 'atrasado'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_POR_DIA = 2;
const TARJETA = 'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl';

const dosDigitos = (n: number) => String(n).padStart(2, '0');

export default function CalendarioPage() {
  const hoy = fechaHoy();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [sinFecha, setSinFecha] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Mes que se está viendo: año y mes (0 a 11)
  const [mes, setMes] = useState(() => ({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) - 1 }));

  useEffect(() => {
    let vigente = true;
    supabase
      .from('proyectos')
      .select('id, codigo, nombre, cliente, descripcion, progreso, fecha_maxima, estados:estado_id ( nombre )')
      .then(({ data, error: err }) => {
        if (!vigente) return;
        if (err) {
          setError('No se pudieron cargar los proyectos.');
        } else {
          const lista: Entrega[] = [];
          for (const p of data ?? []) {
            const fecha = fechaEntrega(p);
            if (!fecha) continue;
            const progreso = Number(p.progreso) || 0;
            const estados = p.estados as { nombre: string } | { nombre: string }[] | null;
            const guardado = (Array.isArray(estados) ? estados[0] : estados)?.nombre || '';
            lista.push({
              id: p.id, codigo: p.codigo || '', nombre: p.nombre || '', cliente: p.cliente || '', progreso, fecha,
              estado: estadoEntrega(progreso, fecha, guardado),
            });
          }
          setEntregas(lista);
          setSinFecha((data ?? []).length - lista.length);
        }
        setLoading(false);
      });
    return () => { vigente = false; };
  }, []);

  const prefijo = `${mes.anio}-${dosDigitos(mes.mes + 1)}`;
  const delMes = useMemo(
    () => entregas.filter((e) => e.fecha.startsWith(prefijo)).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [entregas, prefijo]
  );

  // Celdas del mes con la semana empezando en lunes; null = hueco antes del día 1
  const celdas = useMemo(() => {
    const huecos = (new Date(mes.anio, mes.mes, 1).getDay() + 6) % 7;
    const dias = new Date(mes.anio, mes.mes + 1, 0).getDate();
    return [...Array<null>(huecos).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)];
  }, [mes]);

  const mesLargo = new Date(mes.anio, mes.mes, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const titulo = mesLargo.charAt(0).toUpperCase() + mesLargo.slice(1);
  const mover = (delta: number) =>
    setMes(({ anio, mes: m }) => {
      const d = new Date(anio, m + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
  const botonMes = 'flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] px-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.1]';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white lg:pl-10">
          <CalendarDays className="h-6 w-6 text-blue-400" /> Calendario de Entregas
        </h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => mover(-1)} className={botonMes} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[150px] text-center text-sm font-semibold text-white" aria-live="polite">{titulo}</span>
          <button type="button" onClick={() => mover(1)} className={botonMes} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => setMes({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) - 1 })} className={botonMes}>Hoy</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
        {LEYENDA.map((estado) => (
          <span key={estado} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${COLOR[estado].punto}`} /> {ETIQUETA_ESTADO[estado]}
          </span>
        ))}
      </div>

      {error && <p className="text-xs text-red-300 font-semibold bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/50">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" /> Cargando entregas...
        </div>
      ) : (
        <>
          <div className={`${TARJETA} overflow-hidden`}>
            <div className="grid grid-cols-7 border-b border-white/[0.08] text-center text-[11px] font-semibold uppercase tracking-wide text-white/45">
              {DIAS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {celdas.map((dia, i) => {
                if (dia === null) return <div key={`hueco-${i}`} className="min-h-14 border-b border-r border-white/[0.05] sm:min-h-24" />;
                const fecha = `${prefijo}-${dosDigitos(dia)}`;
                const delDia = delMes.filter((e) => e.fecha === fecha);
                return (
                  <div key={fecha} className={`min-h-14 min-w-0 border-b border-r border-white/[0.05] p-1 sm:min-h-24 sm:p-1.5 ${fecha === hoy ? 'bg-blue-500/[0.1]' : ''}`}>
                    <p className={`text-right text-xs tabular-nums ${fecha === hoy ? 'font-bold text-blue-300' : 'text-white/45'}`}>{dia}</p>

                    {/* Celular: un punto por entrega (el detalle está en la lista de abajo) */}
                    <div className="mt-1 flex flex-wrap justify-center gap-1 sm:hidden">
                      {delDia.map((e) => <span key={e.id} className={`h-2 w-2 rounded-full ${COLOR[e.estado].punto}`} />)}
                    </div>

                    <div className="mt-1 hidden space-y-1 sm:block">
                      {delDia.slice(0, MAX_POR_DIA).map((e) => (
                        <Link
                          key={e.id}
                          href={`/admin/proyectos/${e.id}`}
                          title={`${e.codigo} — ${e.nombre} (${ETIQUETA_ESTADO[e.estado]})`}
                          className={`block truncate rounded-md border px-1.5 py-0.5 text-[11px] font-semibold transition-all hover:brightness-125 ${COLOR[e.estado].chip}`}
                        >
                          {e.codigo || e.nombre}
                        </Link>
                      ))}
                      {delDia.length > MAX_POR_DIA && <p className="text-[10px] text-white/45">+{delDia.length - MAX_POR_DIA} más</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <section className={`${TARJETA} p-5 sm:p-6`}>
            <h2 className="mb-3 flex items-center justify-between text-base font-semibold text-white">
              <span>Entregas de {mesLargo}</span>
              <span className="text-sm font-normal text-white/40">{delMes.length}</span>
            </h2>
            {delMes.length === 0 ? (
              <p className="text-sm text-white/40">No hay entregas programadas este mes.</p>
            ) : (
              <ul className="space-y-2">
                {delMes.map((e) => (
                  <li key={e.id}>
                    <Link href={`/admin/proyectos/${e.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.08]">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COLOR[e.estado].punto}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{[e.codigo, e.nombre].filter(Boolean).join(' — ')}</span>
                        <span className="block truncate text-xs text-white/50">{e.cliente || 'Cliente no especificado'} · {ETIQUETA_ESTADO[e.estado]} · {e.progreso}%</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-white/70">{fechaLegible(e.fecha)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {sinFecha > 0 && (
              <p className="mt-4 text-xs text-white/40">
                {sinFecha} proyecto{sinFecha === 1 ? '' : 's'} sin fecha de entrega no aparece{sinFecha === 1 ? '' : 'n'} en el calendario.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
