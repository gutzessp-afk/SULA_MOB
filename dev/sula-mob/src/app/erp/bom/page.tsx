'use client';

/**
 * BOM — panel ERP — /erp/bom
 * ───────────────────────────
 * Todas las explosiones activas (producción y madera). Se busca por pedido o sucursal y se filtra
 * por clasificación (todas / con madera / sin madera) y por avance. Clic en una → /erp/bom/[id].
 *
 * RUTA: src/app/erp/bom/page.tsx
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Boxes, Loader2, Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { avanceDe, useExplosionesCompras } from '@/app/madera/compras';
import { TarjetaErp } from '../tarjeta';

type Clasif = 'todas' | 'madera' | 'produccion';
type Avance = 'todos' | 'sin_oc' | 'por_llegar' | 'sin_explosion';

const CLASIFS: { id: Clasif; texto: string }[] = [
  { id: 'todas', texto: 'Todas' },
  { id: 'madera', texto: 'Con madera' },
  { id: 'produccion', texto: 'Sin madera' },
];
const AVANCES: { id: Avance; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'sin_oc', texto: 'Con materiales sin OC' },
  { id: 'por_llegar', texto: 'Con material por llegar' },
  { id: 'sin_explosion', texto: 'Sin explosión' },
];

const BOTON = 'shrink-0 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all';

export default function ErpExplosiones() {
  const { explosiones, cargando, error } = useExplosionesCompras();
  const [clasif, setClasif] = useState<Clasif>('todas');
  const [avance, setAvance] = useState<Avance>('todos');
  const [busqueda, setBusqueda] = useState('');
  const termino = useDebounce(busqueda, 250).trim().toLowerCase();

  const visibles = useMemo(() => explosiones.filter(e => {
    const a = avanceDe(e, false);
    const conMadera = (e.revision?.madera?.total ?? 0) > 0;
    if (clasif === 'madera' && !conMadera) return false;
    if (clasif === 'produccion' && (conMadera || !e.revision)) return false;
    if (avance === 'sin_explosion' && e.revision) return false;
    if (avance === 'sin_oc' && !(e.revision && a.sin_oc > 0)) return false;
    if (avance === 'por_llegar' && !(e.revision && a.comprados > a.almacen)) return false;
    if (!termino) return true;
    return [e.proyecto?.codigo, e.proyecto?.nombre, e.proyecto?.sucursal].some(t => t?.toLowerCase().includes(termino));
  }), [explosiones, clasif, avance, termino]);

  if (cargando) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Boxes className="w-6 h-6 text-blue-400" /> BOM · Explosiones</h1>
        <p className="text-sm text-white/50 mt-1">Pedidos activos con su explosión de materiales.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-white/35 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por pedido o sucursal…" aria-label="Buscar pedido"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400/50 max-sm:text-base" />
        </label>
        <div className="flex items-center gap-1 overflow-x-auto max-w-full" role="group" aria-label="Clasificación">
          {CLASIFS.map(f => (
            <button key={f.id} type="button" onClick={() => setClasif(f.id)} aria-pressed={clasif === f.id}
              className={`${BOTON} ${clasif === f.id ? 'border-blue-500 bg-blue-600 text-white' : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'}`}>
              {f.texto}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto max-w-full -mt-2" role="group" aria-label="Avance">
        {AVANCES.map(f => (
          <button key={f.id} type="button" onClick={() => setAvance(f.id)} aria-pressed={avance === f.id}
            className={`${BOTON} ${avance === f.id ? 'border-white/40 bg-white/[0.14] text-white' : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white'}`}>
            {f.texto}
          </button>
        ))}
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
          {visibles.map(e => <TarjetaErp key={e.id} e={e} />)}
        </div>
      )}
    </div>
  );
}
