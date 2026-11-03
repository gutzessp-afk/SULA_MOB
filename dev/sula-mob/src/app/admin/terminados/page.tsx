'use client';

/**
 * Terminados
 * ──────────
 * Pedidos que llegaron al 100%. Salen de la lista de Proyectos y quedan aquí, donde se puede
 * revisar todo el proceso que siguieron (línea de tiempo, áreas, incidencias y reporte)
 * y darlos de baja cuando ya no se necesiten.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Trash2, X, MapPin, History, ExternalLink, CircleCheckBig } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cargarProyectos, useDatos } from '@/lib/cache-datos';
import { eliminarProyecto } from '@/lib/eliminar-proyecto';
import { useDebounce } from '@/hooks/useDebounce';
import { useRealtimeAvances } from '@/hooks/useRealtimeAvances';
import { BadgePrioridad } from '@/components/BadgePrioridad';
import { EnVivo } from '@/components/EnVivo';
import TimelineProyecto from '@/components/TimelineProyecto';
import { fechaEntrega as entregaDe, fechaLegible } from '@/lib/entregas';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string;
  referencia_sucursal?: string | null;
  descripcion?: string;
  prioridad: string;
  progreso: number;
  fecha_maxima?: string | null;
  updated_at?: string | null;
}

const PANEL = 'relative overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

export default function TerminadosPage() {
  // Misma consulta (y caché) que Proyectos y Dashboard
  const { datos, cargando, recargar } = useDatos('proyectos', () => cargarProyectos<Proyecto>());
  const enVivo = useRealtimeAvances(() => void recargar());
  const terminados = useMemo(() => (datos ?? []).filter(p => (Number(p.progreso) || 0) >= 100), [datos]);

  const [search, setSearch] = useState('');
  const busqueda = useDebounce(search, 300);
  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return terminados;
    return terminados.filter(p =>
      p.nombre?.toLowerCase().includes(t) ||
      p.codigo?.toLowerCase().includes(t) ||
      p.cliente?.toLowerCase().includes(t) ||
      p.referencia_sucursal?.toLowerCase().includes(t)
    );
  }, [terminados, busqueda]);

  const [procesos, setProcesos] = useState<Proyecto | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  async function darDeBaja(p: Proyecto) {
    const ok = window.confirm(
      `¿Dar de baja "${p.nombre}" (${p.codigo})?\n\nSe borrarán también sus productos, partidas, avances, retrasos y notificaciones. Esta acción NO se puede deshacer.`
    );
    if (!ok) return;
    setBorrando(p.id);
    const r = await eliminarProyecto(supabase, p.id);
    await recargar();
    setBorrando(null);
    if (procesos?.id === p.id) setProcesos(null);
    if (r.ok) alert(`El pedido ${p.codigo} se dio de baja con todos sus registros.`);
    else alert('No se pudo dar de baja: ' + r.error);
  }

  const btnVer = 'max-sm:min-h-[44px] h-8 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 text-xs px-3 rounded-xl inline-flex items-center justify-center gap-1.5 backdrop-blur-md transition-all';
  const btnBaja = 'max-sm:min-h-[44px] h-8 bg-red-500/20 hover:bg-red-500/35 text-red-200 border border-red-400/30 text-xs px-3 rounded-xl inline-flex items-center justify-center gap-1.5 backdrop-blur-md transition-all disabled:opacity-40';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-0 pb-8">
      <div className={`${PANEL} px-4 py-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-white tracking-wide leading-tight flex items-center gap-2">
            <CircleCheckBig className="w-6 h-6 text-emerald-400" /> Terminados
          </h1>
          <p className="text-[11px] sm:text-xs text-white/65 mt-1">Pedidos al 100%. Revisa todo el proceso que siguieron o dalos de baja.</p>
          <EnVivo estado={enVivo} className="mt-1.5" />
        </div>
        <span className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs font-semibold">
          {terminados.length} terminado{terminados.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className={PANEL}>
        <div className="px-4 py-3 sm:p-4 border-b border-white/10 flex items-center gap-3 bg-white/[0.03]">
          <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por código, sucursal, cliente o proyecto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-sm:text-base max-sm:min-h-[44px] bg-transparent text-sm text-white outline-none w-full placeholder:text-white/40"
          />
        </div>

        {/* Celular: tarjetas */}
        <div className="xl:hidden divide-y divide-white/10">
          {filtrados.map(p => (
            <div key={p.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-emerald-400 font-bold text-sm">{p.codigo}</span>
                <BadgePrioridad prioridad={p.prioridad} />
              </div>
              <p className="text-white font-semibold text-[15px] leading-snug">{p.nombre}</p>
              {(p.referencia_sucursal || p.cliente) && (
                <p className="text-white/50 text-xs flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {p.referencia_sucursal || p.cliente}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setProcesos(p)} className={`${btnVer} flex-1`}><History className="w-3.5 h-3.5" /> Ver procesos</button>
                <button onClick={() => darDeBaja(p)} disabled={borrando === p.id} className={`${btnBaja} flex-1`}><Trash2 className="w-3.5 h-3.5 text-red-400" /> Dar de baja</button>
              </div>
            </div>
          ))}
        </div>

        {/* Escritorio: tabla */}
        <div className="hidden xl:block overflow-x-auto">
          <table className="w-full text-left text-sm text-white/80">
            <thead className="bg-white/[0.07] text-white/60 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Proyecto</th>
                <th className="px-3 py-3">Sucursal</th>
                <th className="px-3 py-3">Prioridad</th>
                <th className="px-3 py-3">Entrega</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtrados.map(p => {
                const entrega = entregaDe(p);
                return (
                  <tr key={p.id} className="hover:bg-white/[0.06] transition-colors">
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-emerald-400 font-bold">{p.codigo}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-semibold text-white">{p.nombre}</td>
                    <td className="px-3 py-3 text-white/60"><span className="block max-w-[260px] truncate">{p.referencia_sucursal || p.cliente || '—'}</span></td>
                    <td className="px-3 py-3"><BadgePrioridad prioridad={p.prioridad} /></td>
                    <td className="px-3 py-3 text-xs text-white/50 whitespace-nowrap">{entrega ? fechaLegible(entrega) : '—'}</td>
                    <td className="px-3 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-500/15 text-emerald-300 border-emerald-400/30">100% · TERMINADO</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <button onClick={() => setProcesos(p)} className={btnVer}><History className="w-3.5 h-3.5" /> Ver procesos</button>
                        <button onClick={() => darDeBaja(p)} disabled={borrando === p.id} className={btnBaja} aria-label={`Dar de baja ${p.codigo}`}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400" /> Dar de baja
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtrados.length === 0 && (
          <div className="p-8 text-center text-white/40 text-sm">
            {cargando ? 'Cargando pedidos...' : search ? 'No se encontraron pedidos terminados.' : 'Aún no hay pedidos al 100%.'}
          </div>
        )}
      </div>

      {/* Todo el proceso del pedido: progreso por área, actividad, incidencias y reporte */}
      {procesos && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-2 sm:p-6" onClick={() => setProcesos(null)}>
          <div className="w-full max-w-5xl bg-[#0b1220]/95 border border-white/15 rounded-2xl p-4 sm:p-6 space-y-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-emerald-400 font-bold text-sm">{procesos.codigo}</p>
                <h2 className="text-white font-bold text-lg leading-tight">{procesos.nombre}</h2>
                {(procesos.referencia_sucursal || procesos.cliente) && <p className="text-white/50 text-xs mt-0.5">{procesos.referencia_sucursal || procesos.cliente}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Link href={`/admin/proyectos/${procesos.id}`} className={btnVer}><ExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Abrir despiece</span></Link>
                <button onClick={() => darDeBaja(procesos)} disabled={borrando === procesos.id} className={btnBaja}><Trash2 className="w-3.5 h-3.5 text-red-400" /> <span className="hidden sm:inline">Dar de baja</span></button>
                <button onClick={() => setProcesos(null)} className="w-8 h-8 rounded-lg border border-white/15 bg-white/[0.05] text-white/70 hover:text-white inline-flex items-center justify-center" aria-label="Cerrar">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <TimelineProyecto proyectoId={procesos.id} />
          </div>
        </div>
      )}
    </div>
  );
}
