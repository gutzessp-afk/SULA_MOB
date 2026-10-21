'use client';

/**
 * Despiece — /admin/despiece
 * ──────────────────────────
 * Entrada del menú lateral al despiece. El despiece es por proyecto, así que aquí se
 * elige el proyecto y se abre su pantalla (/admin/proyectos/[id]).
 *
 * RUTA: src/app/admin/despiece/page.tsx
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Layers, Search, MapPin } from 'lucide-react';
import { cargarProyectos, useDatos } from '@/lib/cache-datos';
import { useDebounce } from '@/hooks/useDebounce';
import { useRealtimeAvances } from '@/hooks/useRealtimeAvances';
import { BadgePrioridad } from '@/components/BadgePrioridad';
import { EnVivo } from '@/components/EnVivo';

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  cliente?: string;
  referencia_sucursal?: string | null;
  prioridad: string;
  progreso: number;
}

const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';

export default function DespieceIndexPage() {
  // Misma clave que la lista de Proyectos: si ya se cargó, aparece al instante
  const { datos, cargando, error, recargar } = useDatos('proyectos', () => cargarProyectos<Proyecto>());
  const enVivo = useRealtimeAvances(() => void recargar());
  const proyectos = useMemo(() => datos ?? [], [datos]);

  const [busqueda, setBusqueda] = useState('');
  const busquedaDebounced = useDebounce(busqueda, 300);
  const filtrados = useMemo(() => {
    const term = busquedaDebounced.trim().toLowerCase();
    if (!term) return proyectos;
    return proyectos.filter(p =>
      p.nombre?.toLowerCase().includes(term) ||
      p.codigo?.toLowerCase().includes(term) ||
      p.cliente?.toLowerCase().includes(term) ||
      p.referencia_sucursal?.toLowerCase().includes(term)
    );
  }, [proyectos, busquedaDebounced]);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-0 pb-8">
      {/* HEADER (el margen en escritorio deja libre el botón que oculta el menú lateral) */}
      <div className={`${TARJETA} relative overflow-hidden px-4 py-5 sm:p-6 flex items-center gap-4 lg:pl-16`}>
        <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-white tracking-wide leading-tight">Despiece</h1>
          <p className="text-[11px] sm:text-xs text-white/65 mt-1">Elige un proyecto para ver su despiece, planos y avance por área.</p>
          <EnVivo estado={enVivo} className="mt-1.5" />
        </div>
      </div>

      <div className={`${TARJETA} overflow-hidden`}>
        {/* Buscador */}
        <div className="px-4 py-3 sm:p-4 border-b border-white/10 flex items-center gap-3 bg-white/[0.03]">
          <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por código, sucursal, cliente o proyecto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="max-sm:text-base max-sm:min-h-[44px] bg-transparent text-sm text-white outline-none w-full placeholder:text-white/40"
          />
        </div>

        {error && <p className="text-xs text-red-300 font-semibold bg-red-500/10 border-b border-red-500/25 px-4 py-3">{error}</p>}

        <div className="divide-y divide-white/10">
          {filtrados.map(p => {
            const progreso = Math.round(Number(p.progreso) || 0);
            return (
              <Link
                key={p.id}
                href={`/admin/proyectos/${p.id}`}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 p-4 min-h-[44px] hover:bg-white/[0.06] active:bg-white/[0.04] transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-blue-400 font-bold text-sm">{p.codigo}</span>
                    <BadgePrioridad prioridad={p.prioridad} />
                  </div>
                  <p className="text-white font-semibold text-[15px] leading-snug truncate">{p.nombre}</p>
                  {(p.referencia_sucursal || p.cliente) && (
                    <p className="text-white/50 text-xs flex items-center gap-1.5 truncate" title={p.cliente ? `Cliente: ${p.cliente}` : undefined}>
                      <MapPin className="w-3 h-3 flex-shrink-0" /> {p.referencia_sucursal || p.cliente}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:w-56">
                  <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-all duration-500 ${progreso >= 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-sky-500 via-indigo-400 to-emerald-400'}`}
                      style={{ width: `${Math.min(100, progreso)}%` }}
                    />
                  </div>
                  <span className={`font-mono text-xs font-bold w-10 text-right ${progreso >= 100 ? 'text-emerald-400' : progreso > 0 ? 'text-blue-400' : 'text-white/40'}`}>
                    {progreso}%
                  </span>
                </div>

                <span className="max-sm:min-h-[44px] bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 text-xs px-3 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" /> Abrir despiece
                </span>
              </Link>
            );
          })}

          {filtrados.length === 0 && (
            <div className="p-8 text-center text-white/40 text-sm">
              {cargando ? 'Cargando proyectos...' : 'No se encontraron proyectos.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}