'use client';

/**
 * Explosiones — panel de madera — /madera/bom
 * ─────────────────────────────────────────────
 * Todos los pedidos activos con su avance de compras. Se busca por código o sucursal y se
 * filtra: con pendientes / completos / sin explosión. Clic en uno → /madera/bom/[id] (modo compras).
 *
 * RUTA: src/app/madera/bom/page.tsx
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Search, Zap } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { avanceDe, SelectorAlcance, TarjetaPedido, useExplosionesCompras } from '../compras';

type Filtro = 'todos' | 'pendientes' | 'completos' | 'sin_explosion';

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'pendientes', texto: 'Con pendientes' },
  { id: 'completos', texto: 'Comprado completo' },
  { id: 'sin_explosion', texto: 'Sin explosión' },
];

export default function MaderaExplosiones() {
  const { explosiones, cargando, error } = useExplosionesCompras();
  const [soloMadera, setSoloMadera] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const termino = useDebounce(busqueda, 250).trim().toLowerCase();

  const visibles = useMemo(() => explosiones.filter(e => {
    const a = avanceDe(e, soloMadera);
    if (filtro === 'sin_explosion' && e.revision) return false;
    if (filtro === 'pendientes' && !(e.revision && a.comprados < a.total)) return false;
    if (filtro === 'completos' && !(e.revision && a.total > 0 && a.comprados === a.total)) return false;
    if (!termino) return true;
    return [e.proyecto?.codigo, e.proyecto?.nombre, e.proyecto?.sucursal].some(t => t?.toLowerCase().includes(termino));
  }), [explosiones, soloMadera, filtro, termino]);

  if (cargando) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Zap className="w-6 h-6 text-amber-400" /> Explosiones</h1>
          <p className="text-sm text-white/50 mt-1">Abre un pedido para capturar OC, compra y almacén.</p>
        </div>
        <SelectorAlcance soloMadera={soloMadera} onCambio={setSoloMadera} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-white/35 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por código o sucursal…" aria-label="Buscar pedido"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 max-sm:text-base" />
        </label>
        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {FILTROS.map(f => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
              className={`shrink-0 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all ${filtro === f.id ? 'border-amber-500 bg-amber-600 text-white' : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'}`}>
              {f.texto}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="text-center text-sm text-white/40 py-16">No hay pedidos con ese filtro.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visibles.map(e => <TarjetaPedido key={e.id} e={e} soloMadera={soloMadera} />)}
        </div>
      )}
    </div>
  );
}
